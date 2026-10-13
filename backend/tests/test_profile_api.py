"""Authenticated API: session state, profile, and ownership.

Required tests 1, 2, 8, 9, 10, 11, 12 and 15, plus the IDOR and CSRF cases.
"""

from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model

from apps.academics.models import ClassLevel, Stream
from apps.accounts.models import StudentProfile
from apps.purchases.models import PurchaseStatus
from apps.purchases.services import has_class_access

from .conftest import google_claims, sign_in_with_google

User = get_user_model()


# ---------------------------------------------------------------------------
# 1 / 2. Auth status and profile
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_unauthenticated_request_receives_401(client):
    response = client.get("/api/v1/profile/me/")

    assert response.status_code == 401


@pytest.mark.django_db
def test_auth_me_reports_unauthenticated_without_erroring(client):
    """A status endpoint is not a protected resource, so it answers 200."""
    response = client.get("/api/v1/auth/me/")

    assert response.status_code == 200
    assert response.json() == {
        "authenticated": False,
        "user": None,
        "profile": None,
        "unlocked_classes": [],
    }


@pytest.mark.django_db
def test_auth_me_reports_authenticated_after_sign_in(google_student):
    response = google_student.get("/api/v1/auth/me/")

    assert response.status_code == 200
    body = response.json()
    assert body["authenticated"] is True
    assert body["user"]["email"] == "rahul@gmail.com"
    # Same keys either way, so the SPA can read one shape.
    assert set(body) == {"authenticated", "user", "profile", "unlocked_classes"}
    assert body["profile"]["selected_class"] is None
    assert body["unlocked_classes"] == []


@pytest.mark.django_db
def test_auth_me_carries_the_unlocked_list_from_approved_purchases(
    google_student, class_10
):
    user = User.objects.get(email="rahul@gmail.com")
    purchase = user.class_purchases.create(
        class_level=class_10, amount=class_10.price, status=PurchaseStatus.ACTIVE
    )

    body = google_student.get("/api/v1/auth/me/").json()

    assert [row["id"] for row in body["unlocked_classes"]] == [class_10.pk]
    assert purchase.is_active


@pytest.mark.django_db
def test_authenticated_user_can_read_their_profile(google_student):
    response = google_student.get("/api/v1/profile/me/")

    assert response.status_code == 200
    body = response.json()
    assert body["email"] == "rahul@gmail.com"
    assert body["auth_provider"] == "google"
    assert body["profile"]["selected_class"] is None


@pytest.mark.django_db
def test_profile_response_contains_no_credentials(google_student):
    body = google_student.get("/api/v1/profile/me/").json()

    # Explicit key checks rather than a substring scan, so the assertion stays
    # meaningful if a value happens to contain one of these words.
    forbidden = {
        "password",
        "google_subject_id",
        "is_staff",
        "is_superuser",
        "token",
        "secret",
        "client_id",
        "access_token",
        "refresh_token",
    }
    assert forbidden.isdisjoint(body.keys())
    assert forbidden.isdisjoint(body["profile"].keys())


@pytest.mark.django_db
def test_profile_has_no_endpoint_for_another_user_id(client, google_student, other_student):
    """There is no id in the URL, so another user's profile is unreachable."""
    for path in (
        f"/api/v1/profile/{other_student.pk}/",
        f"/api/v1/profile/?user_id={other_student.pk}",
        f"/api/v1/users/{other_student.pk}/",
    ):
        assert google_student.get(path).status_code == 404


# ---------------------------------------------------------------------------
# 9 / 10 / 18. Ownership tampering
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_user_cannot_change_their_own_user_id(client, google_student):
    response = google_student.patch(
        "/api/v1/profile/me/",
        data='{"id": 999, "user": 999, "user_id": 999}',
        content_type="application/json",
    )

    assert response.status_code == 400
    user = User.objects.get(email="rahul@gmail.com")
    assert user.pk != 999
    assert StudentProfile.objects.get(user=user).user_id == user.pk


