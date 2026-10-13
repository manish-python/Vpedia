"""Student onboarding, purchase status and access gating.

Three of the reported problems turned out to be frontend-only. The backend was
already correct on every one of them, and this file pins that so the guarantee
is explicit rather than assumed:

* a brand-new Google user has `selected_class = NULL`
* selecting a class grants nothing
* only an ACTIVE purchase grants access, and only to that one class

It also pins two genuine backend-side facts the frontend depends on: the UPI
context exposes `qr_code` (not `qr_code_url`), and the student-facing proof
serializer exposes the status and rejection reason the payment status page
reads.
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.academics.models import ClassLevel
from apps.accounts.models import User
from apps.accounts.services import ensure_profile
from apps.admin_api.models import AdminNotification
from apps.content.models import Content
from apps.payments.models import PaymentStatus, PaymentProof, UPISettings
from apps.purchases.models import ClassPurchase, PurchaseStatus
from apps.purchases.services import has_class_access

from tests.conftest import finish_oauth, google_claims, start_oauth


def png_upload(name: str = "receipt.png") -> SimpleUploadedFile:
    """A real PNG, so Pillow can decode it exactly as it would a real upload."""
    import io

    from PIL import Image

    buffer = io.BytesIO()
    Image.new("RGB", (120, 240), (18, 110, 190)).save(buffer, format="PNG")
    return SimpleUploadedFile(name, buffer.getvalue(), content_type="image/png")


def pdf_bytes() -> bytes:
    return b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"


# ===========================================================================
# NEW USER HAS NO CLASS
# ===========================================================================


@pytest.mark.django_db
def test_new_google_user_has_no_selected_class(client, google_settings):
    """A first-time Google sign-in must not receive any class.

    `StudentProfile.selected_class` is nullable with no default; this proves the
    OAuth adapter leaves it that way rather than picking one.
    """
    state = start_oauth(client)
    finish_oauth(client, state, google_claims(email="brand.new@example.com"))

    user = User.objects.get(email="brand.new@example.com")
    profile = user.profile

    assert profile.selected_class is None
    assert profile.selected_stream is None
    # Crucially not Class 7, and not any class at all.
    assert profile.selected_class_id is None


@pytest.mark.django_db
def test_profile_api_reports_null_for_a_new_user(client, google_settings):
    """The API must say "no class", not omit the field or invent one."""
    state = start_oauth(client)
    finish_oauth(client, state, google_claims(email="null.profile@example.com"))

    response = client.get("/api/v1/profile/me/")
    assert response.status_code == 200

    profile = response.json()["profile"]
    assert profile["selected_class"] is None
    assert profile["selected_class_number"] is None
    assert profile["selected_class_name"] is None
    assert profile["selected_stream"] is None
    assert profile["class_requires_stream"] is False


@pytest.mark.django_db
def test_profile_api_never_defaults_to_class_7(client, student):
    """No fallback path in the profile response may produce Class 7."""
    ensure_profile(student)  # selected_class stays NULL
    client.force_login(student)

    profile = client.get("/api/v1/profile/me/").json()["profile"]

    assert profile["selected_class_number"] != 7
    assert profile["selected_class_number"] is None

    # The session payload must not smuggle a class in either.
    me = client.get("/api/v1/auth/me/").json()
    assert me["profile"]["selected_class_number"] is None
    assert me["user"].get("current_class") in (None, "")


# ===========================================================================
# CLASS SELECTION
# ===========================================================================


@pytest.mark.django_db
def test_student_can_select_a_class(client, student, class_8):
    """`selected_class` is a ClassLevel primary key, not the class number.

    This is the contract the frontend must satisfy: sending the *number* 8
    would address a different row, or no row at all.
    """
    ensure_profile(student)
    client.force_login(student)

    response = client.patch(
        "/api/v1/profile/me/",
        {"selected_class": class_8.pk},
        content_type="application/json",
    )
    assert response.status_code == 200, response.content

    profile = ensure_profile(student)
    profile.refresh_from_db()
    assert profile.selected_class_id == class_8.pk


@pytest.mark.django_db
def test_selected_class_number_and_name_are_derived(
    client, student, class_8
):
    ensure_profile(student)
    client.force_login(student)

    client.patch(
        "/api/v1/profile/me/",
        {"selected_class": class_8.pk},
        content_type="application/json",
    )

    profile = client.get("/api/v1/profile/me/").json()["profile"]
    assert profile["selected_class_number"] == 8
    assert profile["selected_class_name"] == "Class 8"
    assert profile["class_requires_stream"] is False


@pytest.mark.django_db
def test_selection_persists_across_a_re_read(client, student, class_10):
    """The value lives in the database, not in the session or the browser."""
    ensure_profile(student)
    client.force_login(student)
    client.patch(
        "/api/v1/profile/me/",
        {"selected_class": class_10.pk},
        content_type="application/json",
    )

    # A brand-new request with the same session reads the saved value back.
    profile = client.get("/api/v1/profile/me/").json()["profile"]
    assert profile["selected_class_number"] == 10

    profile_row = User.objects.get(pk=student.pk).profile
    profile_row.refresh_from_db()
    assert profile_row.selected_class_id == class_10.pk


@pytest.mark.django_db
def test_invalid_class_is_rejected(client, student):
    ensure_profile(student)
    client.force_login(student)

    response = client.patch(
        "/api/v1/profile/me/",
        {"selected_class": 999999},
        content_type="application/json",
    )
    assert response.status_code == 400
    assert "selected_class" in response.json()


@pytest.mark.django_db
def test_selecting_a_class_creates_no_purchase(client, student, class_8):
    """Selection is a preference. It must never open a purchase."""
    ensure_profile(student)
    client.force_login(student)

    before = ClassPurchase.objects.filter(user=student).count()

    client.patch(
        "/api/v1/profile/me/",
        {"selected_class": class_8.pk},
        content_type="application/json",
    )

    assert ClassPurchase.objects.filter(user=student).count() == before
    assert has_class_access(student, class_8) is False


@pytest.mark.django_db
def test_class_11_requires_a_stream_and_7_to_10_reject_one(
    client, student, class_10, class_11, science_stream
):
    ensure_profile(student)
    client.force_login(student)

    # 11/12 without a stream is refused.
    missing = client.patch(
        "/api/v1/profile/me/",
        {"selected_class": class_11.pk},
        content_type="application/json",
    )
    assert missing.status_code == 400
    assert "selected_stream" in missing.json()

    # 7-10 must not carry one.
    wrong = client.patch(
        "/api/v1/profile/me/",
        {"selected_class": class_10.pk, "selected_stream": science_stream.pk},
        content_type="application/json",
    )
    assert wrong.status_code == 400

    # 11 + Science is accepted.
    ok = client.patch(
        "/api/v1/profile/me/",
        {"selected_class": class_11.pk, "selected_stream": science_stream.pk},
        content_type="application/json",
    )
    assert ok.status_code == 200, ok.content

    profile = ensure_profile(student)
    profile.refresh_from_db()
    assert profile.selected_stream_id == science_stream.pk


# ===========================================================================
# UPI CONTEXT
# ===========================================================================


@pytest.mark.django_db
def test_upi_context_exposes_the_underlined_qr_key(
    client, student, pending_purchase, upi_settings
):
    """`GET /purchases/{id}/upi/` sends `qr_code`, NOT `qr_code_url`.

    The two UPI endpoints spell the field differently. The frontend mapper
    originally read only `qr_code_url`, so a configured QR silently never
    rendered on the payment page.
    """
    client.force_login(student)
    response = client.get(f"/api/v1/purchases/{pending_purchase.pk}/upi/")

    assert response.status_code == 200
    body = response.json()
    assert body["upi_id"] == upi_settings.upi_id
    assert body["display_name"] == upi_settings.display_name
    assert body["instructions"] == upi_settings.instructions
    assert "qr_code" in body, "purchase UPI context must carry `qr_code`"
    assert body["reference"]
    assert body["amount"]
    assert Decimal(body["amount"]) == pending_purchase.amount


@pytest.mark.django_db
def test_configured_qr_resolves_to_a_url(client, student, pending_purchase, upi_settings):
    """With a QR uploaded, `qr_code` is a real URL — not null, not empty."""
    from PIL import Image
    import io

    buffer = io.BytesIO()
    Image.new("RGB", (32, 32), (10, 10, 10)).save(buffer, format="PNG")
    upi_settings.qr_code = SimpleUploadedFile(
        "qr.png", buffer.getvalue(), content_type="image/png"
    )
    upi_settings.save()

    client.force_login(student)
    body = client.get(f"/api/v1/purchases/{pending_purchase.pk}/upi/").json()
    assert body["qr_code"]


@pytest.mark.django_db
def test_qr_endpoint_serves_the_image(client, student, pending_purchase, upi_settings):
    client.force_login(student)
    upi_settings.qr_code = SimpleUploadedFile(
        "qr.png", b"\x89PNG\r\n\x1a\n" + b"0" * 40, content_type="image/png"
    )
    upi_settings.save()

    response = client.get("/api/v1/payments/upi/qr/")
    assert response.status_code == 200
    assert response["Content-Type"].startswith("image/")


@pytest.mark.django_db
def test_missing_qr_yields_a_null_url_not_a_broken_one(
    client, student, pending_purchase, upi_settings
):
    """No QR configured -> `qr_code` is null, so the UI can say so."""
    UPISettings.objects.all().update(qr_code=None)
    client.force_login(student)

    body = client.get(f"/api/v1/purchases/{pending_purchase.pk}/upi/").json()
    assert body["qr_code"] is None
    assert body["upi_id"]  # the ID is still available


@pytest.mark.django_db
def test_student_cannot_read_another_students_upi_context(
    client, student, other_student, class_8
):
    """Ownership is enforced: a foreign purchase id is not readable."""
    foreign = ClassPurchase.objects.create(
        user=other_student, class_level=class_8, amount=class_8.price,
        status=PurchaseStatus.PENDING,
    )
    client.force_login(student)
    # 404 (not found) or 403 (not yours) - both refuse the read, and neither
    # leaks that the purchase exists.
    assert client.get(f"/api/v1/purchases/{foreign.pk}/upi/").status_code in (403, 404)


# ===========================================================================
# PURCHASE / PROOF STATE MACHINE
# ===========================================================================


@pytest.mark.django_db
def test_submit_creates_pending_everywhere_and_grants_nothing(
    client, student, class_8
):
    """Submitted proof: PENDING proof, PENDING purchase, still no access."""
    from apps.payments.services import submit_payment_proof
    from apps.purchases.services import create_purchase_request

    purchase = create_purchase_request(user=student, class_level=class_8)
    proof = submit_payment_proof(
        user=student,
        class_purchase=purchase,
        utr="UTRSTATE1",
        screenshot=png_upload(),
    )

    purchase.refresh_from_db()
    assert proof.status == PaymentStatus.PENDING
    assert purchase.status == PurchaseStatus.PENDING
    assert has_class_access(student, class_8) is False


@pytest.mark.django_db
def test_approval_activates_the_purchase_and_grants_access(
    client, admin_user, student, proof, pending_purchase
):
    """The existing approval service is the only path to ACTIVE."""
    from apps.payments.services import approve_payment

    client.force_login(admin_user)
    assert has_class_access(student, pending_purchase.class_level) is False

    client.post(f"/api/v1/admin/payments/{proof.pk}/approve/")

    proof.refresh_from_db()
    pending_purchase.refresh_from_db()

    assert proof.status == PaymentStatus.APPROVED
    assert pending_purchase.status == PurchaseStatus.ACTIVE
    assert has_class_access(student, pending_purchase.class_level) is True


@pytest.mark.django_db
def test_rejection_leaves_the_class_locked_and_records_the_reason(
    client, admin_user, student, proof, pending_purchase
):
    """A rejected payment unlocks nothing and the reason is readable by the student."""
    from apps.payments.services import reject_payment

    admin = User.objects.get(email="admin@vpedialearning.com")
    reject_payment(proof, admin, "UTR does not match any transaction")

    proof.refresh_from_db()
    pending_purchase.refresh_from_db()

    assert proof.status == PaymentStatus.REJECTED
    assert proof.rejection_reason == "UTR does not match any transaction"
    assert pending_purchase.status == PurchaseStatus.REJECTED
    assert has_class_access(student, pending_purchase.class_level) is False

    # The student can read the reason on their own proof.
    client.force_login(student)
    body = client.get(f"/api/v1/payments/proofs/{proof.pk}/detail/").json()
    assert body["status"] == "REJECTED"
    assert body["rejection_reason"] == "UTR does not match any transaction"


@pytest.mark.django_db
def test_student_cannot_approve_their_own_payment(client, student, proof):
    """Approval is staff-only; the review endpoints must refuse a student."""
    client.force_login(student)
    assert client.post(f"/api/v1/payments/proofs/{proof.pk}/approve/").status_code in (403, 404)


@pytest.mark.django_db
def test_student_cannot_forge_a_status_by_sending_one(client, student, proof):
    """A status in the request body is ignored: the server derives it."""
    client.force_login(student)

    response = client.post(
        "/api/v1/payments/proofs/",
        {
            "class_purchase": proof.class_purchase_id,
            "utr": "UTRFORGED",
            "status": "APPROVED",
            "amount": "1.00",
        },
        content_type="application/json",
    )
    # Either refused outright, or stored as PENDING regardless. Never APPROVED.
    if response.status_code == 201:
        assert response.json()["status"] == "PENDING"
    else:
        assert response.status_code == 400


# ===========================================================================
# ACCESS IS SCOPED TO THE PURCHASED CLASS
# ===========================================================================


@pytest.mark.django_db
def test_one_active_purchase_does_not_unlock_other_classes(
    client, student, class_8, class_7, class_9
):
    """Class 8 active must leave Class 7 and Class 9 locked."""
    purchase = ClassPurchase.objects.create(
        user=student, class_level=class_8, amount=class_8.price,
        status=PurchaseStatus.ACTIVE,
    )
    assert purchase.status == PurchaseStatus.ACTIVE

    assert has_class_access(student, class_8) is True
    assert has_class_access(student, class_7) is False
    assert has_class_access(student, class_9) is False


@pytest.mark.django_db
def test_content_of_an_unpurchased_class_stays_locked(
    client, student, class_8, maths_chapter
):
    """A neighbouring class's document must still refuse."""
    # maths_chapter belongs to Class 10; buy Class 8 and prove 10 stays shut.
    ClassPurchase.objects.create(
        user=student, class_level=class_8, amount=class_8.price,
        status=PurchaseStatus.ACTIVE,
    )
    content = Content.objects.create(
        chapter=maths_chapter, title="Locked Notes", slug="locked-notes",
        content_type=Content.objects.model._meta.get_field("content_type").choices[0][0],
        file=SimpleUploadedFile("l.pdf", pdf_bytes(), content_type="application/pdf"),
        is_published=True,
    )

    client.force_login(student)
    response = client.get(f"/api/v1/contents/{content.slug}/document/")
    assert response.status_code == 403


