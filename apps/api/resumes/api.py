import io
import json
import re
import secrets
import zipfile
from typing import Any, Dict, List, Literal, Optional
from ninja import NinjaAPI, File, Form, Schema
from ninja.files import UploadedFile
from ninja.security import django_auth
from django.conf import settings as django_settings
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.db import transaction
from django.db.models import F
from django.http import HttpResponse, HttpRequest
from django.shortcuts import get_object_or_404
from django.utils import timezone
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
    DeviceSession,
)
from .services.ollama_service import OllamaService
from .services.resume_parser import ResumeParser
from .services.pdf_markdown import DocumentMarkdownConverter
from .services.tailor_service import TailorService
from .services.section_editor import SectionEditor
from .services.latex_templates import RESUMEFORGE_CLASS, normalize_unicode_and_latex_text

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


SESSION_TOKEN_PATTERN = re.compile(r"^[A-Za-z0-9_-]{16,128}$")


def _extract_session_token(request: HttpRequest, explicit_token: Optional[str] = None) -> str:
    raw = (
        explicit_token
        or request.headers.get("X-Session-Token")
        or request.COOKIES.get("resumeforge_session")
        or ""
    ).strip()
    if raw and SESSION_TOKEN_PATTERN.match(raw):
        return raw
    return ""


def _get_dummy_source_user(exclude_user_id: Optional[int] = None) -> Optional[User]:
    session_qs = DeviceSession.objects.select_related("user").filter(is_dummy=True)
    if exclude_user_id is not None:
        session_qs = session_qs.exclude(user_id=exclude_user_id)
    dummy_session = session_qs.order_by("-last_active_at", "-id").first()
    if dummy_session is not None:
        return dummy_session.user

    profile_qs = Profile.objects.select_related("user").filter(is_dummy=True)
    if exclude_user_id is not None:
        profile_qs = profile_qs.exclude(user_id=exclude_user_id)
    dummy_profile = profile_qs.order_by("-updated_at", "-id").first()
    if dummy_profile is not None:
        return dummy_profile.user

    return None


def _copy_dummy_user_data(source_user: User, target_user: User) -> None:
    if source_user.id == target_user.id:
        return

    source_profile = Profile.objects.filter(user=source_user).first()
    target_profile, _ = Profile.objects.get_or_create(user=target_user)
    if source_profile is not None:
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
            setattr(target_profile, field, getattr(source_profile, field, ""))
        target_profile.save()

    Experience.objects.bulk_create([
        Experience(
            user=target_user,
            company=exp.company,
            role=exp.role,
            location=exp.location,
            start_date=exp.start_date,
            end_date=exp.end_date,
            is_current=exp.is_current,
            description=exp.description,
            bullet_points=list(exp.bullet_points or []),
            technologies=list(exp.technologies or []),
            order=exp.order,
        )
        for exp in source_user.experiences.all()
    ])

    Education.objects.bulk_create([
        Education(
            user=target_user,
            institution=edu.institution,
            degree=edu.degree,
            field_of_study=edu.field_of_study,
            start_date=edu.start_date,
            end_date=edu.end_date,
            gpa=edu.gpa,
            highlights=list(edu.highlights or []),
            order=edu.order,
        )
        for edu in source_user.educations.all()
    ])

    Skill.objects.bulk_create([
        Skill(
            user=target_user,
            category=sk.category,
            name=sk.name,
            proficiency=sk.proficiency,
            order=sk.order,
        )
        for sk in source_user.skills.all()
    ])

    Project.objects.bulk_create([
        Project(
            user=target_user,
            title=proj.title,
            subtitle=proj.subtitle,
            role=proj.role,
            repo_url=proj.repo_url,
            live_url=proj.live_url,
            start_date=proj.start_date,
            end_date=proj.end_date,
            bullet_points=list(proj.bullet_points or []),
            technologies=list(proj.technologies or []),
            order=proj.order,
        )
        for proj in source_user.projects.all()
    ])

    Certification.objects.bulk_create([
        Certification(
            user=target_user,
            name=cert.name,
            issuer=cert.issuer,
            issue_date=cert.issue_date,
            credential_url=cert.credential_url,
            order=cert.order,
        )
        for cert in source_user.certifications.all()
    ])

    for app in source_user.applications.all().order_by("created_at", "id"):
        new_app = JobApplication.objects.create(
            user=target_user,
            company_name=app.company_name,
            job_title=app.job_title,
            job_url=app.job_url,
            raw_description=app.raw_description,
            extracted_keywords=list(app.extracted_keywords or []),
            status=app.status,
            match_score=app.match_score,
            notes=app.notes,
            applied_date=app.applied_date,
        )
        TailoredDocument.objects.bulk_create([
            TailoredDocument(
                application=new_app,
                doc_type=doc.doc_type,
                latex_source=doc.latex_source,
                tailoring_rationale=doc.tailoring_rationale,
                version=doc.version,
            )
            for doc in app.documents.all().order_by("version", "created_at", "id")
        ])


