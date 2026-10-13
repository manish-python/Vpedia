"""Authentication and profile endpoints.

Routes mounted under `/api/v1/`:

    GET  /auth/config/                     is Google sign-in available
    GET  /auth/csrf/                       CSRF token for unsafe requests
    GET  /auth/google/                     URL to start the Google round trip
    GET  /auth/complete/                   post-OAuth landing page
    GET  /auth/me/                         current authentication state
    POST /auth/logout/                     terminate the session
    GET  /profile/me/                      the caller's profile
    PATCH /profile/me/                     update the caller's own profile

Session architecture
--------------------
Authentication is an HTTP-only session cookie. The cookie is only ever set by
allauth after it has validated Google's OIDC response, so holding it is proof
that the OAuth exchange already happened. JavaScript cannot read it, so an XSS
bug cannot exfiltrate a long-lived credential.

Because DRF's `SessionAuthentication` also enforces CSRF on unsafe methods, the
SPA must send `X-CSRFToken` on POST/PATCH. `GET /auth/csrf/` issues the token.
"""

from __future__ import annotations

import json

from django.conf import settings
from django.contrib.auth import logout as auth_logout
from django.http import HttpResponse, HttpResponseRedirect
from django.middleware.csrf import get_token
from django.urls import NoReverseMatch, reverse
from django.utils.html import escape
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.services import ensure_profile

from .serializers import (
    ProfileSerializer,
    ProfileUpdateSerializer,
    StudentProfileSerializer,
    UserSerializer,
)


#: Backend-local landing page for a completed OAuth round trip. Kept
#: same-origin so allauth's redirect safety check accepts it without any extra
#: host allow-list configuration.
_COMPLETE_PATH = "/api/v1/auth/complete/"


def _google_login_url() -> str | None:
    """Reverse allauth's Google start URL, or None when not configured.

    `config.api_urls` declares `app_name = "api"`, so every name inside it is
    namespaced. The unqualified name is tried first so this keeps working if
    these routes are ever mounted without that namespace.
    """
    if not getattr(settings, "GOOGLE_OAUTH_CONFIGURED", False):
        return None
    for name in ("api:google_login", "google_login"):
        try:
            return reverse(name)
        except NoReverseMatch:
            continue
    return None  # pragma: no cover - defensive


class AuthConfigView(APIView):
    """`GET /api/v1/auth/config/`

    Tells the frontend whether Google sign-in is available and where to send the
    browser. Public, because the login screen needs it before anyone is signed
    in.

    Exposes no secret: only the URL and the fact that configuration exists.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        login_url = _google_login_url()

        if login_url is None:
            # Misconfigured deployment: fail closed with a clear instruction
            # rather than showing a button that cannot work.
            return Response(
                {
                    "google_enabled": False,
                    "login_url": None,
                    "detail": (
                        "Google sign-in is not configured on this server. "
                        "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET."
                    ),
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response(
            {
                "google_enabled": True,
                "login_url": login_url,
                "auth_provider": "google",
            }
        )


class CsrfTokenView(APIView):
    """`GET /api/v1/auth/csrf/`

    Issues the CSRF cookie and returns the matching token so the SPA can echo
    it in the `X-CSRFToken` header. Safe to call before signing in.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        # `get_token` records the token on the request; CsrfViewMiddleware
        # writes the matching cookie on the way out. `ensure_csrf_cookie` is
        # deliberately not used here: it is a function decorator for Django
        # views, and decorating a DRF *method* would hand it the view instance
        # instead of the request.
        return Response({"csrfToken": get_token(request)})


