"""A class can hold more than one purchase, so "the newest purchase" is not an answer.

The bug this pins
-----------------
`create_purchase_request` refuses a new purchase only while one is PENDING or
ACTIVE (`BLOCKING_STATUSES`). A REJECTED or CANCELLED purchase therefore does not
stop the student buying again — `reject_payment`'s own docstring says so — so a
class accumulates rows:

    purchase 30  REJECTED   proof 10  REJECTED  "UTR does not match"
    purchase 31  PENDING    (no proof)            <- newest

`GET /purchases/my/` returns `-created_at`, so purchase 31 came back first. The
dashboard kept the first row per class and then looked up proofs for *that
purchase only* — and so reported:

    Payment not completed        Continue Payment

for a student who had submitted real evidence and been told why it was refused.
The rejection reason was sitting in the database the whole time, on a row the
client had stopped looking at.

What is pinned here is the data shape the client has to handle, and the ordering
rules it has to apply:

  * a rejected purchase does not block a new one, so multi-row classes are normal
    rather than an edge case;
  * the rejection reason stays readable on the proof for as long as the proof row
    exists, whichever purchase is newest;
  * an ACTIVE purchase wins outright — otherwise a stale rejection is reported
    against a class the student fully owns;
  * a submitted proof is not downgraded by anything the student's own UPI app does,
    because there is no gateway and no such event ever reaches us.

One deliberate non-change is pinned at the bottom: the backend still accepts a
second proof against a PENDING purchase. That is intentional, and the frontend
guard that stops it being *offered* is not backed by a server-side ban.
"""
import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

from apps.payments.models import PaymentStatus
from apps.payments.services import approve_payment, reject_payment, submit_payment_proof
from apps.purchases.models import ClassPurchase, PurchaseStatus
from apps.purchases.services import (
    PurchaseConflict,
    create_purchase_request,
    has_class_access,
)

pytestmark = pytest.mark.django_db


def receipt(utr):
    """A real decodable PNG, because the server refuses anything Pillow cannot open."""
    buffer = io.BytesIO()
    Image.new("RGB", (40, 80), (10, 120, 80)).save(buffer, "PNG")
    return SimpleUploadedFile(f"{utr}.png", buffer.getvalue(), content_type="image/png")


def pay(user, purchase, utr="UTR-FIRST"):
    return submit_payment_proof(
        user=user, class_purchase=purchase, utr=utr, screenshot=receipt(utr)
    )


# ---------------------------------------------------------------------------
# The shape: rejected, then a fresh purchase for the same class
# ---------------------------------------------------------------------------


def test_a_rejected_purchase_does_not_block_a_new_one(student, class_8, admin_user):
    """Why a class ends up with two rows, and the client must cope."""
    first = create_purchase_request(user=student, class_level=class_8)
    pay(student, first)
    reject_payment(
        payment_proof=first.payment_proofs.latest("id"),
        admin_user=admin_user,
        reason="UTR does not match the receipt",
    )
    first.refresh_from_db()
    assert first.status == PurchaseStatus.REJECTED

    # The class is still locked, and buying again is allowed.
    assert has_class_access(student, class_8) is False
    second = create_purchase_request(user=student, class_level=class_8)

    assert second.pk != first.pk
    assert second.status == PurchaseStatus.PENDING
    assert ClassPurchase.objects.filter(user=student, class_level=class_8).count() == 2


def test_a_pending_purchase_does_block_a_second_one(student, class_8):
    """So two *open* rows can never coexist — only a closed one plus a new one.

    This is what makes the priority list unambiguous: the newest row for a class is
    always either the only row or the only open one.
    """
    create_purchase_request(user=student, class_level=class_8)
    with pytest.raises(PurchaseConflict):
        create_purchase_request(user=student, class_level=class_8)


# ---------------------------------------------------------------------------
# Both feeds together are enough for the client to get this right
# ---------------------------------------------------------------------------


def test_the_two_feeds_reveal_the_rejection_behind_a_newer_checkout(
    client, student, class_8, admin_user
):
    """The exact shape the dashboard used to misreport."""
    first = create_purchase_request(user=student, class_level=class_8)
    pay(student, first)
    reject_payment(
        payment_proof=first.payment_proofs.latest("id"),
        admin_user=admin_user,
        reason="UTR does not match the receipt",
    )
    create_purchase_request(user=student, class_level=class_8)

    client.force_login(student)

    purchases = client.get("/api/v1/purchases/my/").json()
    proofs = client.get("/api/v1/payments/proofs/").json()

    # Newest first, and the newest row is the empty checkout.
    assert [row["status"] for row in purchases] == ["PENDING", "REJECTED"]
    assert purchases[0]["id"] == ClassPurchase.objects.filter(user=student).latest("id").pk

    # The evidence for the *older* purchase is still returned, with its reason.
    assert len(proofs) == 1
    assert proofs[0]["class_purchase"] == purchases[1]["id"]
    assert proofs[0]["status"] == "REJECTED"
    assert proofs[0]["rejection_reason"] == "UTR does not match the receipt"

    # Nothing about the newer purchase claims to be under review. This is the
    # distinction the client must make rather than reading `purchase.status`.
    assert purchases[0]["id"] not in {row["class_purchase"] for row in proofs}

    # And the class is still locked, which is the part that must never drift.
    assert has_class_access(student, class_8) is False


