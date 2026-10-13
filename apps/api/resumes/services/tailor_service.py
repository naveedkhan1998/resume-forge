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
    return f"""You are an expert resume copyeditor and career coach.
Your task is to review the bullet points for a single resume section (a specific job role or project).

Rules:
1. Eliminate all semantic duplicates, redundant phrasings, and logically overlapping points.
2. If two bullets describe the same accomplishment, combine them into one concise, impactful bullet point or keep the strongest version.
3. Technical & Domain Accuracy:
   - Experience Duration: {exp_guideline}
   - Latency: Never write "boosting latency" or "increasing latency" for an optimization. Latency is delay: you "reduce latency", "lower latency", or "slash latency".
   - Cloud Anomaly Detection: CloudWatch/Prometheus anomaly detection MTTD operates in seconds (e.g., sub-60s) or minutes, NEVER microseconds across cloud networks.
   - Quantitative Trading: The standard metric is "signal-to-order latency" (time from algorithmic signal evaluation to broker receipt), NEVER "order-to-signal".
   - Cloud Platform Attribution: AWS CDK belongs strictly to AWS/DevOps alongside Terraform, NEVER under GCP.
   - Plain Text Notation & Metrics: Write plain text "CI/CD" (never "$CI/CD$"), plain text "asynchronous I/O" or "async I/O" (never "$1/O$" or "$I/O$"), and plain text metrics like "sub-40s" or "<40s" (never tilted math mode like "$<40$ s").
   - Artificial Intelligence: Write uppercase "AI" (capital A, capital I, e.g. "AI platforms", "AI deployment", "AI-ready", "AI-powered"), never "Al" with lowercase 'l'.
   - Branding & Typos: Always write "FastAPI" (single word, never "Fast API") and "async" (never "asyne").
4. Clean Typography:
   - Use standard ASCII hyphens (-) for compound words (e.g. "high-throughput", "low-latency", "multi-tenant"). Never use non-breaking Unicode hyphens (U+2011) or narrow spaces.
   - For comparisons, use clean syntax like >1,000 or <60s or sub-40s.
5. Every bullet point MUST start with a strong active past-tense action verb (e.g., Engineered, Architected, Spearheaded, Scaled, Automated, Built, Deployed).
6. Preserve all true metrics, percentages, numbers, technologies, and facts. NEVER hallucinate new facts or numbers.
7. Keep bullets concise (1-2 sentences each). Return between 2 and 4 distinct, polished bullet points (or 1-2 for small projects) as a single JSON object in the exact schema:
{{
  "bullets": [
    "Polished bullet point 1",
    "Polished bullet point 2"
  ]
}}
"""


