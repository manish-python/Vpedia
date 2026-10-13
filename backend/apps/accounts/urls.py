"""Authentication routes.

Only the Google provider's login and callback are routed.

allauth also ships password sign-up, password reset, email confirmation,
social-account management and logout views. None of them are included here, so
those capabilities are absent from this application's URL space entirely — not
hidden behind a permission, simply not reachable.

Registered names:
    google_login     ->  /api/v1/accounts/google/login/
    google_callback  ->  /api/v1/accounts/google/login/callback/
"""

from __future__ import annotations

from django.urls import path

from .providers import google_oauth2_callback, google_oauth2_login
from .views import (
    AuthCompleteView,
    AuthConfigView,
    AuthMeView,
    CsrfTokenView,
    GoogleLoginStartView,
    LogoutView,
    ProfileView,
)

auth_patterns = [
    # --- SPA-facing JSON endpoints -------------------------------------
    path("auth/config/", AuthConfigView.as_view(), name="auth-config"),
    path("auth/csrf/", CsrfTokenView.as_view(), name="auth-csrf"),
    path("auth/google/", GoogleLoginStartView.as_view(), name="auth-google-start"),
    path("auth/complete/", AuthCompleteView.as_view(), name="auth-complete"),
    path("auth/me/", AuthMeView.as_view(), name="auth-me"),
    path("auth/logout/", LogoutView.as_view(), name="auth-logout"),

    # --- Profile -------------------------------------------------------
    path("profile/me/", ProfileView.as_view(), name="profile-me"),
]


def google_protocol_patterns() -> list:
    """Google's OAuth 2.0 endpoints, when the provider is installed.

    Returns an empty list when credentials are absent, so a deployment without
    Google configuration has no OAuth route at all and the project still boots.

    Mounted by `config.api_urls` directly rather than via `include`, because it
    must sit alongside the JSON routes under the same `/api/v1/` prefix.
    """
    from django.apps import apps
    from django.conf import settings

    if not getattr(settings, "GOOGLE_OAUTH_CONFIGURED", False):
        return []

    if not apps.is_installed("allauth.socialaccount.providers.google"):
        return []

    return [
        path("accounts/google/login/", google_oauth2_login, name="google_login"),
        path(
            "accounts/google/login/callback/",
            google_oauth2_callback,
            name="google_callback",
        ),
    ]


urlpatterns = [
    *auth_patterns,
    *google_protocol_patterns(),
]
