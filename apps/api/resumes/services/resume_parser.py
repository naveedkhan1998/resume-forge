import io
import json
import logging
import re
from typing import Dict, Any, Optional
import pypdf
import pdfplumber
import docx
from django.contrib.auth.models import User
from django.db import transaction
from ..models import (
    Profile,
    Experience,
    Education,
    Skill,
    Project,
    Certification,
)
from .ollama_service import OllamaService
from .pdf_markdown import DocumentMarkdownConverter

logger = logging.getLogger(__name__)

PARSE_SYSTEM_PROMPT = """You are an expert AI resume parser.
Your task is to turn the candidate resume into a clean structured JSON object with one entry per section.

Rules:
- Return only valid JSON in the exact schema below.
- Preserve factual data and do not invent missing details.
- Parse every visible section: profile, experiences, education, skills, projects, certifications.
- Separate every visible experience or project bullet into its own list item. Keep all metrics, achievements, and facts.
- Preserve wording and facts. Extract existing numbers and scope, but do not rewrite, embellish, infer metrics, or merge facts from different roles.
- For skills: Every individual skill must be its own object in the skills array (e.g. name: "Python", name: "Scala"). Never lump multiple skills together into one comma-separated name.
- Split skills into relevant categories such as Languages, Frameworks, Cloud & DevOps, Databases, Tools, Observability, or Leadership.
- Distinguish employment, projects, education, certifications, and skills using headings and nearby dates.
- Associate each bullet only with its nearest role, project, or education entry.
- Treat "Present", "Current", or an open-ended latest role as is_current=true.
- Treat freelance, self-employed, consulting, and independent-contract work as ONE experience entry, not as separate jobs or standalone portfolio projects.
- Put every freelance client engagement in that experience's client_projects list. Preserve the client and project names when stated, and keep each engagement's bullets and technologies separate.
- Use the top-level projects section only for personal, open-source, academic, or portfolio projects that were not performed for a freelance client.
- Never duplicate a freelance client engagement in both experiences and projects.
- If a field is missing, set it to an empty string or empty array, not a placeholder like "N/A".
- Keep names, titles, organizations, locations, dates, and contact fields concise. Do not put summaries, bullets, or multiple fields into them.
- Deduplicate repeated entries; keep the most complete version.
- Keep the order of experiences, projects, and educations in chronological order when possible.

Exact schema:
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
      "technologies": ["string"],
      "client_projects": [
        {
          "client": "string",
          "project": "string",
          "bullet_points": ["string"],
          "technologies": ["string"]
        }
      ]
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
      "category": "string",
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
    SECTION_MODELS = {
        "experiences": Experience,
        "educations": Education,
        "skills": Skill,
        "projects": Project,
        "certifications": Certification,
    }

    @staticmethod
    def extract_text(file_obj, filename: str) -> str:
        """Extract structured, layout-aware Markdown from PDF, DOCX, or TXT."""
        return DocumentMarkdownConverter.convert_file(file_obj, filename)

    @staticmethod
    def _normalize_value(value: Any) -> Any:
        if isinstance(value, str):
            return value.strip()
        if isinstance(value, list):
            cleaned = []
            for item in value:
                normalized = ResumeParser._normalize_value(item)
                if isinstance(normalized, str):
                    if normalized and normalized.lower() not in {"n/a", "na", "none"}:
                        cleaned.append(normalized)
                elif normalized is not None:
                    cleaned.append(normalized)
            unique = []
            seen = set()
            for item in cleaned:
                identity = (
                    json.dumps(item, sort_keys=True, ensure_ascii=False)
                    if isinstance(item, (dict, list))
                    else str(item)
                )
                if identity not in seen:
                    seen.add(identity)
                    unique.append(item)
            return unique
        if isinstance(value, dict):
            return {str(key): ResumeParser._normalize_value(val) for key, val in value.items()}
        return value

    @staticmethod
    def _normalize_model_string(model, field_name: str, value: Any) -> str:
        text = str(value or "").strip()
        max_length = model._meta.get_field(field_name).max_length
        if max_length and len(text) > max_length:
            logger.warning(
                "Truncating parsed resume field %s.%s from %d to %d characters.",
                model.__name__,
                field_name,
                len(text),
                max_length,
            )
            return text[:max_length]
        return text

    @classmethod
    def normalize_parsed_data(cls, parsed_data: Dict[str, Any]) -> Dict[str, Any]:
        cleaned = cls._normalize_value(parsed_data)
        if not isinstance(cleaned, dict):
            raise ValueError("Parsed resume data must be a JSON object.")

        profile = cleaned.setdefault("profile", {})
        if not isinstance(profile, dict):
            profile = {}
        cleaned["profile"] = profile

        section_fields = {
            "experiences": {
                "company": "", "role": "", "location": "", "start_date": "", "end_date": "",
                "is_current": False, "bullet_points": [], "technologies": [], "client_projects": [],
            },
            "educations": {
                "institution": "", "degree": "", "field_of_study": "", "start_date": "",
                "end_date": "", "gpa": "", "highlights": [],
            },
            "skills": {"category": "Technical Skills", "name": "", "proficiency": ""},
            "projects": {
                "title": "", "subtitle": "", "role": "", "repo_url": "", "live_url": "",
                "start_date": "", "end_date": "", "bullet_points": [], "technologies": [],
            },
            "certifications": {"name": "", "issuer": "", "issue_date": "", "credential_url": ""},
        }
        for key, defaults in section_fields.items():
            items = cleaned.get(key, [])
            if items is None:
                items = []
            if not isinstance(items, list):
                raise ValueError(f"Resume parser field '{key}' must be a list.")
            normalized_items = []
            seen = set()
            for item in items:
                if key == "skills" and isinstance(item, str):
                    item = {"category": "Technical Skills", "name": item, "proficiency": ""}
                if not isinstance(item, dict):
                    continue
                record = {field: item.get(field, default) for field, default in defaults.items()}
                for field, default in defaults.items():
                    if isinstance(default, list) and not isinstance(record[field], list):
                        record[field] = []
                    elif isinstance(default, str):
                        record[field] = cls._normalize_model_string(
                            cls.SECTION_MODELS[key],
                            field,
                            record[field],
                        )
                if key == "experiences":
                    current = record["is_current"]
                    record["is_current"] = (
                        current is True
                        or str(current).strip().casefold() in {"true", "yes", "present", "current"}
                    )
                    client_projects = record.pop("client_projects", [])
                    for client_project in client_projects:
                        if not isinstance(client_project, dict):
                            continue
                        client = str(client_project.get("client", "") or "").strip()
                        project = str(client_project.get("project", "") or "").strip()
                        label = " — ".join(part for part in (client, project) if part)
                        bullets = client_project.get("bullet_points", [])
                        if not isinstance(bullets, list):
                            bullets = []
                        for bullet in bullets:
                            text = str(bullet or "").strip()
                            if text:
                                record["bullet_points"].append(f"{label}: {text}" if label else text)
                        technologies = client_project.get("technologies", [])
                        if isinstance(technologies, list):
                            record["technologies"].extend(
                                str(technology).strip()
                                for technology in technologies
                                if str(technology).strip()
                            )
                    record["bullet_points"] = list(dict.fromkeys(record["bullet_points"]))
                    record["technologies"] = list(dict.fromkeys(record["technologies"]))
                if key == "skills":
                    name_raw = str(record.get("name", "")).strip()
                    if "," in name_raw or ";" in name_raw:
                        sub_names = [s.strip() for s in re.split(r"[,;]+", name_raw) if s.strip()]
                        for sub_name in sub_names:
                            sub_record = dict(record)
                            sub_record["name"] = sub_name
                            sub_identity = (str(sub_record["category"]).casefold(), sub_name.casefold())
                            if sub_name and sub_identity not in seen:
                                seen.add(sub_identity)
                                normalized_items.append(sub_record)
                        continue

                identity_fields = {
                    "experiences": ("company", "role", "start_date"),
                    "educations": ("institution", "degree"),
                    "skills": ("category", "name"),
                    "projects": ("title", "role"),
                    "certifications": ("name", "issuer"),
                }[key]
                identity = tuple(str(record[field]).casefold() for field in identity_fields)
                if any(identity) and identity not in seen:
                    seen.add(identity)
                    normalized_items.append(record)
            cleaned[key] = normalized_items

        for field in [
            "full_name", "headline", "email", "phone", "location",
            "website_url", "linkedin_url", "github_url", "summary",
        ]:
            cleaned["profile"][field] = cls._normalize_model_string(
                Profile,
                field,
                cleaned["profile"].get(field, ""),
            )

        return cleaned

    @classmethod
    def parse_with_ai(cls, raw_text: str, model_name: str = "qwen3.5:9b", base_url: Optional[str] = None) -> Dict[str, Any]:
        """Use Ollama to extract structured data from raw resume text."""
        ollama = OllamaService(base_url=base_url)
        messages = [
            {"role": "system", "content": PARSE_SYSTEM_PROMPT},
            {"role": "user", "content": f"Parse the following resume into JSON:\n\n{raw_text[:20000]}"}
        ]

        parsed = ollama.chat_json_sync(
            model=model_name,
            messages=messages,
            temperature=0.1,
            required_keys=("profile", "experiences", "educations", "skills", "projects"),
        )
        for key in ("experiences", "educations", "skills", "projects", "certifications"):
            value = parsed.setdefault(key, [])
            if not isinstance(value, list):
                raise ValueError(f"Ollama response field '{key}' must be a list.")
        if not isinstance(parsed["profile"], dict):
            raise ValueError("Ollama response field 'profile' must be an object.")
        return cls.normalize_parsed_data(parsed)

    @classmethod
    def save_to_database(cls, user: User, parsed_data: Dict[str, Any], raw_text: str = ""):
        """Merge normalized resume data without duplicating previously imported sections."""
        parsed_data = cls.normalize_parsed_data(parsed_data)
        profile_data = parsed_data.get("profile", {})
        with transaction.atomic():
            profile, _ = Profile.objects.get_or_create(user=user)
            for field in (
                "full_name", "headline", "email", "phone", "location",
                "website_url", "linkedin_url", "github_url", "summary",
            ):
                if profile_data.get(field):
                    setattr(profile, field, profile_data[field])
            if raw_text:
                profile.raw_resume_text = raw_text
            profile.save()

            for idx, exp in enumerate(parsed_data.get("experiences", [])):
                if not exp.get("company") or not exp.get("role"):
                    continue
                Experience.objects.update_or_create(
                    user=user,
                    company=exp.get("company", ""),
                    role=exp.get("role", ""),
                    start_date=exp.get("start_date", ""),
                    defaults={
                        "location": exp.get("location", ""),
                        "end_date": exp.get("end_date", ""),
                        "is_current": exp.get("is_current", False),
                        "bullet_points": exp.get("bullet_points", []),
                        "technologies": exp.get("technologies", []),
                        "order": idx,
                    },
                )

            for idx, edu in enumerate(parsed_data.get("educations", [])):
                if not edu.get("institution"):
                    continue
                Education.objects.update_or_create(
                    user=user,
                    institution=edu.get("institution", ""),
                    degree=edu.get("degree", ""),
                    defaults={
                        "field_of_study": edu.get("field_of_study", ""),
                        "start_date": edu.get("start_date", ""),
                        "end_date": edu.get("end_date", ""),
                        "gpa": edu.get("gpa", ""),
                        "highlights": edu.get("highlights", []),
                        "order": idx,
                    },
                )

            for idx, skill in enumerate(parsed_data.get("skills", [])):
                if not skill.get("name"):
                    continue
                Skill.objects.update_or_create(
                    user=user,
                    category=skill.get("category", "Technical Skills"),
                    name=skill.get("name", ""),
                    defaults={
                        "proficiency": skill.get("proficiency", ""),
                        "order": idx,
                    },
                )

            for idx, project in enumerate(parsed_data.get("projects", [])):
                if not project.get("title"):
                    continue
                Project.objects.update_or_create(
                    user=user,
                    title=project.get("title", ""),
                    defaults={
                        "subtitle": project.get("subtitle", ""),
                        "role": project.get("role", ""),
                        "repo_url": project.get("repo_url", ""),
                        "live_url": project.get("live_url", ""),
                        "start_date": project.get("start_date", ""),
                        "end_date": project.get("end_date", ""),
                        "bullet_points": project.get("bullet_points", []),
                        "technologies": project.get("technologies", []),
                        "order": idx,
                    },
                )

            for idx, certification in enumerate(parsed_data.get("certifications", [])):
                if not certification.get("name"):
                    continue
                Certification.objects.update_or_create(
                    user=user,
                    name=certification.get("name", ""),
                    issuer=certification.get("issuer", ""),
                    defaults={
                        "issue_date": certification.get("issue_date", ""),
                        "credential_url": certification.get("credential_url", ""),
                        "order": idx,
                    },
                )