def _create_isolated_device_session(
    token: Optional[str] = None,
    device_fingerprint: str = "",
) -> DeviceSession:
    session_token = token if (token and SESSION_TOKEN_PATTERN.match(token)) else f"rf_{secrets.token_urlsafe(24)}"
    default_quota = int(getattr(django_settings, "SESSION_LLM_QUOTA", 25))
    default_ollama_url = (
        getattr(django_settings, "OLLAMA_BASE_URL", "http://localhost:11434")
        or "http://localhost:11434"
    )
    with transaction.atomic():
        existing = DeviceSession.objects.select_related("user").filter(token=session_token).first()
        if existing:
            return existing
        username = f"device_{secrets.token_hex(8)}"
        while User.objects.filter(username=username).exists():
            username = f"device_{secrets.token_hex(8)}"
        user = User.objects.create_user(
            username=username,
            email=f"{username}@session.resumeforge.local",
        )
        Profile.objects.get_or_create(user=user)
        UserAISettings.objects.get_or_create(
            user=user,
            defaults={"ollama_endpoint": default_ollama_url},
        )
        dummy_user = _get_dummy_source_user(exclude_user_id=user.id)
        copied_dummy_data = False
        if dummy_user is not None:
            _copy_dummy_user_data(dummy_user, user)
            copied_dummy_data = True

        session = DeviceSession.objects.create(
            user=user,
            token=session_token,
            device_fingerprint=(device_fingerprint or "")[:255],
            resume_uploaded=copied_dummy_data,
            llm_calls_used=0,
            llm_calls_limit=max(0, default_quota),
        )
        return session


def get_device_session(request: HttpRequest, create_if_missing: bool = True) -> Optional[DeviceSession]:
    cached = getattr(request, "_device_session", None)
    if cached is not None:
        return cached

    token = _extract_session_token(request)
    if not token:
        return None

    session = DeviceSession.objects.select_related("user", "user__profile", "user__ai_settings").filter(token=token).first()
    if session is None and create_if_missing:
        session = _create_isolated_device_session(token=token)
    elif session is not None:
        DeviceSession.objects.filter(pk=session.pk).update(last_active_at=timezone.now())

    request._device_session = session
    return session


def get_current_user(request: HttpRequest) -> User:
    session = get_device_session(request, create_if_missing=True)
    if session is not None:
        return session.user
    if request.user.is_authenticated:
        return request.user
    # Fallback default user for legacy unauthenticated test calls
    user, _ = User.objects.get_or_create(
        username="demo_user",
        defaults={"email": "demo@resumeforge.dev", "first_name": "Demo", "last_name": "User"}
    )
    return user


def _serialize_session(session: DeviceSession) -> Dict[str, Any]:
    session.refresh_from_db()
    ai_settings = getattr(session.user, "ai_settings", None)
    provider = (getattr(ai_settings, "provider", "ollama") or "ollama").lower().strip()
    has_key = bool(ai_settings and (ai_settings.api_key or "").strip())
    using_custom = session.has_custom_ai_configured
    if using_custom:
        ai_provider_mode = "local_ollama" if provider == "ollama" and not has_key else "custom_key"
    else:
        ai_provider_mode = "system_fallback"
    return {
        "token": session.token,
        "username": session.user.username,
        "is_dummy": session.is_dummy,
        "resume_uploaded": session.resume_uploaded,
        "llm_unlocked": session.is_llm_unlocked,
        "llm_calls_used": session.llm_calls_used,
        "llm_calls_limit": session.llm_calls_limit,
        "llm_quota_remaining": session.llm_quota_remaining,
        "using_custom_ai": using_custom,
        "ai_provider_mode": ai_provider_mode,
    }


