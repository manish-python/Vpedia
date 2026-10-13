"""API permission and access-control tests.

Covers required tests 12 and 13, plus the remaining access rules at the
transport layer. These prove enforcement is server-side: the tests craft the
requests directly, bypassing any frontend.
"""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.academics.models import ClassLevel
from apps.content.models import Content
from apps.payments.models import PaymentProof, PaymentStatus
from apps.payments.services import submit_payment_proof
from apps.purchases.models import ClassPurchase
from apps.purchases.services import create_purchase_request


@pytest.fixture
def api() -> APIClient:
    return APIClient()


@pytest.fixture
def other_purchase(db, other_student, class_10) -> ClassPurchase:
    return create_purchase_request(user=other_student, class_level=class_10)


@pytest.fixture
def other_proof(other_purchase, other_student, png_upload) -> PaymentProof:
    return submit_payment_proof(
        user=other_student,
        class_purchase=other_purchase,
        utr="UTR-OTHER-999",
        screenshot=png_upload,
    )


# --- 12. A student cannot approve a payment -------------------------------


@pytest.mark.django_db
def test_student_cannot_approve_payment_via_api(api, student, proof):
    api.force_authenticate(user=student)
    response = api.post(f"/api/v1/payments/proofs/{proof.pk}/approve/", {}, format="json")

    assert response.status_code == 403

    proof.refresh_from_db()
    proof.class_purchase.refresh_from_db()
    assert proof.status == PaymentStatus.PENDING
    assert proof.class_purchase.status == "PENDING"


@pytest.mark.django_db
def test_student_cannot_reject_payment_via_api(api, student, proof):
    api.force_authenticate(user=student)
    response = api.post(
        f"/api/v1/payments/proofs/{proof.pk}/reject/",
        {"reason": "I reject my own payment"},
        format="json",
    )

    assert response.status_code == 403
    proof.refresh_from_db()
    assert proof.status == PaymentStatus.PENDING


@pytest.mark.django_db
def test_anonymous_cannot_approve_payment(api, proof):
    response = api.post(f"/api/v1/payments/proofs/{proof.pk}/approve/", {}, format="json")

    assert response.status_code in (401, 403)
    proof.refresh_from_db()
    assert proof.status == PaymentStatus.PENDING


@pytest.mark.django_db
def test_admin_can_approve_payment_via_api(api, admin_user, proof):
    api.force_authenticate(user=admin_user)
    response = api.post(f"/api/v1/payments/proofs/{proof.pk}/approve/", {}, format="json")

    assert response.status_code == 200
    body = response.json()
    assert body["payment"]["status"] == PaymentStatus.APPROVED
    assert body["purchase"]["status"] == "ACTIVE"


@pytest.mark.django_db
def test_admin_rejection_via_api_requires_a_reason(api, admin_user, proof):
    api.force_authenticate(user=admin_user)
    response = api.post(
        f"/api/v1/payments/proofs/{proof.pk}/reject/", {"reason": ""}, format="json"
    )

    assert response.status_code == 400
    proof.refresh_from_db()
    assert proof.status == PaymentStatus.PENDING


# --- 13. A student cannot modify another student's proof -------------------


@pytest.mark.django_db
def test_student_cannot_read_another_students_proof(api, student, other_proof):
    api.force_authenticate(user=student)
    response = api.get(f"/api/v1/payments/proofs/{other_proof.pk}/detail/")

    assert response.status_code == 403


@pytest.mark.django_db
def test_student_can_read_their_own_proof(api, student, proof):
    api.force_authenticate(user=student)
    response = api.get(f"/api/v1/payments/proofs/{proof.pk}/detail/")

    assert response.status_code == 200
    assert response.json()["utr"] == proof.utr

@pytest.mark.django_db
def test_student_cannot_approve_another_students_proof(api, student, other_proof):
    api.force_authenticate(user=student)
    response = api.post(f"/api/v1/payments/proofs/{other_proof.pk}/approve/", {}, format="json")

    assert response.status_code == 403
    other_proof.refresh_from_db()
    assert other_proof.status == PaymentStatus.PENDING


@pytest.mark.django_db
def test_student_cannot_submit_proof_against_another_students_purchase(
    api, student, other_purchase, png_upload
):
    api.force_authenticate(user=student)
    response = api.post(
        "/api/v1/payments/proofs/",
        {
            "class_purchase": other_purchase.pk,
            "utr": "UTR-INTRUDER",
            "screenshot": png_upload,
        },
        format="multipart",
    )

    assert response.status_code in (400, 403)
    assert not PaymentProof.objects.filter(utr="UTR-INTRUDER").exists()


@pytest.mark.django_db
def test_my_proofs_only_returns_the_callers_records(api, student, proof, other_proof):
    api.force_authenticate(user=student)
    response = api.get("/api/v1/payments/my/")

    assert response.status_code == 200
    utrs = [row["utr"] for row in response.json()]
    assert proof.utr in utrs
    assert other_proof.utr not in utrs


@pytest.mark.django_db
def test_proof_serializer_never_exposes_the_screenshot(api, student, proof):
    api.force_authenticate(user=student)
    response = api.get("/api/v1/payments/my/")

    row = next(r for r in response.json() if r["id"] == proof.pk)
    assert "screenshot" not in row
    assert row["has_screenshot"] is True


# --- Amount cannot be manipulated by the client ---------------------------


