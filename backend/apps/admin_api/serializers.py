from __future__ import annotations

from django.utils.text import slugify
from rest_framework import serializers

from apps.academics.models import Chapter, ClassLevel, Stream, Subject
from apps.academics.serializers import class_number_for
from apps.accounts.models import User
from apps.content.models import Content
from apps.payments.models import PaymentProof, UPISettings
from apps.payments.serializers import UPI_QR_PATH
from apps.purchases.models import ClassPurchase
from apps.resources.models import OtherResource, OtherResourceCategory

from .models import AdminNotification


class AdminUserSerializer(serializers.ModelSerializer):
    selected_class = serializers.SerializerMethodField()
    selected_stream = serializers.SerializerMethodField()
    active_purchases = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "email", "first_name", "last_name", "full_name",
            "avatar_url", "email_verified", "is_active", "is_staff",
            "date_joined", "selected_class", "selected_stream", "active_purchases",
        ]
        read_only_fields = fields

    def get_selected_class(self, obj):
        profile = getattr(obj, "profile", None)
        value = profile.selected_class if profile else None
        return {"id": value.pk, "number": class_number_for(value), "name": value.name} if value else None

    def get_selected_stream(self, obj):
        profile = getattr(obj, "profile", None)
        value = profile.selected_stream if profile else None
        return {"id": value.pk, "slug": value.slug, "name": value.name} if value else None

    def get_active_purchases(self, obj):
        return obj.class_purchases.filter(status="ACTIVE").count()


class AdminClassSerializer(serializers.ModelSerializer):
    number = serializers.SerializerMethodField()
    subject_count = serializers.SerializerMethodField()
    purchase_count = serializers.SerializerMethodField()

    class Meta:
        model = ClassLevel
        fields = ["id", "number", "name", "slug", "description", "price", "currency", "display_order", "has_streams", "is_active", "subject_count", "purchase_count"]
        read_only_fields = ["id", "number", "subject_count", "purchase_count"]

    def get_number(self, obj):
        return class_number_for(obj)

    def get_subject_count(self, obj):
        return obj.subjects.filter(is_active=True).count()

    def get_purchase_count(self, obj):
        return obj.purchases.count()


class AdminStreamSerializer(serializers.ModelSerializer):
    class_levels = serializers.PrimaryKeyRelatedField(many=True, queryset=ClassLevel.objects.all())

    class Meta:
        model = Stream
        fields = ["id", "name", "slug", "description", "display_order", "is_active", "class_levels"]


# ---------------------------------------------------------------------------
# Slug derivation
# ---------------------------------------------------------------------------


def _with_derived_slug(data, source: str, value: str | None) -> dict:
    """Return `data` with a server-derived slug when none was supplied.

    `Subject.save()` and `Chapter.save()` already derive a slug from a blank
    one, but that is too late to help here. Each model has a
    `UniqueConstraint`, which DRF turns into a serializer-level
    `UniqueTogetherValidator`, and that validator demands *both* fields be in
    the payload. An omitted slug therefore produced the misleading
    `{"slug": ["This field is required."]}` even though the field is declared
    optional -- and it also runs before `validate()`, so overriding `validate()`
    cannot help.

    Deriving it in `to_internal_value`, the earliest hook available, keeps the
    constraint meaningful (a real collision is still reported) and keeps the
    slug server-generated rather than trusted from a client.

    `source` is the field the slug is built from ("name"), and `value` the
    already-known identity prefix (a primary key, as a string).
    """
    if not isinstance(data, dict):
        return data

    raw_slug = data.get("slug")
    if isinstance(raw_slug, str) and raw_slug.strip():
        return data

    name = data.get(source)
    if value is None or not isinstance(name, str) or not name.strip():
        # Let the individual fields report their own errors.
        return data

    derived = slugify(f"{value}-{name}")
    if not derived:
        return data

    # A multipart body arrives as a QueryDict, whose values are lists when
    # unpacked; `copy()` returns a mutable QueryDict that keeps single values,
    # so both input shapes are handled.
    if hasattr(data, "getlist"):
        mutable = data.copy()
        mutable["slug"] = derived
        return mutable
    return {**data, "slug": derived}


