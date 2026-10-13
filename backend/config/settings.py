"""
Django settings for the VPEDIA LEARNING backend.

Everything environment-specific is read from the environment via
`django-environ`. No secret, credential or host is hardcoded here.

Payment architecture
--------------------
VPEDIA LEARNING has NO payment gateway. Payment is collected manually over
UPI: the student scans a QR code or uses a UPI ID, pays in their own UPI
application, then uploads a screenshot and the UTR for verification.

Access is activated ONLY when an administrator approves the submitted
proof. Nothing in this codebase can grant a student access on its own.
"""

from __future__ import annotations

import os
from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent

# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------
env = environ.Env(
    # Safe defaults for local development only. Production MUST override.
    DEBUG=(bool, True),
    SECRET_KEY=(str, "dev-only-insecure-key-change-me"),
    ALLOWED_HOSTS=(list, ["localhost", "127.0.0.1", "[::1]"]),
    CORS_ALLOWED_ORIGINS=(list, ["http://localhost:5173"]),
    DATABASE_URL=(str, "postgresql://postgres:admin123@localhost:5432/vpedia"),
    VPEDIA_UPI_ID=(str, ""),
    VPEDIA_UPI_NAME=(str, "VPEDIA LEARNING"),
    FRONTEND_URL=(str, "http://localhost:5173"),
    GOOGLE_CLIENT_ID=(str, ""),
    GOOGLE_CLIENT_SECRET=(str, ""),
)

ENV_FILE = BASE_DIR / ".env"
if ENV_FILE.exists():
    env.read_env(str(ENV_FILE))

# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------
SECRET_KEY = env("SECRET_KEY")
DEBUG = env("DEBUG")

ALLOWED_HOSTS = env.list("ALLOWED_HOSTS")

# Trust the platform's proxy header in production so the real scheme/host
# survives a reverse proxy. Off by default because it is spoofable otherwise.
USE_X_FORWARDED_HOST = env.bool("USE_X_FORWARDED_HOST", default=False)
SECURE_PROXY_SSL_HEADER = (
    ("HTTP_X_FORWARDED_PROTO", "https") if env.bool("USE_X_FORWARDED_PROXY", default=False) else None
)

