import json
import re
import io
import logging
from typing import Dict, Any, Optional
import pypdf
import pdfplumber
import docx
from django.contrib.auth.models import User
from ..models import (
    Profile,
    Experience,
    Education,
    Skill,
    Project,
    Certification,
    ItemEmbedding,
)
from .ollama_service import OllamaService

logger = logging.getLogger(__name__)

PARSE_SYSTEM_PROMPT = """You are an expert AI resume parser. 
Your task is to thoroughly analyze the provided resume text and extract all information into a strict JSON structure.
Be exhaustive: do not omit any job positions, bullet points, skills, projects, or educational history.
Ensure your response is valid JSON matching this exact schema:

{
  "profile": {
    "full_name": "string",
    "headline": "string",
    "email": "string",
    "phone": "string",
    "location": "string",
    "website_url": "string",
    "linkedin_url": "string",
    "github_url": "string",
    "summary": "string"
  },
  "experiences": [
    {
      "company": "string",
      "role": "string",
      "location": "string",
      "start_date": "string",
      "end_date": "string",
      "is_current": boolean,
      "bullet_points": ["string"],
      "technologies": ["string"]
    }
  ],
  "educations": [
    {
      "institution": "string",
      "degree": "string",
      "field_of_study": "string",
      "start_date": "string",
      "end_date": "string",
      "gpa": "string",
      "highlights": ["string"]
    }
  ],
  "skills": [
    {
      "category": "string (e.g. Languages, Frameworks, Cloud & DevOps, Databases, Tools)",
      "name": "string",
      "proficiency": "string"
    }
  ],
  "projects": [
    {
      "title": "string",
      "subtitle": "string",
      "role": "string",
      "repo_url": "string",
      "live_url": "string",
      "start_date": "string",
      "end_date": "string",
      "bullet_points": ["string"],
      "technologies": ["string"]
    }
  ],
  "certifications": [
    {
      "name": "string",
      "issuer": "string",
      "issue_date": "string",
      "credential_url": "string"
    }
  ]
}
"""