def check_llm_access(request: HttpRequest, user: User, is_resume_upload: bool = False) -> Optional[HttpResponse]:
    """
    Verify that the current device session is allowed to invoke an LLM endpoint.
    1. Downstream LLM endpoints (tailor, refine, review, AI edit) require a resume upload first.
    2. Sessions without custom AI keys are subject to the per-session free credit quota.
    """
    session = get_device_session(request, create_if_missing=False) or getattr(user, "device_session", None)
    if session is None:
        return None

    if not is_resume_upload and not session.is_llm_unlocked:
        return api.create_response(
            request,
            {
                "error": "Upload or paste your resume in the Import tab first to unlock AI tailoring, section refinement, and editing.",
                "code": "RESUME_REQUIRED",
            },
            status=403,
        )

    if not session.has_custom_ai_configured and session.llm_calls_limit > 0:
        if session.llm_calls_used >= session.llm_calls_limit:
            return api.create_response(
                request,
                {
                    "error": (
                        "This is for demo only. Please clone this repo (https://github.com/naveedkhan1998/resume-forge) "
                        "and use it locally with your own models."
                    ),
                    "code": "QUOTA_EXCEEDED",
                },
                status=429,
            )

    return None


def record_llm_usage(
    request: HttpRequest,
    user: User,
    mark_resume_uploaded: bool = False,
    service: Optional[OllamaService] = None,
) -> Optional[DeviceSession]:
    """Increment the session's LLM usage counter ONLY when the system fallback LLM was used."""
    session = get_device_session(request, create_if_missing=False) or getattr(user, "device_session", None)
    if session is None:
        return None

    updates: Dict[str, Any] = {"last_active_at": timezone.now()}
    if mark_resume_uploaded:
        updates["resume_uploaded"] = True

    if service is not None and service.used_personal_llm and not service.used_system_fallback:
        # User's own Local Ollama or custom API key handled the request directly -> never consume system credits
        updates["device_fingerprint"] = "llm:personal"
    elif service is not None and service.used_system_fallback:
        # Request was routed through the server's hidden SYSTEM_LLM_* fallback -> consume 1 system credit
        updates["llm_calls_used"] = F("llm_calls_used") + 1
        updates["device_fingerprint"] = "llm:system_fallback"
    else:
        # Fallback for unit tests where service methods are mocked without calling chat_sync
        if not session.has_custom_ai_configured:
            updates["llm_calls_used"] = F("llm_calls_used") + 1

    DeviceSession.objects.filter(pk=session.pk).update(**updates)
    session.refresh_from_db()
    return session


# -------------------------------------------------------------
# Schemas
# -------------------------------------------------------------
class SessionInitSchema(Schema):
    token: Optional[str] = None
    device_fingerprint: Optional[str] = ""

class SessionRestoreSchema(Schema):
    token: str

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
    pydantic_gateway_endpoint: Optional[str] = None
    openrouter_endpoint: Optional[str] = None
    api_key: Optional[str] = ""
    model_name: str
    embedding_model: Optional[str] = "nomic-embed-text"
    temperature: float
    custom_instructions: Optional[str] = ""
    system_fallback_available: Optional[bool] = False
    system_fallback_model: Optional[str] = None

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
    section_context: Optional[Dict[str, Any]] = None

class ParseResumeTextSchema(Schema):
    raw_text: Optional[str] = None
    text: Optional[str] = None
    mode: Optional[str] = "merge"

class AIEditLatexSchema(Schema):
    latex_source: Optional[str] = None
    instruction: str
    target_section: Optional[str] = "all"
    model_name: Optional[str] = None
    job_id: Optional[int] = None
    save_to_document: Optional[bool] = False
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
# Device Session & Auth Endpoints
# -------------------------------------------------------------
@api.get("/health")
def api_health(request: HttpRequest):
    return {"status": "ok", "timestamp": timezone.now().isoformat()}


@api.post("/session/init")
def init_session(request: HttpRequest, data: Optional[SessionInitSchema] = None):
    explicit_token = data.token if data else None
    fingerprint = (data.device_fingerprint or "") if data else ""
    token = _extract_session_token(request, explicit_token=explicit_token)
    if token:
        session = DeviceSession.objects.select_related("user").filter(token=token).first()
        if session is None:
            session = _create_isolated_device_session(token=token, device_fingerprint=fingerprint)
        else:
            DeviceSession.objects.filter(pk=session.pk).update(last_active_at=timezone.now())
    else:
        session = _create_isolated_device_session(device_fingerprint=fingerprint)
    request._device_session = session
    return _serialize_session(session)