@pytest.mark.django_db
def test_selecting_a_class_does_not_unlock_its_content(
    client, student, class_10, maths_chapter
):
    """Selection is a preference, and content must still refuse."""
    profile = ensure_profile(student)
    profile.selected_class = class_10
    profile.save()

    content = Content.objects.create(
        chapter=maths_chapter, title="Preference Notes", slug="preference-notes",
        content_type=Content.objects.model._meta.get_field("content_type").choices[0][0],
        file=SimpleUploadedFile("p.pdf", pdf_bytes(), content_type="application/pdf"),
        is_published=True,
    )

    client.force_login(student)
    assert has_class_access(student, class_10) is False
    assert client.get(f"/api/v1/contents/{content.slug}/document/").status_code == 403


# ===========================================================================
# DATA INTEGRITY
# ===========================================================================


@pytest.mark.django_db
def test_existing_legitimate_selections_are_untouched_by_new_users(
    client, google_settings, student, class_10
):
    """Adding a new user must not disturb anyone else's stored preference."""
    profile = ensure_profile(student)
    profile.selected_class = class_10
    profile.save()

    state = start_oauth(client)
    finish_oauth(client, state, google_claims(email="newcomer@example.com"))

    profile.refresh_from_db()
    assert profile.selected_class_id == class_10.pk, "an existing selection was changed"

    newcomer = User.objects.get(email="newcomer@example.com").profile
    assert newcomer.selected_class is None


