import json
from typing import List, Optional, Any, Dict
from pydantic import BaseModel, EmailStr
from ninja import NinjaAPI, File, Form, Schema
from ninja.files import UploadedFile
from ninja.security import django_auth
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
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
)
from .services.ollama_service import OllamaService
from .services.resume_parser import ResumeParser
from .services.tailor_service import TailorService
from .services.section_editor import SectionEditor

api = NinjaAPI(
    title="ResumeForge API",
    version="1.0.0",
    description="API for AI-powered Resume Builder, Tailoring, and Application Tracker"
)

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
    ollama_endpoint: str
    model_name: str
    embedding_model: str
    temperature: float
    custom_instructions: Optional[str] = ""

class JobApplicationCreateSchema(Schema):
    company_name: str
    job_title: str
    job_url: Optional[str] = ""
    raw_description: str
    notes: Optional[str] = ""

class JobApplicationUpdateSchema(Schema):
    status: Optional[str] = None
    notes: Optional[str] = None

class RefineSectionSchema(Schema):
    section_type: str
    current_content: Any
    instruction: str

class UpdateDocumentSchema(Schema):
    latex_source: str


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
def ai_health(request: HttpRequest, endpoint: Optional[str] = None):
    ollama = OllamaService(base_url=endpoint)
    return ollama.check_health_sync()

@api.get("/ai/settings", response=AISettingsSchema)
def get_ai_settings(request: HttpRequest):
    user = get_current_user(request)
    settings, _ = UserAISettings.objects.get_or_create(user=user)
    return settings

@api.post("/ai/settings")
def update_ai_settings(request: HttpRequest, data: AISettingsSchema):
    user = get_current_user(request)
    settings, _ = UserAISettings.objects.get_or_create(user=user)
    settings.ollama_endpoint = data.ollama_endpoint
    settings.model_name = data.model_name
    settings.embedding_model = data.embedding_model
    settings.temperature = data.temperature
    settings.custom_instructions = data.custom_instructions or ""
    settings.save()
    return {"status": "success", "message": "AI settings updated"}

@api.post("/ai/refine-section")
def refine_section(request: HttpRequest, data: RefineSectionSchema):
    user = get_current_user(request)
    ai_settings = getattr(user, 'ai_settings', None)
    endpoint = ai_settings.ollama_endpoint if ai_settings else None
    model = ai_settings.model_name if ai_settings else "qwen3.5:9b"
    result = SectionEditor.refine_section(
        section_type=data.section_type,
        current_content=data.current_content,
        instruction=data.instruction,
        model_name=model,
        base_url=endpoint
    )
    return result


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
        },
        "experiences": list(user.experiences.values()),
        "educations": list(user.educations.values()),
        "skills": list(user.skills.values()),
        "projects": list(user.projects.values()),
        "certifications": list(user.certifications.values()),
    }

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
    user = get_current_user(request)
    raw_text = ResumeParser.extract_text(file, file.name)
    if not raw_text.strip():
        return api.create_response(request, {"error": "Could not extract any text from the uploaded file."}, status=400)

    ai_settings = getattr(user, 'ai_settings', None)
    endpoint = ai_settings.ollama_endpoint if ai_settings else None
    model = ai_settings.model_name if ai_settings else "qwen3.5:9b"

    parsed_data = ResumeParser.parse_with_ai(raw_text, model_name=model, base_url=endpoint)
    ResumeParser.save_to_database(user, parsed_data, raw_text=raw_text)

    return {
        "status": "success",
        "message": "Resume parsed and imported into master profile",
        "parsed_summary": {
            "name": parsed_data.get("profile", {}).get("full_name"),
            "profile": parsed_data.get("profile", {}),
            "experiences_count": len(parsed_data.get("experiences", [])),
            "educations_count": len(parsed_data.get("educations", [])),
            "skills_count": len(parsed_data.get("skills", [])),
            "projects_count": len(parsed_data.get("projects", []))
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
    result = TailorService.tailor_for_job(user=user, application=app)
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
    filename = f"{doc.application.company_name}_{doc.doc_type}.tex".replace(" ", "_")
    response = HttpResponse(doc.latex_source, content_type="application/x-tex")
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response
