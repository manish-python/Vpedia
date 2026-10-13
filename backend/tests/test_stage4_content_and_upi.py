"""Stage 4 backend additions for the payment surface.

The frontend needs two things the Stage 2/3 API did not expose:

1. `GET /api/v1/contents/{slug}/document/` — the only route that streams
   study-material bytes, gated by `has_class_access`.
2. `GET /api/v1/payments/upi/qr/` — the configured UPI QR, which a student
   must be able to see in order to pay.

Both are additions. Nothing here changes pricing, purchase creation, proof
submission, approval or `has_class_access`.
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

from apps.academics.models import Chapter, ClassLevel, Subject
from apps.content.models import Content, ContentType
from apps.payments.models import UPISettings
from apps.payments.services import approve_payment, submit_payment_proof
from apps.purchases.models import PurchaseStatus
from apps.purchases.services import create_purchase_request


def _qr_bytes(size=(240, 240)) -> bytes:
    buffer = __import__("io").BytesIO()
    Image.new("RGB", size, (12, 34, 56)).save(buffer, format="PNG")
    return buffer.getvalue()


def _pdf_bytes() -> bytes:
    return (
        b"%PDF-1.4\n"
        b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
        b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
        b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n"
        b"trailer<</Root 1 0 R>>\n%%EOF\n"
    )


@pytest.fixture
def class_10_subject(db, class_10) -> Subject:
    return Subject.objects.create(
        class_level=class_10, name="Mathematics", slug="class-10-mathematics"
    )


@pytest.fixture
def class_10_chapter(db, class_10_subject) -> Chapter:
    return Chapter.objects.create(subject=class_10_subject, number=1, name="Real Numbers")


@pytest.fixture
def published_pdf(db, class_10_chapter) -> Content:
    return Content.objects.create(
        chapter=class_10_chapter,
        title="Real Numbers Notes",
        slug="class-10-mathematics-real-numbers-notes",
        content_type=ContentType.NOTES,
        file=SimpleUploadedFile("notes.pdf", _pdf_bytes(), content_type="application/pdf"),
        page_count=1,
        is_published=True,
    )


@pytest.fixture
def upi_with_qr(db) -> UPISettings:
    return UPISettings.objects.create(
        upi_id="vpedialearning@upi",
        display_name="VPEDIA LEARNING",
        qr_code=SimpleUploadedFile("upi.png", _qr_bytes(), content_type="image/png"),
        instructions="Pay the exact amount, then upload the screenshot and UTR.",
        is_active=True,
    )


# ---------------------------------------------------------------------------
# Content document — gated by has_class_access
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_document_requires_authentication(client, published_pdf):
    assert client.get(f"/api/v1/contents/{published_pdf.slug}/document/").status_code == 401


@pytest.mark.django_db
def test_document_refused_without_purchase(client, student, published_pdf):
    client.force_login(student)
    assert client.get(f"/api/v1/contents/{published_pdf.slug}/document/").status_code == 403


@pytest.mark.django_db
@pytest.mark.parametrize("status", [PurchaseStatus.PENDING, PurchaseStatus.REJECTED, PurchaseStatus.CANCELLED])
def test_only_active_unlocks_the_document(client, student, class_10, published_pdf, status):
    """RULE: a purchase that is not ACTIVE grants nothing."""
    student.class_purchases.create(
        class_level=class_10, amount=class_10.price, status=status
    )
    client.force_login(student)
    assert client.get(f"/api/v1/contents/{published_pdf.slug}/document/").status_code == 403


@pytest.mark.django_db
def test_document_served_to_the_owner(client, student, class_10, published_pdf):
    student.class_purchases.create(
        class_level=class_10, amount=class_10.price, status=PurchaseStatus.ACTIVE
    )
    client.force_login(student)

    response = client.get(f"/api/v1/contents/{published_pdf.slug}/document/")

    assert response.status_code == 200
    assert b"".join(response.streaming_content) == _pdf_bytes()
    assert response["Content-Type"] == "application/pdf"
    assert "no-store" in response["Cache-Control"]
    assert response["X-Content-Type-Options"] == "nosniff"


@pytest.mark.django_db
def test_class_10_purchase_does_not_unlock_class_11_material(
    client, student, class_10, class_11, science_stream
):
    subject = Subject.objects.create(
        class_level=class_11, stream=science_stream, name="Physics",
        slug="class-11-science-physics",
    )
    chapter = Chapter.objects.create(subject=subject, number=1, name="Units")
    other = Content.objects.create(
        chapter=chapter,
        title="Physics notes",
        slug="class-11-science-physics-units-notes",
        content_type=ContentType.NOTES,
        file=SimpleUploadedFile("p.pdf", _pdf_bytes(), content_type="application/pdf"),
        is_published=True,
    )

    student.class_purchases.create(
        class_level=class_10, amount=class_10.price, status=PurchaseStatus.ACTIVE
    )
    client.force_login(student)

    assert client.get(f"/api/v1/contents/{other.slug}/document/").status_code == 403


@pytest.mark.django_db
def test_unpublished_document_is_404_even_for_the_owner(client, student, class_10, class_10_chapter):
    draft = Content.objects.create(
        chapter=class_10_chapter,
        title="Draft",
        slug="class-10-mathematics-real-numbers-draft",
        content_type=ContentType.NOTES,
        file=SimpleUploadedFile("d.pdf", _pdf_bytes(), content_type="application/pdf"),
        is_published=False,
    )
    student.class_purchases.create(
        class_level=class_10, amount=class_10.price, status=PurchaseStatus.ACTIVE
    )
    client.force_login(student)

    assert client.get(f"/api/v1/contents/{draft.slug}/document/").status_code == 404


@pytest.mark.django_db
def test_document_agrees_with_the_is_locked_metadata(client, student, class_10, published_pdf):
    """The byte route and the metadata must never disagree."""
    client.force_login(student)

    assert client.get(f"/api/v1/contents/{published_pdf.slug}/").json()["is_locked"] is True
    assert client.get(f"/api/v1/contents/{published_pdf.slug}/document/").status_code == 403

    student.class_purchases.create(
        class_level=class_10, amount=class_10.price, status=PurchaseStatus.ACTIVE
    )

    assert client.get(f"/api/v1/contents/{published_pdf.slug}/").json()["is_locked"] is False
    assert client.get(f"/api/v1/contents/{published_pdf.slug}/document/").status_code == 200


@pytest.mark.django_db
def test_document_without_a_file_returns_404_not_500(client, student, class_10, class_10_chapter):
    orphan = Content.objects.create(
        chapter=class_10_chapter,
        title="Placeholder",
        slug="class-10-mathematics-real-numbers-placeholder",
        content_type=ContentType.NOTES,
        is_published=True,
    )
    student.class_purchases.create(
        class_level=class_10, amount=class_10.price, status=PurchaseStatus.ACTIVE
    )
    client.force_login(student)

    assert client.get(f"/api/v1/contents/{orphan.slug}/document/").status_code == 404


@pytest.mark.django_db
def test_content_access_endpoint_works(client, published_pdf):
    """Regression: this route used to raise AttributeError and return 500.

    `Content.class_level` is a property (chapter -> subject -> class_level),
    not a foreign key, so `content.class_level_id` does not exist. The
    endpoint Stage 4 names as the content-access authority had never actually
    been called, which is how the bug survived Stage 2's 200-odd tests.

    Anonymous callers must get a well-formed answer, not a traceback.
    """
    response = client.get(f"/api/v1/contents/{published_pdf.slug}/access/")

    assert response.status_code == 200
    body = response.json()
    assert body["allowed"] is False
    assert body["class_level"] == class_10_primary_key(published_pdf)
    assert body["class_name"] == "Class 10"
    assert body["reason"]


def class_10_primary_key(content: Content) -> int:
    return content.chapter.subject.class_level_id


@pytest.mark.django_db
def test_content_access_agrees_with_the_document_route(client, student, class_10, published_pdf):
    """The badge and the gate must never disagree."""
    client.force_login(student)

    locked = client.get(f"/api/v1/contents/{published_pdf.slug}/access/").json()["allowed"]
    refused = client.get(f"/api/v1/contents/{published_pdf.slug}/document/").status_code
    assert locked is False and refused == 403

    student.class_purchases.create(
        class_level=class_10, amount=class_10.price, status=PurchaseStatus.ACTIVE
    )

    allowed = client.get(f"/api/v1/contents/{published_pdf.slug}/access/").json()["allowed"]
    served = client.get(f"/api/v1/contents/{published_pdf.slug}/document/").status_code
    assert allowed is True and served == 200


@pytest.mark.django_db
def test_content_access_is_404_for_an_unpublished_row(client, published_pdf):
    draft = Content.objects.create(
        chapter=published_pdf.chapter,
        title="Draft",
        slug="class-10-mathematics-real-numbers-draft",
        content_type=ContentType.NOTES,
        is_published=False,
    )

    assert client.get(f"/api/v1/contents/{draft.slug}/access/").status_code == 404


# ---------------------------------------------------------------------------
# UPI QR — public on purpose
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_upi_qr_is_public(client, upi_with_qr):
    """A student must be able to see the QR they are paying with."""
    response = client.get("/api/v1/payments/upi/qr/")

    assert response.status_code == 200
    assert response["Content-Type"] == "image/png"
    assert b"".join(response.streaming_content) == _qr_bytes()


@pytest.mark.django_db
def test_upi_qr_is_404_when_none_configured(client, upi_settings):
    assert client.get("/api/v1/payments/upi/qr/").status_code == 404


@pytest.mark.django_db
def test_upi_settings_points_at_the_public_qr_route(client, upi_with_qr):
    body = client.get("/api/v1/payments/upi/").json()

    assert body["upi_id"] == "vpedialearning@upi"
    assert body["qr_code_url"] == "/api/v1/payments/upi/qr/"
    # Never the staff-only media path.
    assert "private-media" not in body["qr_code_url"]


@pytest.mark.django_db
def test_payment_screenshots_are_still_staff_only(
    client, student, admin_user, class_10, upi_with_qr, png_upload
):
    """Adding a public QR must not loosen the guard on payment evidence."""
    purchase = create_purchase_request(user=student, class_level=class_10)
    proof = submit_payment_proof(
        user=student, class_purchase=purchase, utr="UTR-QR-1", screenshot=png_upload
    )
    path = proof.screenshot.url

    assert client.get(path).status_code == 403

    client.force_login(student)
    assert client.get(path).status_code == 403

    client.force_login(admin_user)
    assert client.get(path).status_code == 200


@pytest.mark.django_db
def test_upi_context_comes_from_the_purchase_not_the_client(client, student, class_10, upi_with_qr):
    purchase = create_purchase_request(user=student, class_level=class_10)
    client.force_login(student)

    body = client.get(f"/api/v1/purchases/{purchase.pk}/upi/").json()

    assert body["amount"] == "199.00"
    assert body["class_name"] == "Class 10"
    assert body["upi_id"] == "vpedialearning@upi"
    assert body["qr_code"] == "/api/v1/payments/upi/qr/"
    assert body["upi_uri"].startswith("upi://pay?")
    assert "am=199.00" in body["upi_uri"]
    assert body["reference"] == f"VP{purchase.pk:06d}"


@pytest.mark.django_db
def test_admin_changing_the_upi_id_reaches_the_api(client, admin_user, upi_with_qr):
    """Requirement: an admin edit must be what students see, with no redeploy."""
    upi_with_qr.upi_id = "new-address@okaxis"
    upi_with_qr.save(update_fields=["upi_id", "updated_at"])

    body = client.get("/api/v1/payments/upi/").json()
    assert body["upi_id"] == "new-address@okaxis"


# ---------------------------------------------------------------------------
# End-to-end: proof submission then approval unlocks the document
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_full_manual_upi_flow_unlocks_the_document(
    client, student, admin_user, class_10, published_pdf, upi_with_qr, png_upload
):
    """Pay by UPI → submit proof → admin approves → bytes become readable."""
    purchase = create_purchase_request(user=student, class_level=class_10)
    proof = submit_payment_proof(
        user=student, class_purchase=purchase, utr="UTR-E2E-1", screenshot=png_upload
    )

    client.force_login(student)
    # PENDING: uploaded proof unlocks nothing.
    assert client.get(f"/api/v1/contents/{published_pdf.slug}/document/").status_code == 403
    assert client.get("/api/v1/my-classes/").json()["count"] == 0

    approve_payment(proof, admin_user)

    # APPROVED: now the bytes are served.
    assert client.get(f"/api/v1/contents/{published_pdf.slug}/document/").status_code == 200
    assert client.get("/api/v1/my-classes/").json()["count"] == 1


@pytest.mark.django_db
def test_rejected_proof_leaves_the_document_locked(
    client, student, admin_user, class_10, published_pdf, upi_with_qr, png_upload
):
    from apps.payments.services import reject_payment

    purchase = create_purchase_request(user=student, class_level=class_10)
    proof = submit_payment_proof(
        user=student, class_purchase=purchase, utr="UTR-E2E-2", screenshot=png_upload
    )
    reject_payment(proof, admin_user, "Amount did not match.")

    client.force_login(student)
    assert client.get(f"/api/v1/contents/{published_pdf.slug}/document/").status_code == 403
    assert client.get("/api/v1/my-classes/").json()["count"] == 0


# ---------------------------------------------------------------------------
# Class number + catalogue filters
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_class_number_is_exposed_for_every_seeded_class(client, db):
    for n in range(7, 13):
        ClassLevel.objects.create(
            name=f"Class {n}", slug=f"class-{n}", price=Decimal("199.00"), display_order=n
        )

    rows = client.get("/api/v1/classes/").json()
    assert sorted(row["number"] for row in rows) == [7, 8, 9, 10, 11, 12]
    for row in rows:
        assert str(row["number"]) in row["name"]
        assert str(row["number"]) in row["slug"]


@pytest.mark.django_db
def test_class_number_follows_a_rename(client, class_10):
    ClassLevel.objects.filter(pk=class_10.pk).update(slug="senior-year-10")
    assert client.get("/api/v1/classes/senior-year-10/").json()["number"] == 10


@pytest.mark.django_db
def test_class_number_is_null_when_the_name_has_none(db, client):
    ClassLevel.objects.create(name="Foundation", slug="foundation", price=Decimal("50.00"))
    assert client.get("/api/v1/classes/foundation/").json()["number"] is None


@pytest.mark.django_db
def test_class_price_comes_from_the_backend(client, class_10):
    row = client.get(f"/api/v1/classes/{class_10.slug}/").json()
    assert row["price"] == "199.00"
    assert row["display_price"] == "₹199"
    assert row["is_active"] is True
    assert row["has_streams"] is False


@pytest.mark.django_db
def test_subject_and_chapter_filters(client, class_11, class_10, science_stream, db):
    from apps.academics.models import Stream

    commerce = Stream.objects.create(name="Commerce", slug="commerce")
    science_stream.class_levels.set([class_11])
    commerce.class_levels.set([class_11])

    plain = Subject.objects.create(
        class_level=class_11, name="Mathematics", slug="class-11-mathematics"
    )
    sci = Subject.objects.create(
        class_level=class_11, stream=science_stream, name="Physics",
        slug="class-11-science-physics",
    )

    rows = client.get(f"/api/v1/subjects/?class={class_11.slug}").json()
    assert {row["id"] for row in rows} == {plain.id, sci.id}

    rows = client.get(f"/api/v1/subjects/?class={class_11.slug}&stream={science_stream.slug}").json()
    assert {row["id"] for row in rows} == {sci.id}

    # A class with no streams returns none.
    assert client.get(f"/api/v1/streams/?class={class_10.slug}").json() == []
    assert len(client.get(f"/api/v1/streams/?class={class_11.slug}").json()) == 2


@pytest.mark.django_db
def test_chapters_endpoint_reports_published_counts(
    client, class_10_subject, class_10_chapter
):
    for label, ctype in (("notes", ContentType.NOTES), ("pyq", ContentType.PYQ)):
        Content.objects.create(
            chapter=class_10_chapter,
            title=f"Real Numbers {label}",
            slug=f"class-10-mathematics-real-numbers-{label}",
            content_type=ctype,
            is_published=True,
        )

    rows = client.get(f"/api/v1/subjects/{class_10_subject.slug}/chapters/").json()

    assert len(rows) == 1
    assert rows[0]["content_count"] == 2
    assert rows[0]["content_types"] == ["NOTES", "PYQ"]


@pytest.mark.django_db
def test_chapter_contents_reports_server_side_access(client, student, class_10, published_pdf):
    client.force_login(student)
    body = client.get(f"/api/v1/chapters/{published_pdf.chapter.slug}/contents/").json()

    assert body["has_access"] is False
    assert body["count"] == 1
    assert body["results"][0]["is_locked"] is True
