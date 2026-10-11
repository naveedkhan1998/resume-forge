from django.contrib import admin
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

@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'full_name', 'email', 'updated_at')
    search_fields = ('user__username', 'full_name', 'email')

@admin.register(Experience)
class ExperienceAdmin(admin.ModelAdmin):
    list_display = ('company', 'role', 'user', 'start_date', 'end_date', 'is_current')
    list_filter = ('is_current',)
    search_fields = ('company', 'role', 'user__username')

@admin.register(Education)
class EducationAdmin(admin.ModelAdmin):
    list_display = ('institution', 'degree', 'field_of_study', 'user', 'end_date')

@admin.register(Skill)
class SkillAdmin(admin.ModelAdmin):
    list_display = ('name', 'category', 'proficiency', 'user')
    list_filter = ('category',)
    search_fields = ('name', 'category')

@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ('title', 'user', 'repo_url', 'live_url')

@admin.register(Certification)
class CertificationAdmin(admin.ModelAdmin):
    list_display = ('name', 'issuer', 'user', 'issue_date')

@admin.register(UserAISettings)
class UserAISettingsAdmin(admin.ModelAdmin):
    list_display = ('user', 'model_name', 'ollama_endpoint', 'temperature')

@admin.register(JobApplication)
class JobApplicationAdmin(admin.ModelAdmin):
    list_display = ('job_title', 'company_name', 'user', 'status', 'match_score', 'created_at')
    list_filter = ('status',)
    search_fields = ('job_title', 'company_name')

@admin.register(TailoredDocument)
class TailoredDocumentAdmin(admin.ModelAdmin):
    list_display = ('application', 'doc_type', 'version', 'created_at')
    list_filter = ('doc_type',)

@admin.register(ItemEmbedding)
class ItemEmbeddingAdmin(admin.ModelAdmin):
    list_display = ('user', 'item_type', 'item_id', 'created_at')