@pytest.mark.django_db
def test_user_cannot_change_email_ownership_through_json(client, google_student):
    response = google_student.patch(
        "/api/v1/profile/me/",
        data='{"email": "victim@gmail.com", "email_verified": false}',
        content_type="application/json",
    )

    assert response.status_code == 400
    user = User.objects.get()
    assert user.email == "rahul@gmail.com"
    assert user.email_verified is True


@pytest.mark.django_db
def test_user_cannot_escalate_themselves_to_staff(client, google_student):
    response = google_student.patch(
        "/api/v1/profile/me/",
        data='{"is_staff": true, "is_superuser": true}',
        content_type="application/json",
    )

    assert response.status_code == 400
    user = User.objects.get()
    assert user.is_staff is False
    assert user.is_superuser is False


@pytest.mark.django_db
def test_user_cannot_claim_another_users_google_identity(client, google_student):
    response = google_student.patch(
        "/api/v1/profile/me/",
        data='{"google_subject_id": "someone-elses-subject"}',
        content_type="application/json",
    )

    assert response.status_code == 400
    assert User.objects.get().google_subject_id == "108765432109876543210"


@pytest.mark.django_db
def test_user_cannot_reassign_their_profile_to_another_user(client, google_student, other_student):
    response = google_student.patch(
        "/api/v1/profile/me/",
        data={"user": other_student.pk},
        content_type="application/json",
    )

    assert response.status_code == 400
    # Still exactly one profile, still owned by the signed-in student.
    assert StudentProfile.objects.count() == 1
    assert StudentProfile.objects.get().user.email == "rahul@gmail.com"


@pytest.mark.django_db
def test_privilege_fields_are_not_part_of_the_profile_write(client, google_student):
    """Every rejected field is named in the refusal, not silently dropped."""
    response = google_student.patch(
        "/api/v1/profile/me/",
        data='{"id": 1, "email": "x@y.com", "is_staff": true, "unlocked_classes": [1,2,3]}',
        content_type="application/json",
    )

    assert response.status_code == 400
    rejected = " ".join(response.content.decode().lower().split())
    for field in ("id", "email", "is_staff", "unlocked_classes"):
        assert field in rejected


@pytest.mark.django_db
def test_unknown_field_alone_is_rejected(client, google_student):
    """A request carrying only a non-writable key must not report success."""
    response = google_student.patch(
        "/api/v1/profile/me/",
        data='{"anything_unexpected": true}',
        content_type="application/json",
    )

    assert response.status_code == 400
    assert "anything_unexpected" in response.content.decode()


# ---------------------------------------------------------------------------
# 11 / 12. Class selection is a preference, never an entitlement
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_selected_class_can_be_updated(google_student, class_10):
    response = google_student.patch(
        "/api/v1/profile/me/",
        data={"selected_class": class_10.pk},
        content_type="application/json",
    )

    assert response.status_code == 200
    assert response.json()["profile"]["selected_class"] == class_10.pk
    assert response.json()["profile"]["selected_class_name"] == "Class 10"


@pytest.mark.django_db
def test_selected_class_does_not_grant_access(google_student, class_10):
    google_student.patch(
        "/api/v1/profile/me/",
        data={"selected_class": class_10.pk},
        content_type="application/json",
    )

    user = User.objects.get()
    # The central guarantee: selecting a class unlocks nothing.
    assert user.profile.selected_class_id == class_10.pk
    assert has_class_access(user, class_10) is False


@pytest.mark.django_db
def test_profile_reports_selected_class_without_purchase_as_locked(google_student, class_10):
    google_student.patch(
        "/api/v1/profile/me/",
        data={"selected_class": class_10.pk},
        content_type="application/json",
    )

    body = google_student.get("/api/v1/profile/me/").json()
    assert body["has_access_to_selected_class"] is False
    assert body["unlocked_classes"] == []