@api.get("/session/status")
def get_session_status(request: HttpRequest):
    session = get_device_session(request, create_if_missing=True)
    if session is None:
        session = _create_isolated_device_session()
        request._device_session = session
    return _serialize_session(session)


@api.post("/session/restore")
def restore_session(request: HttpRequest, data: SessionRestoreSchema):
    token = (data.token or "").strip()
    if not token or not SESSION_TOKEN_PATTERN.match(token):
        return api.create_response(
            request,
            {"error": "Enter a valid session token (16-128 alphanumeric characters)."},
            status=400,
        )
    session = DeviceSession.objects.select_related("user").filter(token=token).first()
    if session is None:
        return api.create_response(
            request,
            {"error": "No workspace found for that session token. Double-check the token and try again."},
            status=404,
        )
    DeviceSession.objects.filter(pk=session.pk).update(last_active_at=timezone.now())
    request._device_session = session
    return _serialize_session(session)


@api.post("/session/new")
def create_new_session(request: HttpRequest):
    session = _create_isolated_device_session()
    request._device_session = session
    return _serialize_session(session)


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
    session = get_device_session(request, create_if_missing=False)
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "is_authenticated": user.is_authenticated,
        "session": _serialize_session(session) if session else None,
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
    probe_presets: bool = False,
):
    user = get_current_user(request)
    ai_settings = getattr(user, 'ai_settings', None)
    active_provider = (provider or (ai_settings.provider if ai_settings else "ollama")).lower().strip()
    if active_provider == "gateway":
        active_provider = "pydantic_gateway"
    key = api_key if api_key is not None else (ai_settings.api_key if ai_settings else "")
    default_ollama_url = (
        getattr(django_settings, "OLLAMA_BASE_URL", "http://localhost:11434")
        or "http://localhost:11434"
    )
    if OllamaService._is_gateway_provider(active_provider):
        default_gw = (
            ai_settings.pydantic_gateway_endpoint
            if ai_settings
            else OllamaService.DEFAULT_GATEWAY_URL
        )
        url = endpoint or default_gw
    else:
        url = endpoint or (ai_settings.ollama_endpoint if ai_settings else default_ollama_url)

    service = OllamaService(
        base_url=url,
        api_key=key,
        provider=active_provider,
    )
    health_res = service.check_health_sync(probe_presets=probe_presets)

    # When running in Docker (where OLLAMA_BASE_URL is e.g. http://host.docker.internal:11434)
    # and the user's saved endpoint was still http://localhost:11434, automatically check
    # the Docker host Ollama URL and update their saved endpoint if reachable.
    if (
        not health_res.get("connected")
        and not probe_presets
        and active_provider == "ollama"
        and default_ollama_url.rstrip("/") != (url or "").rstrip("/")
    ):
        docker_service = OllamaService(
            base_url=default_ollama_url,
            api_key=key,
            provider="ollama",
        )
        docker_health = docker_service.check_health_sync(probe_presets=False)
        if docker_health.get("connected"):
            health_res = docker_health
            if ai_settings is not None:
                ai_settings.ollama_endpoint = default_ollama_url
                ai_settings.save(update_fields=["ollama_endpoint", "updated_at"])

    session = get_device_session(request, create_if_missing=False) or getattr(user, "device_session", None)
    if session is not None:
        if health_res.get("connected"):
            new_fp = "llm:personal"
        elif not probe_presets:
            new_fp = "llm:system_fallback"
        else:
            new_fp = session.device_fingerprint
        if new_fp and session.device_fingerprint != new_fp:
            DeviceSession.objects.filter(pk=session.pk).update(device_fingerprint=new_fp)
            session.refresh_from_db()
        health_res["session"] = _serialize_session(session)

    return health_res

