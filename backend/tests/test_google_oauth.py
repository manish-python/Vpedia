"""Google OAuth: sign-in flow, account creation, and identity safety.

Required tests 3, 4, 5, 6, 7 and 16, plus the OAuth-specific security cases.

These tests drive the real allauth login-start and callback views over HTTP.
Only Google's token endpoint and userinfo endpoint are stubbed, so `state`
validation, session creation, redirect handling and the adapter policy in
`apps.accounts.adapter` all execute exactly as they do in production.
"""

from __future__ import annotations

from urllib.parse import parse_qs, urlparse

import pytest
from django.contrib.auth import get_user_model

from allauth.socialaccount.models import SocialAccount, SocialToken

from apps.accounts.models import StudentProfile
from apps.purchases.services import has_class_access

from .conftest import (
    AUTH_COMPLETE_PATH,
    GOOGLE_CALLBACK_PATH,
    GOOGLE_LOGIN_PATH,
    finish_oauth,
    google_claims,
    sign_in_with_google,
    start_oauth,
)

User = get_user_model()


# ---------------------------------------------------------------------------
# 3 / 4. A new Google identity creates a User and a StudentProfile
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_new_google_identity_creates_a_user(oauth_client):
    assert User.objects.count() == 0

    sign_in_with_google(oauth_client)

    assert User.objects.count() == 1
    user = User.objects.get()
    assert user.email == "rahul@gmail.com"
    assert user.first_name == "Rahul"
    assert user.last_name == "Sharma"
    # Google is the identity authority, so the address counts as verified.
    assert user.email_verified is True


@pytest.mark.django_db
def test_student_profile_is_created_for_a_new_student(oauth_client):
    sign_in_with_google(oauth_client)

    user = User.objects.get()
    assert StudentProfile.objects.filter(user=user).count() == 1

    profile = user.profile
    # Signing in must not imply a class, and must not imply access to one.
    assert profile.selected_class is None
    assert profile.selected_stream is None
    assert has_class_access(user, None) is False


@pytest.mark.django_db
def test_google_identity_is_stored_in_the_social_account_table(oauth_client):
    sign_in_with_google(oauth_client)

    user = User.objects.get()
    account = SocialAccount.objects.get()

    assert account.provider == "google"
    assert account.uid == "108765432109876543210"
    assert account.user_id == user.pk
    # The subject id also pins the account on the user row.
    assert user.google_subject_id == "108765432109876543210"


@pytest.mark.django_db
def test_no_provider_token_is_persisted(oauth_client):
    """The application needs no Google API access, so no token is stored."""
    sign_in_with_google(oauth_client)

    user = User.objects.get()
    assert SocialAccount.objects.get(user=user).pk is not None
    # `SOCIALACCOUNT_STORE_TOKENS = False`, so nothing lands in SocialToken.
    assert SocialToken.objects.filter(account__user=user).count() == 0


@pytest.mark.django_db
def test_google_avatar_is_copied_from_the_verified_claims(oauth_client):
    sign_in_with_google(
        oauth_client,
        google_claims(picture="https://lh3.googleusercontent.com/a/abc123"),
    )

    assert User.objects.get().avatar_url == (
        "https://lh3.googleusercontent.com/a/abc123"
    )


# ---------------------------------------------------------------------------
# 5. An existing Google user signs back into the same account
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_existing_google_user_logs_into_the_existing_account(oauth_client):
    sign_in_with_google(oauth_client)
    first_id = User.objects.get().pk

    oauth_client.logout()

    # Same Google identity, second time round.
    sign_in_with_google(oauth_client)

    assert User.objects.count() == 1
    assert User.objects.get().pk == first_id
    assert SocialAccount.objects.count() == 1


@pytest.mark.django_db
def test_repeated_sign_in_keeps_the_same_user_id(oauth_client):
    sign_in_with_google(oauth_client)
    first_id = User.objects.get().pk
    oauth_client.logout()

    for _ in range(3):
        sign_in_with_google(oauth_client)
        oauth_client.logout()

    assert User.objects.count() == 1
    assert User.objects.get().pk == first_id


