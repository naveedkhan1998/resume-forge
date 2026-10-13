import io
import json
import re
import zipfile
from typing import Any, List, Literal, Optional
from ninja import NinjaAPI, File, Schema
from ninja.files import UploadedFile
from ninja.security import django_auth
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.db import transaction
from django.http import HttpResponse, HttpRequest
from django.shortcuts import get_object_or_404
from .models import (
    Profile,
    Experience,
    Education,
    Skill,
    Project,
    Certification,
    UserAISettings,
    JobApplication,
    TailoredDocument,
    ItemEmbedding,
)
from .services.ollama_service import OllamaService
from .services.resume_parser import ResumeParser
from .services.tailor_service import TailorService
from .services.section_editor import SectionEditor
from .services.latex_compiler import LatexCompiler
from .services.latex_templates import RESUMEFORGE_CLASS

api = NinjaAPI(
    title="ResumeForge API",
    version="1.0.0",
    description="API for AI-powered Resume Builder, Tailoring, and Application Tracker"
)

@api.exception_handler(Exception)
def global_exception_handler(request: HttpRequest, exc: Exception):
    import traceback, logging
    logger = logging.getLogger(__name__)
    logger.error(f"Global API exception: {traceback.format_exc()}")
    return api.create_response(request, {"error": str(exc)}, status=500)

# Helper for demo / single-user or authenticated user
def get_current_user(request: HttpRequest) -> User:
    if request.user.is_authenticated:
        return request.user
    # Demo/Fallback default user for frictionless public demo or local dev
    user, _ = User.objects.get_or_create(
        username="demo_user",
        defaults={"email": "demo@resumeforge.dev", "first_name": "Demo", "last_name": "User"}
    )
    return user


# -------------------------------------------------------------
# Schemas
# -------------------------------------------------------------
class RegisterSchema(Schema):
    username: str
    email: str
    password: str
    full_name: Optional[str] = ""

class LoginSchema(Schema):
    username: str
    password: str

class ProfileSchema(Schema):
    full_name: str
    headline: str
    email: str
    phone: str
    location: str
    website_url: str
    linkedin_url: str
    github_url: str
    summary: str

class ExperienceSchema(Schema):
    id: Optional[int] = None
    company: str
    role: str
    location: Optional[str] = ""
    start_date: Optional[str] = ""
    end_date: Optional[str] = ""
    is_current: Optional[bool] = False
    description: Optional[str] = ""
    bullet_points: List[str] = []
    technologies: List[str] = []
    order: Optional[int] = 0

class EducationSchema(Schema):
    id: Optional[int] = None
    institution: str
    degree: str
    field_of_study: Optional[str] = ""
    start_date: Optional[str] = ""
    end_date: Optional[str] = ""
    gpa: Optional[str] = ""
    highlights: List[str] = []
    order: Optional[int] = 0

class SkillSchema(Schema):
    id: Optional[int] = None
    category: str
    name: str
    proficiency: Optional[str] = ""
    order: Optional[int] = 0

class CertificationSchema(Schema):
    id: Optional[int] = None
    name: str
    issuer: Optional[str] = ""
    issue_date: Optional[str] = ""
    credential_url: Optional[str] = ""
    order: Optional[int] = 0

class ProjectSchema(Schema):
    id: Optional[int] = None
    title: str
    subtitle: Optional[str] = ""
    role: Optional[str] = ""
    repo_url: Optional[str] = ""
    live_url: Optional[str] = ""
    start_date: Optional[str] = ""
    end_date: Optional[str] = ""
    bullet_points: List[str] = []
    technologies: List[str] = []
    order: Optional[int] = 0

class AISettingsSchema(Schema):
    provider: Optional[str] = "ollama"
    ollama_endpoint: Optional[str] = "http://localhost:11434"
    openrouter_endpoint: Optional[str] = "https://openrouter.ai/api/v1"
    api_key: Optional[str] = ""
    model_name: str
    embedding_model: Optional[str] = "nomic-embed-text"
    temperature: float
    custom_instructions: Optional[str] = ""

class JobApplicationCreateSchema(Schema):
    company_name: str
    job_title: str
    job_url: Optional[str] = ""
    raw_description: Optional[str] = ""
    notes: Optional[str] = ""

class JobApplicationUpdateSchema(Schema):
    status: Optional[str] = None
    notes: Optional[str] = None

class RefineChatMessageSchema(Schema):
    role: Literal["user", "assistant"]
    content: str