@pytest.mark.django_db
def test_unlocked_classes_reflects_approved_purchases_only(google_student, class_10):
    user = User.objects.get()
    purchase = user.class_purchases.create(
        class_level=class_10, amount=class_10.price, status=PurchaseStatus.ACTIVE
    )

    body = google_student.get("/api/v1/profile/me/").json()
    assert [row["id"] for row in body["unlocked_classes"]] == [class_10.pk]
    assert body["has_access_to_selected_class"] is False

    # Selecting the same class still reflects the purchase, not the preference.
    google_student.patch(
        "/api/v1/profile/me/",
        data={"selected_class": class_10.pk},
        content_type="application/json",
    )
    assert google_student.get("/api/v1/profile/me/").json()[
        "has_access_to_selected_class"
    ] is True
    assert purchase.is_active


@pytest.mark.django_db
def test_first_and_last_name_can_be_updated(google_student):
    response = google_student.patch(
        "/api/v1/profile/me/",
        data={"first_name": "Rahul Kumar", "last_name": "Sharma"},
        content_type="application/json",
    )

    assert response.status_code == 200
    assert response.json()["full_name"] == "Rahul Kumar Sharma"


@pytest.mark.django_db
def test_partial_update_leaves_other_fields_alone(google_student, class_10):
    google_student.patch(
        "/api/v1/profile/me/",
        data={"selected_class": class_10.pk},
        content_type="application/json",
    )

    google_student.patch(
        "/api/v1/profile/me/",
        data={"last_name": "Verma"},
        content_type="application/json",
    )

    profile = User.objects.get().profile
    assert profile.selected_class_id == class_10.pk
    assert User.objects.get().last_name == "Verma"


# ---------------------------------------------------------------------------
# 10. Class / stream validation
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_class_11_requires_a_stream(google_student, class_11):
    response = google_student.patch(
        "/api/v1/profile/me/",
        data={"selected_class": class_11.pk},
        content_type="application/json",
    )

    assert response.status_code == 400
    assert "selected_stream" in response.content.decode()
    assert User.objects.get().profile.selected_class is None


@pytest.fixture
def all_streams(db, class_11, class_12):
    """Science, Commerce and Humanities, both linked to Classes 11 and 12."""
    streams = {}
    for order, name in enumerate(["Science", "Commerce", "Humanities"], start=1):
        stream = Stream.objects.create(
            name=name, slug=name.lower(), display_order=order
        )
        stream.class_levels.set([class_11, class_12])
        streams[name] = stream
    return streams


@pytest.mark.django_db
@pytest.mark.parametrize("stream_name", ["Science", "Commerce", "Humanities"])
def test_streamed_class_accepts_every_offered_stream(
    google_student, class_11, all_streams, stream_name
):
    stream = all_streams[stream_name]

    response = google_student.patch(
        "/api/v1/profile/me/",
        data={"selected_class": class_11.pk, "selected_stream": stream.pk},
        content_type="application/json",
    )

    assert response.status_code == 200, response.content
    profile = User.objects.get().profile
    assert profile.selected_class_id == class_11.pk
    assert profile.selected_stream_id == stream.pk


@pytest.mark.django_db
def test_class_12_accepts_a_stream(google_student, class_12, all_streams):
    response = google_student.patch(
        "/api/v1/profile/me/",
        data={"selected_class": class_12.pk, "selected_stream": all_streams["Science"].pk},
        content_type="application/json",
    )

    assert response.status_code == 200, response.content


@pytest.mark.django_db
def test_class_12_requires_a_stream(google_student, class_12):
    response = google_student.patch(
        "/api/v1/profile/me/",
        data={"selected_class": class_12.pk},
        content_type="application/json",
    )

    assert response.status_code == 400
    assert "selected_stream" in response.content.decode()