@api.get("/ai/settings", response=AISettingsSchema)
def get_ai_settings(request: HttpRequest):
    user = get_current_user(request)
    default_ollama_url = (
        getattr(django_settings, "OLLAMA_BASE_URL", "http://localhost:11434")
        or "http://localhost:11434"
    )
    settings_obj, _ = UserAISettings.objects.get_or_create(
        user=user,
        defaults={"ollama_endpoint": default_ollama_url},
    )
    effective_provider = settings_obj.provider or "ollama"
    if effective_provider == "gateway":
        effective_provider = "pydantic_gateway"
    fallback_configured = OllamaService.is_system_fallback_configured()
    return {
        "provider": effective_provider,
        "ollama_endpoint": settings_obj.ollama_endpoint,
        "pydantic_gateway_endpoint": settings_obj.pydantic_gateway_endpoint,
        "openrouter_endpoint": settings_obj.openrouter_endpoint,
        "api_key": settings_obj.api_key,
        "model_name": settings_obj.model_name,
        "embedding_model": settings_obj.embedding_model,
        "temperature": settings_obj.temperature,
        "custom_instructions": settings_obj.custom_instructions,
        "system_fallback_available": fallback_configured,
        "system_fallback_model": OllamaService.get_system_fallback_model() if fallback_configured else None,
    }

@api.post("/ai/settings")
def update_ai_settings(request: HttpRequest, data: AISettingsSchema):
    provider = (data.provider or "ollama").lower().strip()
    if provider == "gateway":
        provider = "pydantic_gateway"
    if provider not in {"ollama", "pydantic_gateway", "openrouter"}:
        return api.create_response(
            request,
            {"error": "Provider must be 'ollama' or 'pydantic_gateway'."},
            status=400,
        )
    if provider == "ollama" and data.ollama_endpoint and not data.ollama_endpoint.startswith(("http://", "https://")):
        return api.create_response(request, {"error": "Ollama endpoint must use http:// or https://."}, status=400)

    gateway_endpoint = (data.pydantic_gateway_endpoint or data.openrouter_endpoint or "").strip()
    if provider in {"pydantic_gateway", "openrouter"} and gateway_endpoint and not gateway_endpoint.startswith(("http://", "https://")):
        return api.create_response(request, {"error": "Pydantic AI Gateway endpoint must use http:// or https://."}, status=400)

    if not data.model_name.strip():
        return api.create_response(request, {"error": "Model name is required."}, status=400)
    if not 0 <= data.temperature <= 1:
        return api.create_response(request, {"error": "Temperature must be between 0 and 1."}, status=400)

    user = get_current_user(request)
    settings_obj, _ = UserAISettings.objects.get_or_create(user=user)
    settings_obj.provider = provider
    if data.ollama_endpoint:
        settings_obj.ollama_endpoint = data.ollama_endpoint.strip()
    if gateway_endpoint:
        settings_obj.openrouter_endpoint = gateway_endpoint
    if data.api_key is not None:
        settings_obj.api_key = data.api_key.strip()
    settings_obj.model_name = data.model_name.strip()
    if data.embedding_model:
        settings_obj.embedding_model = data.embedding_model.strip()
    settings_obj.temperature = data.temperature
    settings_obj.custom_instructions = data.custom_instructions or ""
    settings_obj.save()

    session = get_device_session(request, create_if_missing=False) or getattr(user, "device_session", None)
    if session is not None and provider in {"pydantic_gateway", "openrouter"}:
        new_fp = "llm:personal" if bool(settings_obj.api_key) else "llm:system_fallback"
        if session.device_fingerprint != new_fp:
            DeviceSession.objects.filter(pk=session.pk).update(device_fingerprint=new_fp)
            session.refresh_from_db()

    fallback_configured = OllamaService.is_system_fallback_configured()
    return {
        "status": "success",
        "message": "AI settings updated",
        "system_fallback_available": fallback_configured,
        "system_fallback_model": OllamaService.get_system_fallback_model() if fallback_configured else None,
        "session": _serialize_session(session) if session else None,
    }

@api.post("/ai/refine-section")
def refine_section(request: HttpRequest, data: RefineSectionSchema):
    if not data.instruction.strip():
        return api.create_response(request, {"error": "A refinement instruction is required."}, status=400)
    user = get_current_user(request)
    access_error = check_llm_access(request, user, is_resume_upload=False)
    if access_error is not None:
        return access_error

    ai_settings = getattr(user, 'ai_settings', None)
    model = ai_settings.model_name if ai_settings else "qwen3.5:9b"
    custom_instructions = ai_settings.custom_instructions if ai_settings else ""
    service = OllamaService.from_user(user)
    master_data = TailorService.get_user_master_data(user)
    candidate_context = {k: v for k, v in master_data.items() if k != "source_resume_text"}
    try:
        result = SectionEditor.refine_section(
            section_type=data.section_type,
            current_content=data.current_content,
            instruction=data.instruction,
            conversation=[message.dict() for message in data.conversation],
            model_name=model,
            ollama_service=service,
            section_context=data.section_context,
            candidate_context=candidate_context,
            custom_instructions=custom_instructions,
        )
    except (RuntimeError, ValueError) as exc:
        return api.create_response(request, {"error": str(exc)}, status=502)

    record_llm_usage(request, user, mark_resume_uploaded=False, service=service)
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

        # Re-lock downstream LLM endpoints until a new resume is imported, preserving llm_calls_used
        DeviceSession.objects.filter(user=user).update(resume_uploaded=False)

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