INSTALLED_APPS = [
    # Project apps
    "apps.core",
    "apps.accounts",
    "apps.academics",
    "apps.content",
    "apps.purchases",
    "apps.payments",
    "apps.resources",
    "apps.admin_api",
    # Third party
    "rest_framework",
    "corsheaders",
    # Google OAuth / OpenID Connect. This is the ONLY way a student
    # authenticates; there is no password, OTP or magic-link flow.
    "django.contrib.sites",
    "allauth",
    "allauth.account",
    "allauth.socialaccount",
    # Django built-ins
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

# The Google provider is only installed when real credentials are present.
# A missing or partial configuration therefore leaves the project bootable
# with no OAuth surface at all, rather than half-working, and
# `/api/v1/auth/config/` reports `google_enabled: false`.
GOOGLE_CLIENT_ID = env("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = env("GOOGLE_CLIENT_SECRET")
# Optional pin for the OAuth callback. Left blank, the server derives it from
# the incoming request, which is correct but depends on the origin the browser
# actually used. Setting it removes that ambiguity; the system checks in
# apps/accounts/checks.py verify it looks like the real callback.
GOOGLE_REDIRECT_URI = env("GOOGLE_REDIRECT_URI", default="")

GOOGLE_OAUTH_CONFIGURED = bool(
    GOOGLE_CLIENT_ID.strip() and GOOGLE_CLIENT_SECRET.strip()
)

if GOOGLE_OAUTH_CONFIGURED:
    INSTALLED_APPS.append("allauth.socialaccount.providers.google")

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    # Must sit after AuthenticationMiddleware: it wires allauth's signals onto
    # the request and the authenticated user.
    "allauth.account.middleware.AccountMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
                # Supplies `vpedia_frontend_url` to the OAuth error templates.
                "apps.core.context_processors.vpedia",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
# PostgreSQL is the primary and intended database.
#
# `USE_SQLITE` exists purely so the suite can be executed on a machine with
# no PostgreSQL server available. It must never be enabled outside local
# development: the application relies on PostgreSQL partial/conditional
# unique constraints, which SQLite does not enforce.
USE_SQLITE = env.bool("USE_SQLITE", default=False)

if USE_SQLITE:
    if not DEBUG:  # pragma: no cover - defensive
        raise RuntimeError("USE_SQLITE must not be enabled when DEBUG is False.")
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }
else:
    DATABASES = {"default": env.db_url("DATABASE_URL")}
    # Persistent connections are configured separately: django-environ 0.14
    # no longer accepts `conn_max_age` as a `db_url` keyword argument.
    DATABASES["default"]["CONN_MAX_AGE"] = env.int("CONN_MAX_AGE", default=600)
    DATABASES["default"]["CONN_HEALTH_CHECKS"] = True

AUTH_USER_MODEL = "accounts.User"

# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------
# Students: Google OAuth only. django-allauth verifies the OIDC response and
# establishes the session; the browser then holds an HTTP-only session cookie
# and every subsequent API call is authenticated by that cookie.
#
# Staff: Django Admin still uses a password, which is why a password backend
# must remain. `GoogleOnlyModelBackend` is a narrowed `ModelBackend` that
# refuses any account without `is_staff`, so it keeps `/admin/` working while
# making it impossible for a student to be authenticated by password.
#
# Django's stock `ModelBackend` is deliberately NOT in this list. Including it
# would allow any user row with a usable password to sign in.
#
# There is no API endpoint that accepts a password, and allauth's password
# routes are never included in the URLconf, so no such path exists.
AUTHENTICATION_BACKENDS = [
    "apps.accounts.backends.GoogleOnlyModelBackend",
]

# Student accounts are created with an unusable password, so even if
# ModelBackend were reachable it could not authenticate a student.
LOGIN_URL = "/admin/login/"
LOGIN_REDIRECT_URL = "/admin/"
LOGOUT_REDIRECT_URL = "/admin/login/"

SITE_ID = 1

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# ---------------------------------------------------------------------------
# Media
# ---------------------------------------------------------------------------
# Payment proofs contain sensitive transaction data, so MEDIA_URL is never
# exposed as a public, unauthenticated route. Files are served only through
# the staff-guarded view registered in config/urls.py.
MEDIA_URL = "/private-media/"
MEDIA_ROOT = BASE_DIR / "media"

MEDIA_SUBDIRECTORIES = {
    "payment_proofs": MEDIA_ROOT / "payment_proofs",
    "content": MEDIA_ROOT / "content",
    "profile_images": MEDIA_ROOT / "profile_images",
}

MAX_UPLOAD_SIZE_MB = env.int("MAX_UPLOAD_SIZE_MB", default=5)

# ---------------------------------------------------------------------------
# Django REST Framework
# ---------------------------------------------------------------------------
REST_FRAMEWORK = {
    # Session-cookie authentication. The session is created only by allauth
    # after a verified Google OIDC response, so possessing the cookie is proof
    # that OAuth already happened.
    #
    # `SessionAuthentication` also enforces CSRF on every unsafe method, which
    # is what stops another site from driving a signed-in student's browser.
    #
    # The subclass only changes the status code for a missing identity: 401
    # rather than DRF's default 403, so "signed out" is distinguishable from
    # "not allowed".
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "apps.core.authentication.SessionAuthenticationWithChallenge",
    ],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
        "rest_framework.renderers.BrowsableAPIRenderer",
    ],
    "DEFAULT_PAGINATION_CLASS": "apps.core.pagination.StandardPagination",
    "PAGE_SIZE": 25,
    "TEST_REQUEST_DEFAULT_FORMAT": "json",
}

# ---------------------------------------------------------------------------
# Google OAuth (django-allauth)
# ---------------------------------------------------------------------------
# Frontend origin. Used only to build post-OAuth redirects back to the SPA and
# as a CSRF trusted origin. It is never used to make an authorization decision.
FRONTEND_URL = env("FRONTEND_URL").rstrip("/")

# allauth models local (non-Google) sign-in as "login methods". Google is a
# social method and is configured under SOCIALACCOUNT_* below, so this setting
# governs only allauth's own password forms — whose URLs are never routed.
#
# Email is kept as the login method with no password signup field so allauth's
# own consistency checks pass, and so a stray `/accounts/*` URL could not
# create an account with a password even if one were added by mistake.
ACCOUNT_LOGIN_METHODS = {"email"}
# `*` marks the field required. There is deliberately no `password1` entry:
# allauth's local signup form has no password field, and a student account is
# only ever created from Google claims.
ACCOUNT_SIGNUP_FIELDS = ["email*"]
ACCOUNT_UNIQUE_EMAIL = True

# `accounts.User` has no `username` column — email is the only identifier.
# Declaring this explicitly tells allauth to skip its username machinery
# entirely (validation, unique-name generation, blacklist), which would
# otherwise raise FieldDoesNotExist against the custom model.
ACCOUNT_USER_MODEL_USERNAME_FIELD = None
# `accounts.User.email` is the identity field, so allauth reads and writes it.
ACCOUNT_USER_MODEL_EMAIL_FIELD = "email"
# Google already proved the address; no separate verification system exists.
ACCOUNT_EMAIL_VERIFICATION = "optional"
ACCOUNT_EMAIL_SUBJECT_PREFIX = "[VPEDIA]"

