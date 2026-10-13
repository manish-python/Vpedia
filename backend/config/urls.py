"""Root URL configuration.

Two rules matter here:

1. `/api/v1/` is the versioned API surface.
2. Uploaded media is NOT exposed at a public URL. `MEDIA_URL` resolves to
   the staff-guarded view below, so payment screenshots cannot be fetched
   by an unauthenticated caller.
"""

from __future__ import annotations

from django.contrib import admin
from django.urls import include, path

from apps.core.views import private_media

admin.site.site_header = "VPEDIA LEARNING Administration"
admin.site.site_title = "VPEDIA LEARNING Admin"
admin.site.index_title = "Catalogue, purchases and payment verification"

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include("config.api_urls")),
    # Private, permission-checked file delivery (payment proofs, content).
    path("private-media/<path:path>", private_media, name="private-media"),
]