@api.post("/master/certifications")
def create_certification(request: HttpRequest, data: CertificationSchema):
    user = get_current_user(request)
    cert = Certification.objects.create(user=user, **data.dict(exclude={'id'}))
    return {"status": "success", "id": cert.id}

@api.put("/master/certifications/{int:cert_id}")
def update_certification(request: HttpRequest, cert_id: int, data: CertificationSchema):
    user = get_current_user(request)
    cert = get_object_or_404(Certification, id=cert_id, user=user)
    for key, val in data.dict(exclude={'id'}).items():
        setattr(cert, key, val)
    cert.save()
    return {"status": "success"}

@api.delete("/master/certifications/{int:cert_id}")
def delete_certification(request: HttpRequest, cert_id: int):
    user = get_current_user(request)
    cert = get_object_or_404(Certification, id=cert_id, user=user)
    cert.delete()
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
def _build_parse_response(
    raw_text: str,
    parsed_data: Dict[str, Any],
    mode: str = "merge",
    session: Optional[DeviceSession] = None,
) -> Dict[str, Any]:
    resp: Dict[str, Any] = {
        "status": "success",
        "message": (
            "Resume parsed and replaced master profile"
            if mode == "replace"
            else "Resume parsed and merged into master profile"
        ),
        "mode": mode,
        "markdown_text": raw_text,
        "parsed_summary": {
            "name": parsed_data.get("profile", {}).get("full_name"),
            "profile": parsed_data.get("profile", {}),
            "experiences_count": len(parsed_data.get("experiences", [])),
            "educations_count": len(parsed_data.get("educations", [])),
            "skills_count": len(parsed_data.get("skills", [])),
            "projects_count": len(parsed_data.get("projects", [])),
            "certifications_count": len(parsed_data.get("certifications", [])),
        },
    }
    if session is not None:
        resp["session"] = _serialize_session(session)
    return resp


@api.post("/resumes/upload")
def upload_resume(
    request: HttpRequest,
    file: UploadedFile = File(...),
    mode: str = Form("merge"),
):
    extension = file.name.lower().rsplit(".", 1)[-1] if "." in file.name else ""
    if extension not in {"pdf", "docx", "txt"}:
        return api.create_response(request, {"error": "Upload a PDF, DOCX, or TXT file."}, status=400)
    if file.size > 15 * 1024 * 1024:
        return api.create_response(request, {"error": "Resume files must be 15 MB or smaller."}, status=400)
    user = get_current_user(request)
    access_error = check_llm_access(request, user, is_resume_upload=True)
    if access_error is not None:
        return access_error

    raw_text = ResumeParser.extract_text(file, file.name)
    if not raw_text.strip():
        return api.create_response(request, {"error": "Could not extract any text from the uploaded file."}, status=400)

    ai_settings = getattr(user, 'ai_settings', None)
    model = ai_settings.model_name if ai_settings else "qwen3.5:9b"
    service = OllamaService.from_user(user)
    normalized_mode = "replace" if (mode or "").strip().lower() == "replace" else "merge"

    try:
        parsed_data = ResumeParser.parse_with_ai(raw_text, model_name=model, ollama_service=service)
        ResumeParser.save_to_database(user, parsed_data, raw_text=raw_text, mode=normalized_mode)
    except (RuntimeError, ValueError) as exc:
        return api.create_response(request, {"error": str(exc)}, status=502)

    updated_session = record_llm_usage(request, user, mark_resume_uploaded=True, service=service)
    return _build_parse_response(raw_text, parsed_data, mode=normalized_mode, session=updated_session)