@pytest.mark.django_db
def test_payment_approval_still_notifies_admins(client, admin_user, proof, pending_purchase):
    """The notification wiring from the admin stage survives this flow."""
    AdminNotification.objects.all().delete()
    client.force_login(admin_user)

    client.post(f"/api/v1/admin/payments/{proof.pk}/approve/")

    types = set(AdminNotification.objects.values_list("type", flat=True))
    assert "PAYMENT_APPROVED" in types


@pytest.mark.django_db
def test_student_proofs_list_is_scoped_to_the_student(client, student, proof, class_7):
    """A student only ever sees their own proofs."""
    other = User.objects.create_user(email="someone.else@example.com")
    other_proof = PaymentProof.objects.create(
        user=other,
        class_purchase=ClassPurchase.objects.create(
            user=other, class_level=class_7, amount=Decimal("99.00"),
            status=PurchaseStatus.PENDING,
        ),
        utr="UTROTHER",
        amount=Decimal("99.00"),
        status=PaymentStatus.PENDING,
    )

    client.force_login(student)
    rows = client.get("/api/v1/payments/proofs/").json()
    utrs = {row["utr"] for row in rows}

    assert proof.utr in utrs
    assert "UTROTHER" not in utrs
    assert client.get(f"/api/v1/payments/proofs/{other_proof.pk}/detail/").status_code in (403, 404)