# ---------------------------------------------------------------------------
# 6. Duplicate account creation is prevented
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_two_different_google_accounts_with_the_same_email_make_one_user(oauth_client):
    sign_in_with_google(oauth_client, google_claims(sub="sub-one", email="same@gmail.com"))
    oauth_client.logout()

    sign_in_with_google(oauth_client, google_claims(sub="sub-two", email="same@gmail.com"))

    # Email is the unique key: the second Google identity is linked to the
    # existing account instead of creating a duplicate.
    assert User.objects.filter(email="same@gmail.com").count() == 1
    assert SocialAccount.objects.count() == 2


@pytest.mark.django_db
def test_existing_email_account_is_connected_not_duplicated(oauth_client):
    """A Stage 2 account with no Google link yet is adopted, not duplicated."""
    from apps.accounts.services import get_or_create_student

    pre_existing = get_or_create_student(
        email="rahul@gmail.com", first_name="Rahul", last_name="Sharma"
    )

    sign_in_with_google(oauth_client)

    assert User.objects.filter(email="rahul@gmail.com").count() == 1
    assert User.objects.get().pk == pre_existing.pk
    assert SocialAccount.objects.filter(user=pre_existing).count() == 1


@pytest.mark.django_db
def test_email_stays_unique_across_many_sign_ins(oauth_client):
    for _ in range(5):
        sign_in_with_google(oauth_client)
        oauth_client.logout()

    emails = list(User.objects.values_list("email", flat=True))
    assert len(emails) == len(set(emails)) == 1


# ---------------------------------------------------------------------------
# 7. Only a Google-verified email is accepted
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_unverified_google_email_is_refused(oauth_client):
    state = start_oauth(oauth_client)

    response = finish_oauth(
        oauth_client, state, google_claims(email_verified=False)
    )

    # Redirected away with an explanatory flag rather than signed in.
    assert response.status_code == 302
    assert "error=unverified_email" in response["Location"]
    assert User.objects.count() == 0
    assert SocialAccount.objects.count() == 0


@pytest.mark.django_db
def test_empty_google_email_is_refused(oauth_client):
    state = start_oauth(oauth_client)

    response = finish_oauth(oauth_client, state, google_claims(email=""))

    assert response.status_code == 302
    assert User.objects.count() == 0


@pytest.mark.django_db
def test_a_bare_client_supplied_email_grants_nothing(oauth_client):
    """No API endpoint accepts an email and returns a session."""
    for payload in (
        {"email": "attacker@gmail.com"},
        {"email": "attacker@gmail.com", "is_staff": True},
        {"credential": "anything"},
        {"google_subject_id": "108765432109876543210"},
    ):
        response = oauth_client.post(
            "/api/v1/auth/login/", payload, content_type="application/json"
        )
        assert response.status_code == 404, payload
        assert User.objects.count() == 0


# ---------------------------------------------------------------------------
# OAuth callback misuse
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_callback_without_a_state_parameter_is_refused(oauth_client):
    response = oauth_client.get(f"{GOOGLE_CALLBACK_PATH}?code=stub-auth-code")

    # allauth answers a rejected callback with 401 and a plain-language page.
    assert response.status_code == 401
    assert b"could not sign you in" in response.content.lower()
    assert User.objects.count() == 0


@pytest.mark.django_db
def test_callback_with_a_forged_state_is_refused(oauth_client):
    response = oauth_client.get(
        f"{GOOGLE_CALLBACK_PATH}?code=stub-auth-code&state=forged-state-value"
    )

    assert response.status_code == 401
    assert b"could not sign you in" in response.content.lower()
    assert User.objects.count() == 0


@pytest.mark.django_db
def test_state_from_another_session_is_refused(oauth_client):
    """A state captured in a different browser cannot be replayed."""
    start_oauth(oauth_client)
    response = oauth_client.get(
        f"{GOOGLE_CALLBACK_PATH}?code=stub-auth-code&state=some-other-browsers-state"
    )

    assert response.status_code == 401
    assert User.objects.count() == 0


@pytest.mark.django_db
def test_cancelling_the_consent_screen_creates_nothing(oauth_client):
    start_oauth(oauth_client)

    response = oauth_client.get(
        f"{GOOGLE_CALLBACK_PATH}?error=access_denied&state=whatever"
    )

    assert response.status_code == 401
    assert User.objects.count() == 0


