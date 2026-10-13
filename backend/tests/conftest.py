"""Shared pytest fixtures.

Includes a faithful Google OAuth harness: tests drive the real allauth
login-start and callback views over HTTP, so `state` validation, session
creation and the adapter policy all execute for real. Only Google's token
endpoint and userinfo endpoint are stubbed — the parts that require a live
Google account.
"""

from __future__ import annotations

import io
from decimal import Decimal
from unittest import mock
from urllib.parse import parse_qs, urlparse

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

from apps.accounts.models import User
from apps.academics.models import Chapter, ClassLevel, Stream, Subject
from apps.content.models import Content, ContentType
from apps.payments.models import UPISettings
from apps.purchases.models import ClassPurchase, PurchaseStatus
from apps.purchases.services import create_purchase_request


# ---------------------------------------------------------------------------
# Google OAuth harness
# ---------------------------------------------------------------------------

GOOGLE_LOGIN_PATH = "/api/v1/accounts/google/login/"
GOOGLE_CALLBACK_PATH = "/api/v1/accounts/google/login/callback/"
AUTH_COMPLETE_PATH = "/api/v1/auth/complete/"

#: Where allauth sends the browser to obtain Google's authorization code.
GOOGLE_AUTHORIZE_HOST = "accounts.google.com"


def google_claims(
    *,
    sub: str = "108765432109876543210",
    email: str = "rahul@gmail.com",
    email_verified: bool = True,
    given_name: str = "Rahul",
    family_name: str = "Sharma",
    picture: str = "",
) -> dict:
    """A decoded Google OpenID Connect userinfo payload.

    Shaped exactly like the response Google returns. Tests pass it in place of
    the network call, so nothing about the shape is invented here.
    """
    payload = {
        "sub": sub,
        "email": email,
        "email_verified": email_verified,
        "given_name": given_name,
        "family_name": family_name,
        "name": f"{given_name} {family_name}".strip(),
        "aud": "test-client-id.apps.googleusercontent.com",
    }
    if picture:
        payload["picture"] = picture
    return payload


@pytest.fixture
def google_settings(settings):
    """Enable Google OAuth for the test with placeholder credentials.

    Nothing here is a real credential: the token and userinfo endpoints are
    stubbed, so these values are never sent anywhere.

    `SOCIALACCOUNT_PROVIDERS` is what allauth turns into the `SocialApp` row,
    so it has to be overridden alongside the client id.
    """
    settings.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com"
    settings.GOOGLE_CLIENT_SECRET = "test-client-secret"
    settings.GOOGLE_OAUTH_CONFIGURED = True
    # Pinned so the redirect URI is deterministic regardless of the Host header
    # the test client happens to send.
    settings.GOOGLE_REDIRECT_URI = (
        "http://testserver/api/v1/accounts/google/login/callback/"
    )
    settings.SOCIALACCOUNT_PROVIDERS = {
        "google": {
            "APP": {
                "client_id": "test-client-id.apps.googleusercontent.com",
                "secret": "test-client-secret",
                "key": "",
            },
            "SCOPE": ["openid", "email", "profile"],
            "OAUTH_PKCE_ENABLED": True,
            "AUTH_PARAMS": {"access_type": "online", "prompt": "select_account"},
        }
    }
    settings.AUTHENTICATION_BACKENDS = [
        "apps.accounts.backends.GoogleOnlyModelBackend",
    ]
    return settings


@pytest.fixture
def oauth_client(client, google_settings):
    """A test client that can complete a real Google OAuth round trip."""
    return client


def start_oauth(client, next_path: str = AUTH_COMPLETE_PATH):
    """Begin the flow and return the `state` allauth generated.

    The `state` value is the CSRF-equivalent for OAuth: the callback refuses
    to proceed without the exact value stashed in the session.
    """
    response = client.get(
        f"{GOOGLE_LOGIN_PATH}?process=login&next={next_path}"
    )
    assert response.status_code == 302, (
        f"expected a redirect to Google, got {response.status_code}"
    )

    location = response["Location"]
    assert urlparse(location).netloc == GOOGLE_AUTHORIZE_HOST

    state_values = parse_qs(urlparse(location).query).get("state")
    assert state_values, "allauth did not put a state parameter in the URL"
    return state_values[0]