class AdminSubjectSerializer(serializers.ModelSerializer):
    class_name = serializers.CharField(source="class_level.name", read_only=True)
    stream_name = serializers.CharField(source="stream.name", read_only=True, default=None)
    chapter_count = serializers.SerializerMethodField()

    class Meta:
        model = Subject
        fields = ["id", "class_level", "class_name", "stream", "stream_name", "name", "slug", "description", "display_order", "is_active", "chapter_count"]
        read_only_fields = ["id", "class_name", "stream_name", "chapter_count"]
        # Optional: derived on create when absent, and honoured when supplied so
        # an administrator can deliberately keep a URL stable.
        extra_kwargs = {"slug": {"required": False, "allow_blank": True}}

    def to_internal_value(self, data):
        """Derive the slug before the unique-together check runs. See
        `_with_derived_slug`."""
        if self.instance is None and isinstance(data, dict):
            class_level = data.get("class_level")
            pk = getattr(class_level, "pk", class_level)
            try:
                value = str(int(pk)) if pk is not None else None
            except (TypeError, ValueError):
                value = None
            data = _with_derived_slug(data, "name", value)
        return super().to_internal_value(data)

    def get_chapter_count(self, obj: Subject) -> int:
        """Active chapters, in one query when the viewset annotated them.

        Reads `admin_chapter_count` — the annotation alias, deliberately
        different from this property's name — and falls back to the model's own
        `chapter_count` property, which counts identically but costs one query
        per row.
        """
        annotated = getattr(obj, "admin_chapter_count", None)
        if annotated is not None:
            return annotated
        return obj.chapter_count

    def validate(self, attrs):
        class_level = attrs.get("class_level", getattr(self.instance, "class_level", None))
        stream = attrs.get("stream", getattr(self.instance, "stream", None))
        if class_level and class_level.has_streams and stream is None:
            raise serializers.ValidationError({"stream": "This class requires a stream."})
        if class_level and not class_level.has_streams and stream is not None:
            raise serializers.ValidationError({"stream": "This class does not use streams."})
        if stream and class_level and not stream.class_levels.filter(pk=class_level.pk).exists():
            raise serializers.ValidationError({"stream": "This stream is not offered for the selected class."})
        self._reject_duplicate_name(class_level, stream, attrs.get("name"))
        return attrs

    def _reject_duplicate_name(self, class_level, stream, name) -> None:
        """Refuse two subjects with the same name in one class/stream.

        The database constraint is `UNIQUE(class_level, stream, slug)`, which is
        necessary but not sufficient: in PostgreSQL a NULL in a unique index
        compares as distinct from every other NULL, so for Classes 7-10 -- where
        `stream` is always NULL -- the constraint protects nothing. Two rows
        named "Mathematics" in Class 10 would both be accepted.

        Checking the name here closes that gap and produces a message an
        administrator can act on, rather than relying on a slug collision that
        may never come.
        """
        if class_level is None or not name:
            return

        duplicates = Subject.objects.filter(
            class_level=class_level, stream=stream, name__iexact=name
        )
        if self.instance is not None:
            duplicates = duplicates.exclude(pk=self.instance.pk)

        if duplicates.exists():
            where = f"{class_level.name}"
            if stream is not None:
                where += f" {stream.name}"
            raise serializers.ValidationError(
                {"name": f"A subject named \"{name}\" already exists for {where}."}
            )


class AdminChapterSerializer(serializers.ModelSerializer):
    """A chapter plus enough of its ancestry to render and re-select it.

    The edit form has to reopen with Class and Subject already chosen, which it
    cannot do from a subject id alone without a second request. `class_level_id`
    and `stream_id` are resolved here so the form can preselect straight from
    the row it already has, with no extra round trip and no race.
    """

    subject_name = serializers.CharField(source="subject.name", read_only=True)
    class_name = serializers.CharField(source="subject.class_level.name", read_only=True)
    stream_name = serializers.CharField(source="subject.stream.name", read_only=True, default=None)
    class_level_id = serializers.IntegerField(source="subject.class_level_id", read_only=True)
    stream_id = serializers.IntegerField(source="subject.stream_id", read_only=True)
    content_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Chapter
        fields = [
            "id",
            "subject",
            "subject_name",
            "class_name",
            "class_level_id",
            "stream_id",
            "stream_name",
            "number",
            "name",
            "slug",
            "description",
            "display_order",
            "is_active",
            "content_count",
        ]
        read_only_fields = [
            "id",
            "subject_name",
            "class_name",
            "class_level_id",
            "stream_id",
            "stream_name",
            "content_count",
        ]
        # Optional, for the same reason as on Subject.
        extra_kwargs = {"slug": {"required": False, "allow_blank": True}}

    def to_internal_value(self, data):
        """Derive the slug before the unique-together check runs. See
        `_with_derived_slug`."""
        if self.instance is None and isinstance(data, dict):
            subject = data.get("subject")
            pk = getattr(subject, "pk", subject)
            try:
                value = str(int(pk)) if pk is not None else None
            except (TypeError, ValueError):
                value = None
            data = _with_derived_slug(data, "name", value)
        return super().to_internal_value(data)