@api.post("/resumes/parse-text")
def parse_resume_text(request: HttpRequest, data: ParseResumeTextSchema):
    raw_text = (data.raw_text or data.text or "").strip()
    if not raw_text:
        return api.create_response(request, {"error": "Paste your resume text or career notes first."}, status=400)

    user = get_current_user(request)
    access_error = check_llm_access(request, user, is_resume_upload=True)
    if access_error is not None:
        return access_error

    ai_settings = getattr(user, 'ai_settings', None)
    model = ai_settings.model_name if ai_settings else "qwen3.5:9b"
    service = OllamaService.from_user(user)
    normalized_mode = "replace" if (data.mode or "").strip().lower() == "replace" else "merge"

    try:
        parsed_data = ResumeParser.parse_with_ai(raw_text, model_name=model, ollama_service=service)
        ResumeParser.save_to_database(user, parsed_data, raw_text=raw_text, mode=normalized_mode)
    except (RuntimeError, ValueError) as exc:
        return api.create_response(request, {"error": str(exc)}, status=502)

    updated_session = record_llm_usage(request, user, mark_resume_uploaded=True, service=service)
    return _build_parse_response(raw_text, parsed_data, mode=normalized_mode, session=updated_session)


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
    latest_resume_latex = ""
    for d in app.documents.all():
        cleaned_latex = normalize_unicode_and_latex_text(d.latex_source)
        if d.doc_type == "resume" and not latest_resume_latex:
            latest_resume_latex = cleaned_latex
        docs.append({
            "id": d.id,
            "doc_type": d.doc_type,
            "version": d.version,
            "latex_source": cleaned_latex,
            "tailoring_rationale": d.tailoring_rationale,
            "created_at": d.created_at.strftime("%Y-%m-%d %H:%M"),
        })

    keyword_coverage = None
    if app.extracted_keywords and latest_resume_latex:
        master_data = TailorService.get_user_master_data(user)
        keyword_coverage = TailorService.analyze_keyword_coverage(
            keywords=app.extracted_keywords,
            latex_source=latest_resume_latex,
            master_data=master_data,
        )

    return {
        "id": app.id,
        "company_name": app.company_name,
        "job_title": app.job_title,
        "job_url": app.job_url,
        "raw_description": app.raw_description,
        "status": app.status,
        "match_score": app.match_score,
        "extracted_keywords": app.extracted_keywords,
        "keyword_coverage": keyword_coverage,
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
    access_error = check_llm_access(request, user, is_resume_upload=False)
    if access_error is not None:
        return access_error

    app = get_object_or_404(JobApplication, id=job_id, user=user)
    service = OllamaService.from_user(user)
    try:
        result = TailorService.tailor_for_job(user=user, application=app, ollama_service=service)
    except (RuntimeError, ValueError) as exc:
        return api.create_response(request, {"error": str(exc)}, status=502)

    record_llm_usage(request, user, mark_resume_uploaded=False, service=service)
    return {"status": "success", "result": result}

@api.put("/documents/{int:doc_id}")
def update_document(request: HttpRequest, doc_id: int, data: UpdateDocumentSchema):
    user = get_current_user(request)
    doc = get_object_or_404(TailoredDocument, id=doc_id, application__user=user)
    doc.latex_source = normalize_unicode_and_latex_text(data.latex_source)
    doc.save()
    return {"status": "success", "message": "LaTeX source updated"}

@api.get("/documents/{int:doc_id}/export-latex")
def export_latex(request: HttpRequest, doc_id: int):
    user = get_current_user(request)
    doc = get_object_or_404(TailoredDocument, id=doc_id, application__user=user)
    filename = re.sub(r"[^A-Za-z0-9._-]+", "_", f"{doc.application.company_name}_{doc.doc_type}.tex")
    cleaned_source = normalize_unicode_and_latex_text(doc.latex_source)
    response = HttpResponse(cleaned_source, content_type="application/x-tex; charset=utf-8")
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
    cleaned_source = normalize_unicode_and_latex_text(doc.latex_source)
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("main.tex", cleaned_source)
        zf.writestr("resumeforge.cls", RESUMEFORGE_CLASS)
    zip_buffer.seek(0)
    zip_filename = re.sub(r"[^A-Za-z0-9._-]+", "_", f"{doc.application.company_name}_{doc.doc_type}_overleaf.zip")
    response = HttpResponse(zip_buffer.getvalue(), content_type="application/zip")
    response['Content-Disposition'] = f'attachment; filename="{zip_filename}"'
    return response

@api.post("/documents/export-zip-custom")
def export_custom_overleaf_zip(request: HttpRequest, data: ExportCustomZipSchema):
    cleaned_source = normalize_unicode_and_latex_text(data.latex_source)
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("main.tex", cleaned_source)
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
    access_error = check_llm_access(request, user, is_resume_upload=False)
    if access_error is not None:
        return access_error

    doc = get_object_or_404(TailoredDocument, id=doc_id, application__user=user)
    ai_settings = getattr(user, 'ai_settings', None)
    model = (data.model_name if data and data.model_name else None) or (ai_settings.model_name if ai_settings else 'qwen3.5:9b')

    source_to_review = (data.latex_source if data and data.latex_source else None) or doc.latex_source
    service = OllamaService.from_user(user)

    reviewed_latex = TailorService.review_latex_document(
        latex_source=source_to_review,
        model_name=model,
        ollama_service=service,
        target_keywords=doc.application.extracted_keywords or [],
    )

    doc.latex_source = reviewed_latex
    doc.save(update_fields=["latex_source", "updated_at"])

    record_llm_usage(request, user, mark_resume_uploaded=False, service=service)
    return {"status": "success", "latex_source": reviewed_latex}

@api.post("/documents/review-latex")
def review_custom_latex(request: HttpRequest, data: ReviewSectionsSchema):
    user = get_current_user(request)
    access_error = check_llm_access(request, user, is_resume_upload=False)
    if access_error is not None:
        return access_error

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
    record_llm_usage(request, user, mark_resume_uploaded=False, service=service)
    return {"status": "success", "latex_source": reviewed_latex}


@api.post("/documents/{int:doc_id}/ai-edit")
def ai_edit_document_latex(request: HttpRequest, doc_id: int, data: AIEditLatexSchema):
    user = get_current_user(request)
    access_error = check_llm_access(request, user, is_resume_upload=False)
    if access_error is not None:
        return access_error

    doc = get_object_or_404(TailoredDocument, id=doc_id, application__user=user)
    ai_settings = getattr(user, 'ai_settings', None)
    model = data.model_name or (ai_settings.model_name if ai_settings else 'qwen3.5:9b')
    source_to_edit = data.latex_source or doc.latex_source

    service = OllamaService.from_user(user)
    master_data = TailorService.get_user_master_data(user)
    try:
        result = TailorService.ai_edit_latex_document(
            latex_source=source_to_edit,
            instruction=data.instruction,
            model_name=model,
            ollama_service=service,
            target_section=data.target_section or "all",
            job_description=doc.application.raw_description,
            master_data=master_data,
        )
    except (RuntimeError, ValueError) as exc:
        return api.create_response(request, {"error": str(exc)}, status=502)

    doc.latex_source = result["latex_source"]
    doc.save(update_fields=["latex_source", "updated_at"])

    keyword_coverage = None
    if doc.doc_type == "resume" and doc.application.extracted_keywords:
        keyword_coverage = TailorService.analyze_keyword_coverage(
            keywords=doc.application.extracted_keywords,
            latex_source=doc.latex_source,
            master_data=master_data,
        )

    record_llm_usage(request, user, mark_resume_uploaded=False, service=service)
    return {
        "status": "success",
        "latex_source": result["latex_source"],
        "changes_summary": result["changes_summary"],
        "keyword_coverage": keyword_coverage,
    }


@api.post("/documents/ai-edit-latex")
def ai_edit_custom_latex(request: HttpRequest, data: AIEditLatexSchema):
    user = get_current_user(request)
    access_error = check_llm_access(request, user, is_resume_upload=False)
    if access_error is not None:
        return access_error

    if not data.latex_source:
        return api.create_response(request, {"error": "latex_source is required."}, status=400)
    ai_settings = getattr(user, 'ai_settings', None)
    model = data.model_name or (ai_settings.model_name if ai_settings else 'qwen3.5:9b')

    service = OllamaService.from_user(user)
    master_data = TailorService.get_user_master_data(user)
    try:
        result = TailorService.ai_edit_latex_document(
            latex_source=data.latex_source,
            instruction=data.instruction,
            model_name=model,
            ollama_service=service,
            target_section=data.target_section or "all",
            master_data=master_data,
        )
    except (RuntimeError, ValueError) as exc:
        return api.create_response(request, {"error": str(exc)}, status=502)

    record_llm_usage(request, user, mark_resume_uploaded=False, service=service)
    return {
        "status": "success",
        "latex_source": result["latex_source"],
        "changes_summary": result["changes_summary"],
    }