def finish_oauth(client, state: str, claims: dict | None = None):
    """Complete the callback, stubbing only Google's two network calls."""
    from allauth.socialaccount.providers.google.provider import GoogleProvider
    from allauth.socialaccount.providers.google.views import GoogleOAuth2Adapter

    claims = claims if claims is not None else google_claims()

    def fake_complete_login(request, app, token, **kwargs):
        # Build the SocialLogin through the provider, so the adapter's
        # extract_uid / extract_common_fields overrides really do run.
        provider = GoogleProvider(request, app=app)
        return provider.sociallogin_from_response(request, claims)

    with mock.patch.object(
        GoogleOAuth2Adapter,
        "get_access_token_data",
        return_value={"access_token": "stub-access-token", "expires_in": 3600},
    ), mock.patch.object(
        GoogleOAuth2Adapter,
        "complete_login",
        side_effect=fake_complete_login,
    ):
        return client.get(
            f"{GOOGLE_CALLBACK_PATH}?code=stub-auth-code&state={state}"
        )


def sign_in_with_google(client, claims: dict | None = None):
    """Run the whole flow and leave the client holding a valid session."""
    state = start_oauth(client)
    response = finish_oauth(client, state, claims)
    assert response.status_code == 302, (
        f"expected a redirect after sign-in, got {response.status_code}"
    )
    return response


@pytest.fixture
def google_student(client, google_settings):
    """A brand-new student who has just signed in with Google."""
    sign_in_with_google(client)
    return client


@pytest.fixture
def api(client):
    """DRF-style access to the same client, for JSON assertions."""
    return client

@pytest.fixture(autouse=True)
def isolated_media_root(settings, tmp_path):
    """Redirect uploads to a temporary directory for every test.

    Without this, tests would write screenshots into the real `media/` tree
    and leave payment evidence on disk.
    """
    media_root = tmp_path / "media"
    (media_root / "payment_proofs").mkdir(parents=True, exist_ok=True)
    (media_root / "content").mkdir(parents=True, exist_ok=True)
    settings.MEDIA_ROOT = media_root
    return media_root


def pdf_bytes() -> bytes:
    """A minimal but genuine PDF payload.

    Defined once, here, so an uploaded document and the bytes a test later
    downloads are guaranteed to be the same file.
    """
    return b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"


def make_png_bytes(size=(120, 240), colour=(30, 120, 220)) -> bytes:
    """Build a genuine PNG in memory, so uploads pass Pillow validation."""
    buffer = io.BytesIO()
    Image.new("RGB", size, colour).save(buffer, format="PNG")
    return buffer.getvalue()


@pytest.fixture
def png_upload() -> SimpleUploadedFile:
    return SimpleUploadedFile(
        "upi-receipt.png", make_png_bytes(), content_type="image/png"
    )


@pytest.fixture
def not_an_image_upload() -> SimpleUploadedFile:
    return SimpleUploadedFile(
        "proof.txt", b"this is not an image", content_type="image/png"
    )


@pytest.fixture
def student(db) -> User:
    return User.objects.create_user(
        email="rahul@example.com", first_name="Rahul", last_name="Sharma"
    )


@pytest.fixture
def other_student(db) -> User:
    return User.objects.create_user(
        email="priya@example.com", first_name="Priya", last_name="Verma"
    )


@pytest.fixture
def admin_user(db) -> User:
    return User.objects.create_superuser(
        email="admin@vpedialearning.com",
        password="admin-pass-123",
        first_name="Site",
        last_name="Admin",
    )


@pytest.fixture
def class_7(db) -> ClassLevel:
    return ClassLevel.objects.create(
        name="Class 7",
        slug="class-7",
        price=Decimal("99.00"),
        display_order=7,
    )