@pytest.mark.django_db
def test_submission_ignores_a_client_supplied_amount(api, student, pending_purchase, png_upload):
    api.force_authenticate(user=student)
    response = api.post(
        "/api/v1/payments/proofs/",
        {
            "class_purchase": pending_purchase.pk,
            "utr": "UTR-AMOUNT",
            "amount": "1.00",
            "screenshot": png_upload,
        },
        format="multipart",
    )

    assert response.status_code == 201
    proof = PaymentProof.objects.get(utr="UTR-AMOUNT")
    # The server-side price won, not the value sent by the client.
    assert proof.amount == pending_purchase.amount


@pytest.mark.django_db
def test_purchase_request_ignores_a_client_supplied_amount(api, student, class_10):
    api.force_authenticate(user=student)
    response = api.post(
        "/api/v1/purchases/",
        {"class_level": class_10.pk, "amount": "1.00"},
        format="json",
    )

    assert response.status_code == 201
    purchase = ClassPurchase.objects.get(pk=response.json()["id"])
    assert purchase.amount == class_10.price


# --- Content access is enforced server-side -------------------------------


@pytest.mark.django_db
def test_content_of_unowned_class_reports_locked(api, student, published_content):
    api.force_authenticate(user=student)
    response = api.get(f"/api/v1/contents/{published_content.slug}/")

    assert response.status_code == 200
    assert response.json()["is_locked"] is True


@pytest.mark.django_db
def test_content_of_owned_class_reports_unlocked(
    api, student, active_purchase, published_content
):
    api.force_authenticate(user=student)
    response = api.get(f"/api/v1/contents/{published_content.slug}/")

    assert response.status_code == 200
    assert response.json()["is_locked"] is False


@pytest.mark.django_db
def test_unpublished_content_is_never_listed(api, student, active_purchase, published_content):
    Content.objects.filter(pk=published_content.pk).update(is_published=False)

    api.force_authenticate(user=student)
    response = api.get("/api/v1/contents/")

    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.django_db
def test_chapter_contents_endpoint_reports_has_access(
    api, student, active_purchase, maths_chapter, published_content
):
    api.force_authenticate(user=student)
    response = api.get(f"/api/v1/chapters/{maths_chapter.slug}/contents/")

    assert response.status_code == 200
    body = response.json()
    assert body["has_access"] is True
    assert body["count"] == 1


@pytest.mark.django_db
def test_chapter_contents_endpoint_denies_unowned_class(
    api, student, class_11, maths_chapter, published_content
):
    api.force_authenticate(user=student)
    response = api.get(f"/api/v1/chapters/{maths_chapter.slug}/contents/")

    assert response.status_code == 200
    body = response.json()
    assert body["has_access"] is False
    assert body["results"][0]["is_locked"] is True


# --- Purchase API ---------------------------------------------------------


@pytest.mark.django_db
def test_create_purchase_endpoint(api, student, class_10):
    api.force_authenticate(user=student)
    response = api.post("/api/v1/purchases/", {"class_level": class_10.pk}, format="json")

    assert response.status_code == 201
    assert response.json()["status"] == "PENDING"
    assert response.json()["amount"] == "199.00"


@pytest.mark.django_db
def test_create_purchase_requires_stream_for_streamed_class(
    api, student, class_11, science_stream
):
    api.force_authenticate(user=student)
    response = api.post("/api/v1/purchases/", {"class_level": class_11.pk}, format="json")

    assert response.status_code == 400
    assert "stream" in response.json()


@pytest.mark.django_db
def test_duplicate_purchase_via_api_returns_conflict(api, student, class_10, pending_purchase):
    api.force_authenticate(user=student)
    response = api.post("/api/v1/purchases/", {"class_level": class_10.pk}, format="json")

    assert response.status_code == 409


@pytest.mark.django_db
def test_purchase_requires_authentication(api, class_10):
    response = api.post("/api/v1/purchases/", {"class_level": class_10.pk}, format="json")

    assert response.status_code in (401, 403)


@pytest.mark.django_db
def test_inactive_class_cannot_be_purchased_via_api(api, student, class_10):
    ClassLevel.objects.filter(pk=class_10.pk).update(is_active=False)

    api.force_authenticate(user=student)
    response = api.post("/api/v1/purchases/", {"class_level": class_10.pk}, format="json")

    assert response.status_code == 400


@pytest.mark.django_db
def test_my_classes_lists_only_active_purchases(api, student, active_purchase, class_11):
    api.force_authenticate(user=student)
    response = api.get("/api/v1/my-classes/")

    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 1
    assert body["results"][0]["class_name"] == "Class 10"


@pytest.mark.django_db
def test_upi_context_is_returned_for_own_purchase(api, student, pending_purchase, upi_settings):
    api.force_authenticate(user=student)
    response = api.get(f"/api/v1/purchases/{pending_purchase.pk}/upi/")

    assert response.status_code == 200
    body = response.json()
    assert body["upi_id"] == "vpedialearning@upi"
    assert body["amount"] == "199.00"
    assert body["currency"] == "INR"
    assert body["upi_uri"].startswith("upi://pay?")
    assert "pa=vpedialearning%40upi" in body["upi_uri"]


@pytest.mark.django_db
def test_student_cannot_read_another_students_upi_context(api, student, other_purchase):
    api.force_authenticate(user=student)
    response = api.get(f"/api/v1/purchases/{other_purchase.pk}/upi/")

    # 403 rather than 404: the request is explicitly refused, which is clearer
    # than pretending the purchase does not exist.
    assert response.status_code == 403


@pytest.mark.django_db
def test_upi_settings_endpoint_is_public(api, upi_settings):
    response = api.get("/api/v1/payments/upi/")

    assert response.status_code == 200
    assert response.json()["upi_id"] == "vpedialearning@upi"
