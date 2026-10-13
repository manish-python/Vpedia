"""Django system checks for the Google OAuth configuration.

These catch the mistakes that otherwise surface as an opaque Google error page
hours later, long after the developer has moved on:

* a redirect URI registered in the Google Cloud Console that the server will
  not actually send;
* a client id or secret that looks like a placeholder;
* a frontend origin that is not a trusted CSRF origin, which would break every
  state-changing API call from the SPA.
"""

from __future__ import annotations

from urllib.parse import urlparse

from django.conf import settings
from django.core.checks import Error, Warning, register

#: Substrings that suggest a value was copied from `.env.example` and never
#: replaced. Deliberately specific: a real client secret is a long opaque
#: string, so none of these can appear in one by accident.
PLACEHOLDER_MARKERS = (
    "your-",
    "your_",
    "changeme",
    "change-me",
    "replace-me",
    "replaceme",
    "dummy",
    "fake-",
    "example.com",
    "example-client",
    "xxxx",
)


@register("accounts")
def google_oauth_configuration(app_configs, **kwargs):
    """Validate the Google OAuth wiring against the rest of the configuration."""
    problems = []

    client_id = getattr(settings, "GOOGLE_CLIENT_ID", "").strip()
    client_secret = getattr(settings, "GOOGLE_CLIENT_SECRET", "").strip()
    configured = bool(client_id and client_secret)

    if not configured:
        # Failing closed is a supported state, not a misconfiguration.
        return problems

    placeholderish = [
        name
        for name, value in (
            ("GOOGLE_CLIENT_ID", client_id),
            ("GOOGLE_CLIENT_SECRET", client_secret),
        )
        if any(marker in value.lower() for marker in PLACEHOLDER_MARKERS)
    ]

    if placeholderish:
        problems.append(
            Warning(
                f"{' and '.join(placeholderish)} still "
                f"{'look' if len(placeholderish) > 1 else 'looks'} "
                f"like {'placeholders' if len(placeholderish) > 1 else 'a placeholder'}.",
                hint=(
                    "Sign-in will reach Google and be rejected with "
                    "'invalid_client'. Create a real OAuth client at "
                    "https://console.cloud.google.com/apis/credentials"
                ),
                id="accounts.W101",
            )
        )

    redirect_uri = getattr(settings, "GOOGLE_REDIRECT_URI", "").strip()
    if redirect_uri:
        parsed = urlparse(redirect_uri)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            problems.append(
                Error(
                    "GOOGLE_REDIRECT_URI is not a valid absolute URL.",
                    hint=f"Got {redirect_uri!r}.",
                    id="accounts.E101",
                )
            )
        elif parsed.scheme == "http" and not settings.DEBUG:
            problems.append(
                Warning(
                    "GOOGLE_REDIRECT_URI uses http in production.",
                    hint="Google requires https outside localhost.",
                    id="accounts.W102",
                )
            )
        elif not parsed.path.endswith("/api/v1/accounts/google/login/callback/"):
            problems.append(
                Warning(
                    "GOOGLE_REDIRECT_URI does not point at the Google callback.",
                    hint=(
                        "It should end with "
                        "/api/v1/accounts/google/login/callback/ , or be left "
                        "blank so the server derives it from the request."
                    ),
                    id="accounts.W103",
                )
            )
    else:
        problems.append(
            Warning(
                "GOOGLE_REDIRECT_URI is not set, so the redirect URI is derived "
                "from the incoming request.",
                hint=(
                    "That works, but the derived origin depends on how the "
                    "browser reached the backend. Register the derived value "
                    "exactly, including the port. For the Vite dev proxy that "
                    f"is http://{settings.FRONTEND_URL.split('://')[-1]}"
                    "/api/v1/accounts/google/login/callback/"
                ),
                id="accounts.W104",
            )
        )

    # The SPA origin must be a trusted CSRF origin or every PATCH/POST 403s.
    frontend_url = getattr(settings, "FRONTEND_URL", "").rstrip("/")
    trusted = list(getattr(settings, "CSRF_TRUSTED_ORIGINS", []))

    if frontend_url and frontend_url not in trusted:
        problems.append(
            Error(
                f"FRONTEND_URL ({frontend_url}) is not in CSRF_TRUSTED_ORIGINS.",
                hint=(
                    "Django will reject every state-changing request from the "
                    "SPA with 403. Add the origin to CSRF_TRUSTED_ORIGINS."
                ),
                id="accounts.E102",
            )
        )

    if not settings.CORS_ALLOW_CREDENTIALS:
        problems.append(
            Error(
                "CORS_ALLOW_CREDENTIALS is False, so the browser will not send "
                "the session cookie to the SPA.",
                hint="Session-cookie authentication requires credentials.",
                id="accounts.E103",
            )
        )

    if not settings.SESSION_COOKIE_HTTPONLY:
        problems.append(
            Warning(
                "SESSION_COOKIE_HTTPONLY is False.",
                hint=(
                    "The session cookie would be readable by JavaScript, which "
                    "makes an XSS bug able to steal the session."
                ),
                id="accounts.W105",
            )
        )

    return problems
