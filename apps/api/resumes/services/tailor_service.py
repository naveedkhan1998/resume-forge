import json
import logging
import re
from typing import Any, Dict, List, Optional, Set
from django.contrib.auth.models import User
from django.db import transaction
from ..models import (
    Profile,
    Experience,
    Education,
    Skill,
    Project,
    JobApplication,
    TailoredDocument,
    UserAISettings,
)
from .ollama_service import OllamaService
from .latex_templates import LatexGenerator, normalize_unicode_and_latex_text
from .experience_calculator import (
    calculate_experience_metrics,
    calculate_experience_metrics_from_latex,
    calculate_user_experience_metrics,
    get_experience_prompt_guidelines,
    normalize_experience_duration_text,
)

logger = logging.getLogger(__name__)

STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "he",
    "in", "is", "it", "its", "of", "on", "that", "the", "to", "was", "were", "will", "with"
}


def build_review_system_prompt(exp_metrics: Optional[Dict[str, Any]] = None) -> str:
    exp_guideline = get_experience_prompt_guidelines(exp_metrics or {})
    return f"""You are an expert resume copyeditor and career coach working across all professions (healthcare, arts, business, education, trades, finance, science, engineering, etc.).
Your task is to review the bullet points for a single resume section (a specific role, clinical rotation, exhibition, or project).

Rules:
1. Eliminate all semantic duplicates, redundant phrasings, and logically overlapping points.
2. If two bullets describe the same accomplishment, combine them into one concise, impactful bullet point or keep the strongest version.
3. Domain & Factual Accuracy:
   - Experience Duration: {exp_guideline}
   - Directional Accuracy: Preserve the logical direction of metrics and outcomes (e.g., reducing wait times, errors, or costs vs. increasing satisfaction, quality, revenue, or output).
   - Plain Text Notation: Write abbreviations, ratios, and units in clean plain text without wrapping words or slashes in LaTeX math mode (`$...$`).
   - Clean Typography: Use standard ASCII hyphens (-) for compound words and ranges. Never use non-breaking Unicode hyphens (U+2011) or narrow spaces.
4. Every bullet point MUST start with a strong, active past-tense action verb appropriate to the candidate's profession (e.g., Led, Delivered, Treated, Coordinated, Designed, Curated, Improved, Managed, Researched, Built).
5. Preserve all true metrics, percentages, numbers, tools, methods, instruments, and facts. NEVER hallucinate new facts or numbers.
6. Keep bullets concise (1-2 sentences each). Return between 2 and 4 distinct, polished bullet points (or 1-2 for smaller entries) as a single JSON object in the exact schema:
{{
  "bullets": [
    "Polished bullet point 1",
    "Polished bullet point 2"
  ]
}}
"""


def build_tailor_system_prompt(exp_metrics: Optional[Dict[str, Any]] = None) -> str:
    exp_guideline = get_experience_prompt_guidelines(exp_metrics or {})
    return f"""You are an expert ATS resume optimizer and career coach for candidates of any profession (healthcare, nursing, medicine, visual & performing arts, education, finance, operations, design, trades, or engineering).
Your task is to tailor the candidate's existing resume to strongly match the target job description while preserving all factual truth, metrics, employers, and achievements.

Rules:
- Return ONLY valid JSON in the exact schema below.
- Preserve factual data. Never invent organizations, roles, dates, degrees, licenses, metrics, or unsupported skills.
- DO NOT truncate or omit the candidate's substantive work history. Maintain all valid experiences and projects from the candidate profile.
- Domain & Factual Accuracy:
  - Experience Duration: {exp_guideline}
  - Directional Accuracy: Preserve the logical meaning of metrics and outcomes (e.g., reducing turnaround time, errors, or cost vs. improving patient outcomes, engagement, revenue, or efficiency).
  - Plain Text Notation: Write abbreviations, credentials, and metrics in clean plain text without wrapping words in LaTeX math mode (`$...$`).
  - Characters: Use standard ASCII hyphens (-) for compound words and ranges. Never output Unicode non-breaking hyphens (U+2011) or narrow spaces.
  - Skills Organization: Group skills into 3 to 6 clear, compact categories tailored to the candidate's profession and target role (for example: Clinical Care, Diagnostic Procedures, EHR & Equipment for healthcare; Mediums & Techniques, Studio Practice, Exhibition Design for artists; or Programming Languages, Frameworks, Cloud & DevOps for software engineers). Avoid duplicate skills across categories.
- Tailor experience and project bullet points: Align phrasing with the target job requirements, highlighting relevant skills, tools, methods, scope, and measurable impact from the candidate's actual work.
- In `technologies` for experiences and projects, list the relevant tools, instruments, methods, media, systems, or technologies used in that entry.
- Prioritize and categorize skills relevant to the target job description.
- Retain all certifications, licenses, and education details.
- Provide a targeted headline and 2-3 sentence executive summary reflecting the target position and the candidate's profession.
- Provide a professional, compelling 3-paragraph cover letter tailored to the organization and role.
- Calculate an objective match_score (0-100) reflecting how well the candidate's profile satisfies the job requirements.
- Extract top target keywords (skills, qualifications, credentials, tools, and domain competencies) from the job description.

Required schema:
{{
  "match_score": 85,
  "extracted_keywords": ["Core Competency 1", "Domain Tool / Skill 2", "Qualification 3"],
  "tailoring_rationale": "Aligned candidate's relevant experience, core competencies, and terminology with the target role.",
  "tailored_profile": {{
    "headline": "Targeted professional headline matching the role",
    "summary": "2-3 sentence targeted executive summary"
  }},
  "tailored_experiences": [
    {{
      "id": 1,
      "company": "...",
      "role": "...",
      "location": "...",
      "start_date": "...",
      "end_date": "...",
      "is_current": false,
      "bullet_points": ["Adapted bullet point 1", "Adapted bullet point 2"],
      "technologies": ["Relevant Tool/Method 1", "Relevant Tool/Method 2"]
    }}
  ],
  "tailored_projects": [
    {{
      "id": 1,
      "title": "...",
      "subtitle": "...",
      "role": "...",
      "repo_url": "...",
      "live_url": "...",
      "start_date": "...",
      "end_date": "...",
      "bullet_points": ["Adapted project or portfolio highlight"],
      "technologies": ["..."]
    }}
  ],
  "tailored_skills": [
    {{
      "category": "Category appropriate to the profession",
      "name": "Skill or competency name",
      "proficiency": "expert"
    }}
  ],
  "cover_letter_body": "Paragraph 1...\\n\\nParagraph 2...\\n\\nParagraph 3..."
}}
"""