class ResumeParser:
    @staticmethod
    def extract_text(file_obj, filename: str) -> str:
        """Extract raw plain text from PDF, DOCX, or TXT."""
        ext = filename.lower().split('.')[-1]
        content_bytes = file_obj.read() if hasattr(file_obj, 'read') else file_obj
        if isinstance(content_bytes, str):
            return content_bytes

        if ext == 'pdf':
            text = ""
            try:
                with pdfplumber.open(io.BytesIO(content_bytes)) as pdf:
                    for page in pdf.pages:
                        extracted = page.extract_text()
                        if extracted:
                            text += extracted + "\n"
            except Exception as e:
                logger.warning(f"pdfplumber failed, falling back to pypdf: {e}")
                reader = pypdf.PdfReader(io.BytesIO(content_bytes))
                for page in reader.pages:
                    text += (page.extract_text() or "") + "\n"
            return text.strip()

        elif ext in ('docx', 'doc'):
            doc = docx.Document(io.BytesIO(content_bytes))
            text_lines = [p.text for p in doc.paragraphs if p.text.strip()]
            for table in doc.tables:
                for row in table.rows:
                    row_text = [cell.text.strip() for cell in row.cells if cell.text.strip()]
                    if row_text:
                        text_lines.append(" | ".join(row_text))
            return "\n".join(text_lines).strip()

        else: # txt or other text format
            try:
                return content_bytes.decode('utf-8', errors='ignore').strip()
            except Exception:
                return str(content_bytes)

    @classmethod
    def parse_with_ai(cls, raw_text: str, model_name: str = "qwen3.5:9b", base_url: Optional[str] = None) -> Dict[str, Any]:
        """Use Ollama to extract structured data from raw resume text."""
        ollama = OllamaService(base_url=base_url)
        messages = [
            {"role": "system", "content": PARSE_SYSTEM_PROMPT},
            {"role": "user", "content": f"Parse the following resume into JSON:\n\n{raw_text}"}
        ]

        response = ollama.chat_sync(
            model=model_name,
            messages=messages,
            temperature=0.1,
            format_json=True
        )

        content = response.get("content", "{}")
        # Ensure we extract JSON if wrapped in markdown code fence
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()

        try:
            return json.loads(content)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to decode Ollama response as JSON: {content}")
            raise ValueError(f"Ollama returned invalid JSON: {e}")

    @classmethod
    def save_to_database(cls, user: User, parsed_data: Dict[str, Any], raw_text: str = ""):
        """Save parsed structured resume data into database models for the user."""
        profile_data = parsed_data.get("profile", {})
        profile, _ = Profile.objects.get_or_create(user=user)
        if profile_data.get("full_name"):
            profile.full_name = profile_data["full_name"]
        if profile_data.get("headline"):
            profile.headline = profile_data["headline"]
        if profile_data.get("email"):
            profile.email = profile_data["email"]
        if profile_data.get("phone"):
            profile.phone = profile_data["phone"]
        if profile_data.get("location"):
            profile.location = profile_data["location"]
        if profile_data.get("website_url"):
            profile.website_url = profile_data["website_url"]
        if profile_data.get("linkedin_url"):
            profile.linkedin_url = profile_data["linkedin_url"]
        if profile_data.get("github_url"):
            profile.github_url = profile_data["github_url"]
        if profile_data.get("summary"):
            profile.summary = profile_data["summary"]
        if raw_text:
            profile.raw_resume_text = raw_text
        profile.save()

        # Save experiences
        for idx, exp in enumerate(parsed_data.get("experiences", [])):
            if exp.get("company") and exp.get("role"):
                Experience.objects.create(
                    user=user,
                    company=exp.get("company", ""),
                    role=exp.get("role", ""),
                    location=exp.get("location", ""),
                    start_date=exp.get("start_date", ""),
                    end_date=exp.get("end_date", ""),
                    is_current=exp.get("is_current", False),
                    bullet_points=exp.get("bullet_points", []),
                    technologies=exp.get("technologies", []),
                    order=idx
                )

        # Save educations
        for idx, edu in enumerate(parsed_data.get("educations", [])):
            if edu.get("institution"):
                Education.objects.create(
                    user=user,
                    institution=edu.get("institution", ""),
                    degree=edu.get("degree", ""),
                    field_of_study=edu.get("field_of_study", ""),
                    start_date=edu.get("start_date", ""),
                    end_date=edu.get("end_date", ""),
                    gpa=edu.get("gpa", ""),
                    highlights=edu.get("highlights", []),
                    order=idx
                )

        # Save skills
        for idx, sk in enumerate(parsed_data.get("skills", [])):
            if sk.get("name"):
                Skill.objects.create(
                    user=user,
                    category=sk.get("category", "Technical Skills"),
                    name=sk.get("name", ""),
                    proficiency=sk.get("proficiency", ""),
                    order=idx
                )

        # Save projects
        for idx, proj in enumerate(parsed_data.get("projects", [])):
            if proj.get("title"):
                Project.objects.create(
                    user=user,
                    title=proj.get("title", ""),
                    subtitle=proj.get("subtitle", ""),
                    role=proj.get("role", ""),
                    repo_url=proj.get("repo_url", ""),
                    live_url=proj.get("live_url", ""),
                    start_date=proj.get("start_date", ""),
                    end_date=proj.get("end_date", ""),
                    bullet_points=proj.get("bullet_points", []),
                    technologies=proj.get("technologies", []),
                    order=idx
                )

        # Save certifications
        for idx, cert in enumerate(parsed_data.get("certifications", [])):
            if cert.get("name"):
                Certification.objects.create(
                    user=user,
                    name=cert.get("name", ""),
                    issuer=cert.get("issuer", ""),
                    issue_date=cert.get("issue_date", ""),
                    credential_url=cert.get("credential_url", ""),
                    order=idx
                )
