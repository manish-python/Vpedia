"""Stage 2 compatibility: nothing may regress now that sessions exist.

Required tests 13, 14, 16, 17, 18 and 19, plus the API-compatibility checks in
the brief.

The Stage 2 suites already cover pricing, submission, approval and the access
rule with DRF's `force_authenticate`. These tests deliberately use *real*
session cookies instead, because that is the path production now takes and it
has to work for every existing endpoint.
"""

from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model

from apps.payments.models import PaymentStatus
from apps.payments.services import approve_payment, submit_payment_proof
from apps.purchases.models import PurchaseStatus
from apps.purchases.services import create_purchase_request, has_class_access

User = get_user_model()


# ---------------------------------------------------------------------------
# 19. Health endpoint
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_health_endpoint_still_works(client):
    response = client.get("/api/v1/health/")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "VPEDIA LEARNING API"}


@pytest.mark.django_db
def test_health_needs_no_authentication(client):
    assert client.get("/api/v1/health/").status_code == 200


# ---------------------------------------------------------------------------
# Academic APIs
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_academic_apis_still_work(client, class_7, class_10):
    assert client.get("/api/v1/classes/").status_code == 200
    assert client.get("/api/v1/subjects/").status_code == 200
    assert client.get("/api/v1/chapters/").status_code == 200
    assert client.get("/api/v1/streams/").status_code == 200


@pytest.mark.django_db
def test_class_prices_are_still_exposed(client, class_10):
    row = next(r for r in client.get("/api/v1/classes/").json() if r["id"] == class_10.pk)

    assert row["price"] == "199.00"
    assert row["display_price"]


# ---------------------------------------------------------------------------
# Payment APIs still enforce authentication
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_payment_write_endpoints_reject_anonymous_callers(client, class_10):
    assert client.post("/api/v1/purchases/", {"class_level": class_10.pk}).status_code in (
        400,
        401,
        403,
    )
    assert client.post("/api/v1/payments/proofs/", {}).status_code in (400, 401, 403)


@pytest.mark.django_db
def test_purchase_endpoint_works_with_a_real_session(client, student, class_10):
    client.force_login(student)

    response = client.post(
        "/api/v1/purchases/", {"class_level": class_10.pk}, content_type="application/json"
    )

    assert response.status_code == 201
    assert response.json()["status"] == "PENDING"
    # Still derived server-side, not from the request.
    assert response.json()["amount"] == "199.00"


@pytest.mark.django_db
def test_my_purchases_endpoint_works_with_a_real_session(
    client, student, class_10, pending_purchase
):
    client.force_login(student)

    response = client.get("/api/v1/purchases/my/")

    assert response.status_code == 200
    assert [row["id"] for row in response.json()] == [pending_purchase.pk]


@pytest.mark.django_db
def test_student_cannot_approve_via_api_with_a_real_session(client, student, proof):
    client.force_login(student)

    response = client.post(f"/api/v1/payments/proofs/{proof.pk}/approve/")

    assert response.status_code == 403
    proof.refresh_from_db()
    assert proof.status == PaymentStatus.PENDING


@pytest.mark.django_db
def test_admin_can_approve_via_api_with_a_real_session(
    client, admin_user, proof, class_10
):
    client.force_login(admin_user)

    response = client.post(f"/api/v1/payments/proofs/{proof.pk}/approve/")

    assert response.status_code == 200
    assert response.json()["purchase"]["status"] == "ACTIVE"

    student = proof.user
    assert has_class_access(student, class_10) is True


@pytest.mark.django_db
def test_ownership_still_enforced_with_a_real_session(client, other_student, proof):
    client.force_login(other_student)

    assert client.get(f"/api/v1/payments/proofs/{proof.pk}/detail/").status_code == 403
    assert client.post(f"/api/v1/payments/proofs/{proof.pk}/approve/").status_code == 403


@pytest.mark.django_db
def test_unpublished_content_still_hidden_from_a_signed_in_student(
    client, student, class_10, maths_chapter
):
    from apps.content.models import Content, ContentType

    content = Content.objects.create(
        chapter=maths_chapter,
        title="Draft notes",
        content_type=ContentType.NOTES,
        is_published=False,
    )
    client.force_login(student)

    response = client.get("/api/v1/contents/")

    assert response.status_code == 200
    assert content.id not in [row["id"] for row in response.json()]