REVIEW_SYSTEM_PROMPT = build_review_system_prompt()
TAILOR_SYSTEM_PROMPT = build_tailor_system_prompt()


LATEX_AI_EDIT_SYSTEM_PROMPT = r"""You are an expert LaTeX resume & cover-letter editor using the custom `resumeforge` document class.
Your task is to modify the supplied LaTeX document according to the user's instruction while keeping 100% factual accuracy to the candidate's verified profile and aligning with the target job description across any profession.

Rules:
1. Return ONLY valid JSON in the exact schema below.
2. Preserve valid `resumeforge` LaTeX structure:
   - The document MUST start with `\documentclass{resumeforge}` and `\begin{document}` and end with `\end{document}`.
   - Experience entries use `\resumeSubheading{Role}{Date Range}{Company}{Location}` followed by `\resumeItemListStart`, `\resumeItem{...}`, and `\resumeItemListEnd`.
   - Project/Portfolio entries use `\resumeProjectHeading{Left Header}{Right Links/Dates}` followed by `\resumeItemListStart`, `\resumeItem{...}`, and `\resumeItemListEnd`.
   - Escape special LaTeX characters in prose: `\%`, `\&`, `\_`, `\#`, `\$`, `\textgreater{}`, `\textless{}`.
   - Never use math mode (`$...$`) around ordinary words, abbreviations, or units.
3. Never invent organizations, roles, metrics, degrees, credentials, or skills not grounded in the candidate context or user instruction.
4. Return the COMPLETE updated LaTeX document in `updated_latex`.

Required JSON schema:
{
  "assistant_message": "Concise conversational summary of what you updated in the LaTeX document",
  "updated_latex": "\\documentclass{resumeforge}\n\\begin{document}\n...\n\\end{document}",
  "explanation": "Brief rationale for the changes"
}
"""


