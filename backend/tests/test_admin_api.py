"""Security and workflow tests for the custom staff admin API."""

from __future__ import annotations

from decimal import Decimal

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test.client import BOUNDARY, encode_multipart

from apps.academics.models import Subject
from apps.content.models import ContentType
from apps.payments.models import PaymentStatus
from apps.purchases.models import PurchaseStatus
from apps.purchases.services import create_purchase_request


def admin_session(client, user, password="admin-pass-123"):
    response = client.post(
        "/api/v1/admin/login/",
        {"email": user.email, "password": password},
    )
    assert response.status_code == 200
    return response


@pytest.mark.django_db
def test_admin_api_requires_authentication(client):
    assert client.get("/api/v1/admin/dashboard/").status_code == 401
    assert client.get("/api/v1/admin/students/").status_code == 401


@pytest.mark.django_db
def test_student_is_forbidden_from_admin_api(client, student):
    client.force_login(student)

    assert client.get("/api/v1/admin/dashboard/").status_code == 403
    assert client.get("/api/v1/admin/payments/").status_code == 403
    assert client.get("/api/v1/admin/upi/").status_code == 403


@pytest.mark.django_db
def test_staff_and_superuser_can_login_and_view_dashboard(client, admin_user):
    body = admin_session(client, admin_user).json()
    assert body["authenticated"] is True
    assert body["user"]["is_staff"] is True

    dashboard = client.get("/api/v1/admin/dashboard/")
    assert dashboard.status_code == 200
    assert {"students", "classes", "active_purchases", "pending_payments"} <= set(dashboard.json())


@pytest.mark.django_db
def test_non_staff_password_login_is_refused(client, student):
    response = client.post(
        "/api/v1/admin/login/",
        {"email": student.email, "password": "anything"},
    )
    assert response.status_code == 401


@pytest.mark.django_db
def test_staff_can_list_students_classes_and_paginated_catalogue(client, admin_user, student, class_10):
    admin_session(client, admin_user)

    students = client.get("/api/v1/admin/students/")
    classes = client.get("/api/v1/admin/classes/")

    assert students.status_code == 200
    assert students.json()["results"][0]["email"] == student.email
    assert classes.status_code == 200
    assert classes.json()["results"][0]["price"] == "199.00"


@pytest.mark.django_db
def test_staff_can_update_price_without_rewriting_historical_purchase(
    client, admin_user, student, class_10
):
    purchase = create_purchase_request(user=student, class_level=class_10)
    admin_session(client, admin_user)

    response = client.patch(
        f"/api/v1/admin/classes/{class_10.pk}/",
        {"price": "249.00"},
        content_type="application/json",
    )
    assert response.status_code == 200

    class_10.refresh_from_db()
    purchase.refresh_from_db()
    assert class_10.price == Decimal("249.00")
    assert purchase.amount == Decimal("199.00")


@pytest.mark.django_db
def test_staff_can_create_subject_with_relationship_validation(
    client, admin_user, class_10
):
    admin_session(client, admin_user)
    response = client.post(
        "/api/v1/admin/subjects/",
        {
            "class_level": class_10.pk,
            "name": "Computer Applications",
            "slug": "class-10-computer-applications",
            "description": "Optional subject",
        },
    )
    assert response.status_code == 201
    assert response.json()["class_name"] == "Class 10"


@pytest.mark.django_db
def test_staff_can_filter_chapters_and_content(client, admin_user, maths_chapter, published_content):
    admin_session(client, admin_user)

    chapters = client.get(f"/api/v1/admin/chapters/?subject={maths_chapter.subject_id}")
    contents = client.get("/api/v1/admin/content/?type=NOTES")

    assert chapters.status_code == 200
    assert chapters.json()["results"][0]["content_count"] == 1
    assert contents.status_code == 200
    assert contents.json()["results"][0]["content_type"] == ContentType.NOTES


