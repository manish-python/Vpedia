"""Purchase creation and class-access control.

`has_class_access` is the authoritative entitlement check. Every future API
view that returns protected material must call it (or the DRF permission
that wraps it) — never the frontend.
"""

from __future__ import annotations

from decimal import Decimal

from django.db import IntegrityError, transaction

from apps.academics.models import ClassLevel, Stream
from apps.accounts.models import User
from apps.core.exceptions import PurchaseConflict

from .models import BLOCKING_STATUSES, ClassPurchase, PurchaseStatus


# ---------------------------------------------------------------------------
# Access control
# ---------------------------------------------------------------------------


def has_class_access(user: User | None, class_level) -> bool:
    """Return True only for an active, authenticated user with an ACTIVE purchase.

    PENDING, REJECTED and CANCELLED purchases all return False, as does a
    user with no purchase at all. A deactivated account also loses access
    immediately, without needing to touch any purchase row.
    """
    if user is None or not getattr(user, "is_authenticated", False):
        return False
    if not getattr(user, "is_active", False):
        return False
    if class_level is None:
        return False

    # Accept either a model instance or a primary key.
    class_id = getattr(class_level, "pk", class_level)
    if not isinstance(class_id, int):
        return False

    return ClassPurchase.objects.filter(
        user=user,
        class_level_id=class_id,
        status=PurchaseStatus.ACTIVE,
    ).exists()


def get_active_purchase(user: User | None, class_level) -> ClassPurchase | None:
    """Return the ACTIVE purchase for this user and class, if any."""
    if user is None or not getattr(user, "is_authenticated", False):
        return None
    if not getattr(user, "is_active", False):
        return None
    class_id = getattr(class_level, "pk", class_level)
    if not isinstance(class_id, int):
        return None
    return (
        ClassPurchase.objects.select_related("class_level", "stream")
        .filter(user=user, class_level_id=class_id, status=PurchaseStatus.ACTIVE)
        .first()
    )


def get_unlocked_class_ids(user: User | None) -> set[int]:
    """Class ids the user may read. Used to annotate list endpoints."""
    return ClassPurchase.objects.unlocked_class_ids(user) if user else set()


def user_can_access_content(user: User | None, content) -> bool:
    """Entitlement check for a single `Content` row."""
    if user is None or not getattr(user, "is_authenticated", False):
        return False
    return has_class_access(user, content.class_level)


# ---------------------------------------------------------------------------
# Purchase creation
# ---------------------------------------------------------------------------


def _validate_class_is_purchasable(class_level: ClassLevel) -> None:
    if not class_level.is_active:
        raise PurchaseConflict(f"{class_level.name} is not currently available for purchase.")


def _validate_stream(class_level: ClassLevel, stream: Stream | None) -> None:
    """Classes 11 and 12 require a valid stream; 7-10 must not carry one."""
    if class_level.has_streams:
        if stream is None:
            raise PurchaseConflict(f"Please choose a stream for {class_level.name}.")
        if not stream.is_active:
            raise PurchaseConflict(f"{stream.name} is not currently available.")
        if not stream.class_levels.filter(pk=class_level.pk).exists():
            raise PurchaseConflict(f"{stream.name} is not offered for {class_level.name}.")
    elif stream is not None:
        raise PurchaseConflict(f"{class_level.name} does not use streams.")


def create_purchase_request(
    user: User,
    class_level: ClassLevel,
    stream: Stream | None = None,
) -> ClassPurchase:
    """Create a PENDING purchase using the server-side class price.

    The amount is read from `ClassLevel.price`. No caller-supplied amount is
    accepted, so a client cannot request a Class 12 purchase for ₹1.
    """
    if user is None or not getattr(user, "is_authenticated", False):
        raise PurchaseConflict("You must be signed in to purchase a class.")

    _validate_class_is_purchasable(class_level)
    _validate_stream(class_level, stream)

    # A clear error here beats a database constraint violation, which would
    # surface as a generic 500.
    existing = ClassPurchase.objects.filter(
        user=user, class_level=class_level, status__in=BLOCKING_STATUSES
    ).first()
    if existing is not None:
        raise PurchaseConflict(
            f"A purchase for {class_level.name} is already "
            f"{'active' if existing.is_active else 'awaiting verification'}."
        )

    try:
        with transaction.atomic():
            return ClassPurchase.objects.create(
                user=user,
                class_level=class_level,
                stream=stream,
                amount=class_level.price,
                currency=class_level.currency,
                status=PurchaseStatus.PENDING,
            )
    except IntegrityError as exc:
        # Lost a race against a concurrent request for the same class.
        raise PurchaseConflict(
            f"A purchase for {class_level.name} is already in progress."
        ) from exc


def cancel_purchase(purchase: ClassPurchase) -> ClassPurchase:
    """Cancel a PENDING purchase, freeing the slot for a new request."""
    if purchase.status != PurchaseStatus.PENDING:
        raise PurchaseConflict("Only a pending purchase can be cancelled.")
    purchase.status = PurchaseStatus.CANCELLED
    purchase.save(update_fields=["status", "updated_at"])
    return purchase


def amount_due_for(class_level: ClassLevel) -> Decimal:
    """The amount a student must pay, as configured server-side."""
    return Decimal(class_level.price).quantize(Decimal("0.01"))