class RefineSectionSchema(Schema):
    section_type: str
    current_content: Any
    instruction: str
    conversation: List[RefineChatMessageSchema] = []

class UpdateDocumentSchema(Schema):
    latex_source: str

class ReviewSectionsSchema(Schema):
    latex_source: Optional[str] = None
    model_name: Optional[str] = None

class ResetDataSchema(Schema):
    confirm: str
    delete_applications: bool = True
    delete_ai_settings: bool = False

class ExportCustomZipSchema(Schema):
    latex_source: str
    company_name: Optional[str] = "Candidate"
    doc_type: Optional[str] = "resume"


# -------------------------------------------------------------
# Auth Endpoints
# -------------------------------------------------------------
@api.post("/auth/register")
def register(request: HttpRequest, data: RegisterSchema):
    if User.objects.filter(username=data.username).exists():
        return api.create_response(request, {"error": "Username already exists"}, status=400)
    user = User.objects.create_user(
        username=data.username,
        email=data.email,
        password=data.password,
        first_name=data.full_name or ""
    )
    Profile.objects.create(
        user=user,
        full_name=data.full_name or data.username,
        email=data.email
    )
    UserAISettings.objects.create(user=user)
    login(request, user)
    return {"message": "User registered successfully", "username": user.username}

@api.post("/auth/login")
def login_view(request: HttpRequest, data: LoginSchema):
    user = authenticate(request, username=data.username, password=data.password)
    if user is not None:
        login(request, user)
        return {"message": "Logged in", "username": user.username}
    return api.create_response(request, {"error": "Invalid credentials"}, status=401)

@api.get("/auth/me")
def me(request: HttpRequest):
    user = get_current_user(request)
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "is_authenticated": user.is_authenticated
    }


# -------------------------------------------------------------
# AI Configuration & Health
# -------------------------------------------------------------
@api.get("/ai/health")
def ai_health(
    request: HttpRequest,
    provider: Optional[str] = None,
    endpoint: Optional[str] = None,
    api_key: Optional[str] = None,
):
    user = get_current_user(request)
    ai_settings = getattr(user, 'ai_settings', None)
    active_provider = (provider or (ai_settings.provider if ai_settings else "ollama")).lower().strip()
    key = api_key if api_key is not None else (ai_settings.api_key if ai_settings else "")
    if active_provider == "openrouter":
        url = endpoint or (ai_settings.openrouter_endpoint if ai_settings else "https://openrouter.ai/api/v1")
    else:
        url = endpoint or (ai_settings.ollama_endpoint if ai_settings else "http://localhost:11434")

    service = OllamaService(
        base_url=url,
        api_key=key,
        provider=active_provider,
    )
    return service.check_health_sync()

@api.get("/ai/settings", response=AISettingsSchema)
def get_ai_settings(request: HttpRequest):
    user = get_current_user(request)
    settings, _ = UserAISettings.objects.get_or_create(user=user)
    return settings

@api.post("/ai/settings")
def update_ai_settings(request: HttpRequest, data: AISettingsSchema):
    provider = (data.provider or "ollama").lower().strip()
    if provider not in {"ollama", "openrouter"}:
        return api.create_response(request, {"error": "Provider must be 'ollama' or 'openrouter'."}, status=400)
    if provider == "ollama" and data.ollama_endpoint and not data.ollama_endpoint.startswith(("http://", "https://")):
        return api.create_response(request, {"error": "Ollama endpoint must use http:// or https://."}, status=400)
    if provider == "openrouter" and data.openrouter_endpoint and not data.openrouter_endpoint.startswith(("http://", "https://")):
        return api.create_response(request, {"error": "OpenRouter endpoint must use http:// or https://."}, status=400)
    if not data.model_name.strip():
        return api.create_response(request, {"error": "Model name is required."}, status=400)
    if not 0 <= data.temperature <= 1:
        return api.create_response(request, {"error": "Temperature must be between 0 and 1."}, status=400)

    user = get_current_user(request)
    settings, _ = UserAISettings.objects.get_or_create(user=user)
    settings.provider = provider
    if data.ollama_endpoint:
        settings.ollama_endpoint = data.ollama_endpoint
    if data.openrouter_endpoint:
        settings.openrouter_endpoint = data.openrouter_endpoint
    if data.api_key is not None:
        settings.api_key = data.api_key
    settings.model_name = data.model_name
    if data.embedding_model:
        settings.embedding_model = data.embedding_model
    settings.temperature = data.temperature
    settings.custom_instructions = data.custom_instructions or ""
    settings.save()
    return {"status": "success", "message": "AI settings updated"}