class AdminContentSerializer(serializers.ModelSerializer):
    chapter_name = serializers.CharField(source="chapter.name", read_only=True)
    subject_name = serializers.CharField(source="chapter.subject.name", read_only=True)
    class_name = serializers.CharField(source="chapter.subject.class_level.name", read_only=True)
    file_name = serializers.SerializerMethodField()
    file_size = serializers.SerializerMethodField()

    class Meta:
        model = Content
        fields = ["id", "chapter", "chapter_name", "subject_name", "class_name", "title", "slug", "description", "content_type", "page_count", "display_order", "is_published", "file", "file_name", "file_size", "created_at", "updated_at"]
        read_only_fields = ["id", "chapter_name", "subject_name", "class_name", "file_name", "file_size", "created_at", "updated_at"]
        # Optional: when omitted, the slug is derived in `validate()` below.
        # An explicit slug is still accepted so an administrator can keep an
        # existing URL stable.
        extra_kwargs = {"slug": {"required": False, "allow_blank": True}}

    def to_internal_value(self, data):
        """Derive the slug on create before the unique-together check runs.

        Two DRF behaviours combine here, and both have to be respected:

        1. `Content` has a `UniqueConstraint(fields=["chapter", "slug"])`,
           which DRF turns into a serializer-level `UniqueTogetherValidator`.
           That validator requires *both* fields to be present, so an absent
           slug produces the misleading error
           `{"slug": ["This field is required."]}` even though the field is
           declared optional.
        2. `Serializer.run_validation` calls `run_validators()` *before*
           `validate()`, so overriding `validate()` is too late to help.

        Deriving the slug in `to_internal_value` -- the earliest available hook
        -- fixes both. The constraint stays meaningful (a genuine collision is
        still reported) and the slug is still generated server-side rather than
        trusted from a client.
        """
        if self.instance is None and isinstance(data, dict):
            raw_slug = data.get("slug")
            if not (isinstance(raw_slug, str) and raw_slug.strip()):
                chapter = data.get("chapter")
                title = data.get("title")
                # At this stage `chapter` is still the raw primary key from the
                # request, not a model instance, so coerce defensively.
                pk = getattr(chapter, "pk", chapter)
                if pk is not None and isinstance(title, str) and title.strip():
                    try:
                        derived = slugify(f"{int(pk)}-{title}")
                    except (TypeError, ValueError):
                        # A non-numeric chapter id is rejected by the field's own
                        # PrimaryKeyRelatedField with a clearer message.
                        derived = None
                    if derived:
                        # A multipart body arrives as a QueryDict, whose values
                        # are lists when unpacked with `{**data}`. `copy()`
                        # returns a mutable QueryDict that keeps single values,
                        # so both input shapes are handled correctly.
                        if hasattr(data, "getlist"):
                            mutable = data.copy()
                            mutable["slug"] = derived
                            data = mutable
                        else:
                            data = {**data, "slug": derived}
        return super().to_internal_value(data)

    def get_file_name(self, obj):
        return obj.file.name.rsplit("/", 1)[-1] if obj.file else None

    def get_file_size(self, obj):
        try:
            return obj.file.size if obj.file else None
        except (OSError, ValueError):
            return None


class AdminPurchaseSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="user.full_name", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)
    class_name = serializers.CharField(source="class_level.name", read_only=True)
    approved_by_email = serializers.EmailField(source="approved_by.email", read_only=True, default=None)

    class Meta:
        model = ClassPurchase
        fields = ["id", "user", "student_name", "email", "class_level", "class_name", "stream", "amount", "currency", "status", "created_at", "activated_at", "approved_by_email", "approved_at"]
        read_only_fields = fields


class AdminPaymentSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="user.full_name", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)
    class_name = serializers.CharField(source="class_purchase.class_level.name", read_only=True)
    screenshot_url = serializers.SerializerMethodField()
    reviewed_by_email = serializers.EmailField(source="reviewed_by.email", read_only=True, default=None)

    class Meta:
        model = PaymentProof
        fields = ["id", "user", "student_name", "email", "class_purchase", "class_name", "amount", "currency", "utr", "transaction_id", "status", "submitted_at", "reviewed_at", "reviewed_by_email", "rejection_reason", "admin_note", "screenshot_url"]
        read_only_fields = ["id", "user", "student_name", "email", "class_purchase", "class_name", "amount", "currency", "utr", "transaction_id", "status", "submitted_at", "reviewed_at", "reviewed_by_email", "screenshot_url"]

    def get_screenshot_url(self, obj):
        return f"/private-media/{obj.screenshot.name}" if obj.screenshot else None


class AdminUPISerializer(serializers.ModelSerializer):
    qr_code_url = serializers.SerializerMethodField()

    class Meta:
        model = UPISettings
        fields = ["upi_id", "display_name", "instructions", "is_active", "qr_code", "qr_code_url"]
        read_only_fields = ["qr_code_url"]

    def get_qr_code_url(self, obj):
        return UPI_QR_PATH if obj.qr_code else None


# ---------------------------------------------------------------------------
# Other Resources
# ---------------------------------------------------------------------------


class AdminOtherResourceCategorySerializer(serializers.ModelSerializer):
    """Category CRUD. `name` is unique; the slug is derived server-side."""

    resource_count = serializers.SerializerMethodField()

    class Meta:
        model = OtherResourceCategory
        fields = [
            "id", "name", "slug", "description", "display_order",
            "is_active", "resource_count", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "slug", "resource_count", "created_at", "updated_at"]

    def get_resource_count(self, obj) -> int:
        return obj.resources.count()

    def validate_name(self, value: str) -> str:
        cleaned = (value or "").strip()
        if not cleaned:
            raise serializers.ValidationError("A category name is required.")
        return cleaned


class AdminOtherResourceSerializer(serializers.ModelSerializer):
    """Resource CRUD.

    Deliberately carries no class, stream, subject or chapter field: an Other
    Resource is structurally independent of the academic tree, so there is
    nothing here for a client to attach it to and nothing for it to unlock.
    """

    category_name = serializers.CharField(source="category.name", read_only=True)
    file_name = serializers.SerializerMethodField()
    file_size = serializers.SerializerMethodField()

    class Meta:
        model = OtherResource
        fields = [
            "id", "category", "category_name", "title", "slug", "description",
            "file", "file_name", "file_size", "page_count", "display_order",
            "is_published", "created_at", "updated_at",
        ]
        # `slug` is derived from the title in `OtherResource.save()`. Making it
        # read-only means the client cannot choose or collide with a URL, and
        # cannot change a live URL out from under existing links.
        read_only_fields = [
            "id", "category_name", "slug", "file_name", "file_size",
            "created_at", "updated_at",
        ]

    def get_file_name(self, obj) -> str | None:
        return obj.file.name.rsplit("/", 1)[-1] if obj.file else None

    def get_file_size(self, obj) -> int | None:
        try:
            return obj.file.size if obj.file else None
        except (OSError, ValueError):
            return None

    def validate_title(self, value: str) -> str:
        cleaned = (value or "").strip()
        if not cleaned:
            raise serializers.ValidationError("A title is required.")
        return cleaned

# ---------------------------------------------------------------------------
# Admin notifications
# ---------------------------------------------------------------------------


class AdminNotificationSerializer(serializers.ModelSerializer):
    """Read-only feed row.

    `type`, `title`, `message` and `link` are all server-generated; the client
    can only read them, which is what makes a forged event impossible.
    """

    type_label = serializers.CharField(source="get_type_display", read_only=True)

    class Meta:
        model = AdminNotification
        fields = [
            "id",
            "type",
            "type_label",
            "title",
            "message",
            "link",
            "is_read",
            "created_at",
        ]
        read_only_fields = fields