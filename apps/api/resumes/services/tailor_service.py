import json
from typing import Any, Dict, Optional
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
from .latex_templates import LatexGenerator

TAILOR_SYSTEM_PROMPT = """You tailor resumes for ATS relevance using only facts in the candidate profile.
Never invent skills, employers, dates, achievements, or metrics. Prefer exact job-description terminology only
when the candidate evidence supports it. Select a concise subset suitable for one page: at most 4 experiences
with 4 bullets each, 3 projects with 3 bullets each, and 24 skills. Return JSON only.

Required schema:
{
  "match_score": 85,
  "extracted_keywords": ["Python", "Kubernetes", "Distributed Systems"],
  "tailoring_rationale": "Prioritized backend scalability work and omitted older frontend-focused roles to keep the resume focused on systems engineering.",
  "tailored_profile": {
    "headline": "Targeted headline matching role",
    "summary": "1-2 sentence targeted summary"
  },
  "tailored_experiences": [
    {
      "company": "...",
      "role": "...",
      "location": "...",
      "start_date": "...",
      "end_date": "...",
      "is_current": false,
      "bullet_points": ["Adapted bullet point 1", "Adapted bullet point 2"],
      "technologies": ["Python", "Docker"]
    }
  ],
  "tailored_projects": [
    {
      "title": "...",
      "subtitle": "...",
      "role": "...",
      "repo_url": "...",
      "live_url": "...",
      "start_date": "...",
      "end_date": "...",
      "bullet_points": ["Project bullet point"],
      "technologies": ["..."]
    }
  ],
  "tailored_skills": [
    {
      "category": "Languages",
      "name": "Python",
      "proficiency": "expert"
    }
  ],
  "cover_letter_body": "Paragraph 1...\n\nParagraph 2...\n\nParagraph 3..."
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

        return {
            "profile": profile_dict,
            "experiences": experiences,
            "educations": educations,
            "skills": skills,
            "projects": projects,
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
        # Check user AI settings
        ai_settings = getattr(user, 'ai_settings', None)
        endpoint = base_url or (ai_settings.ollama_endpoint if ai_settings else None)
        selected_model = model_name or (ai_settings.model_name if ai_settings else 'qwen3.5:9b')

        master_data = cls.get_user_master_data(user)
        ollama = OllamaService(base_url=endpoint)

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

        messages = [
            {"role": "system", "content": TAILOR_SYSTEM_PROMPT},
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

        # Build tailored resume LaTeX
        tailored_profile = {**master_data["profile"], **tailored.get("tailored_profile", {})}
        tailored_experiences = [
            item for item in (tailored.get("tailored_experiences") or master_data["experiences"])
            if isinstance(item, dict)
        ][:4]
        for experience in tailored_experiences:
            experience["bullet_points"] = [
                str(bullet) for bullet in experience.get("bullet_points", []) if str(bullet).strip()
            ][:4]
            experience["technologies"] = [
                str(technology) for technology in experience.get("technologies", []) if str(technology).strip()
            ][:8]

        tailored_projects = [
            item for item in (tailored.get("tailored_projects") or master_data["projects"])
            if isinstance(item, dict)
        ][:3]
        for project in tailored_projects:
            project["bullet_points"] = [
                str(bullet) for bullet in project.get("bullet_points", []) if str(bullet).strip()
            ][:3]
            project["technologies"] = [
                str(technology) for technology in project.get("technologies", []) if str(technology).strip()
            ][:6]

        tailored_skills = [
            item for item in (tailored.get("tailored_skills") or master_data["skills"])
            if isinstance(item, dict) and str(item.get("name", "")).strip()
        ][:24]

        resume_latex = LatexGenerator.generate_resume(
            profile=tailored_profile,
            experiences=tailored_experiences,
            educations=master_data["educations"],
            skills=tailored_skills,
            projects=tailored_projects
        )

        cover_letter_latex = LatexGenerator.generate_cover_letter(
            profile=tailored_profile,
            company_name=application.company_name,
            job_title=application.job_title,
            letter_body=tailored.get("cover_letter_body", "I am writing to express my strong interest in this position...")
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
            "tailoring_rationale": tailored.get("tailoring_rationale", ""),
            "resume_doc_id": resume_doc.id,
            "resume_latex": resume_latex,
            "cover_letter_doc_id": cover_letter_doc.id,
            "cover_letter_latex": cover_letter_latex,
        }
