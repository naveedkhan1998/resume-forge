from typing import Optional
from django.db import models
from django.contrib.auth.models import User
from pgvector.django import VectorField

class Profile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    full_name = models.CharField(max_length=255, blank=True, default='')
    headline = models.CharField(max_length=255, blank=True, default='')
    email = models.EmailField(blank=True, default='')
    phone = models.CharField(max_length=50, blank=True, default='')
    location = models.CharField(max_length=255, blank=True, default='')
    website_url = models.TextField(blank=True, default='')
    linkedin_url = models.TextField(blank=True, default='')
    github_url = models.TextField(blank=True, default='')
    summary = models.TextField(blank=True, default='')
    raw_resume_text = models.TextField(blank=True, default='')
    is_dummy = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.full_name or self.user.username}'s Profile"


class Experience(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='experiences')
    company = models.CharField(max_length=255)
    role = models.CharField(max_length=255)
    location = models.CharField(max_length=255, blank=True, default='')
    start_date = models.CharField(max_length=50, blank=True, default='')
    end_date = models.CharField(max_length=50, blank=True, default='')
    is_current = models.BooleanField(default=False)
    description = models.TextField(blank=True, default='')
    bullet_points = models.JSONField(default=list, blank=True)
    technologies = models.JSONField(default=list, blank=True)
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['order', '-created_at']

    def __str__(self):
        return f"{self.role} at {self.company}"


class Education(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='educations')
    institution = models.CharField(max_length=255)
    degree = models.CharField(max_length=255)
    field_of_study = models.CharField(max_length=255, blank=True, default='')
    start_date = models.CharField(max_length=50, blank=True, default='')
    end_date = models.CharField(max_length=50, blank=True, default='')
    gpa = models.CharField(max_length=50, blank=True, default='')
    highlights = models.JSONField(default=list, blank=True)
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['order', '-created_at']

    def __str__(self):
        return f"{self.degree} - {self.institution}"


class Skill(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='skills')
    category = models.CharField(max_length=100, default='Technical Skills')
    name = models.CharField(max_length=100)
    proficiency = models.CharField(max_length=50, blank=True, default='')
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['category', 'order', 'name']

    def __str__(self):
        return f"{self.name} ({self.category})"


class Project(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='projects')
    title = models.CharField(max_length=255)
    subtitle = models.CharField(max_length=255, blank=True, default='')
    role = models.CharField(max_length=255, blank=True, default='')
    repo_url = models.TextField(blank=True, default='')
    live_url = models.TextField(blank=True, default='')
    start_date = models.CharField(max_length=50, blank=True, default='')
    end_date = models.CharField(max_length=50, blank=True, default='')
    bullet_points = models.JSONField(default=list, blank=True)
    technologies = models.JSONField(default=list, blank=True)
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['order', '-created_at']

    def __str__(self):
        return self.title


class Certification(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='certifications')
    name = models.CharField(max_length=255)
    issuer = models.CharField(max_length=255, blank=True, default='')
    issue_date = models.CharField(max_length=50, blank=True, default='')
    credential_url = models.TextField(blank=True, default='')
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order', '-created_at']

    def __str__(self):
        return self.name