# ---------------------------------------------------------------------------
# 13 / 14. Access control still comes only from an approved purchase
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_class_purchase_still_controls_content_access(
    client, student, class_10, published_content, admin_user, png_upload
):
    # Signed in, selected Class 10, but never paid: still locked.
    client.force_login(student)
    client.patch(
        "/api/v1/profile/me/",
        data={"selected_class": class_10.pk},
        content_type="application/json",
    )

    body = client.get(f"/api/v1/contents/{published_content.slug}/").json()
    assert body["is_locked"] is True
    assert has_class_access(student, class_10) is False

    # Proof submitted but not yet approved: still locked.
    purchase = create_purchase_request(user=student, class_level=class_10)
    proof = submit_payment_proof(
        user=student,
        class_purchase=purchase,
        utr="UTR-COMPAT-1",
        screenshot=png_upload,
    )
    assert has_class_access(student, class_10) is False

    # Only an approved payment unlocks it.
    approve_payment(proof, admin_user)

    body = client.get(f"/api/v1/contents/{published_content.slug}/").json()
    assert body["is_locked"] is False
    assert has_class_access(student, class_10) is True


@pytest.mark.django_db
def test_class_10_purchase_still_does_not_grant_class_11_access(
    client, student, class_10, class_11
):
    purchase = create_purchase_request(user=student, class_level=class_10)
    purchase.status = PurchaseStatus.ACTIVE
    purchase.save(update_fields=["status", "updated_at"])

    client.force_login(student)

    body = client.get(f"/api/v1/contents/?class=class-11").json()
    assert all(row["is_locked"] for row in body)

    assert has_class_access(student, class_10) is True
    assert has_class_access(student, class_11) is False


@pytest.mark.django_db
def test_my_classes_still_lists_only_active_purchases(client, student, class_10):
    create_purchase_request(user=student, class_level=class_10)
    client.force_login(student)

    # PENDING only, so nothing is unlocked.
    assert client.get("/api/v1/my-classes/").json()["count"] == 0


@pytest.mark.django_db
def test_google_login_then_full_purchase_workflow_still_works(
    google_student, class_10, admin_user, png_upload
):
    """Google sign-in -> purchase -> proof -> approval -> access."""
    user = User.objects.get(email="rahul@gmail.com")

    purchase = create_purchase_request(user=user, class_level=class_10)
    proof = submit_payment_proof(
        user=user,
        class_purchase=purchase,
        utr="UTR-GOOGLE-FLOW",
        screenshot=png_upload,
    )
    assert has_class_access(user, class_10) is False

    approve_payment(proof, admin_user)

    assert has_class_access(user, class_10) is True

    body = google_student.get("/api/v1/profile/me/").json()
    assert [row["id"] for row in body["unlocked_classes"]] == [class_10.pk]


# ---------------------------------------------------------------------------
# 16. Django Admin
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_admin_login_still_works_with_a_password(client, admin_user):
    """Google is for students; administrators still sign in with a password."""
    response = client.post(
        "/admin/login/",
        {
            "username": admin_user.email,
            "password": "admin-pass-123",
            "next": "/admin/",
        },
    )

    assert response.status_code in (302, 200)
    # A successful sign-in redirects; a failure re-renders the form with an error.
    assert client.get("/admin/").status_code == 200
    assert "login" not in client.get("/admin/").content.decode().lower()[:400]


@pytest.mark.django_db
def test_students_cannot_sign_in_to_admin(client, student):
    """A student account has no usable password and must be refused."""
    response = client.post(
        "/admin/login/",
        {"username": student.email, "password": "", "next": "/admin/"},
    )

    assert response.status_code == 200
    assert client.get("/admin/").status_code == 302


@pytest.mark.django_db
def test_student_cannot_be_authenticated_by_password_even_with_one_set(client, student):
    """The narrowed backend refuses non-staff accounts even with a password."""
    student.set_password("a-perfectly-valid-password-123")
    student.save(update_fields=["password", "updated_at"])

    from django.contrib.auth import authenticate

    assert authenticate(username=student.email, password="a-perfectly-valid-password-123") is None
    assert authenticate(username=student.email, password=None) is None


@pytest.mark.django_db
def test_admin_can_reach_django_admin_with_a_real_session(client, admin_user):
    client.force_login(admin_user)

    response = client.get("/admin/")

    assert response.status_code == 200
    assert "VPEDIA" in response.content.decode()


@pytest.mark.django_db
def test_student_cannot_reach_django_admin(client, student):
    client.force_login(student)

    response = client.get("/admin/")

    assert response.status_code == 302
    assert "login" in response["Location"]


@pytest.mark.django_db
def test_payment_screenshots_remain_staff_only(client, student, admin_user, proof):
    """Uploads were never public and must not have become so."""
    assert proof.screenshot

    path = proof.screenshot.url

    # Anonymous
    assert client.get(path).status_code == 403
    # Signed-in student
    client.force_login(student)
    assert client.get(path).status_code == 403
    # Staff
    client.force_login(admin_user)
    assert client.get(path).status_code == 200
