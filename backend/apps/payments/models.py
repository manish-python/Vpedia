"""Manual UPI payment model.

Payment flow
------------
1. Student creates a purchase request (`ClassPurchase`, PENDING).
2. The frontend renders the active `UPISettings` QR code and UPI ID.
3. Student pays in their own UPI application — entirely outside VPEDIA.
4. Student uploads a screenshot plus the UTR (`PaymentProof`, PENDING).
5. An administrator verifies the transfer in their bank or UPI app and
   approves or rejects it.

Only step 5 activates access. Uploading a screenshot records evidence; it
never grants an entitlement, and opening a UPI application proves nothing.
"""

from __future__ import annotations

from django.core.exceptions import ValidationError
from django.db import models
from django.utils.text import slugify

from apps.academics.models import Currency
from apps.accounts.models import User
from apps.core.models import (
    TimeStampedModel,
    unique_upload_path,
    validate_image_upload,
)


def payment_screenshot_path(instance: "PaymentProof", filename: str) -> str:
    """``payment_proofs/<yyyy>/<mm>/<purchase-reference>/<uuid>.<ext>``.

    Kept in its own tree, separate from educational content, so the two can
    be migrated to storage independently. The original filename is never
    reused, which keeps student-supplied names out of the filesystem.
    """
    return unique_upload_path(instance, filename, folder="payment_proofs")


class PaymentMethod(models.TextChoices):
    UPI = "UPI", "UPI"


class PaymentStatus(models.TextChoices):
    PENDING = "PENDING", "Awaiting verification"
    APPROVED = "APPROVED", "Approved"
    REJECTED = "REJECTED", "Rejected"


class UPISettingsQuerySet(models.QuerySet):
    def active(self) -> "UPISettingsQuerySet":
        return self.filter(is_active=True)


class UPISettings(TimeStampedModel):
    """Singleton row holding the live UPI receiving details.

    Administrators edit these in Django Admin; no code change or redeploy is
    needed when a UPI ID or QR code changes.
    """

    upi_id = models.CharField(
        max_length=100,
        blank=True,
        help_text="UPI ID students pay to, for example vpedia@bank.",
    )
    display_name = models.CharField(
        max_length=100,
        blank=True,
        default="VPEDIA LEARNING",
        help_text="Name shown to the student in their UPI app.",
    )
    qr_code = models.ImageField(
        upload_to="upi/qr/",
        blank=True,
        null=True,
        validators=[validate_image_upload],
    )
    instructions = models.TextField(blank=True)
    is_active = models.BooleanField(default=True, db_index=True)

    objects = UPISettingsQuerySet.as_manager()

    class Meta:
        db_table = "payments_upi_settings"
        verbose_name = "UPI settings"
        verbose_name_plural = "UPI settings"
        constraints = [
            # Enforces the singleton at the database level: only the row with
            # pk=1 may ever exist.
            models.CheckConstraint(
                condition=models.Q(pk=1),
                name="payments_upi_settings_singleton",
            ),
        ]

    def __str__(self) -> str:
        return self.upi_id or "UPI settings (unconfigured)"

    def save(self, *args, **kwargs) -> None:
        self.pk = 1
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):  # noqa: ANN002, ANN003
        """Refuse deletion; the row must always exist."""
        raise ValidationError("The UPI settings row cannot be deleted.")

    @classmethod
    def load(cls) -> "UPISettings | None":
        """Return the active configuration, or None when unconfigured."""
        return cls.objects.filter(pk=1, is_active=True).first()


class PaymentProofQuerySet(models.QuerySet):
    def pending(self) -> "PaymentProofQuerySet":
        return self.filter(status=PaymentStatus.PENDING)

    def awaiting_review(self) -> "PaymentProofQuerySet":
        return self.filter(status=PaymentStatus.PENDING)


class PaymentProof(TimeStampedModel):
    """Evidence submitted by a student for manual verification."""

    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="payment_proofs"
    )
    class_purchase = models.ForeignKey(
        "purchases.ClassPurchase",
        on_delete=models.CASCADE,
        related_name="payment_proofs",
    )
    # Recorded for auditing. The authoritative amount lives on the purchase
    # and must match.
    amount = models.DecimalField(max_digits=8, decimal_places=2)
    currency = models.CharField(
        max_length=3, choices=Currency.choices, default=Currency.INR
    )
    payment_method = models.CharField(
        max_length=16, choices=PaymentMethod.choices, default=PaymentMethod.UPI
    )
    # UTR (Unique Transaction Reference) as printed by the UPI application.
    # Unique so one bank transfer cannot be claimed twice.
    utr = models.CharField(max_length=64, unique=True, db_index=True)
    transaction_id = models.CharField(max_length=100, blank=True)
    screenshot = models.ImageField(
        upload_to=payment_screenshot_path,
        validators=[validate_image_upload],
        help_text="Screenshot of the successful UPI payment.",
    )
    status = models.CharField(
        max_length=16,
        choices=PaymentStatus.choices,
        default=PaymentStatus.PENDING,
        db_index=True,
    )
    submitted_at = models.DateTimeField(auto_now_add=True, db_index=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_payment_proofs",
    )
    rejection_reason = models.CharField(max_length=500, blank=True)
    admin_note = models.TextField(blank=True)

    # Discriminator used to build the storage path.
    upload_discriminator = "proof"

    objects = PaymentProofQuerySet.as_manager()

    class Meta:
        db_table = "payments_payment_proof"
        verbose_name = "payment proof"
        verbose_name_plural = "payment proofs"
        ordering = ["-submitted_at"]
        indexes = [
            models.Index(fields=["status", "-submitted_at"]),
            models.Index(fields=["user", "status"]),
        ]

    def __str__(self) -> str:
        return f"UTR {self.utr} — {self.user.email} [{self.status}]"

    @property
    def class_level(self):
        return self.class_purchase.class_level

    @property
    def is_reviewable(self) -> bool:
        return self.status == PaymentStatus.PENDING

    @property
    def screenshot_name(self) -> str:
        return slugify(self.utr) or str(self.pk)
