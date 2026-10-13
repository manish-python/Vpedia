"""Payment verification services.

This module is the single implementation of the approval workflow. Django
Admin, REST APIs and any future management command call these functions
rather than mutating rows themselves, so the business rules cannot drift
between surfaces.

Guarantees
----------
* Approval and rejection run inside `transaction.atomic()` with a row lock.
* A proof can only be reviewed once; double approval raises.
* The proof's amount must match the purchase amount.
* Only an active staff member may review.
* Nothing here marks a purchase ACTIVE as a side effect of uploading a
  screenshot or of building a UPI link.
"""

from __future__ import annotations

from decimal import Decimal
from urllib.parse import quote

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.core.exceptions import (
    AmountMismatch,
    InvalidPaymentState,
    PurchaseConflict,
    ServiceError,
)
from apps.core.models import validate_image_upload
from apps.payments.serializers import UPI_QR_PATH
from apps.purchases.models import ClassPurchase, PurchaseStatus

from .models import PaymentProof, PaymentStatus, UPISettings


# ---------------------------------------------------------------------------
# Guards
# ---------------------------------------------------------------------------


def _require_reviewer(admin_user) -> None:
    """Only an active staff member may review a payment."""
    if admin_user is None or not getattr(admin_user, "is_authenticated", False):
        raise ServiceError("Authentication is required to review a payment.")
    if not getattr(admin_user, "is_staff", False) or not getattr(admin_user, "is_active", False):
        raise ServiceError("Only an administrator can review a payment.")


def _money(value) -> Decimal:
    return Decimal(value).quantize(Decimal("0.01"))


# ---------------------------------------------------------------------------
# Submission
# ---------------------------------------------------------------------------


def submit_payment_proof(
    *,
    user,
    class_purchase: ClassPurchase,
    utr: str,
    screenshot,
    transaction_id: str = "",
    admin_note: str = "",
) -> PaymentProof:
    """Record a student's payment evidence as PENDING.

    Creating a proof never activates the purchase: access stays locked until
    `approve_payment` runs.

    The class and amount are derived from the purchase. Nothing about the
    amount is taken from the request.
    """
    if user is None or not getattr(user, "is_authenticated", False):
        raise ServiceError("You must be signed in to submit payment proof.")

    if class_purchase.user_id != user.pk:
        # A student may only submit proof against their own purchase.
        raise PurchaseConflict("You can only submit proof for your own purchase.")

    if not class_purchase.is_actionable:
        raise PurchaseConflict(
            "This purchase is not awaiting payment."
            if class_purchase.is_active
            else "This purchase can no longer accept payment proof."
        )

    utr = (utr or "").strip()
    if not utr:
        raise ServiceError("A UTR / transaction reference is required.")
    if len(utr) > 64:
        raise ServiceError("The UTR is too long.")

    if screenshot is None:
        raise ServiceError("A payment screenshot is required.")

    # Field validators only run through `full_clean()`, which `create()` does
    # not call. The upload is decoded here so a non-image or oversized file is
    # refused at the service boundary, not just in the admin form.
    try:
        validate_image_upload(screenshot)
    except ValidationError as exc:
        raise ServiceError("; ".join(exc.messages)) from exc

    proof = PaymentProof.objects.create(
        user=user,
        class_purchase=class_purchase,
        amount=class_purchase.amount,  # server-side amount, never the request
        currency=class_purchase.currency,
        utr=utr,
        transaction_id=(transaction_id or "").strip(),
        screenshot=screenshot,
        status=PaymentStatus.PENDING,
        admin_note=admin_note,
    )

    # Operational feed only. This does not touch the purchase status: a proof
    # remains PENDING until a staff member reviews it.
    from apps.admin_api.notifications import payment_requested

    payment_requested(proof=proof)

    return proof


# ---------------------------------------------------------------------------
# Review
# ---------------------------------------------------------------------------


@transaction.atomic
def approve_payment(payment_proof: PaymentProof, admin_user) -> PaymentProof:
    """Approve a payment and activate the corresponding class access.

    Steps, in order, inside one transaction:
      1. Require a staff reviewer.
      2. Lock the proof row (`select_for_update`).
      3. Confirm the proof is still PENDING.
      4. Load and lock the related purchase.
      5. Confirm the purchase belongs to the same student.
      6. Confirm the proof amount matches the purchase amount.
      7. Mark the proof APPROVED with reviewer and timestamp.
      8. Mark the purchase ACTIVE with `activated_at`.
      9. Save both.

    Any failure raises and rolls the whole transaction back.
    """
    _require_reviewer(admin_user)

    # Re-read under a row lock so two administrators cannot both approve.
    locked_proof = (
        PaymentProof.objects.select_for_update()
        .select_related("class_purchase", "user")
        .get(pk=payment_proof.pk)
    )

    if locked_proof.status != PaymentStatus.PENDING:
        raise InvalidPaymentState(
            f"This payment has already been {locked_proof.status.lower()}."
        )

    purchase = (
        ClassPurchase.objects.select_for_update()
        .select_related("class_level")
        .get(pk=locked_proof.class_purchase_id)
    )

    if purchase.user_id != locked_proof.user_id:
        raise ServiceError("The purchase does not belong to the submitting student.")

    if _money(locked_proof.amount) != _money(purchase.amount):
        raise AmountMismatch(
            "The submitted amount does not match the amount due for this class."
        )

    now = timezone.now()

    locked_proof.status = PaymentStatus.APPROVED
    locked_proof.reviewed_by = admin_user
    locked_proof.reviewed_at = now
    locked_proof.rejection_reason = ""
    locked_proof.save(
        update_fields=["status", "reviewed_by", "reviewed_at", "rejection_reason", "updated_at"]
    )

    purchase.grant_access(reviewer=admin_user)
    purchase.save(
        update_fields=[
            "status",
            "activated_at",
            "approved_by",
            "approved_at",
            "updated_at",
        ]
    )

    from apps.admin_api.notifications import payment_approved

    payment_approved(proof=locked_proof)

    locked_proof.refresh_from_db()
    return locked_proof