@api.post("/ai/refine-section")
def refine_section(request: HttpRequest, data: RefineSectionSchema):
    if not data.instruction.strip():
        return api.create_response(request, {"error": "A refinement instruction is required."}, status=400)
    user = get_current_user(request)
    ai_settings = getattr(user, 'ai_settings', None)
    model = ai_settings.model_name if ai_settings else "qwen3.5:9b"
    service = OllamaService.from_user(user)
    try:
        return SectionEditor.refine_section(
            section_type=data.section_type,
            current_content=data.current_content,
            instruction=data.instruction,
            conversation=[message.dict() for message in data.conversation],
            model_name=model,
            ollama_service=service,
        )
    except (RuntimeError, ValueError) as exc:
        return api.create_response(request, {"error": str(exc)}, status=502)


# -------------------------------------------------------------
# Master Baseline Context
# -------------------------------------------------------------
@api.get("/master/all")
def get_all_master_context(request: HttpRequest):
    user = get_current_user(request)
    profile, _ = Profile.objects.get_or_create(user=user)
    return {
        "profile": {
            "full_name": profile.full_name,
            "headline": profile.headline,
            "email": profile.email,
            "phone": profile.phone,
            "location": profile.location,
            "website_url": profile.website_url,
            "linkedin_url": profile.linkedin_url,
            "github_url": profile.github_url,
            "summary": profile.summary,
            "raw_resume_text": profile.raw_resume_text,
        },
        "experiences": list(user.experiences.values()),
        "educations": list(user.educations.values()),
        "skills": list(user.skills.values()),
        "projects": list(user.projects.values()),
        "certifications": list(user.certifications.values()),
    }

@api.post("/master/reset")
def reset_master_data(request: HttpRequest, data: ResetDataSchema):
    """Delete the user's career data so they can start from a clean slate."""
    if data.confirm.strip().upper() != "DELETE":
        return api.create_response(
            request,
            {"error": 'Type "DELETE" to confirm this irreversible reset.'},
            status=400,
        )

    user = get_current_user(request)
    deleted = {}
    with transaction.atomic():
        deleted["experiences"] = user.experiences.all().delete()[0]
        deleted["educations"] = user.educations.all().delete()[0]
        deleted["skills"] = user.skills.all().delete()[0]
        deleted["projects"] = user.projects.all().delete()[0]
        deleted["certifications"] = user.certifications.all().delete()[0]
        deleted["embeddings"] = ItemEmbedding.objects.filter(user=user).delete()[0]

        if data.delete_applications:
            documents = TailoredDocument.objects.filter(application__user=user)
            for document in documents:
                if document.pdf_file:
                    document.pdf_file.delete(save=False)
            deleted["documents"] = documents.delete()[0]
            deleted["applications"] = user.applications.all().delete()[0]

        if data.delete_ai_settings:
            deleted["ai_settings"] = UserAISettings.objects.filter(user=user).delete()[0]

        profile, _ = Profile.objects.get_or_create(user=user)
        for field in (
            "full_name",
            "headline",
            "email",
            "phone",
            "location",
            "website_url",
            "linkedin_url",
            "github_url",
            "summary",
            "raw_resume_text",
        ):
            setattr(profile, field, "")
        profile.save()

    return {"status": "success", "deleted": deleted}

@api.put("/master/profile")
def update_profile(request: HttpRequest, data: ProfileSchema):
    user = get_current_user(request)
    profile, _ = Profile.objects.get_or_create(user=user)
    for key, value in data.dict().items():
        setattr(profile, key, value)
    profile.save()
    return {"status": "success"}

@api.post("/master/experiences")
def create_experience(request: HttpRequest, data: ExperienceSchema):
    user = get_current_user(request)
    exp = Experience.objects.create(user=user, **data.dict(exclude={'id'}))
    return {"status": "success", "id": exp.id}

@api.put("/master/experiences/{int:exp_id}")
def update_experience(request: HttpRequest, exp_id: int, data: ExperienceSchema):
    user = get_current_user(request)
    exp = get_object_or_404(Experience, id=exp_id, user=user)
    for key, val in data.dict(exclude={'id'}).items():
        setattr(exp, key, val)
    exp.save()
    return {"status": "success"}

@api.delete("/master/experiences/{int:exp_id}")
def delete_experience(request: HttpRequest, exp_id: int):
    user = get_current_user(request)
    exp = get_object_or_404(Experience, id=exp_id, user=user)
    exp.delete()
    return {"status": "success"}