@pytest.mark.django_db
def test_class_10_must_not_carry_a_stream(google_student, class_10, science_stream):
    response = google_student.patch(
        "/api/v1/profile/me/",
        data={"selected_class": class_10.pk, "selected_stream": science_stream.pk},
        content_type="application/json",
    )

    assert response.status_code == 400
    assert "does not use streams" in response.content.decode()
    profile = User.objects.get().profile
    assert profile.selected_class is None
    assert profile.selected_stream is None


@pytest.mark.django_db
def test_stream_from_another_class_is_refused(google_student, class_10, db):
    """A stream not linked to the chosen class must not be accepted."""
    unrelated = Stream.objects.create(name="Unrelated Stream", slug="unrelated-stream")
    class_11 = ClassLevel.objects.create(
        name="Class 11", slug="class-11", price="249.00", display_order=11, has_streams=True
    )

    response = google_student.patch(
        "/api/v1/profile/me/",
        data={"selected_class": class_11.pk, "selected_stream": unrelated.pk},
        content_type="application/json",
    )

    assert response.status_code == 400
    assert "not offered" in response.content.decode()


@pytest.mark.django_db
def test_inactive_class_cannot_be_selected(google_student, class_10):
    ClassLevel.objects.filter(pk=class_10.pk).update(is_active=False)

    response = google_student.patch(
        "/api/v1/profile/me/",
        data={"selected_class": class_10.pk},
        content_type="application/json",
    )

    assert response.status_code == 400


@pytest.mark.django_db
def test_class_can_be_cleared(google_student, class_10):
    google_student.patch(
        "/api/v1/profile/me/",
        data={"selected_class": class_10.pk},
        content_type="application/json",
    )

    response = google_student.patch(
        "/api/v1/profile/me/",
        data={"selected_class": None, "selected_stream": None},
        content_type="application/json",
    )

    assert response.status_code == 200
    assert response.json()["profile"]["selected_class"] is None


# ---------------------------------------------------------------------------
# 15. Logout
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_logout_invalidates_authentication(google_student):
    assert google_student.get("/api/v1/auth/me/").json()["authenticated"] is True

    response = google_student.post("/api/v1/auth/logout/")

    assert response.status_code == 200

    # The session is gone server-side, not merely hidden in the browser.
    after = google_student.get("/api/v1/auth/me/")
    assert after.json()["authenticated"] is False
    assert after.json()["user"] is None

    assert google_student.get("/api/v1/profile/me/").status_code == 401


@pytest.mark.django_db
def test_logout_expires_the_session_cookie(google_student):
    response = google_student.post("/api/v1/auth/logout/")

    # Cookies live on `response.cookies`, not in the raw header dict.
    morsel = response.cookies["vpedia_sessionid"]
    assert morsel.value == ""
    assert morsel["max-age"] == 0
    assert "vpedia_csrftoken" in response.cookies


@pytest.mark.django_db
def test_logout_is_idempotent_for_anonymous_clients(client):
    first = client.post("/api/v1/auth/logout/")
    second = client.post("/api/v1/auth/logout/")

    assert first.status_code == 200
    assert second.status_code == 200


@pytest.mark.django_db
def test_logout_by_a_signed_in_user_still_requires_csrf(google_student):
    """CSRF is enforced because the session authenticates the request.

    For an anonymous caller there is nothing to destroy, so DRF never reaches
    the CSRF check. For a signed-in student the check does run, which stops
    another site from logging them out.
    """
    from django.test import Client

    strict = Client(enforce_csrf_checks=True)
    strict.cookies["vpedia_sessionid"] = google_student.cookies["vpedia_sessionid"].value

    refused = strict.post("/api/v1/auth/logout/")
    assert refused.status_code == 403

    # The session survived the refused attempt.
    assert strict.get("/api/v1/auth/me/").json()["authenticated"] is True

    # With a token the same client can log out.
    primed = Client(enforce_csrf_checks=True)
    primed.cookies["vpedia_sessionid"] = google_student.cookies["vpedia_sessionid"].value
    primed.get("/api/v1/auth/csrf/")
    token = primed.cookies["vpedia_csrftoken"].value

    accepted = primed.post(
        "/api/v1/auth/logout/", headers={"X-CSRFToken": token}
    )
    assert accepted.status_code == 200
    assert primed.get("/api/v1/auth/me/").json()["authenticated"] is False