def build_tailor_system_prompt(exp_metrics: Optional[Dict[str, Any]] = None) -> str:
    exp_guideline = get_experience_prompt_guidelines(exp_metrics or {})
    return f"""You are an expert ATS resume optimizer and career coach.
Your task is to tailor the candidate's existing resume to strongly match the target job description while preserving all factual truth, metrics, employers, and achievements.

Rules:
- Return ONLY valid JSON in the exact schema below.
- Preserve factual data. Never invent companies, roles, dates, degrees, metrics, or unsupported technologies.
- DO NOT truncate or omit the candidate's substantive work history. Maintain all valid experiences and projects from the candidate profile.
- Technical & Domain Accuracy:
  - Experience Duration: {exp_guideline}
  - Latency is delay: always say "reducing latency", "lowering latency", or "cutting latency", NEVER "boosting latency".
  - Cloud anomaly detection & monitoring MTTD operates in seconds (e.g. "sub-60s"), never microseconds.
  - Quantitative finance metrics: use "signal-to-order latency", NEVER "order-to-signal".
  - Cloud stacks: AWS CDK belongs to AWS / DevOps & Infrastructure, never GCP.
  - Plain text notation: write plain text "CI/CD" (never "$CI/CD$"), "asynchronous I/O" (never "$1/O$" or "$I/O$"), and "sub-40s" / "<40s" (never "$<40$ s").
  - AI naming: write uppercase "AI" (capital A, capital I, e.g. "AI platforms", "AI deployment", "AI-ready"), never "Al" with lowercase 'l'.
  - Branding & typos: write "FastAPI" (single word, never "Fast API") and "async" (never "asyne").
  - Characters: Use standard ASCII hyphens (-) for compound adjectives (high-throughput, low-latency, multi-tenant). Never output Unicode non-breaking hyphens (U+2011) or narrow spaces.
  - Skills Organization: Group skills into exactly 5 compact categories: Programming Languages, Frameworks & Backend, Cloud & DevOps, Databases & Caching, Observability & Tools. In Cloud & DevOps, streamline to "Docker, Kubernetes (EKS, GKE), Terraform, AWS CDK, GitLab CI/CD, GitHub Actions, Nginx" without repeating Kubernetes.
- Tailor experience bullet points: Align phrasing with job requirements, highlighting relevant tools, scope, and impact from the candidate's actual work.
- Prioritize and categorize skills relevant to the target job description.
- Retain all certifications and education details.
- Provide a targeted headline and 2-3 sentence executive summary reflecting the target position.
- Provide a professional, compelling 3-paragraph cover letter tailored to the company and role.
- Calculate an objective match_score (0-100) reflecting how well the candidate's profile satisfies the job requirements.
- Extract top target keywords from the job description.

Required schema:
{{
  "match_score": 85,
  "extracted_keywords": ["Python", "Kubernetes", "Distributed Systems"],
  "tailoring_rationale": "Prioritized backend scalability work and aligned terminology with the target role.",
  "tailored_profile": {{
    "headline": "Targeted headline matching role",
    "summary": "2-3 sentence targeted executive summary"
  }},
  "tailored_experiences": [
    {{
      "company": "...",
      "role": "...",
      "location": "...",
      "start_date": "...",
      "end_date": "...",
      "is_current": false,
      "bullet_points": ["Adapted bullet point 1", "Adapted bullet point 2"],
      "technologies": ["Python", "Docker"]
    }}
  ],
  "tailored_projects": [
    {{
      "title": "...",
      "subtitle": "...",
      "role": "...",
      "repo_url": "...",
      "live_url": "...",
      "start_date": "...",
      "end_date": "...",
      "bullet_points": ["Project bullet point"],
      "technologies": ["..."]
    }}
  ],
  "tailored_skills": [
    {{
      "category": "Languages",
      "name": "Python",
      "proficiency": "expert"
    }}
  ],
  "cover_letter_body": "Paragraph 1...\\n\\nParagraph 2...\\n\\nParagraph 3..."
}}
"""

