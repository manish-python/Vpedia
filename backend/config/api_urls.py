"""Versioned API routes — `/api/v1/`."""

from __future__ import annotations

from django.urls import include, path

from apps.accounts import urls as accounts_urls
from apps.academics import urls as academics_urls
from apps.content import urls as content_urls
from apps.core.views import health
from apps.payments import urls as payments_urls
from apps.purchases import urls as purchases_urls
from apps.admin_api import urls as admin_api_urls
from apps.resources import urls as resources_urls

# NOTE: deliberately no `app_name` here. Declaring one would put every route
# in this module into an `api:` namespace, and allauth reverses its own
# provider callback unqualified (`reverse("google_callback")`). Namespacing
# would break the OAuth callback with NoReverseMatch.

urlpatterns = [
    path("health/", health, name="health"),
    # Authentication + profile (Google OAuth only)
    path("", include(accounts_urls.auth_patterns)),
    # Google OAuth protocol endpoints, present only when configured
    *accounts_urls.google_protocol_patterns(),
    # Catalogue (public read)
    path("", include(academics_urls.urlpatterns)),
    path("", include(content_urls.urlpatterns)),
    # Purchase + payment
    path("", include(purchases_urls.urlpatterns)),
    path("", include(payments_urls.urlpatterns)),
    # Other Resources — independent of the class/subject/chapter tree
    path("", include(resources_urls.urlpatterns)),
    path("admin/", include(admin_api_urls.urlpatterns)),
]
