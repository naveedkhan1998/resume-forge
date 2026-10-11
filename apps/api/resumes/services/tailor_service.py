import json
import logging
from typing import Dict, Any, List, Optional
from django.contrib.auth.models import User
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

logger = logging.getLogger(__name__)

TAILOR_SYSTEM_PROMPT = """You are an elite career strategist and technical resume tailoring expert.
Your goal is to tailor a candidate's comprehensive master profile to match a specific job description for maximum ATS (Applicant Tracking System) ranking and recruiter appeal.

You must:
1. Identify key technologies, qualifications, and core responsibilities from the job description.
2. Calculate a realistic candidate match score between 0 and 100 based on their experience.
3. Select only the MOST RELEVANT experiences, projects, and skills to fit a clean, targeted 1-page resume. Deliberately discard or de-prioritize experiences or bullet points that do not add strong value for this specific role.
4. Adapt bullet points to emphasize relevant technical achievements, action verbs, and measurable impact (e.g., STAR format) while staying truthful to what the candidate did.
5. Write a persuasive, tailored cover letter body (3-4 paragraphs) expressing genuine excitement for the role and tying their top 2-3 achievements to the company's needs.
6. Provide an honest rationale explaining what you kept, what you omitted, and why.

You must output strictly valid JSON matching this schema:
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

        user_prompt = f"""
Candidate Master Profile:
{json.dumps(master_data, indent=2)}

Target Job Application:
Company: {application.company_name}
Position: {application.job_title}
Job URL: {application.job_url}
Job Description:
{application.raw_description}
"""

        messages = [
            {"role": "system", "content": TAILOR_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt}
        ]

        response = ollama.chat_sync(
            model=selected_model,
            messages=messages,
            temperature=0.2,
            format_json=True
        )

        content = response.get("content", "{}")
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()

        tailored = json.loads(content)

        # Update application match score & keywords
        match_score = tailored.get("match_score")
        if match_score is not None:
            application.match_score = float(match_score)
        application.extracted_keywords = tailored.get("extracted_keywords", [])
        application.save()

        # Build tailored resume LaTeX
        tailored_profile = {**master_data["profile"], **tailored.get("tailored_profile", {})}
        tailored_experiences = tailored.get("tailored_experiences", master_data["experiences"])
        tailored_projects = tailored.get("tailored_projects", master_data["projects"])
        tailored_skills = tailored.get("tailored_skills", master_data["skills"])

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

        # Save documents
        resume_doc = TailoredDocument.objects.create(
            application=application,
            doc_type='resume',
            latex_source=resume_latex,
            tailoring_rationale=tailored.get("tailoring_rationale", ""),
            version=application.documents.filter(doc_type='resume').count() + 1
        )

        cover_letter_doc = TailoredDocument.objects.create(
            application=application,
            doc_type='cover_letter',
            latex_source=cover_letter_latex,
            tailoring_rationale=tailored.get("tailoring_rationale", ""),
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