class TailorService:
    @classmethod
    def get_user_master_data(cls, user: User) -> Dict[str, Any]:
        """Fetch all baseline context data for the user."""
        profile = getattr(user, 'profile', None)
        profile_dict = {
            "full_name": profile.full_name if profile else user.get_full_name() or user.username,
            "headline": profile.headline if profile else "",
            "email": profile.email if profile else user.email,
            "phone": profile.phone if profile else "",
            "location": profile.location if profile else "",
            "website_url": profile.website_url if profile else "",
            "linkedin_url": profile.linkedin_url if profile else "",
            "github_url": profile.github_url if profile else "",
            "summary": profile.summary if profile else "",
        }
        source_resume_text = profile.raw_resume_text if profile else ""

        experiences = list(user.experiences.values(
            'id', 'company', 'role', 'location', 'start_date', 'end_date', 'is_current', 'bullet_points', 'technologies'
        ))
        educations = list(user.educations.values(
            'id', 'institution', 'degree', 'field_of_study', 'start_date', 'end_date', 'gpa', 'highlights'
        ))
        skills = list(user.skills.values('id', 'category', 'name', 'proficiency'))
        projects = list(user.projects.values(
            'id', 'title', 'subtitle', 'role', 'repo_url', 'live_url', 'start_date', 'end_date', 'bullet_points', 'technologies'
        ))
        certifications = list(user.certifications.values(
            'id', 'name', 'issuer', 'issue_date', 'credential_url'
        ))

        return {
            "profile": profile_dict,
            "source_resume_text": source_resume_text,
            "experiences": experiences,
            "educations": educations,
            "skills": skills,
            "projects": projects,
            "certifications": certifications,
        }

    @staticmethod
    def extract_jd_signals(
        job_title: str,
        raw_description: str,
        master_data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Stage 1 JD pre-analysis: deterministically extract salient skills, qualifications, and domain terms across any profession."""
        text = f"{job_title}\n{raw_description or ''}"
        detected_terms: List[str] = []
        seen_lower: Set[str] = set()

        def _add_term(term: str) -> None:
            clean = term.strip()
            if clean and clean.lower() not in seen_lower:
                seen_lower.add(clean.lower())
                detected_terms.append(clean)

        # 1. Dynamically check candidate's own skills, tools, and certifications against the JD
        if master_data:
            candidate_terms: List[str] = []
            for sk in master_data.get("skills", []):
                if isinstance(sk, dict) and sk.get("name"):
                    candidate_terms.append(str(sk["name"]).strip())
            for exp in master_data.get("experiences", []):
                if isinstance(exp, dict):
                    candidate_terms.extend(str(t).strip() for t in (exp.get("technologies") or []) if str(t).strip())
            for proj in master_data.get("projects", []):
                if isinstance(proj, dict):
                    candidate_terms.extend(str(t).strip() for t in (proj.get("technologies") or []) if str(t).strip())
            for cert in master_data.get("certifications", []):
                if isinstance(cert, dict) and cert.get("name"):
                    candidate_terms.append(str(cert["name"]).strip())

            for term in candidate_terms:
                if len(term) < 2:
                    continue
                escaped = re.escape(term)
                if re.search(rf"(?<![A-Za-z0-9]){escaped}(?![A-Za-z0-9])", text, flags=re.IGNORECASE):
                    _add_term(term)

        # 2. Cross-industry professional, clinical, creative, business, and technical terms
        cross_domain_patterns = [
            # Healthcare & Clinical
            "Patient Care", "Triage", "EHR", "EMR", "Epic", "Cerner", "HIPAA", "BLS", "ACLS", "PALS",
            "ICU", "Emergency Medicine", "Clinical Research", "Phlebotomy", "Telemetry", "Care Planning",
            "Medication Administration", "Infection Control", "Case Management", "Rehabilitation",
            # Arts, Design & Media
            "Figma", "Adobe Creative Suite", "Photoshop", "Illustrator", "InDesign", "Oil Painting",
            "Acrylic", "Watercolor", "Mixed Media", "Curatorial", "Art Direction", "Typography",
            "Exhibition Design", "Storyboarding", "CAD", "AutoCAD", "SolidWorks", "Blender",
            # Business, Finance & Operations
            "Project Management", "Stakeholder Management", "Financial Modeling", "Forecasting",
            "GAAP", "CPA", "PMP", "Agile", "Scrum", "Lean", "Six Sigma", "Supply Chain", "Salesforce",
            "SAP", "Excel", "Tableau", "Power BI", "Risk Management", "Compliance",
            # Education & Research
            "Curriculum Development", "Instructional Design", "Special Education", "IEP", "Classroom Management",
            "Grant Writing", "Peer Review", "SPSS", "MATLAB",
            # Engineering & Software
            "Python", "Go", "TypeScript", "JavaScript", "Rust", "C\\+\\+", "Java", "SQL",
            "Django", "FastAPI", "Flask", "React", "Next\\.js", "Node\\.js", "GraphQL", "REST",
            "PostgreSQL", "MySQL", "Redis", "MongoDB", "Docker", "Kubernetes", "Terraform", "AWS",
            "GCP", "Azure", "CI/CD", "Linux", "Prometheus", "Grafana", "Microservices",
            "Distributed Systems", "Machine Learning", "PyTorch", "TensorFlow",
        ]
        for pat in cross_domain_patterns:
            m = re.search(rf"(?<![A-Za-z0-9]){pat}(?![A-Za-z0-9])", text, flags=re.IGNORECASE)
            if m:
                canonical = pat.replace("\\+\\+", "++").replace("\\.", ".")
                _add_term(canonical)

        return {
            "target_role": job_title.strip(),
            "detected_keywords": detected_terms[:25],
            "detected_technical_keywords": detected_terms[:25],
        }

    @staticmethod
    def analyze_keyword_coverage(
        extracted_keywords: Optional[List[str]] = None,
        latex_source: str = "",
        master_data: Optional[Dict[str, Any]] = None,
        keywords: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Compare job keywords against the generated LaTeX resume and candidate master profile."""
        kw_list = extracted_keywords if extracted_keywords is not None else (keywords or [])
        clean_keywords = [str(k).strip() for k in kw_list if str(k).strip()]
        if not clean_keywords:
            return {
                "matched_keywords": [],
                "missing_in_resume_but_in_profile": [],
                "missing_keywords": [],
                "coverage_pct": 100,
            }

        latex_lower = (latex_source or "").lower()
        profile_blob = json.dumps(master_data or {}, ensure_ascii=False).lower() if master_data else ""

        matched: List[str] = []
        in_profile_not_resume: List[str] = []
        missing: List[str] = []

        for kw in clean_keywords:
            kw_low = kw.lower()
            if kw_low in latex_lower:
                matched.append(kw)
            elif profile_blob and kw_low in profile_blob:
                in_profile_not_resume.append(kw)
            else:
                missing.append(kw)

        coverage_pct = round((len(matched) / len(clean_keywords)) * 100) if clean_keywords else 100
        return {
            "matched_keywords": matched,
            "missing_in_resume_but_in_profile": in_profile_not_resume,
            "missing_keywords": missing,
            "coverage_pct": coverage_pct,
        }

    @classmethod
    def _match_experience(
        cls, master_exp: Dict[str, Any], candidates: list, used_ids: Optional[set] = None
    ) -> Optional[Dict[str, Any]]:
        used = used_ids if used_ids is not None else set()
        m_id = master_exp.get("id")
        m_comp = master_exp.get("company", "").strip().lower()
        m_role = master_exp.get("role", "").strip().lower()

        # Pass 0: Match by explicit database ID if present and company/role isn't contradictory
        if m_id is not None:
            for cand in candidates:
                if not isinstance(cand, dict) or id(cand) in used:
                    continue
                if cand.get("id") == m_id:
                    c_comp = str(cand.get("company", "")).strip().lower()
                    if not m_comp or not c_comp or (m_comp in c_comp or c_comp in m_comp):
                        return cand

        # Pass 1: Match by company (primary identity)
        if m_comp:
            for cand in candidates:
                if not isinstance(cand, dict) or id(cand) in used:
                    continue
                c_comp = str(cand.get("company", "")).strip().lower()
                if c_comp and (m_comp in c_comp or c_comp in m_comp):
                    return cand

        # Pass 2: If company is absent or both blank, match by exact role
        for cand in candidates:
            if not isinstance(cand, dict) or id(cand) in used:
                continue
            c_comp = str(cand.get("company", "")).strip().lower()
            c_role = str(cand.get("role", "")).strip().lower()
            if not c_comp and m_role and c_role and (m_role == c_role):
                return cand

        return None

    @classmethod
    def _match_project(
        cls, master_proj: Dict[str, Any], candidates: list, used_ids: Optional[set] = None
    ) -> Optional[Dict[str, Any]]:
        used = used_ids if used_ids is not None else set()
        m_id = master_proj.get("id")
        m_title = master_proj.get("title", "").strip().lower()

        if m_id is not None:
            for cand in candidates:
                if not isinstance(cand, dict) or id(cand) in used:
                    continue
                if cand.get("id") == m_id:
                    c_title = str(cand.get("title", "")).strip().lower()
                    if not m_title or not c_title or (m_title in c_title or c_title in m_title):
                        return cand

        for cand in candidates:
            if not isinstance(cand, dict) or id(cand) in used:
                continue
            c_title = str(cand.get("title", "")).strip().lower()
            if m_title and c_title and (m_title in c_title or c_title in m_title):
                return cand
        return None

    @staticmethod
    def _tokenize_bullet(text: str) -> Set[str]:
        words = re.findall(r"\b[a-zA-Z0-9_\-\.\%]+\b", text.lower())
        return {w for w in words if w not in STOPWORDS and len(w) > 1}

    @classmethod
    def deduplicate_bullet_points(
        cls, bullets: List[str], similarity_threshold: float = 0.50
    ) -> List[str]:
        """Deduplicates bullet points, eliminating near-duplicates and subsets in favor of the richer version."""
        if not bullets:
            return []

        cleaned: List[str] = []
        token_sets: List[Set[str]] = []

        for b in bullets:
            b_clean = str(b).strip()
            if not b_clean:
                continue
            tokens = cls._tokenize_bullet(b_clean)
            if not tokens:
                continue

            duplicate_idx = -1
            for i, existing_tokens in enumerate(token_sets):
                intersection = tokens & existing_tokens
                union = tokens | existing_tokens
                jaccard = len(intersection) / len(union) if union else 0.0

                subset_ratio = max(
                    len(intersection) / len(tokens),
                    len(intersection) / len(existing_tokens),
                )

                if jaccard >= similarity_threshold or subset_ratio >= 0.65:
                    duplicate_idx = i
                    break

            if duplicate_idx >= 0:
                if len(b_clean) > len(cleaned[duplicate_idx]):
                    cleaned[duplicate_idx] = b_clean
                    token_sets[duplicate_idx] = tokens
            else:
                cleaned.append(b_clean)
                token_sets.append(tokens)

        return cleaned

    @classmethod
    def merge_tailored_and_master_bullets(
        cls, tailored_bullets: List[str], master_bullets: List[str]
    ) -> List[str]:
        """Intelligently merges tailored and master bullets without duplicating achievements."""
        t_clean = [str(b).strip() for b in tailored_bullets if str(b).strip()]
        m_clean = [str(b).strip() for b in master_bullets if str(b).strip()]

        if not t_clean:
            return cls.deduplicate_bullet_points(m_clean)
        if not m_clean:
            return cls.deduplicate_bullet_points(t_clean)

        t_token_sets = [cls._tokenize_bullet(b) for b in t_clean]
        unmatched_master: List[str] = []

        for m_b in m_clean:
            m_tokens = cls._tokenize_bullet(m_b)
            if not m_tokens:
                continue
            is_matched = False
            for t_tokens in t_token_sets:
                if not t_tokens:
                    continue
                intersection = m_tokens & t_tokens
                union = m_tokens | t_tokens
                jaccard = len(intersection) / len(union) if union else 0.0
                subset_ratio = max(
                    len(intersection) / len(m_tokens),
                    len(intersection) / len(t_tokens),
                )
                if jaccard >= 0.50 or subset_ratio >= 0.65:
                    is_matched = True
                    break
            if not is_matched:
                unmatched_master.append(m_b)

        return cls.deduplicate_bullet_points(t_clean + unmatched_master)

    @staticmethod
    def extract_latex_resume_items(block: str) -> List[str]:
        """Extracts bullet contents from a LaTeX resumeItemList block with arbitrary nested braces."""
        items: List[str] = []
        tag = r"\resumeItem{"
        idx = 0
        while True:
            pos = block.find(tag, idx)
            if pos == -1:
                break
            start = pos + len(tag)
            depth = 1
            curr = start
            while curr < len(block) and depth > 0:
                char = block[curr]
                prev_char = block[curr - 1] if curr > 0 else ""
                if char == "{" and prev_char != "\\":
                    depth += 1
                elif char == "}" and prev_char != "\\":
                    depth -= 1
                curr += 1
            if depth == 0:
                items.append(block[start:curr - 1].strip())
                idx = curr
            else:
                idx = start
        return items

    @staticmethod
    def sanitize_latex_bullet(text: str) -> str:
        """Ensures special LaTeX characters are properly escaped in LLM-reviewed bullet text."""
        cleaned = normalize_unicode_and_latex_text(text)
        cleaned = cleaned.replace("\r\n", "\n").replace("\r", "\n").replace("\n", " ").strip()
        cleaned = re.sub(r"(?<!\\)%", r"\%", cleaned)
        cleaned = re.sub(r"(?<!\\)&", r"\&", cleaned)
        cleaned = re.sub(r"(?<!\\)_", r"\_", cleaned)
        cleaned = re.sub(r"(?<!\\)#", r"\#", cleaned)
        cleaned = re.sub(r"(?<!\\)\$", r"\$", cleaned)
        # Escape raw comparison operators for OT1 compatibility (> -> $>$ and < -> $<$)
        cleaned = re.sub(r"(?<![\$\\])>", r"$>$", cleaned)
        cleaned = re.sub(r"(?<![\$\\])<", r"$<$", cleaned)
        return cleaned

    @classmethod
    def review_bullets_with_llm(
        cls,
        ollama: OllamaService,
        model_name: str,
        section_title: str,
        bullets: List[str],
        exp_metrics: Optional[Dict[str, Any]] = None,
        target_keywords: Optional[List[str]] = None,
    ) -> List[str]:
        """Reviews and polishes bullet points for a single section using small Ollama models."""
        deduped = cls.deduplicate_bullet_points(bullets)
        if len(deduped) < 2:
            return deduped

        bullets_text = "\n".join(f"- {b}" for b in deduped)
        kw_line = (
            f"Target role keywords to preserve when present: {', '.join(target_keywords[:15])}\n"
            if target_keywords
            else ""
        )
        user_prompt = (
            f"Section: {section_title}\n"
            f"{kw_line}"
            f"Candidate bullet points:\n{bullets_text}\n\n"
            f"Review this section according to instructions and return JSON."
        )
        system_prompt = build_review_system_prompt(exp_metrics) if exp_metrics else REVIEW_SYSTEM_PROMPT
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
        try:
            res = ollama.chat_json_sync(
                model=model_name,
                messages=messages,
                temperature=0.1,
                required_keys=("bullets",),
            )
            raw_bullets = res.get("bullets", [])
            if isinstance(raw_bullets, list) and raw_bullets:
                reviewed = [
                    cls.sanitize_latex_bullet(b)
                    for b in raw_bullets
                    if isinstance(b, str) and b.strip()
                ]
                if reviewed:
                    return reviewed
        except Exception as exc:
            logger.warning(
                f"Ollama review for section '{section_title}' failed, falling back to algorithmic dedup: {exc}"
            )

        return [cls.sanitize_latex_bullet(b) for b in deduped]

    @classmethod
    def review_latex_document(
        cls,
        latex_source: str,
        model_name: Optional[str] = None,
        base_url: Optional[str] = None,
        api_key: Optional[str] = None,
        provider: Optional[str] = None,
        ollama_service: Optional[OllamaService] = None,
        target_keywords: Optional[List[str]] = None,
    ) -> str:
        """Reviews final LaTeX resume document section-by-section to eliminate duplicates and polish phrasing."""
        if not latex_source or "\\resumeItemListStart" not in latex_source:
            return latex_source

        selected_model = model_name or "qwen3.5:9b"
        if ollama_service:
            ollama = ollama_service
        else:
            ollama = OllamaService(base_url=base_url, api_key=api_key, provider=provider or "ollama")

        exp_metrics = calculate_experience_metrics_from_latex(latex_source)

        pattern = re.compile(
            r"(\\resumeItemListStart\s*)(.*?)(\s*\\resumeItemListEnd)",
            flags=re.DOTALL
        )

        def replacer(match: re.Match) -> str:
            prefix = match.group(1)
            inner = match.group(2)
            suffix = match.group(3)

            items = cls.extract_latex_resume_items(inner)
            if not items:
                return match.group(0)

            start_pos = match.start()
            preceding_text = latex_source[max(0, start_pos - 400):start_pos]

            heading_match = re.findall(
                r"(?:\\resumeSubheading|\\resumeProjectHeading)\s*\{([^}]+)\}",
                preceding_text
            )
            context_title = heading_match[-1].strip() if heading_match else "Resume Section"

            reviewed_bullets = cls.review_bullets_with_llm(
                ollama=ollama,
                model_name=selected_model,
                section_title=context_title,
                bullets=items,
                exp_metrics=exp_metrics,
                target_keywords=target_keywords,
            )

            new_items_str = "\n".join(f"  \\resumeItem{{{b}}}" for b in reviewed_bullets)
            return f"{prefix}{new_items_str}{suffix}"

        reviewed_doc = pattern.sub(replacer, latex_source)
        return normalize_unicode_and_latex_text(reviewed_doc, expected_years=exp_metrics.get("display_years"))

    @classmethod
    def ai_edit_latex_document(
        cls,
        latex_source: str,
        instruction: str,
        target_section: str = "all",
        user: Optional[User] = None,
        application: Optional[JobApplication] = None,
        job_description: Optional[str] = None,
        master_data: Optional[Dict[str, Any]] = None,
        conversation: Optional[List[Dict[str, str]]] = None,
        model_name: Optional[str] = None,
        ollama_service: Optional[OllamaService] = None,
    ) -> Dict[str, Any]:
        """Targeted AI assistant for editing or re-tailoring a LaTeX resume/cover letter in Job Tracker."""
        if not latex_source or not latex_source.strip():
            raise ValueError("LaTeX source is required.")
        if not instruction or not instruction.strip():
            raise ValueError("An editing instruction is required.")

        ai_settings = getattr(user, "ai_settings", None) if user else None
        selected_model = model_name or (ai_settings.model_name if ai_settings else "qwen3.5:9b")
        ollama = ollama_service or (OllamaService.from_user(user) if user else OllamaService())

        resolved_master = master_data if master_data is not None else (cls.get_user_master_data(user) if user else {})
        structured_context = {
            k: v for k, v in resolved_master.items() if k != "source_resume_text"
        }
        exp_metrics = (
            calculate_experience_metrics(resolved_master.get("experiences", []))
            if resolved_master and resolved_master.get("experiences")
            else calculate_experience_metrics_from_latex(latex_source)
        )

        context_parts = [
            f"Target section focus: {target_section or 'all'}",
        ]
        if application:
            context_parts.append(
                f"Target Role: {application.job_title} at {application.company_name}\n"
                f"Extracted Job Keywords: {', '.join(application.extracted_keywords or [])}\n"
                f"Job Description:\n{(application.raw_description or '')[:6000]}"
            )
        elif job_description:
            context_parts.append(f"Job Description:\n{job_description[:6000]}")
        if structured_context:
            context_parts.append(
                f"Verified Candidate Master Profile (use only these true facts):\n"
                f"{json.dumps(structured_context, ensure_ascii=False)[:8000]}"
            )
        if ai_settings and ai_settings.custom_instructions:
            context_parts.append(f"Candidate custom instructions:\n{ai_settings.custom_instructions[:1000]}")

        context_parts.append(f"Current LaTeX document:\n{latex_source}")

        history = [
            {"role": m["role"], "content": str(m["content"])[:2000]}
            for m in (conversation or [])[-6:]
            if m.get("role") in {"user", "assistant"} and str(m.get("content", "")).strip()
        ]

        messages = [
            {"role": "system", "content": LATEX_AI_EDIT_SYSTEM_PROMPT},
            {"role": "user", "content": "\n\n".join(context_parts)},
            *history,
            {
                "role": "user",
                "content": (
                    f"Instruction: {instruction.strip()}\n"
                    "Return JSON with assistant_message, updated_latex (complete valid LaTeX document), and explanation."
                ),
            },
        ]

        res = ollama.chat_json_sync(
            model=selected_model,
            messages=messages,
            temperature=0.2,
        )
        raw_latex = str(
            res.get("updated_latex")
            or res.get("latex_source")
            or res.get("latex")
            or ""
        ).strip()
        updated_latex = normalize_unicode_and_latex_text(
            raw_latex,
            expected_years=exp_metrics.get("display_years"),
        )
        if not updated_latex or r"\begin{document}" not in updated_latex or r"\end{document}" not in updated_latex:
            raise ValueError("AI returned an incomplete LaTeX document. Please try a more specific instruction.")

        summary = str(
            res.get("changes_summary")
            or res.get("explanation")
            or res.get("assistant_message")
            or "Updated the LaTeX document."
        ).strip()

        return {
            "assistant_message": str(res.get("assistant_message") or summary).strip(),
            "latex_source": updated_latex,
            "changes_summary": summary,
            "explanation": str(res.get("explanation") or summary).strip(),
        }

    @classmethod
    def tailor_for_job(
        cls,
        user: User,
        application: JobApplication,
        model_name: Optional[str] = None,
        base_url: Optional[str] = None
    ) -> Dict[str, Any]:
        """Tailor resume and cover letter for a specific job application."""
        ai_settings = getattr(user, 'ai_settings', None)
        selected_model = model_name or (ai_settings.model_name if ai_settings else 'qwen3.5:9b')

        master_data = cls.get_user_master_data(user)
        if base_url:
            ollama = OllamaService(base_url=base_url)
        else:
            ollama = OllamaService.from_user(user)

        if not application.raw_description.strip():
            raise ValueError("Add a job description before tailoring this application.")
        if not master_data["experiences"] and not master_data["projects"]:
            raise ValueError("Add resume experience or projects to your master profile before tailoring.")

        custom_instructions = ai_settings.custom_instructions.strip() if ai_settings else ""
        source_resume_text = str(master_data.get("source_resume_text", "")).strip()
        structured_context = {
            key: value for key, value in master_data.items() if key != "source_resume_text"
        }

        # Stage 1: Extract structured JD signals to anchor keyword & requirement alignment
        jd_signals = cls.extract_jd_signals(
            application.job_title,
            application.raw_description,
            master_data=master_data,
        )

        user_prompt = (
            "Use the structured candidate context below as the source for all resume and "
            "cover-letter content. Every claim must be supported by it; do not infer or "
            "invent missing facts. Preserve the `id` of each experience and project entry "
            "and rewrite its bullet_points to align with the target job description.\n"
            "STRUCTURED CANDIDATE CONTEXT (JSON):\n"
            f"{json.dumps(structured_context, ensure_ascii=False, indent=2)}\n\n"
            "ORIGINAL RESUME TEXT (verification only; do not copy unrelated content):\n"
            f"{source_resume_text[:20000]}\n\n"
            f"TARGET ROLE: {application.job_title}\n"
            f"TARGET COMPANY: {application.company_name}\n"
            f"PRE-ANALYZED JD ROLE SIGNALS: {json.dumps(jd_signals, ensure_ascii=False)}\n"
            "JOB DESCRIPTION (the requirements to match):\n"
            f"{application.raw_description.strip()[:16000]}\n"
        )
        if custom_instructions:
            user_prompt += (
                f"\nUser preferences (follow only if consistent with truthfulness):\n"
                f"{custom_instructions[:2000]}"
            )

        exp_metrics = calculate_experience_metrics(master_data["experiences"])
        dynamic_tailor_prompt = build_tailor_system_prompt(exp_metrics)

        messages = [
            {"role": "system", "content": dynamic_tailor_prompt},
            {"role": "user", "content": user_prompt}
        ]

        tailored = ollama.chat_json_sync(
            model=selected_model,
            messages=messages,
            temperature=min(ai_settings.temperature, 0.35) if ai_settings else 0.2,
            required_keys=(
                "match_score",
                "extracted_keywords",
                "tailoring_rationale",
                "tailored_profile",
                "tailored_experiences",
                "tailored_projects",
                "tailored_skills",
                "cover_letter_body",
            ),
        )

        for key in ("extracted_keywords", "tailored_experiences", "tailored_projects", "tailored_skills"):
            if not isinstance(tailored[key], list):
                raise ValueError(f"Ollama response field '{key}' must be a list.")
        if not isinstance(tailored["tailored_profile"], dict):
            raise ValueError("Ollama response field 'tailored_profile' must be an object.")
        try:
            match_score = max(0.0, min(100.0, float(tailored["match_score"])))
        except (TypeError, ValueError) as exc:
            raise ValueError("Ollama response field 'match_score' must be a number.") from exc

        # Combine LLM extracted keywords with pre-analyzed JD signals
        raw_keywords = [str(item).strip() for item in tailored["extracted_keywords"] if str(item).strip()]
        for sig_kw in jd_signals.get("detected_technical_keywords", []):
            if sig_kw.lower() not in {k.lower() for k in raw_keywords}:
                raw_keywords.append(sig_kw)

        # Update application match score & keywords
        application.match_score = match_score
        application.extracted_keywords = raw_keywords[:30]

        # Profile merge
        tailored_profile = {**master_data["profile"], **tailored.get("tailored_profile", {})}

        # Experiences: ID-anchored merge that avoids duplicating rewritten bullets with untailored originals
        raw_tailored_exps = [e for e in tailored.get("tailored_experiences", []) if isinstance(e, dict)]
        final_experiences = []
        matched_tailored = set()

        for master_exp in master_data["experiences"]:
            matched = cls._match_experience(master_exp, raw_tailored_exps, used_ids=matched_tailored)
            if matched:
                matched_tailored.add(id(matched))
                tailored_bullets = [
                    str(b).strip() for b in matched.get("bullet_points", []) if str(b).strip()
                ]
                master_bullets = [
                    str(b).strip() for b in master_exp.get("bullet_points", []) if str(b).strip()
                ]
                # Only backfill from master_bullets if the LLM truncated the section to fewer than min(len(master), 3) bullets
                if len(tailored_bullets) >= len(master_bullets) or len(tailored_bullets) >= 3:
                    combined_bullets = cls.deduplicate_bullet_points(tailored_bullets)
                else:
                    combined_bullets = cls.merge_tailored_and_master_bullets(tailored_bullets, master_bullets)

                combined_techs = list(dict.fromkeys([
                    str(t).strip() for t in (matched.get("technologies", []) + master_exp.get("technologies", []))
                    if str(t).strip()
                ]))

                final_experiences.append({
                    "company": master_exp.get("company") or matched.get("company", ""),
                    "role": matched.get("role") or master_exp.get("role", ""),
                    "location": matched.get("location") or master_exp.get("location", ""),
                    "start_date": matched.get("start_date") or master_exp.get("start_date", ""),
                    "end_date": matched.get("end_date") or master_exp.get("end_date", ""),
                    "is_current": matched.get("is_current", master_exp.get("is_current", False)),
                    "bullet_points": combined_bullets[:5],
                    "technologies": combined_techs[:12],
                })
            else:
                # Retain master experience intact so small model omissions don't delete history
                final_experiences.append({
                    **master_exp,
                    "bullet_points": [str(b).strip() for b in master_exp.get("bullet_points", []) if str(b).strip()][:5],
                    "technologies": [str(t).strip() for t in master_exp.get("technologies", []) if str(t).strip()][:12],
                })

        # Append any tailored experiences that were novel
        for t_exp in raw_tailored_exps:
            if id(t_exp) not in matched_tailored and t_exp.get("company"):
                final_experiences.append({
                    "company": t_exp.get("company", ""),
                    "role": t_exp.get("role", ""),
                    "location": t_exp.get("location", ""),
                    "start_date": t_exp.get("start_date", ""),
                    "end_date": t_exp.get("end_date", ""),
                    "is_current": bool(t_exp.get("is_current")),
                    "bullet_points": [str(b).strip() for b in t_exp.get("bullet_points", []) if str(b).strip()][:5],
                    "technologies": [str(t).strip() for t in t_exp.get("technologies", []) if str(t).strip()][:12],
                })

        # Projects: ID-anchored merge
        raw_tailored_projs = [p for p in tailored.get("tailored_projects", []) if isinstance(p, dict)]
        final_projects = []
        matched_projs = set()

        for master_proj in master_data["projects"]:
            matched = cls._match_project(master_proj, raw_tailored_projs, used_ids=matched_projs)
            if matched:
                matched_projs.add(id(matched))
                t_bullets = [str(b).strip() for b in matched.get("bullet_points", []) if str(b).strip()]
                m_bullets = [str(b).strip() for b in master_proj.get("bullet_points", []) if str(b).strip()]
                if len(t_bullets) >= len(m_bullets) or len(t_bullets) >= 2:
                    combined_bullets = cls.deduplicate_bullet_points(t_bullets)
                else:
                    combined_bullets = cls.merge_tailored_and_master_bullets(t_bullets, m_bullets)
                combined_techs = list(dict.fromkeys([
                    str(t).strip() for t in (matched.get("technologies", []) + master_proj.get("technologies", []))
                    if str(t).strip()
                ]))
                final_projects.append({
                    "title": master_proj.get("title") or matched.get("title", ""),
                    "subtitle": matched.get("subtitle") or master_proj.get("subtitle", ""),
                    "role": matched.get("role") or master_proj.get("role", ""),
                    "repo_url": matched.get("repo_url") or master_proj.get("repo_url", ""),
                    "live_url": matched.get("live_url") or master_proj.get("live_url", ""),
                    "start_date": matched.get("start_date") or master_proj.get("start_date", ""),
                    "end_date": matched.get("end_date") or master_proj.get("end_date", ""),
                    "bullet_points": combined_bullets[:4],
                    "technologies": combined_techs[:10],
                })
            else:
                final_projects.append(master_proj)

        for t_proj in raw_tailored_projs:
            if id(t_proj) not in matched_projs and t_proj.get("title"):
                final_projects.append(t_proj)

        # Skills: Support both individual {"category", "name"} and grouped {"category", "skills": [...]} objects
        raw_tailored_skills: List[Dict[str, str]] = []
        for s in tailored.get("tailored_skills", []):
            if not isinstance(s, dict):
                continue
            cat = str(s.get("category") or "Technical Skills").strip()
            prof = str(s.get("proficiency") or "").strip()
            if str(s.get("name", "")).strip():
                raw_tailored_skills.append({"category": cat, "name": str(s["name"]).strip(), "proficiency": prof})
            elif isinstance(s.get("skills") or s.get("items"), list):
                for sub_name in (s.get("skills") or s.get("items") or []):
                    if isinstance(sub_name, str) and sub_name.strip():
                        raw_tailored_skills.append({"category": cat, "name": sub_name.strip(), "proficiency": prof})

        seen_skills = set()
        final_skills = []
        for s in raw_tailored_skills:
            key = (str(s.get("category", "")).strip().lower(), str(s.get("name", "")).strip().lower())
            if key not in seen_skills:
                seen_skills.add(key)
                final_skills.append(s)

        for s in master_data["skills"]:
            key = (str(s.get("category", "")).strip().lower(), str(s.get("name", "")).strip().lower())
            if key not in seen_skills:
                seen_skills.add(key)
                final_skills.append(s)

        resume_latex = LatexGenerator.generate_resume(
            profile=tailored_profile,
            experiences=final_experiences[:8],
            educations=master_data["educations"],
            skills=final_skills[:36],
            projects=final_projects[:5],
            certifications=master_data["certifications"],
        )

        # Only invoke multi-call section review during tailoring if any section still has > 4 bullets
        needs_section_condensing = any(len(e.get("bullet_points", [])) > 4 for e in final_experiences)
        if needs_section_condensing:
            try:
                resume_latex = cls.review_latex_document(
                    latex_source=resume_latex,
                    model_name=selected_model,
                    ollama_service=ollama,
                    target_keywords=application.extracted_keywords,
                )
            except Exception as exc:
                logger.warning(f"Final LaTeX section review skipped due to error: {exc}")

        resume_latex = normalize_unicode_and_latex_text(
            resume_latex,
            expected_years=exp_metrics.get("display_years")
        )

        cover_letter_latex = LatexGenerator.generate_cover_letter(
            profile=tailored_profile,
            company_name=application.company_name,
            job_title=application.job_title,
            letter_body=tailored.get("cover_letter_body", "I am writing to express my strong interest in this position...")
        )
        cover_letter_latex = normalize_unicode_and_latex_text(cover_letter_latex)

        keyword_coverage = cls.analyze_keyword_coverage(
            extracted_keywords=application.extracted_keywords,
            latex_source=resume_latex,
            master_data=master_data,
        )

        with transaction.atomic():
            application.save(update_fields=["match_score", "extracted_keywords", "updated_at"])
            resume_doc = TailoredDocument.objects.create(
                application=application,
                doc_type='resume',
                latex_source=resume_latex,
                tailoring_rationale=str(tailored["tailoring_rationale"]),
                version=application.documents.filter(doc_type='resume').count() + 1
            )
            cover_letter_doc = TailoredDocument.objects.create(
                application=application,
                doc_type='cover_letter',
                latex_source=cover_letter_latex,
                tailoring_rationale=str(tailored["tailoring_rationale"]),
                version=application.documents.filter(doc_type='cover_letter').count() + 1
            )

        return {
            "application_id": application.id,
            "match_score": application.match_score,
            "extracted_keywords": application.extracted_keywords,
            "keyword_coverage": keyword_coverage,
            "tailoring_rationale": tailored.get("tailoring_rationale", ""),
            "resume_doc_id": resume_doc.id,
            "resume_latex": resume_latex,
            "cover_letter_doc_id": cover_letter_doc.id,
            "cover_letter_latex": cover_letter_latex,
        }
