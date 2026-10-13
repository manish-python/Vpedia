"""Google OAuth 2.0 adapter.

Extends allauth's Google adapter with exactly one behaviour change: the
redirect URI may be pinned explicitly via `GOOGLE_REDIRECT_URI`.

Why this matters
----------------
allauth derives the callback URL from the incoming request, so in local
development behind the Vite proxy it produces
`http://localhost:5173/api/v1/accounts/google/login/callback/` (the proxy
preserves the browser's Host header, which is what it must do — otherwise
Google would return the browser to a port the SPA is not served from).

That derived value is correct, but it is easy to register a different URI in
the Google Cloud Console and get an opaque `redirect_uri_mismatch`. Pinning the
value removes the guesswork, and `VpediaCallbackUriCheck` then warns when the
configured URI disagrees with what the server would otherwise send.

Everything else — the authorization-code exchange, `state` validation, PKCE and
token verification — is allauth's, and is not reimplemented here.
"""

from __future__ import annotations

from django.conf import settings
from django.http import HttpRequest
from django.urls import reverse

from allauth.socialaccount.models import SocialApp
from allauth.socialaccount.providers.google.views import (
    GoogleOAuth2Adapter,
    OAuth2CallbackView,
    OAuth2LoginView,
)
from allauth.utils import build_absolute_uri


class VpediaGoogleOAuth2Adapter(GoogleOAuth2Adapter):
    """Google's adapter with a pinnable redirect URI."""

    def get_callback_url(self, request: HttpRequest, app: SocialApp) -> str:
        """Return the URI Google will send the browser back to.

        Prefers `GOOGLE_REDIRECT_URI` when it is set, because a registered
        redirect URI must match byte for byte. Falls back to allauth's
        derivation from the request otherwise.
        """
        pinned = getattr(settings, "GOOGLE_REDIRECT_URI", "").strip()

        if pinned:
            return pinned

        callback_path = reverse(f"{self.provider_id}_callback")
        protocol = self.redirect_uri_protocol
        return build_absolute_uri(request, callback_path, protocol)


def build_views() -> tuple:
    """Bind allauth's login and callback views to the VPEDIA adapter.

    `adapter_view` instantiates the adapter per request, which is what lets it
    read the current request.
    """
    login_view = OAuth2LoginView.adapter_view(VpediaGoogleOAuth2Adapter)
    callback_view = OAuth2CallbackView.adapter_view(VpediaGoogleOAuth2Adapter)
    return login_view, callback_view


google_oauth2_login, google_oauth2_callback = build_views()
