"""Purchase serializers.

The client sends only `class_level` and optionally `stream`. No amount field
exists on the write serializer, so a caller cannot ask for a Class 12
purchase at ₹1 — the price is read from `ClassLevel.price`.
"""

from __future__ import annotations

from rest_framework import serializers

from apps.academics.models import ClassLevel, Stream

from .models import ClassPurchase, PurchaseStatus


class ClassPurchaseSerializer(serializers.ModelSerializer):
    """Read representation."""

    class_name = serializers.CharField(source="class_level.name", read_only=True)
    stream_name = serializers.CharField(source="stream.name", read_only=True, default=None)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    approved_by_email = serializers.EmailField(
        source="approved_by.email", read_only=True, default=None
    )
    is_active = serializers.BooleanField(read_only=True)

    class Meta:
        model = ClassPurchase
        fields = [
            "id",
            "user",
            "class_level",
            "class_name",
            "stream",
            "stream_name",
            "amount",
            "currency",
            "status",
            "status_label",
            "is_active",
            "activated_at",
            "approved_at",
            "approved_by_email",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class PurchaseRequestSerializer(serializers.Serializer):
    """Input for `POST /api/v1/purchases/`.

    Intentionally has no `amount` field. The server decides what is owed.
    """

    class_level = serializers.PrimaryKeyRelatedField(
        queryset=ClassLevel.objects.filter(is_active=True),
        help_text="Class the student wants access to.",
    )
    stream = serializers.PrimaryKeyRelatedField(
        queryset=Stream.objects.filter(is_active=True),
        required=False,
        allow_null=True,
        help_text="Required for classes that offer streams.",
    )

    def validate(self, attrs):
        class_level: ClassLevel = attrs["class_level"]
        stream = attrs.get("stream")

        if class_level.has_streams and stream is None:
            raise serializers.ValidationError(
                {"stream": f"Please choose a stream for {class_level.name}."}
            )
        if not class_level.has_streams and stream is not None:
            raise serializers.ValidationError(
                {"stream": f"{class_level.name} does not use streams."}
            )
        return attrs


class ClassAccessSerializer(serializers.Serializer):
    class_level = serializers.PrimaryKeyRelatedField(
        queryset=ClassLevel.objects.all()
    )
    has_access = serializers.BooleanField(read_only=True)
    active_purchase_id = serializers.IntegerField(read_only=True, allow_null=True)
    message = serializers.CharField(read_only=True)


class PurchaseStatusSerializer(serializers.ModelSerializer):
    class_name = serializers.CharField(source="class_level.name", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = ClassPurchase
        fields = ["id", "class_level", "class_name", "status", "status_label", "activated_at"]
        read_only_fields = fields


PURCHASE_STATUS_CHOICES = PurchaseStatus.choices