# ---------------------------------------------------------------------------
# ACTIVE outranks everything, or a stale rejection gets reported as current
# ---------------------------------------------------------------------------


def test_a_stale_rejection_cannot_outrank_an_active_purchase(
    client, student, class_8, admin_user
):
    """The ordering rule that is easiest to get backwards.

    After a rejection and a successful retry a class holds:

        purchase 30  REJECTED   proof 10  REJECTED  "wrong UTR"
        purchase 31  ACTIVE     proof 11  APPROVED

    The class is open — but the proofs feed still contains a REJECTED proof, and a
    client that reads proofs before purchases will tell a student with full access
    that their payment was rejected. The resolver's first rule is what prevents
    that.
    """
    rejected = create_purchase_request(user=student, class_level=class_8)
    pay(student, rejected, "UTR-WRONG")
    reject_payment(
        payment_proof=rejected.payment_proofs.latest("id"),
        admin_user=admin_user,
        reason="UTR does not match the receipt",
    )

    retry = create_purchase_request(user=student, class_level=class_8)
    pay(student, retry, "UTR-RIGHT")
    approve_payment(payment_proof=retry.payment_proofs.latest("id"), admin_user=admin_user)

    client.force_login(student)
    purchases = client.get("/api/v1/purchases/my/").json()
    proofs = client.get("/api/v1/payments/proofs/").json()

    # Both purchases exist, newest first, and the newest is the one that opened.
    assert [row["status"] for row in purchases] == ["ACTIVE", "REJECTED"]
    assert purchases[0]["id"] == retry.pk

    # The rejected proof is still in the feed, reason intact.
    assert [row["status"] for row in proofs] == ["APPROVED", "REJECTED"]
    assert proofs[1]["rejection_reason"] == "UTR does not match the receipt"

    # The server's own answer, which is the one that matters.
    rejected.refresh_from_db()
    retry.refresh_from_db()
    assert retry.status == PurchaseStatus.ACTIVE
    assert rejected.status == PurchaseStatus.REJECTED
    assert has_class_access(student, class_8) is True


def test_only_one_purchase_per_class_is_ever_active(student, class_8, admin_user):
    """The invariant that makes the rule above unambiguous.

    `ACTIVE` is in `BLOCKING_STATUSES`, so no second checkout can be opened once
    the first is approved. There is never a tie to break between two open rows for
    one class.
    """
    purchase = create_purchase_request(user=student, class_level=class_8)
    pay(student, purchase, "UTR-ONE")
    approve_payment(payment_proof=purchase.payment_proofs.latest("id"), admin_user=admin_user)

    assert (
        ClassPurchase.objects.filter(
            user=student, class_level=class_8, status=PurchaseStatus.ACTIVE
        ).count()
        == 1
    )
    assert purchase.payment_proofs.latest("id").status == PaymentStatus.APPROVED
    assert has_class_access(student, class_8) is True


# ---------------------------------------------------------------------------
# A submitted proof is never downgraded by a cancelled UPI attempt
# ---------------------------------------------------------------------------


def test_a_pending_proof_survives_the_student_reopening_checkout(client, student, class_8):
    """There is no gateway, so nothing the student's own app does can reach us.

    The only consequence of coming back from a cancelled UPI screen is that they
    re-request the purchase, which conflicts precisely because a PENDING purchase
    still blocks. The proof is left exactly as it was submitted.
    """
    purchase = create_purchase_request(user=student, class_level=class_8)
    pay(student, purchase, utr="UTR-KEEP")

    with pytest.raises(PurchaseConflict):
        create_purchase_request(user=student, class_level=class_8)

    purchase.refresh_from_db()
    proof = purchase.payment_proofs.latest("id")

    assert purchase.status == PurchaseStatus.PENDING
    assert proof.status == PaymentStatus.PENDING
    assert proof.utr == "UTR-KEEP"
    assert has_class_access(student, class_8) is False

    client.force_login(student)
    rows = client.get("/api/v1/payments/proofs/").json()
    assert [(row["status"], row["utr"]) for row in rows] == [("PENDING", "UTR-KEEP")]


# ---------------------------------------------------------------------------
# Deliberate non-change: the server still permits a resubmission
# ---------------------------------------------------------------------------


def test_a_second_proof_on_a_pending_purchase_is_still_accepted(student, class_8):
    """The UI stops *offering* a duplicate; the API does not refuse one.

    A student who uploaded an unreadable screenshot must be able to send a better
    one without waiting for an administrator, so `submit_payment_proof` keeps
    accepting it. Pinned so the frontend guard is not later mistaken for a
    server-side rule that does not exist — and so the client keeps treating the
    *newest* proof as the current one.
    """
    purchase = create_purchase_request(user=student, class_level=class_8)
    pay(student, purchase, utr="UTR-BLURRY")
    pay(student, purchase, utr="UTR-CLEARER")

    assert purchase.payment_proofs.count() == 2
    # A proof is still only evidence; it grants nothing on its own.
    assert purchase.status == PurchaseStatus.PENDING
    assert has_class_access(student, class_8) is False