@pytest.mark.django_db
def test_payment_approval_uses_existing_atomic_service(client, admin_user, proof, pending_purchase):
    admin_session(client, admin_user)

    response = client.post(f"/api/v1/admin/payments/{proof.pk}/approve/")
    assert response.status_code == 200

    proof.refresh_from_db()
    pending_purchase.refresh_from_db()
    assert proof.status == PaymentStatus.APPROVED
    assert proof.reviewed_by_id == admin_user.pk
    assert pending_purchase.status == PurchaseStatus.ACTIVE
    assert pending_purchase.approved_by_id == admin_user.pk


@pytest.mark.django_db
def test_payment_rejection_requires_reason_and_keeps_access_locked(
    client, admin_user, proof, pending_purchase
):
    admin_session(client, admin_user)

    missing = client.post(f"/api/v1/admin/payments/{proof.pk}/reject/", {})
    assert missing.status_code == 400

    response = client.post(
        f"/api/v1/admin/payments/{proof.pk}/reject/",
        {"reason": "UTR could not be verified."},
    )
    assert response.status_code == 200
    proof.refresh_from_db()
    pending_purchase.refresh_from_db()
    assert proof.status == PaymentStatus.REJECTED
    assert proof.rejection_reason == "UTR could not be verified."
    assert pending_purchase.status == PurchaseStatus.REJECTED


@pytest.mark.django_db
def test_student_cannot_approve_payment_or_choose_reviewer(client, student, proof):
    client.force_login(student)

    response = client.post(
        f"/api/v1/admin/payments/{proof.pk}/approve/",
        {"reviewed_by": student.pk},
    )
    assert response.status_code == 403
    proof.refresh_from_db()
    assert proof.status == PaymentStatus.PENDING


@pytest.mark.django_db
def test_upi_read_and_update_are_staff_only(client, admin_user, upi_settings):
    assert client.get("/api/v1/admin/upi/").status_code == 401

    admin_session(client, admin_user)
    current = client.get("/api/v1/admin/upi/")
    assert current.status_code == 200
    assert current.json()["upi_id"] == "vpedialearning@upi"

    updated = client.patch(
        "/api/v1/admin/upi/1/",
        {"upi_id": "vpedialearning2@upi", "display_name": "VPEDIA 2"},
        content_type="application/json",
    )
    assert updated.status_code == 200
    assert updated.json()["upi_id"] == "vpedialearning2@upi"

    public = client.get("/api/v1/payments/upi/")
    assert public.json()["upi_id"] == "vpedialearning2@upi"


@pytest.mark.django_db
def test_qr_upload_is_returned_through_the_existing_public_upi_route(
    client, admin_user, upi_settings, png_upload
):
    admin_session(client, admin_user)
    response = client.generic(
        "PATCH",
        "/api/v1/admin/upi/1/",
        data=encode_multipart(BOUNDARY, {"qr_code": png_upload}),
        content_type=f"multipart/form-data; boundary={BOUNDARY}",
    )
    assert response.status_code == 200
    assert response.json()["qr_code_url"] == "/api/v1/payments/upi/qr/"


@pytest.mark.django_db
def test_payment_screenshot_url_is_not_public_but_staff_can_use_it(
    client, admin_user, proof
):
    admin_session(client, admin_user)
    body = client.get(f"/api/v1/admin/payments/{proof.pk}/").json()
    assert body["screenshot_url"].startswith("/private-media/")

    client.logout()
    assert client.get(body["screenshot_url"]).status_code == 403


@pytest.mark.django_db
def test_staff_can_upload_pdf_content(client, admin_user, maths_chapter):
    admin_session(client, admin_user)
    pdf = SimpleUploadedFile("admin-notes.pdf", b"%PDF-1.4\n", content_type="application/pdf")
    response = client.post(
        "/api/v1/admin/content/",
        {
            "chapter": maths_chapter.pk,
            "title": "Admin Notes",
            "slug": "admin-notes",
            "content_type": ContentType.NOTES,
            "file": pdf,
            "is_published": "false",
        },
    )
    assert response.status_code == 201
    assert response.json()["is_published"] is False