# ===========================================================================
# A PENDING PURCHASE IS NOT A SUBMITTED PROOF
#
# The server creates a PENDING `ClassPurchase` when the payment page opens, so
# it can price the order and reserve a reference. A student who opens the page
# and backs away therefore has a PENDING purchase and no proof at all.
#
# The UI once reported that state as "your payment proof has been submitted and
# is waiting for administrator verification", which was false about the
# student's money. These tests pin the two facts the UI now reads separately.
# ===========================================================================


@pytest.mark.django_db
def test_opening_checkout_creates_a_pending_purchase_and_no_proof(
    client, student, class_8
):
    """The purchase exists before any money does."""
    from apps.purchases.services import create_purchase_request

    purchase = create_purchase_request(user=student, class_level=class_8)

    assert purchase.status == PurchaseStatus.PENDING
    assert PaymentProof.objects.filter(class_purchase=purchase).count() == 0
    # Still nothing to verify, and still no access.
    assert has_class_access(student, class_8) is False

    client.force_login(student)

    rows = client.get("/api/v1/purchases/my/").json()
    assert any(row["id"] == purchase.pk and row["status"] == "PENDING" for row in rows)

    # The proofs feed is empty, which is how the client tells the two apart.
    assert client.get("/api/v1/payments/proofs/").json() == []