@api.post("/master/educations")
def create_education(request: HttpRequest, data: EducationSchema):
    user = get_current_user(request)
    edu = Education.objects.create(user=user, **data.dict(exclude={'id'}))
    return {"status": "success", "id": edu.id}

@api.put("/master/educations/{int:edu_id}")
def update_education(request: HttpRequest, edu_id: int, data: EducationSchema):
    user = get_current_user(request)
    edu = get_object_or_404(Education, id=edu_id, user=user)
    for key, val in data.dict(exclude={'id'}).items():
        setattr(edu, key, val)
    edu.save()
    return {"status": "success"}

@api.delete("/master/educations/{int:edu_id}")
def delete_education(request: HttpRequest, edu_id: int):
    user = get_current_user(request)
    edu = get_object_or_404(Education, id=edu_id, user=user)
    edu.delete()
    return {"status": "success"}

@api.post("/master/skills")
def create_skill(request: HttpRequest, data: SkillSchema):
    user = get_current_user(request)
    sk = Skill.objects.create(user=user, **data.dict(exclude={'id'}))
    return {"status": "success", "id": sk.id}

@api.delete("/master/skills/{int:skill_id}")
def delete_skill(request: HttpRequest, skill_id: int):
    user = get_current_user(request)
    sk = get_object_or_404(Skill, id=skill_id, user=user)
    sk.delete()
    return {"status": "success"}

@api.put("/master/skills")
def replace_skills(request: HttpRequest, data: List[SkillSchema]):
    user = get_current_user(request)
    with transaction.atomic():
        user.skills.all().delete()
        Skill.objects.bulk_create([
            Skill(
                user=user,
                category=item.category.strip() or "Technical Skills",
                name=item.name.strip(),
                proficiency=(item.proficiency or "").strip(),
                order=index,
            )
            for index, item in enumerate(data)
            if item.name.strip()
        ])
    return {"status": "success"}

@api.put("/master/certifications")
def replace_certifications(request: HttpRequest, data: List[CertificationSchema]):
    user = get_current_user(request)
    with transaction.atomic():
        user.certifications.all().delete()
        Certification.objects.bulk_create([
            Certification(
                user=user,
                name=item.name.strip(),
                issuer=(item.issuer or "").strip(),
                issue_date=(item.issue_date or "").strip(),
                credential_url=(item.credential_url or "").strip(),
                order=index,
            )
            for index, item in enumerate(data)
            if item.name.strip()
        ])
    return {"status": "success"}

@api.post("/master/projects")
def create_project(request: HttpRequest, data: ProjectSchema):
    user = get_current_user(request)
    proj = Project.objects.create(user=user, **data.dict(exclude={'id'}))
    return {"status": "success", "id": proj.id}

@api.put("/master/projects/{int:proj_id}")
def update_project(request: HttpRequest, proj_id: int, data: ProjectSchema):
    user = get_current_user(request)
    proj = get_object_or_404(Project, id=proj_id, user=user)
    for key, val in data.dict(exclude={'id'}).items():
        setattr(proj, key, val)
    proj.save()
    return {"status": "success"}

@api.delete("/master/projects/{int:proj_id}")
def delete_project(request: HttpRequest, proj_id: int):
    user = get_current_user(request)
    proj = get_object_or_404(Project, id=proj_id, user=user)
    proj.delete()
    return {"status": "success"}


# -------------------------------------------------------------
# Resume Upload & Auto-Parsing
# -------------------------------------------------------------
@api.post("/resumes/upload")
def upload_resume(request: HttpRequest, file: UploadedFile = File(...)):
    extension = file.name.lower().rsplit(".", 1)[-1] if "." in file.name else ""
    if extension not in {"pdf", "docx", "txt"}:
        return api.create_response(request, {"error": "Upload a PDF, DOCX, or TXT file."}, status=400)
    if file.size > 15 * 1024 * 1024:
        return api.create_response(request, {"error": "Resume files must be 15 MB or smaller."}, status=400)
    user = get_current_user(request)
    raw_text = ResumeParser.extract_text(file, file.name)
    if not raw_text.strip():
        return api.create_response(request, {"error": "Could not extract any text from the uploaded file."}, status=400)

    ai_settings = getattr(user, 'ai_settings', None)
    model = ai_settings.model_name if ai_settings else "qwen3.5:9b"
    service = OllamaService.from_user(user)

    try:
        parsed_data = ResumeParser.parse_with_ai(raw_text, model_name=model, ollama_service=service)
        ResumeParser.save_to_database(user, parsed_data, raw_text=raw_text)
    except (RuntimeError, ValueError) as exc:
        return api.create_response(request, {"error": str(exc)}, status=502)

    return {
        "status": "success",
        "message": "Resume parsed and imported into master profile",
        "markdown_text": raw_text,
        "parsed_summary": {
            "name": parsed_data.get("profile", {}).get("full_name"),
            "profile": parsed_data.get("profile", {}),
            "experiences_count": len(parsed_data.get("experiences", [])),
            "educations_count": len(parsed_data.get("educations", [])),
            "skills_count": len(parsed_data.get("skills", [])),
            "projects_count": len(parsed_data.get("projects", [])),
            "certifications_count": len(parsed_data.get("certifications", [])),
        }
    }


