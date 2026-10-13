"""Payment serializers.

The proof submission serializer accepts only a purchase reference, a UTR, an
optional transaction id and the screenshot. The class and the amount are
always taken from the purchase, so the request cannot influence what is owed.
"""

from __future__ import annotations

from rest_framework import serializers

from apps.purchases.models import ClassPurchase

# Defined here rather than imported: `views` imports this module, so importing
# back from it would be circular.
#: Public route serving the configured UPI QR image.
UPI_QR_PATH = "/api/v1/payments/upi/qr/"

from .models import PaymentProof, UPISettings


class UPISettingsSerializer(serializers.ModelSerializer):
    """Public payment instructions."""

    qr_code_url = serializers.SerializerMethodField()

    class Meta:
        model = UPISettings
        fields = [
            "upi_id",
            "display_name",
            "qr_code_url",
            "instructions",
        ]
        read_only_fields = fields

    def get_qr_code_url(self, obj: UPISettings) -> str | None:
        """Absolute path to the QR, served by the public UPI route.

        Not the staff-only media path: a student has to be able to see the QR
        they are paying with. The receiving UPI address is public by design.
        """
        return UPI_QR_PATH if obj.qr_code else None


class PaymentProofSerializer(serializers.ModelSerializer):
    """Read representation.

    Deliberately omits the screenshot URL: payment proofs are private, and
    the staff-guarded media view is reachable only by administrators.
    """

    class_name = serializers.CharField(source="class_purchase.class_level.name", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    reviewed_by_email = serializers.EmailField(
        source="reviewed_by.email", read_only=True, default=None
    )
    has_screenshot = serializers.SerializerMethodField()

    class Meta:
        model = PaymentProof
        fields = [
            "id",
            "class_purchase",
            "class_name",
            "amount",
            "currency",
            "payment_method",
            "utr",
            "transaction_id",
            "status",
            "status_label",
            "submitted_at",
            "reviewed_at",
            "reviewed_by_email",
            "rejection_reason",
            "has_screenshot",
        ]
        read_only_fields = fields

    def get_has_screenshot(self, obj: PaymentProof) -> bool:
        return bool(obj.screenshot)


class PaymentProofSubmissionSerializer(serializers.Serializer):
    """Input for `POST /api/v1/payments/proofs/`.

    No `amount`, no `status`, no `user`. The server derives all three.
    """

    class_purchase = serializers.PrimaryKeyRelatedField(
        queryset=ClassPurchase.objects.select_related("class_level"),
        help_text="Purchase this payment settles.",
    )
    utr = serializers.CharField(
        max_length=64,
        trim_whitespace=True,
        help_text="UTR / transaction reference from the UPI application.",
    )
    transaction_id = serializers.CharField(
        max_length=100, required=False, allow_blank=True, trim_whitespace=True
    )
    screenshot = serializers.ImageField(
        help_text="Screenshot of the completed UPI payment (JPG, PNG or WebP)."
    )

    def validate_utr(self, value: str) -> str:
        cleaned = (value or "").strip()
        if not cleaned:
            raise serializers.ValidationError("A UTR / transaction reference is required.")
        return cleaned

    def validate_screenshot(self, value):
        # ImageField already enforces an image; size and format are checked
        # again by the model validator, which decodes the file with Pillow.
        return value


class PaymentReviewSerializer(serializers.Serializer):
    """Input for staff review endpoints."""

    reason = serializers.CharField(
        max_length=500, required=False, allow_blank=True, trim_whitespace=True
    )
    admin_note = serializers.CharField(
        max_length=2000, required=False, allow_blank=True, trim_whitespace=True
    )