@pytest.mark.django_db
def test_the_two_feeds_disagree_until_a_proof_exists(client, student, class_8):
    """Purchase PENDING + no proof row is the abandoned-checkout signature."""
    from apps.purchases.services import create_purchase_request

    purchase = create_purchase_request(user=student, class_level=class_8)
    client.force_login(student)

    purchase_rows = client.get("/api/v1/purchases/my/").json()
    proof_rows = client.get("/api/v1/payments/proofs/").json()

    pending_ids = {row["id"] for row in purchase_rows if row["status"] == "PENDING"}
    proof_purchase_ids = {row["class_purchase"] for row in proof_rows}

    assert purchase.pk in pending_ids
    assert purchase.pk not in proof_purchase_ids

    # Submitting a proof is what puts the purchase id into the proofs feed.
    from django.core.files.uploadedfile import SimpleUploadedFile
    from apps.payments.services import submit_payment_proof

    submit_payment_proof(
        user=student,
        class_purchase=purchase,
        utr="UTRSIGNATURE",
        screenshot=png_upload(),
    )

    proof_rows = client.get("/api/v1/payments/proofs/").json()
    assert purchase.pk in {row["class_purchase"] for row in proof_rows}
    assert all(row["status"] == "PENDING" for row in proof_rows)

    # And the purchase is STILL PENDING: submitting a proof does not approve it.
    purchase.refresh_from_db()
    assert purchase.status == PurchaseStatus.PENDING
    assert has_class_access(student, class_8) is False


@pytest.mark.django_db
def test_proof_list_carries_the_fields_the_status_page_reads(
    client, student, proof
):
    """The status page reads status, UTR, timestamps and the rejection reason."""
    client.force_login(student)

    row = client.get("/api/v1/payments/proofs/").json()[0]

    for field in (
        "id",
        "class_purchase",
        "class_name",
        "amount",
        "utr",
        "transaction_id",
        "status",
        "status_label",
        "submitted_at",
        "reviewed_at",
        "rejection_reason",
    ):
        assert field in row, f"status page needs `{field}`"

    assert row["status"] == "PENDING"
    assert row["utr"] == proof.utr
    assert row["reviewed_at"] is None
    # Private evidence: the screenshot is deliberately not exposed.
    assert "screenshot_url" not in row