# -------------------------------------------------------------
# Job Applications & Tailoring
# -------------------------------------------------------------
@api.get("/jobs")
def list_jobs(request: HttpRequest):
    user = get_current_user(request)
    apps = user.applications.all()
    results = []
    for a in apps:
        results.append({
            "id": a.id,
            "company_name": a.company_name,
            "job_title": a.job_title,
            "job_url": a.job_url,
            "status": a.status,
            "match_score": a.match_score,
            "created_at": a.created_at.strftime("%Y-%m-%d"),
            "documents_count": a.documents.count()
        })
    return results

@api.post("/jobs")
def create_job(request: HttpRequest, data: JobApplicationCreateSchema):
    if not data.company_name.strip() or not data.job_title.strip():
        return api.create_response(request, {"error": "Company and job title are required."}, status=400)
    user = get_current_user(request)
    app = JobApplication.objects.create(
        user=user,
        company_name=data.company_name,
        job_title=data.job_title,
        job_url=data.job_url or "",
        raw_description=data.raw_description,
        notes=data.notes or ""
    )
    return {"status": "success", "id": app.id}

@api.get("/jobs/{int:job_id}")
def get_job_detail(request: HttpRequest, job_id: int):
    user = get_current_user(request)
    app = get_object_or_404(JobApplication, id=job_id, user=user)
    docs = []
    for d in app.documents.all():
        docs.append({
            "id": d.id,
            "doc_type": d.doc_type,
            "version": d.version,
            "latex_source": d.latex_source,
            "tailoring_rationale": d.tailoring_rationale,
            "created_at": d.created_at.strftime("%Y-%m-%d %H:%M"),
        })
    return {
        "id": app.id,
        "company_name": app.company_name,
        "job_title": app.job_title,
        "job_url": app.job_url,
        "raw_description": app.raw_description,
        "status": app.status,
        "match_score": app.match_score,
        "extracted_keywords": app.extracted_keywords,
        "notes": app.notes,
        "documents": docs,
    }

@api.put("/jobs/{int:job_id}")
def update_job(request: HttpRequest, job_id: int, data: JobApplicationUpdateSchema):
    user = get_current_user(request)
    app = get_object_or_404(JobApplication, id=job_id, user=user)
    if data.status:
        app.status = data.status
    if data.notes is not None:
        app.notes = data.notes
    app.save()
    return {"status": "success"}

@api.delete("/jobs/{int:job_id}")
def delete_job(request: HttpRequest, job_id: int):
    user = get_current_user(request)
    app = get_object_or_404(JobApplication, id=job_id, user=user)
    app.delete()
    return {"status": "success"}

@api.post("/jobs/{int:job_id}/tailor")
def tailor_for_job(request: HttpRequest, job_id: int):
    user = get_current_user(request)
    app = get_object_or_404(JobApplication, id=job_id, user=user)
    try:
        result = TailorService.tailor_for_job(user=user, application=app)
    except (RuntimeError, ValueError) as exc:
        return api.create_response(request, {"error": str(exc)}, status=502)
    return {"status": "success", "result": result}

@api.put("/documents/{int:doc_id}")
def update_document(request: HttpRequest, doc_id: int, data: UpdateDocumentSchema):
    user = get_current_user(request)
    doc = get_object_or_404(TailoredDocument, id=doc_id, application__user=user)
    doc.latex_source = data.latex_source
    doc.save()
    return {"status": "success", "message": "LaTeX source updated"}