@transaction.atomic
def reject_payment(payment_proof: PaymentProof, admin_user, reason: str) -> PaymentProof:
    """Reject a payment, keeping the purchase locked.

    A rejected purchase is recorded as REJECTED so the audit trail is
    complete; access remains unavailable. The student may submit a fresh
    request afterwards, because REJECTED rows do not block a new purchase.
    """
    _require_reviewer(admin_user)

    reason = (reason or "").strip()
    if not reason:
        raise ServiceError("A rejection reason is required.")

    locked_proof = (
        PaymentProof.objects.select_for_update()
        .select_related("class_purchase", "user")
        .get(pk=payment_proof.pk)
    )

    if locked_proof.status != PaymentStatus.PENDING:
        raise InvalidPaymentState(
            f"This payment has already been {locked_proof.status.lower()}."
        )

    purchase = (
        ClassPurchase.objects.select_for_update().get(pk=locked_proof.class_purchase_id)
    )

    if purchase.user_id != locked_proof.user_id:
        raise ServiceError("The purchase does not belong to the submitting student.")

    now = timezone.now()

    locked_proof.status = PaymentStatus.REJECTED
    locked_proof.reviewed_by = admin_user
    locked_proof.reviewed_at = now
    locked_proof.rejection_reason = reason
    locked_proof.save(
        update_fields=["status", "reviewed_by", "reviewed_at", "rejection_reason", "updated_at"]
    )

    purchase.status = PurchaseStatus.REJECTED
    purchase.activated_at = None
    purchase.approved_by = admin_user
    purchase.approved_at = now
    purchase.save(
        update_fields=["status", "activated_at", "approved_by", "approved_at", "updated_at"]
    )

    from apps.admin_api.notifications import payment_rejected

    payment_rejected(proof=locked_proof)

    locked_proof.refresh_from_db()
    return locked_proof


@transaction.atomic
def add_admin_note(payment_proof: PaymentProof, admin_user, note: str) -> PaymentProof:
    """Attach an internal note without changing the payment status."""
    _require_reviewer(admin_user)

    locked = PaymentProof.objects.select_for_update().get(pk=payment_proof.pk)
    locked.admin_note = (note or "").strip()
    locked.save(update_fields=["admin_note", "updated_at"])
    return locked


# ---------------------------------------------------------------------------
# UPI payment URI
# ---------------------------------------------------------------------------


def build_upi_uri(
    *,
    upi_id: str,
    payee_name: str,
    amount,
    reference: str,
    currency: str = "INR",
    note: str = "",
) -> str:
    """Build a standard `upi://pay` URI.

    This is the vendor-neutral form any UPI application understands. No
    provider-specific deep links are used.

    Building a link is not a payment. It only hands the student a convenient
    way to open their own UPI application; the transfer still has to be
    verified by an administrator.
    """
    if not upi_id:
        raise ServiceError("No UPI ID is configured yet.")

    amount_value = _money(amount)
    if amount_value <= 0:
        raise ServiceError("The amount to pay must be greater than zero.")

    params = [
        f"pa={quote(upi_id, safe='')}",
        f"pn={quote(payee_name or 'VPEDIA LEARNING', safe='')}",
        f"am={amount_value}",
        f"cu={quote(currency or 'INR', safe='')}",
        f"tn={quote(reference or '', safe='')}",
    ]
    if note:
        params.append(f"tn_note={quote(note, safe='')}")

    return "upi://pay?" + "&".join(params)


def get_upi_payment_context(class_purchase: ClassPurchase) -> dict:
    """Everything the frontend needs to render the payment step.

    Returns the UPI ID, payee name, the server-side amount, a payment
    reference and a ready-made `upi://pay` URI.
    """
    settings_row = UPISettings.load()
    if settings_row is None:
        raise ServiceError("Payments are not available at the moment. Please try again later.")

    reference = f"VP{class_purchase.pk:06d}"
    uri = build_upi_uri(
        upi_id=settings_row.upi_id,
        payee_name=settings_row.display_name,
        amount=class_purchase.amount,
        reference=reference,
        currency=class_purchase.currency,
        note=f"{class_purchase.class_level.name} access",
    )

    return {
        "reference": reference,
        "upi_id": settings_row.upi_id,
        "display_name": settings_row.display_name,
        # Public QR route, so a student can actually see what they are paying
        # with. See `apps.payments.views.UPISettingsView.qr`.
        "qr_code": UPI_QR_PATH if settings_row.qr_code else None,
        "instructions": settings_row.instructions,
        "amount": str(_money(class_purchase.amount)),
        "currency": class_purchase.currency,
        "class_name": class_purchase.class_level.name,
        "upi_uri": uri,
    }
