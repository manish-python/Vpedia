"""Class purchase entitlements.

A `ClassPurchase` is the single source of truth for "may this student read
Class N material". It starts PENDING and only becomes ACTIVE when an
administrator approves a matching `PaymentProof`.

Uploading a screenshot never changes this status, and opening a UPI app
never changes this status.
"""

from __future__ import annotations

from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models

from apps.academics.models import Currency
from apps.accounts.models import User
from apps.core.models import TimeStampedModel


class PurchaseStatus(models.TextChoices):
    PENDING = "PENDING", "Pending verification"
    ACTIVE = "ACTIVE", "Active"
    REJECTED = "REJECTED", "Rejected"
    CANCELLED = "CANCELLED", "Cancelled"


#: Statuses that occupy the "one in-flight or live request per class" slot.
BLOCKING_STATUSES = (PurchaseStatus.PENDING, PurchaseStatus.ACTIVE)


class ClassPurchaseQuerySet(models.QuerySet):
    def active(self) -> "ClassPurchaseQuerySet":
        return self.filter(status=PurchaseStatus.ACTIVE)

    def for_user(self, user: User) -> "ClassPurchaseQuerySet":
        return self.filter(user=user)

    def unlocked_class_ids(self, user: User) -> set[int]:
        """Primary keys of every class this user may read."""
        if not (user and user.is_authenticated):
            return set()
        return set(
            self.active().filter(user=user).values_list("class_level_id", flat=True)
        )


class ClassPurchase(TimeStampedModel):
    """One student's entitlement to one class."""

    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="class_purchases"
    )
    class_level = models.ForeignKey(
        "academics.ClassLevel", on_delete=models.PROTECT, related_name="purchases"
    )
    stream = models.ForeignKey(
        "academics.Stream",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="purchases",
        help_text="Required for classes that have streams (11 and 12).",
    )
    # Snapshot of the server-side price at the moment of purchase, so later
    # price changes never rewrite history.
    amount = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    currency = models.CharField(
        max_length=3, choices=Currency.choices, default=Currency.INR
    )
    status = models.CharField(
        max_length=16,
        choices=PurchaseStatus.choices,
        default=PurchaseStatus.PENDING,
        db_index=True,
    )
    activated_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Set when an administrator approves the payment.",
    )
    approved_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_purchases",
    )
    approved_at = models.DateTimeField(null=True, blank=True)

    objects = ClassPurchaseQuerySet.as_manager()

    class Meta:
        db_table = "purchases_class_purchase"
        verbose_name = "class purchase"
        verbose_name_plural = "class purchases"
        ordering = ["-created_at"]
        constraints = [
            # A student may hold at most one in-flight or active purchase per
            # class. REJECTED and CANCELLED rows are excluded, so after a
            # rejection the student may submit a fresh request. PostgreSQL
            # enforces this; the service layer raises a clearer error first.
            models.UniqueConstraint(
                fields=["user", "class_level"],
                condition=models.Q(status__in=list(BLOCKING_STATUSES)),
                name="purchases_unique_active_purchase_per_user_class",
            ),
        ]
        indexes = [models.Index(fields=["user", "status"])]

    def __str__(self) -> str:
        return f"{self.user.email} — {self.class_level.name} [{self.status}]"

    @property
    def is_active(self) -> bool:
        return self.status == PurchaseStatus.ACTIVE

    @property
    def is_actionable(self) -> bool:
        """A pending purchase still awaiting a payment proof."""
        return self.status == PurchaseStatus.PENDING

    def grant_access(self, *, reviewer: User | None = None) -> None:
        """Activate this purchase. Callers must already hold a transaction.

        Kept on the model so the admin, the API and any future management
        command all perform the identical transition.
        """
        from django.utils import timezone

        self.status = PurchaseStatus.ACTIVE
        self.activated_at = timezone.now()
        if reviewer is not None:
            self.approved_by = reviewer
            self.approved_at = self.activated_at

    def revoke(self, *, reviewer: User | None = None) -> None:
        """Deactivate without deleting, keeping the audit trail."""
        self.status = PurchaseStatus.REJECTED
        if reviewer is not None:
            self.approved_by = reviewer