class UserAISettings(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='ai_settings')
    provider = models.CharField(max_length=50, default='ollama')
    ollama_endpoint = models.CharField(max_length=255, default='http://localhost:11434')
    openrouter_endpoint = models.CharField(max_length=255, default='https://gateway.pydantic.dev/v1')
    api_key = models.CharField(max_length=255, blank=True, default='')
    model_name = models.CharField(max_length=100, default='qwen3.5:9b')
    embedding_model = models.CharField(max_length=100, default='nomic-embed-text')
    temperature = models.FloatField(default=0.7)
    custom_instructions = models.TextField(blank=True, default='')
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def pydantic_gateway_endpoint(self) -> str:
        val = (self.openrouter_endpoint or '').strip()
        if not val or 'openrouter.ai' in val:
            return 'https://gateway.pydantic.dev/v1'
        return val

    @pydantic_gateway_endpoint.setter
    def pydantic_gateway_endpoint(self, value: str) -> None:
        self.openrouter_endpoint = (value or 'https://gateway.pydantic.dev/v1').strip()

    @property
    def system_fallback_available(self) -> bool:
        from django.conf import settings as django_settings
        sys_key = getattr(django_settings, 'SYSTEM_LLM_API_KEY', '')
        sys_provider = getattr(django_settings, 'SYSTEM_LLM_PROVIDER', 'pydantic_gateway')
        sys_url = getattr(django_settings, 'SYSTEM_LLM_BASE_URL', '')
        if sys_provider == 'ollama':
            return bool(sys_url)
        return bool(sys_key and sys_url)

    @property
    def system_fallback_model(self) -> Optional[str]:
        if self.system_fallback_available:
            from django.conf import settings as django_settings
            return getattr(django_settings, 'SYSTEM_LLM_MODEL', 'qwen3.5:9b') or 'qwen3.5:9b'
        return None

    def __str__(self):
        return f"{self.user.username}'s AI Settings ({self.provider}: {self.model_name})"


class JobApplication(models.Model):
    STATUS_CHOICES = [
        ('saved', 'Saved'),
        ('applied', 'Applied'),
        ('interviewing', 'Interviewing'),
        ('offer', 'Offer'),
        ('rejected', 'Rejected'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='applications')
    company_name = models.CharField(max_length=255)
    job_title = models.CharField(max_length=255)
    job_url = models.TextField(blank=True, default='')
    raw_description = models.TextField(blank=True, default='')
    extracted_keywords = models.JSONField(default=list, blank=True)
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='saved')
    match_score = models.FloatField(null=True, blank=True)
    notes = models.TextField(blank=True, default='')
    applied_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.job_title} at {self.company_name}"


class TailoredDocument(models.Model):
    DOC_TYPES = [
        ('resume', 'Resume'),
        ('cover_letter', 'Cover Letter'),
    ]

    application = models.ForeignKey(JobApplication, on_delete=models.CASCADE, related_name='documents')
    doc_type = models.CharField(max_length=50, choices=DOC_TYPES, default='resume')
    latex_source = models.TextField()
    pdf_file = models.FileField(upload_to='generated_resumes/', null=True, blank=True)
    tailoring_rationale = models.TextField(blank=True, default='')
    version = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-version', '-created_at']

    def __str__(self):
        return f"{self.doc_type.title()} v{self.version} for {self.application}"


class ItemEmbedding(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='embeddings')
    item_type = models.CharField(max_length=50) # 'experience', 'bullet', 'skill', 'project'
    item_id = models.PositiveIntegerField()
    content = models.TextField()
    embedding = VectorField(dimensions=768, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.item_type}:{self.item_id} embedding"


class DeviceSession(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='device_session')
    token = models.CharField(max_length=128, unique=True, db_index=True)
    device_fingerprint = models.CharField(max_length=255, blank=True, default='')
    resume_uploaded = models.BooleanField(default=False)
    is_dummy = models.BooleanField(default=False, db_index=True)
    llm_calls_used = models.PositiveIntegerField(default=0)
    llm_calls_limit = models.PositiveIntegerField(default=25)
    created_at = models.DateTimeField(auto_now_add=True)
    last_active_at = models.DateTimeField(auto_now=True)

    @property
    def has_custom_ai_configured(self) -> bool:
        ai_settings = getattr(self.user, 'ai_settings', None)
        if ai_settings and bool((ai_settings.api_key or '').strip()):
            return True
        if self.device_fingerprint == "llm:personal":
            return True
        return False

    @property
    def is_llm_unlocked(self) -> bool:
        if self.resume_uploaded or self.is_dummy:
            return True
        profile = getattr(self.user, 'profile', None)
        if profile and (profile.raw_resume_text or '').strip():
            return True
        return False

    @property
    def llm_quota_remaining(self) -> Optional[int]:
        if self.has_custom_ai_configured:
            return None
        if self.llm_calls_limit == 0:
            return None
        return max(0, self.llm_calls_limit - self.llm_calls_used)

    def __str__(self):
        return f"Session {self.token[:12]}... ({self.user.username})"

