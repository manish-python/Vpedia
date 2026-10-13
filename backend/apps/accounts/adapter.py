"""django-allauth social-account adapter.

This module holds the VPEDIA policy for Google OAuth. allauth owns the OAuth 2.0
/ OpenID Connect protocol — the authorization-code exchange, `state` validation,
PKCE, token verification and signature checks are all performed by the library
and are not reimplemented here.

What this adapter decides:

* a Google identity is only accepted when Google reports the email as verified;
* an existing account with the same verified email is connected rather than
  duplicated;
* a brand-new account also gets a `StudentProfile`;
* Google-supplied name and avatar are copied onto the user;
* `is_staff` / `is_superuser` are never touched, so OAuth can never elevate a
  student and can never demote an administrator.

The backend remains the source of truth for identity. Nothing in the request
body from the frontend can influence any of the above.
"""

from __future__ import annotations

import logging

from allauth.account.utils import user_field
from allauth.core.exceptions import ImmediateHttpResponse
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from allauth.socialaccount.models import SocialAccount
from django.conf import settings
from django.core.exceptions import ValidationError
from django.http import HttpResponseRedirect

logger = logging.getLogger(__name__)

#: Providers this adapter is written for. Anything else is refused.
SUPPORTED_PROVIDERS = {"google"}


class UnverifiedGoogleEmail(Exception):
    """Google returned an identity whose email address is not verified.

    Raised as a hard stop. A student must never be signed in from an address
    Google has not confirmed, because email is the unique key on the account.
    """


def _refuse(reason: str, log_message: str):
    """Abort the OAuth flow with a redirect the student can act on.

    `ImmediateHttpResponse` is allauth's documented way to stop a flow, and
    `AccountMiddleware` turns it into the real HTTP response. Raising a plain
    exception instead would surface as a 500.
    """
    logger.warning(log_message)
    frontend = getattr(settings, "FRONTEND_URL", "").rstrip("/")
    return ImmediateHttpResponse(
        HttpResponseRedirect(f"{frontend}/login?error={reason}")
    )


class VpediaSocialAccountAdapter(DefaultSocialAccountAdapter):
    """VPEDIA's Google sign-in policy."""

    # -- Provider gating -------------------------------------------------

    def provider_apps(self, request=None):
        """Refuse any provider other than Google.

        Only Google's login/callback URLs are routed at all, so this is a
        second line of defence rather than the primary control.
        """
        apps = super().provider_apps(request)
        return [app for app in apps if app.provider.id in SUPPORTED_PROVIDERS]

    def is_provider_allowed(self, provider, request=None) -> bool:
        return provider.id in SUPPORTED_PROVIDERS

    # -- Claim extraction ------------------------------------------------

    def populate_user(self, request, sociallogin, data):
        """Extend allauth's field mapping with Google's picture URL.

        allauth copies email, first_name and last_name on its own. It has no
        concept of `avatar_url`, so the Google profile photo is applied here.

        `picture` is read from `sociallogin.account.extra_data`, which is the
        decoded Google userinfo payload allauth produced *after* validating
        the token signature, audience, issuer and expiry. It cannot be
        supplied by the browser.

        (`extract_common_fields` lives on the provider, not the adapter, so it
        is not the right place for this.)
        """
        user = super().populate_user(request, sociallogin, data)

        extra = sociallogin.account.extra_data or {}
        picture = str(extra.get("picture") or "").strip()
        if picture:
            # `user_field` only assigns when the model has the field, so this
            # stays safe if the user model changes.
            user_field(user, "avatar_url", picture)

        if not user.first_name and not user.last_name:
            # Fall back to the local part of the address so the UI is not blank.
            local_part = (user.email or "").split("@", 1)[0]
            if local_part:
                user_field(user, "first_name", local_part)

        return user

    # -- Flow gating -----------------------------------------------------

    def pre_social_login(self, request, sociallogin):
        """Refuse any identity whose email Google has not verified."""
        self._require_verified_google_email(sociallogin)

        user = sociallogin.user
        if user is None:
            return

        # A staff member signing in through Google keeps their existing account
        # and, critically, their privileges. Nothing below assigns them.
        logger.info(
            "Google sign-in for existing account id=%s", getattr(user, "pk", None)
        )

    def is_auto_sign_up_allowed(self, request, sociallogin) -> bool:
        """Create an account automatically for a first-time Google identity.

        Returning True is what makes "click Continue with Google" sufficient
        for a brand-new student — there is no separate registration step and no
        password to choose.
        """
        self._require_verified_google_email(sociallogin)
        return bool(sociallogin.account and sociallogin.account.uid)

    def save_user(self, request, sociallogin, form=None):
        """Persist a newly created student from verified Google claims."""
        user = super().save_user(request, sociallogin, form)

        user.email_verified = True

        subject = (sociallogin.account.extra_data or {}).get("sub")
        if subject:
            existing = (
                SocialAccount.objects.filter(provider="google", uid=str(subject))
                .exclude(user=user)
                .exists()
            )
            if not existing:
                user.google_subject_id = str(subject)

        # Deliberately NOT set: is_staff, is_superuser, groups or permissions.
        # OAuth authentication must never be able to grant administrative
        # access, and it never revokes it either.
        user.save(
            update_fields=[
                "email_verified",
                "google_subject_id",
                "updated_at",
            ]
        )

        # Every student gets a profile so profile endpoints have something to
        # read. Class selection is deliberately left unset here.
        from apps.accounts.services import ensure_profile

        ensure_profile(user)

        # Tell the administrators a student has arrived.
        #
        # Generated here because this is the only place a student is genuinely
        # created. `notify` swallows its own failures, so a notification
        # problem can never break sign-in.
        from apps.admin_api.notifications import student_registered

        student_registered(
            name=user.full_name or user.email, email=user.email, user_id=user.pk
        )

        return user

    # -- Helpers ---------------------------------------------------------

    def _require_verified_google_email(self, sociallogin) -> None:
        """Stop the flow unless Google vouched for the address.

        Requirement: a bare `{"email": "..."}` must never be enough. The value
        is only trusted because allauth verified the OIDC token first; if the
        token is not valid this method is never reached.
        """
        if getattr(sociallogin.account, "provider", None) not in SUPPORTED_PROVIDERS:
            raise _refuse(
                "unsupported_provider",
                "Refused sign-in from a non-Google provider.",
            )

        # `extra_data` is Google's decoded, already-verified userinfo payload.
        # The `email_verified` claim is part of it; nothing else in this
        # project can set that flag.
        extra = sociallogin.account.extra_data or {}
        email = (extra.get("email") or "").strip()

        if not email or not bool(extra.get("email_verified")):
            raise _refuse(
                "unverified_email",
                "Refused Google sign-in: email not verified by the provider.",
            )

    # -- Account safety --------------------------------------------------

    def get_connect_redirect_url(self, request, socialaccount) -> str:
        """Never expose the provider's access token to the frontend.

        allauth would otherwise redirect with `?access_token=...` in the query
        string, which would leak a bearer token into browser history and logs.
        """
        return "/api/v1/auth/me/"

    def validate_disconnect(self, account, accounts) -> None:
        """Refuse to detach the last usable sign-in method.

        Since Google is the only method a student has, disconnecting it would
        otherwise leave an account nobody can ever authenticate as.
        """
        if not accounts.exists():
            raise ValidationError(
                "This is the only sign-in method on the account. "
                "Connect another Google account before disconnecting this one."
            )