@pytest.mark.django_db
def test_protected_write_is_refused_after_logout(google_student, class_10):
    google_student.post("/api/v1/auth/logout/")

    response = google_student.patch(
        "/api/v1/profile/me/",
        data={"selected_class": class_10.pk},
        content_type="application/json",
    )

    assert response.status_code == 401
    assert User.objects.get().profile.selected_class is None


# ---------------------------------------------------------------------------
# CSRF
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_unsafe_request_without_csrf_token_is_refused(client, google_student):
    """DRF's SessionAuthentication enforces CSRF on unsafe methods."""
    from django.test import Client

    strict = Client(enforce_csrf_checks=True)
    # Reuse the signed-in session, but bypass the CSRF check in the test client.
    session = google_student.cookies["vpedia_sessionid"].value
    strict.cookies["vpedia_sessionid"] = session

    response = strict.patch(
        "/api/v1/profile/me/",
        data='{"first_name": "Injected"}',
        content_type="application/json",
    )

    assert response.status_code == 403
    assert User.objects.get().first_name == "Rahul"


@pytest.mark.django_db
def test_csrf_token_endpoint_issues_a_readable_token(client):
    response = client.get("/api/v1/auth/csrf/")

    assert response.status_code == 200
    assert response.json()["csrfToken"]
    # The SPA must be able to read it, so this one cookie is not HttpOnly.
    assert "vpedia_csrftoken" in response.cookies


@pytest.mark.django_db
def test_csrf_endpoint_is_available_before_signing_in(client):
    assert client.get("/api/v1/auth/csrf/").status_code == 200


# ---------------------------------------------------------------------------
# Config endpoint
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_auth_config_reports_google_available(google_student):
    response = google_student.get("/api/v1/auth/config/")

    assert response.status_code == 200
    body = response.json()
    assert body["google_enabled"] is True
    assert body["login_url"] == "/api/v1/accounts/google/login/"
    assert "test-client-secret" not in response.content.decode()


@pytest.mark.django_db
def test_auth_config_fails_closed_without_credentials(client, settings):
    settings.GOOGLE_OAUTH_CONFIGURED = False

    response = client.get("/api/v1/auth/config/")

    assert response.status_code == 503
    body = response.json()
    assert body["google_enabled"] is False
    assert body["login_url"] is None


@pytest.mark.django_db
def test_start_endpoint_fails_closed_without_credentials(client, settings):
    settings.GOOGLE_OAUTH_CONFIGURED = False

    assert client.get("/api/v1/auth/google/").status_code == 503


@pytest.mark.django_db
def test_start_endpoint_points_at_allauth_with_a_same_origin_next(google_student):
    body = google_student.get("/api/v1/auth/google/").json()

    assert body["login_url"].startswith("/api/v1/accounts/google/login/")
    assert "next=/api/v1/auth/complete/" in body["login_url"]


# ---------------------------------------------------------------------------
# Complete landing page
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_complete_page_forwards_a_signed_in_student_to_the_spa(google_student):
    response = google_student.get("/api/v1/auth/complete/")

    assert response.status_code == 200
    body = response.content.decode()
    assert "/auth/google/callback" in body
    assert "vpedia_sessionid" not in body


@pytest.mark.django_db
def test_complete_page_sends_an_anonymous_visitor_back_to_login(client):
    response = client.get("/api/v1/auth/complete/")

    assert response.status_code == 302
    assert "/login" in response["Location"]