REVIEW_SYSTEM_PROMPT = build_review_system_prompt()
TAILOR_SYSTEM_PROMPT = build_tailor_system_prompt()


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

        experiences = list(user.experiences.values(
            'company', 'role', 'location', 'start_date', 'end_date', 'is_current', 'bullet_points', 'technologies'
        ))
        educations = list(user.educations.values(
            'institution', 'degree', 'field_of_study', 'start_date', 'end_date', 'gpa', 'highlights'
        ))
        skills = list(user.skills.values('category', 'name', 'proficiency'))
        projects = list(user.projects.values(
            'title', 'subtitle', 'role', 'repo_url', 'live_url', 'start_date', 'end_date', 'bullet_points', 'technologies'
        ))
        certifications = list(user.certifications.values(
            'name', 'issuer', 'issue_date', 'credential_url'
        ))

        return {
            "profile": profile_dict,
            "experiences": experiences,
            "educations": educations,
            "skills": skills,
            "projects": projects,
            "certifications": certifications,
        }

    @classmethod
    def _match_experience(
        cls, master_exp: Dict[str, Any], candidates: list, used_ids: Optional[set] = None
    ) -> Optional[Dict[str, Any]]:
        used = used_ids if used_ids is not None else set()
        m_comp = master_exp.get("company", "").strip().lower()
        m_role = master_exp.get("role", "").strip().lower()

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
        m_title = master_proj.get("title", "").strip().lower()
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
    ) -> List[str]:
        """Reviews and polishes bullet points for a single section using small Ollama models."""
        deduped = cls.deduplicate_bullet_points(bullets)
        if len(deduped) < 2:
            return deduped

        bullets_text = "\n".join(f"- {b}" for b in deduped)
        user_prompt = (
            f"Section: {section_title}\n"
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
            )

            new_items_str = "\n".join(f"  \\resumeItem{{{b}}}" for b in reviewed_bullets)
            return f"{prefix}{new_items_str}{suffix}"

        reviewed_doc = pattern.sub(replacer, latex_source)
        return normalize_unicode_and_latex_text(reviewed_doc, expected_years=exp_metrics.get("display_years"))


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
        user_prompt = (
            f"Candidate profile:\n{json.dumps(master_data, separators=(',', ':'))}\n\n"
            f"Target: {application.job_title} at {application.company_name}\n"
            f"Job description:\n{application.raw_description.strip()[:16000]}\n"
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

        # Update application match score & keywords
        application.match_score = match_score
        application.extracted_keywords = [str(item) for item in tailored["extracted_keywords"][:30]]

        # Profile merge
        tailored_profile = {**master_data["profile"], **tailored.get("tailored_profile", {})}

        # Experiences: Intelligent merge preserving candidate history
        raw_tailored_exps = [e for e in tailored.get("tailored_experiences", []) if isinstance(e, dict)]
        final_experiences = []
        matched_tailored = set()

        for master_exp in master_data["experiences"]:
            matched = cls._match_experience(master_exp, raw_tailored_exps, used_ids=matched_tailored)
            if matched:
                matched_tailored.add(id(matched))
                # Take tailored bullets
                tailored_bullets = [
                    str(b).strip() for b in matched.get("bullet_points", []) if str(b).strip()
                ]
                master_bullets = [
                    str(b).strip() for b in master_exp.get("bullet_points", []) if str(b).strip()
                ]
                # Intelligently merge tailored and master bullets without duplicates
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
                    "bullet_points": combined_bullets[:6],
                    "technologies": combined_techs[:12],
                })
            else:
                # Retain master experience intact so small model omissions don't delete history
                final_experiences.append({
                    **master_exp,
                    "bullet_points": [str(b).strip() for b in master_exp.get("bullet_points", []) if str(b).strip()][:6],
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
                    "bullet_points": [str(b).strip() for b in t_exp.get("bullet_points", []) if str(b).strip()][:6],
                    "technologies": [str(t).strip() for t in t_exp.get("technologies", []) if str(t).strip()][:12],
                })

        # Projects: Intelligent merge
        raw_tailored_projs = [p for p in tailored.get("tailored_projects", []) if isinstance(p, dict)]
        final_projects = []
        matched_projs = set()

        for master_proj in master_data["projects"]:
            matched = cls._match_project(master_proj, raw_tailored_projs, used_ids=matched_projs)
            if matched:
                matched_projs.add(id(matched))
                t_bullets = [str(b).strip() for b in matched.get("bullet_points", []) if str(b).strip()]
                m_bullets = [str(b).strip() for b in master_proj.get("bullet_points", []) if str(b).strip()]
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
                    "bullet_points": combined_bullets[:5],
                    "technologies": combined_techs[:10],
                })
            else:
                final_projects.append(master_proj)

        for t_proj in raw_tailored_projs:
            if id(t_proj) not in matched_projs and t_proj.get("title"):
                final_projects.append(t_proj)

        # Skills: Combine tailored + master skills
        raw_tailored_skills = [
            s for s in tailored.get("tailored_skills", [])
            if isinstance(s, dict) and str(s.get("name", "")).strip()
        ]
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

        # Final section-by-section review to eliminate any duplicates and polish phrasing
        try:
            resume_latex = cls.review_latex_document(
                latex_source=resume_latex,
                model_name=selected_model,
                ollama_service=ollama,
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
            "tailoring_rationale": tailored.get("tailoring_rationale", ""),
            "resume_doc_id": resume_doc.id,
            "resume_latex": resume_latex,
            "cover_letter_doc_id": cover_letter_doc.id,
            "cover_letter_latex": cover_letter_latex,
        }