@pytest.mark.django_db
def test_error_page_shows_no_trace_or_token(oauth_client):
    """The failure page must stay user-friendly and leak nothing."""
    response = oauth_client.get(f"{GOOGLE_CALLBACK_PATH}?code=stub-auth-code")

    body = response.content.decode()
    assert "Traceback" not in body
    assert "test-client-secret" not in body
    assert "stub-access-token" not in body
    assert "site-packages" not in body


@pytest.mark.django_db
def test_login_start_redirects_to_google_and_never_leaks_the_secret(oauth_client):
    response = oauth_client.get(
        f"{GOOGLE_LOGIN_PATH}?process=login&next={AUTH_COMPLETE_PATH}"
    )

    assert response.status_code == 302
    location = response["Location"]

    assert urlparse(location).netloc == "accounts.google.com"
    assert "client_id=test-client-id" in location
    assert "test-client-secret" not in location
    assert "response_type=code" in location
    # PKCE and state are present, so the callback is bound to this browser.
    assert "code_challenge" in location
    assert "state=" in location


@pytest.mark.django_db
def test_redirect_uri_comes_from_the_pinned_setting(oauth_client):
    """`GOOGLE_REDIRECT_URI` wins, so the registered URI is unambiguous."""
    response = oauth_client.get(
        f"{GOOGLE_LOGIN_PATH}?process=login&next={AUTH_COMPLETE_PATH}"
    )

    redirect_uri = parse_qs(urlparse(response["Location"]).query)["redirect_uri"][0]
    assert redirect_uri == (
        "http://testserver/api/v1/accounts/google/login/callback/"
    )


@pytest.mark.django_db
def test_redirect_uri_is_derived_when_not_pinned(client, google_settings):
    """With the setting blank, allauth derives it from the request."""
    google_settings.GOOGLE_REDIRECT_URI = ""

    response = client.get(
        f"{GOOGLE_LOGIN_PATH}?process=login&next={AUTH_COMPLETE_PATH}"
    )

    redirect_uri = parse_qs(urlparse(response["Location"]).query)["redirect_uri"][0]
    assert redirect_uri.endswith("/api/v1/accounts/google/login/callback/")


@pytest.mark.django_db
def test_pkce_verifier_never_appears_in_the_browser_url(oauth_client):
    """The verifier must stay in the server session, not the query string."""
    response = oauth_client.get(
        f"{GOOGLE_LOGIN_PATH}?process=login&next={AUTH_COMPLETE_PATH}"
    )

    query = urlparse(response["Location"]).query
    assert "code_challenge" in query
    assert "code_challenge_method=S256" in query
    assert "code_verifier" not in query


# ---------------------------------------------------------------------------
# Configuration checks
# ---------------------------------------------------------------------------


def _warning_ids(settings_overrides: dict, base: dict | None = None):
    """Run the account system checks with the given settings overrides."""
    from django.core.checks import run_checks

    from django.conf import settings as django_settings

    saved = {}
    for key, value in settings_overrides.items():
        saved[key] = getattr(django_settings, key, None)
        setattr(django_settings, key, value)
    try:
        return {m.id for m in run_checks()}
    finally:
        for key, value in saved.items():
            setattr(django_settings, key, value)


@pytest.mark.django_db
def test_check_flags_a_redirect_uri_pointing_at_the_wrong_path(settings):
    settings.GOOGLE_OAUTH_CONFIGURED = True
    settings.GOOGLE_REDIRECT_URI = "https://api.example.com/oauth/callback"

    assert "accounts.W103" in _warning_ids({"GOOGLE_REDIRECT_URI": settings.GOOGLE_REDIRECT_URI})


@pytest.mark.django_db
def test_check_flags_a_non_absolute_redirect_uri(settings):
    settings.GOOGLE_OAUTH_CONFIGURED = True

    ids = _warning_ids({"GOOGLE_REDIRECT_URI": "/relative/callback"})
    assert "accounts.E101" in ids


@pytest.mark.django_db
def test_check_flags_a_readable_session_cookie(settings):
    settings.GOOGLE_OAUTH_CONFIGURED = True

    assert "accounts.W105" in _warning_ids({"SESSION_COOKIE_HTTPONLY": False})


