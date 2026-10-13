"""Payment proof submission and review.

Covers required tests 5, 6, 14, 15, 16, 17, 18, 19 and 20.
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from django.utils import timezone

from apps.core.exceptions import InvalidPaymentState, ServiceError
from apps.payments.models import PaymentProof, PaymentStatus
from apps.payments.services import approve_payment, reject_payment, submit_payment_proof
from apps.purchases.models import PurchaseStatus


# The `proof` and `other_staff` fixtures live in conftest.py so that other
# test modules can use them too.


# --- 5 & 6. Submission, and PENDING is the only status -------------------


@pytest.mark.django_db
def test_payment_proof_can_be_submitted(proof, pending_purchase):
    assert proof.pk is not None
    assert proof.utr == "UTR123456789"
    assert proof.class_purchase_id == pending_purchase.pk
    assert proof.user_id == pending_purchase.user_id
    assert proof.screenshot


@pytest.mark.django_db
def test_new_payment_proof_starts_pending(proof):
    assert proof.status == PaymentStatus.PENDING
    assert proof.reviewed_at is None
    assert proof.reviewed_by is None
    assert proof.rejection_reason == ""


@pytest.mark.django_db
def test_submission_does_not_unlock_the_class(proof, student, class_10):
    """RULE 1: uploading a screenshot must not grant access."""
    from apps.purchases.services import has_class_access

    proof.refresh_from_db()
    pending_purchase_status = proof.class_purchase.status

    assert pending_purchase_status == PurchaseStatus.PENDING
    assert not has_class_access(student, class_10)


@pytest.mark.django_db
def test_proof_amount_is_taken_from_the_purchase(proof, pending_purchase):
    assert proof.amount == pending_purchase.amount == Decimal("199.00")


@pytest.mark.django_db
def test_utr_is_required(student, pending_purchase, png_upload):
    with pytest.raises(ServiceError):
        submit_payment_proof(
            user=student,
            class_purchase=pending_purchase,
            utr="   ",
            screenshot=png_upload,
        )


@pytest.mark.django_db
def test_screenshot_is_required(student, pending_purchase):
    with pytest.raises(ServiceError):
        submit_payment_proof(
            user=student, class_purchase=pending_purchase, utr="UTR1", screenshot=None
        )


@pytest.mark.django_db
def test_student_cannot_submit_for_another_students_purchase(
    other_student, pending_purchase, png_upload
):
    with pytest.raises(ServiceError):
        submit_payment_proof(
            user=other_student,
            class_purchase=pending_purchase,
            utr="UTR-HACK",
            screenshot=png_upload,
        )


@pytest.mark.django_db
def test_non_image_upload_is_rejected(student, pending_purchase, not_an_image_upload):
    """A file that is not a real image is refused, whatever it claims to be."""
    with pytest.raises(ServiceError):
        submit_payment_proof(
            user=student,
            class_purchase=pending_purchase,
            utr="UTR-FAKE",
            screenshot=not_an_image_upload,
        )

    assert not PaymentProof.objects.filter(utr="UTR-FAKE").exists()


@pytest.mark.django_db
def test_duplicate_utr_is_rejected(proof, pending_purchase, student, png_upload):
    from django.db import IntegrityError

    with pytest.raises(IntegrityError):
        submit_payment_proof(
            user=student,
            class_purchase=pending_purchase,
            utr=proof.utr,
            screenshot=png_upload,
        )


# --- 14, 16, 17, 18. Admin approval --------------------------------------


@pytest.mark.django_db
def test_admin_can_approve_payment(proof, admin_user):
    approved = approve_payment(proof, admin_user)

    assert approved.status == PaymentStatus.APPROVED


@pytest.mark.django_db
def test_approval_activates_the_purchase(proof, admin_user):
    approve_payment(proof, admin_user)

    proof.class_purchase.refresh_from_db()
    assert proof.class_purchase.status == PurchaseStatus.ACTIVE
    assert proof.class_purchase.activated_at is not None


@pytest.mark.django_db
def test_approval_stores_reviewer_and_timestamp(proof, admin_user):
    approved = approve_payment(proof, admin_user)

    assert approved.reviewed_by_id == admin_user.pk
    assert approved.reviewed_at is not None
    assert approved.reviewed_at <= timezone.now()


@pytest.mark.django_db
def test_approval_records_reviewer_on_the_purchase(proof, admin_user):
    approve_payment(proof, admin_user)

    proof.class_purchase.refresh_from_db()
    assert proof.class_purchase.approved_by_id == admin_user.pk
    assert proof.class_purchase.approved_at is not None


# --- 15. Rejection --------------------------------------------------------


@pytest.mark.django_db
def test_admin_can_reject_payment(proof, admin_user):
    rejected = reject_payment(proof, admin_user, "Amount did not match.")

    assert rejected.status == PaymentStatus.REJECTED
    assert rejected.rejection_reason == "Amount did not match."


@pytest.mark.django_db
def test_rejection_requires_a_reason(proof, admin_user):
    with pytest.raises(ServiceError):
        reject_payment(proof, admin_user, "   ")


@pytest.mark.django_db
def test_rejection_keeps_the_class_locked(proof, admin_user, student, class_10):
    from apps.purchases.services import has_class_access

    reject_payment(proof, admin_user, "Screenshot unclear.")

    proof.class_purchase.refresh_from_db()
    assert proof.class_purchase.status == PurchaseStatus.REJECTED
    assert proof.class_purchase.activated_at is None
    assert not has_class_access(student, class_10)


# --- 20. Atomicity and double review -------------------------------------


@pytest.mark.django_db
def test_double_approval_is_refused(proof, admin_user, other_staff):
    approve_payment(proof, admin_user)

    with pytest.raises(InvalidPaymentState):
        approve_payment(proof, other_staff)


@pytest.mark.django_db
def test_rejection_after_approval_is_refused(proof, admin_user):
    approve_payment(proof, admin_user)

    with pytest.raises(InvalidPaymentState):
        reject_payment(proof, admin_user, "Too late.")


@pytest.mark.django_db
def test_approval_rolls_back_when_the_amount_does_not_match(proof, admin_user):
    """RULE: the whole transaction must fail, leaving both rows untouched."""
    from apps.core.exceptions import AmountMismatch

    PaymentProof.objects.filter(pk=proof.pk).update(amount=Decimal("1.00"))

    with pytest.raises(AmountMismatch):
        approve_payment(proof, admin_user)

    proof.refresh_from_db()
    proof.class_purchase.refresh_from_db()

    assert proof.status == PaymentStatus.PENDING
    assert proof.reviewed_by_id is None
    assert proof.class_purchase.status == PurchaseStatus.PENDING
    assert proof.class_purchase.activated_at is None


@pytest.mark.django_db
def test_non_staff_cannot_approve(proof, student):
    """RULE 10: a student can never approve, including their own payment."""
    with pytest.raises(ServiceError):
        approve_payment(proof, student)

    proof.refresh_from_db()
    proof.class_purchase.refresh_from_db()
    assert proof.status == PaymentStatus.PENDING
    assert proof.class_purchase.status == PurchaseStatus.PENDING


@pytest.mark.django_db
def test_inactive_staff_cannot_approve(proof, admin_user):
    admin_user.is_active = False
    admin_user.save(update_fields=["is_active", "updated_at"])

    with pytest.raises(ServiceError):
        approve_payment(proof, admin_user)


@pytest.fixture
def other_staff(db):
    from apps.accounts.models import User

    return User.objects.create_staff(
        email="reviewer@vpedialearning.com",
        password="reviewer-pass-123",
        first_name="Second",
        last_name="Reviewer",
    )

