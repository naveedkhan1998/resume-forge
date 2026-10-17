from django.contrib import admin
from django.urls import path
from django.conf import settings
from django.conf.urls.static import static
from django.http import JsonResponse
from django.utils import timezone
from resumes.api import api


def root_health(request):
    return JsonResponse({"status": "ok", "timestamp": timezone.now().isoformat()})


urlpatterns = [
    path('health', root_health),
    path('health/', root_health),
    path('admin/', admin.site.urls),
    path('api/', api.urls),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