@pytest.mark.django_db
def test_check_flags_a_frontend_missing_from_csrf_trusted_origins(settings):
    settings.GOOGLE_OAUTH_CONFIGURED = True

    ids = _warning_ids({"CSRF_TRUSTED_ORIGINS": ["http://elsewhere.example"]})
    assert "accounts.E102" in ids


@pytest.mark.django_db
def test_check_flags_credentials_that_look_like_placeholders(settings):
    settings.GOOGLE_OAUTH_CONFIGURED = True

    ids = _warning_ids({"GOOGLE_CLIENT_SECRET": "your-client-secret-here"})
    assert "accounts.W101" in ids


@pytest.mark.django_db
def test_check_does_not_fire_on_a_realistic_secret(settings):
    """The marker list must not produce false positives on opaque secrets."""
    settings.GOOGLE_OAUTH_CONFIGURED = True

    ids = _warning_ids(
        {"GOOGLE_CLIENT_SECRET": "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q8w7e6r5t4y"}
    )
    assert "accounts.W101" not in ids


@pytest.mark.django_db
def test_a_correct_configuration_produces_no_warnings(settings):
    settings.GOOGLE_OAUTH_CONFIGURED = True

    ids = _warning_ids(
        {
            "GOOGLE_CLIENT_SECRET": "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q8w7e6r5t4y",
            "GOOGLE_CLIENT_ID": "1234567890-abcdefghij.apps.googleusercontent.com",
            # https, because the suite runs with DEBUG=False, which is the
            # production posture the check is written for.
            "GOOGLE_REDIRECT_URI": (
                "https://api.vpedialearning.com/api/v1/accounts/google/login/callback/"
            ),
        }
    )
    assert not {i for i in ids if i.startswith("accounts.")}, ids


# ---------------------------------------------------------------------------
# 20. Admin safety — OAuth must not touch staff privileges
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_google_sign_in_never_grants_staff_to_a_student(oauth_client):
    sign_in_with_google(oauth_client)

    user = User.objects.get()
    assert user.is_staff is False
    assert user.is_superuser is False


@pytest.mark.django_db
def test_staff_signing_in_with_google_keeps_their_privileges(oauth_client, admin_user):
    sign_in_with_google(
        oauth_client,
        google_claims(
            sub="admin-sub-1",
            email=admin_user.email,
            given_name="Site",
            family_name="Admin",
        ),
    )

    admin_user.refresh_from_db()
    assert admin_user.is_staff is True
    assert admin_user.is_superuser is True
    # Signing in with Google created a profile but never a second user.
    assert User.objects.filter(is_superuser=True).count() == 1


@pytest.mark.django_db
def test_oauth_cannot_promote_a_student_by_supplying_flags(oauth_client):
    """`is_staff` is not read from anywhere in the flow."""
    claims = google_claims()
    claims["is_staff"] = True
    claims["is_superuser"] = True

    sign_in_with_google(oauth_client, claims)

    user = User.objects.get()
    assert user.is_staff is False
    assert user.is_superuser is False


# ---------------------------------------------------------------------------
# Token and secret leakage
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_no_google_token_reaches_the_api_response(oauth_client):
    sign_in_with_google(oauth_client)

    for path in ("/api/v1/auth/me/", "/api/v1/profile/me/"):
        response = oauth_client.get(path)
        assert response.status_code == 200
        body = response.content.decode()
        assert "stub-access-token" not in body
        assert "test-client-secret" not in body
        assert "access_token" not in body


@pytest.mark.django_db
def test_login_start_response_contains_no_secret(oauth_client):
    response = oauth_client.get("/api/v1/auth/google/")

    assert response.status_code == 200
    body = response.content.decode()
    assert "test-client-secret" not in body
    assert "client_secret" not in body


@pytest.mark.django_db
def test_auth_me_never_exposes_the_google_subject_id_or_tokens(oauth_client):
    sign_in_with_google(oauth_client)

    body = oauth_client.get("/api/v1/auth/me/").json()["user"]

    assert "google_subject_id" not in body
    assert "password" not in body
    assert "token" not in body
    assert "secret" not in body