@pytest.fixture
def class_8(db) -> ClassLevel:
    return ClassLevel.objects.create(
        name="Class 8",
        slug="class-8",
        price=Decimal("99.00"),
        display_order=8,
    )


@pytest.fixture
def class_9(db) -> ClassLevel:
    return ClassLevel.objects.create(
        name="Class 9",
        slug="class-9",
        price=Decimal("149.00"),
        display_order=9,
    )


@pytest.fixture
def class_10(db) -> ClassLevel:
    return ClassLevel.objects.create(
        name="Class 10",
        slug="class-10",
        price=Decimal("199.00"),
        display_order=10,
    )


@pytest.fixture
def class_11(db) -> ClassLevel:
    return ClassLevel.objects.create(
        name="Class 11",
        slug="class-11",
        price=Decimal("249.00"),
        display_order=11,
        has_streams=True,
    )


@pytest.fixture
def class_12(db) -> ClassLevel:
    return ClassLevel.objects.create(
        name="Class 12",
        slug="class-12",
        price=Decimal("299.00"),
        display_order=12,
        has_streams=True,
    )


@pytest.fixture
def science_stream(db) -> Stream:
    stream = Stream.objects.create(
        name="Science", slug="science", description="Science stream"
    )
    stream.class_levels.set(ClassLevel.objects.filter(has_streams=True))
    return stream


@pytest.fixture
def maths_subject(db, class_10) -> Subject:
    return Subject.objects.create(
        class_level=class_10, name="Mathematics", slug="class-10-mathematics"
    )


@pytest.fixture
def maths_chapter(db, maths_subject) -> Chapter:
    return Chapter.objects.create(
        subject=maths_subject, number=1, name="Real Numbers"
    )


@pytest.fixture
def published_content(db, maths_chapter) -> Content:
    return Content.objects.create(
        chapter=maths_chapter,
        title="Chapter Notes — Real Numbers",
        content_type=ContentType.NOTES,
        page_count=24,
        is_published=True,
    )


@pytest.fixture
def resource_category(db):
    from apps.resources.models import OtherResourceCategory

    return OtherResourceCategory.objects.create(
        name="Coding & Programming",
        slug="coding-programming",
        description="Programming basics.",
    )


@pytest.fixture
def other_resource(db, resource_category):
    from apps.resources.models import OtherResource

    return OtherResource.objects.create(
        category=resource_category,
        title="Python Beginner Notes",
        slug="python-beginner-notes",
        file=SimpleUploadedFile("python.pdf", pdf_bytes(), content_type="application/pdf"),
        is_published=True,
    )


@pytest.fixture
def upi_settings(db) -> UPISettings:
    return UPISettings.objects.create(
        upi_id="vpedialearning@upi",
        display_name="VPEDIA LEARNING",
        instructions="Pay the exact amount, then upload the screenshot and UTR.",
        is_active=True,
    )


@pytest.fixture
def pending_purchase(db, student, class_10) -> ClassPurchase:
    return create_purchase_request(user=student, class_level=class_10)


@pytest.fixture
def proof(pending_purchase, student, png_upload):
    """A submitted payment proof awaiting verification."""
    from apps.payments.services import submit_payment_proof

    return submit_payment_proof(
        user=student,
        class_purchase=pending_purchase,
        utr="UTR123456789",
        screenshot=png_upload,
    )


@pytest.fixture
def other_staff(db):
    return User.objects.create_staff(
        email="reviewer@vpedialearning.com",
        password="reviewer-pass-123",
        first_name="Second",
        last_name="Reviewer",
    )


@pytest.fixture
def active_purchase(db, student, class_10, admin_user) -> ClassPurchase:
    """An ACTIVE Class 10 purchase, approved the same way admin approval does."""
    purchase = create_purchase_request(user=student, class_level=class_10)
    purchase.grant_access(reviewer=admin_user)
    purchase.save()
    return purchase