@api.get("/documents/{int:doc_id}/export-latex")
def export_latex(request: HttpRequest, doc_id: int):
    user = get_current_user(request)
    doc = get_object_or_404(TailoredDocument, id=doc_id, application__user=user)
    filename = re.sub(r"[^A-Za-z0-9._-]+", "_", f"{doc.application.company_name}_{doc.doc_type}.tex")
    response = HttpResponse(doc.latex_source, content_type="application/x-tex")
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response

@api.get("/documents/{int:doc_id}/export-pdf")
def export_pdf(request: HttpRequest, doc_id: int):
    user = get_current_user(request)
    doc = get_object_or_404(TailoredDocument, id=doc_id, application__user=user)
    try:
        pdf = LatexCompiler.compile_pdf(doc.latex_source)
    except RuntimeError as exc:
        return api.create_response(request, {"error": str(exc)}, status=503)
    except ValueError as exc:
        return api.create_response(request, {"error": str(exc)}, status=422)

    filename = re.sub(r"[^A-Za-z0-9._-]+", "_", f"{doc.application.company_name}_{doc.doc_type}.pdf")
    response = HttpResponse(pdf, content_type="application/pdf")
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response

@api.get("/latex/resumeforge.cls")
def download_class_file(request: HttpRequest):
    response = HttpResponse(RESUMEFORGE_CLASS, content_type="text/x-tex; charset=utf-8")
    response['Content-Disposition'] = 'attachment; filename="resumeforge.cls"'
    return response

@api.get("/latex/cls-content")
def get_class_file_content(request: HttpRequest):
    return {"content": RESUMEFORGE_CLASS}

@api.get("/documents/{int:doc_id}/export-zip")
def export_overleaf_zip(request: HttpRequest, doc_id: int):
    user = get_current_user(request)
    doc = get_object_or_404(TailoredDocument, id=doc_id, application__user=user)
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("main.tex", doc.latex_source)
        zf.writestr("resumeforge.cls", RESUMEFORGE_CLASS)
    zip_buffer.seek(0)
    zip_filename = re.sub(r"[^A-Za-z0-9._-]+", "_", f"{doc.application.company_name}_{doc.doc_type}_overleaf.zip")
    response = HttpResponse(zip_buffer.getvalue(), content_type="application/zip")
    response['Content-Disposition'] = f'attachment; filename="{zip_filename}"'
    return response

@api.post("/documents/export-zip-custom")
def export_custom_overleaf_zip(request: HttpRequest, data: ExportCustomZipSchema):
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("main.tex", data.latex_source)
        zf.writestr("resumeforge.cls", RESUMEFORGE_CLASS)
    zip_buffer.seek(0)
    prefix = re.sub(r"[^A-Za-z0-9._-]+", "_", f"{data.company_name}_{data.doc_type}")
    zip_filename = f"{prefix}_overleaf.zip"
    response = HttpResponse(zip_buffer.getvalue(), content_type="application/zip")
    response['Content-Disposition'] = f'attachment; filename="{zip_filename}"'
    return response

@api.post("/documents/{int:doc_id}/review-sections")
def review_document_sections(request: HttpRequest, doc_id: int, data: Optional[ReviewSectionsSchema] = None):
    user = get_current_user(request)
    doc = get_object_or_404(TailoredDocument, id=doc_id, application__user=user)
    ai_settings = getattr(user, 'ai_settings', None)
    model = (data.model_name if data and data.model_name else None) or (ai_settings.model_name if ai_settings else 'qwen3.5:9b')

    source_to_review = (data.latex_source if data and data.latex_source else None) or doc.latex_source
    service = OllamaService.from_user(user)

    reviewed_latex = TailorService.review_latex_document(
        latex_source=source_to_review,
        model_name=model,
        ollama_service=service,
    )

    doc.latex_source = reviewed_latex
    doc.save(update_fields=["latex_source", "updated_at"])

    return {"status": "success", "latex_source": reviewed_latex}

@api.post("/documents/review-latex")
def review_custom_latex(request: HttpRequest, data: ReviewSectionsSchema):
    user = get_current_user(request)
    ai_settings = getattr(user, 'ai_settings', None)
    model = data.model_name or (ai_settings.model_name if ai_settings else 'qwen3.5:9b')

    if not data.latex_source:
        return api.create_response(request, {"error": "latex_source is required."}, status=400)

    service = OllamaService.from_user(user)
    reviewed_latex = TailorService.review_latex_document(
        latex_source=data.latex_source,
        model_name=model,
        ollama_service=service,
    )
    return {"status": "success", "latex_source": reviewed_latex}