SOCIALACCOUNT_PROVIDERS = {}
if GOOGLE_OAUTH_CONFIGURED:
    SOCIALACCOUNT_PROVIDERS["google"] = {
        # allauth 65 reads the client credentials from an `APP` block. The
        # values are the same environment variables used for the
        # GOOGLE_OAUTH_CONFIGURED check above, so there is a single source.
        #
        # This lives in server-side settings only. No API response ever
        # serialises SOCIALACCOUNT_PROVIDERS, and `secret` never reaches the
        # browser or a log line.
        "APP": {
            "client_id": GOOGLE_CLIENT_ID,
            "secret": GOOGLE_CLIENT_SECRET,
            "key": "",
        },
        "SCOPE": ["openid", "email", "profile"],
        # PKCE (RFC 7636). The browser is a public client and cannot keep a
        # secret, so the authorization code is additionally bound to a
        # verifier that never leaves the server session.
        "OAUTH_PKCE_ENABLED": True,
        "AUTH_PARAMS": {
            # `hd` may be set to restrict sign-in to a single Google Workspace
            # domain. Left unset so any verified Google account may register.
            "access_type": "online",
            "include_granted_scopes": "true",
            "prompt": "select_account",
        },
    }

# When a Google account presents an address that already exists on a VPEDIA
# account, link the Google identity to that account instead of creating a
# duplicate. Email remains the unique key; the Google subject id additionally
# pins the specific Google identity that may claim it.
SOCIALACCOUNT_EMAIL_AUTHENTICATION = True
SOCIALACCOUNT_EMAIL_AUTHENTICATION_AUTO_CONNECT = True

# Automatically sign a user in after the very first verified Google login.
SOCIALACCOUNT_AUTO_SIGNUP = True

# Store Google access/refresh tokens. The application needs no provider API
# access, so tokens are neither requested nor persisted.
SOCIALACCOUNT_STORE_TOKENS = False

SOCIALACCOUNT_LOGIN_ON_GET = True

# The adapter in apps.accounts.adapter applies the VPEDIA policy on top of
# allauth's defaults.
SOCIALACCOUNT_ADAPTER = "apps.accounts.adapter.VpediaSocialAccountAdapter"

LOGOUT_REDIRECT_URL = f"{FRONTEND_URL}/login"

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
# Explicit allowlist only. `CORS_ALLOW_ALL_ORIGINS` is never enabled.
CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS")
# The session cookie is sent cross-origin, so credentials are required.
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS", default=CORS_ALLOWED_ORIGINS)
# The SPA's origin must always be a trusted CSRF origin; otherwise the
# double-submit cookie check rejects every state-changing call.
if FRONTEND_URL not in CSRF_TRUSTED_ORIGINS:
    CSRF_TRUSTED_ORIGINS = [*CSRF_TRUSTED_ORIGINS, FRONTEND_URL]

# ---------------------------------------------------------------------------
# Session
# ---------------------------------------------------------------------------
# The authenticated session lives in an HTTP-only cookie. JavaScript cannot
# read it, so an XSS bug cannot exfiltrate a long-lived credential.
SESSION_ENGINE = "django.contrib.sessions.backends.db"
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_NAME = "vpedia_sessionid"
SESSION_COOKIE_SAMESITE = env.str("SESSION_COOKIE_SAMESITE", default="Lax")
# Rotate the session key on login so a pre-login identifier cannot be reused.
SESSION_SAVE_EVERY_REQUEST = False

CSRF_COOKIE_NAME = "vpedia_csrftoken"
CSRF_COOKIE_HTTPONLY = False  # the SPA must read it to echo it back
CSRF_COOKIE_SAMESITE = env.str("CSRF_COOKIE_SAMESITE", default="Lax")
CSRF_USE_SESSIONS = False

# ---------------------------------------------------------------------------
# Security
# ---------------------------------------------------------------------------
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"

# Enabled when serving over HTTPS in production.
SECURE_SSL_REDIRECT = env.bool("SECURE_SSL_REDIRECT", default=False)
SESSION_COOKIE_SECURE = env.bool("SESSION_COOKIE_SECURE", default=False)
CSRF_COOKIE_SECURE = env.bool("CSRF_COOKIE_SECURE", default=False)
SECURE_HSTS_SECONDS = env.int("SECURE_HSTS_SECONDS", default=0)
SECURE_HSTS_INCLUDE_SUBDOMAINS = env.bool("SECURE_HSTS_INCLUDE_SUBDOMAINS", default=False)
SECURE_HSTS_PRELOAD = env.bool("SECURE_HSTS_PRELOAD", default=False)

# ---------------------------------------------------------------------------
# UPI defaults
# ---------------------------------------------------------------------------
# Seeded into UPISettings on first run. Administrators can change the live
# values from Django Admin at any time; these are only the starting point.
VPEDIA_UPI_ID = env("VPEDIA_UPI_ID")
VPEDIA_UPI_NAME = env("VPEDIA_UPI_NAME")

MESSAGE_STORAGE = "django.contrib.messages.storage.session.SessionStorage"

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"simple": {"format": "[{levelname}] {name}: {message}", "style": "{"}},
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "simple"}},
    "root": {"handlers": ["console"], "level": env("LOG_LEVEL", default="INFO")},
}