class GoogleLoginStartView(APIView):
    """`GET /api/v1/auth/google/`

    Returns the URL that begins the OAuth 2.0 authorization-code flow.

    The browser is redirected there rather than the SPA collecting a token
    itself, so the `state` parameter that allauth generates and validates stays
    on the server. The client secret is never involved in the browser at all.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        login_url = _google_login_url()
        if login_url is None:
            return Response(
                {"detail": "Google sign-in is not configured on this server."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        # `next` stays same-origin so allauth's redirect safety check accepts
        # it without any extra host allow-list configuration. The landing page
        # then hands the student back to the SPA.
        return Response(
            {
                "login_url": f"{login_url}?process=login&next={_COMPLETE_PATH}",
                "state_note": "state is generated and validated server-side",
            }
        )


class AuthCompleteView(APIView):
    """`GET /api/v1/auth/complete/`

    The `next` target allauth returns to once Google has authenticated the
    student. By this point the session cookie has already been set.

    Renders a minimal same-origin page that forwards to the SPA, which then
    calls `/auth/me/` and confirms the session for real. No account data is
    rendered here — the SPA never trusts a redirect to be proof of identity.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        frontend = getattr(settings, "FRONTEND_URL", "")
        landing = f"{frontend}/auth/google/callback" if frontend else "/"

        # `request.user` must reflect the real session here, so session
        # authentication is deliberately NOT disabled on this view.
        if not request.user.is_authenticated:
            # e.g. the student dismissed the Google consent screen.
            return HttpResponseRedirect(f"{frontend}/login?error=auth_cancelled")

        # `landing` is built from FRONTEND_URL, never from request data, and is
        # JSON-encoded so a stray quote cannot break out of the string.
        target = json.dumps(landing)
        html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Signing you in…</title>
<meta name="robots" content="noindex">
</head>
<body>
<p>Signing you in to VPEDIA LEARNING…</p>
<noscript>
  <p>JavaScript is disabled. <a href="{escape(landing)}">Continue</a></p>
</noscript>
<script>window.location.replace({target});</script>
</body>
</html>"""
        return HttpResponse(html, content_type="text/html; charset=utf-8")


class AuthMeView(APIView):
    """`GET /api/v1/auth/me/`

    Reports whether the current request is authenticated.

    Always 200, with `authenticated: false` and `user: null` when there is no
    valid session. A status endpoint is not a protected resource, so a 401 here
    would only force the frontend to treat a normal state as an error.

    When signed in the payload also carries the class/stream preference and the
    list of classes this student has actually paid for, so the SPA can render
    its shell from a single request. The unlocked list comes from ACTIVE
    purchases — it is never derived from the selected class.

    Every endpoint that *does* require identity returns 401.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        if not request.user.is_authenticated:
            return Response(
                {
                    "authenticated": False,
                    "user": None,
                    "profile": None,
                    "unlocked_classes": [],
                }
            )

        ensure_profile(request.user)

        # The profile and the unlocked list travel with the account so the SPA
        # needs one request to render its whole shell. `unlocked_classes` is
        # derived from ACTIVE purchases, never from the selected class.
        profile = ProfileSerializer(request.user).data
        return Response(
            {
                "authenticated": True,
                "user": UserSerializer(request.user).data,
                "profile": profile["profile"],
                "unlocked_classes": profile["unlocked_classes"],
            }
        )


class LogoutView(APIView):
    """`POST /api/v1/auth/logout/`

    Terminates the session on the server.

    The session row is deleted and the cookie is expired, so the cookie a
    browser still holds is worthless. Clearing frontend storage is not what
    makes this work — it is only cosmetic.

    CSRF: `AllowAny` is deliberate, so signing out twice or without a session is
    harmless rather than an error. For a *signed-in* student DRF's session
    authentication still runs, which means the CSRF check runs too — another
    site cannot force a logout. The SPA primes a token from `/auth/csrf/`
    before calling this.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        was_authenticated = request.user.is_authenticated

        # Flushes the session, cycles the key and expires the cookie.
        auth_logout(request)

        response = Response(
            {
                "detail": "Signed out.",
                "was_authenticated": was_authenticated,
            }
        )
        response.delete_cookie(settings.SESSION_COOKIE_NAME)
        response.delete_cookie(settings.CSRF_COOKIE_NAME)
        return response


class ProfileView(APIView):
    """`GET` / `PATCH /api/v1/profile/me/`

    Reads or updates the *authenticated* student's own profile.

    There is no id in the URL and no way to name another user. Ownership comes
    from `request.user`, which the session established. A request body cannot
    redirect the write to a different account: see
    `ProfileUpdateSerializer`, which accepts a four-field whitelist.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        ensure_profile(request.user)
        return Response(ProfileSerializer(request.user).data)

    def patch(self, request):
        serializer = ProfileUpdateSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        return Response(ProfileSerializer(user).data)
