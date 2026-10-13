"""Serializers for authentication and the student profile.

Two distinct serializers, on purpose:

* `UserSerializer` / `ProfileSerializer` are read models. They enumerate the
  fields that may leave the backend, so a field can never leak by being added
  to a model later.
* `ProfileUpdateSerializer` is a hand-written whitelist, not a
  `ModelSerializer`. Only the fields a student is allowed to change appear on
  it. Anything else — `id`, `user`, `email`, `is_staff`, `is_superuser`,
  `google_subject_id` — is not a field here at all, so posting it is a 400
  rather than a silent write.
"""

from __future__ import annotations

from rest_framework import serializers

from apps.academics.models import ClassLevel, Stream
from apps.academics.serializers import class_number_for

from .models import StudentProfile, User


class UserSerializer(serializers.ModelSerializer):
    """Safe account information.

    Never includes the OAuth client secret, a Google access or refresh token,
    the provider subject id, or any privilege flag.
    """

    full_name = serializers.CharField(read_only=True)
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "email_verified",
            "first_name",
            "last_name",
            "full_name",
            "avatar_url",
            "date_joined",
        ]
        read_only_fields = fields

    def get_avatar_url(self, obj: User) -> str | None:
        """Google's picture URL, falling back to an uploaded profile image.

        The Google URL is remote and served by Google, so it needs no
        authentication and no local media route.
        """
        if obj.avatar_url:
            return obj.avatar_url
        profile = getattr(obj, "profile", None)
        if profile is not None and profile.profile_image:
            try:
                return profile.profile_image.url
            except ValueError:  # pragma: no cover - file missing on disk
                return None
        return None


class StudentProfileSerializer(serializers.ModelSerializer):
    """Read-only view of the profile preference."""

    selected_class_name = serializers.CharField(
        source="selected_class.name", read_only=True, default=None
    )
    selected_stream_name = serializers.CharField(
        source="selected_stream.name", read_only=True, default=None
    )
    # `selected_class` is a primary key. A client that addresses classes by
    # number (which is what students and URLs use) would otherwise have to
    # guess the mapping, and guessing it wrong is how "Class 7" ends up
    # displayed for someone who chose Class 10. Derived, never stored.
    selected_class_number = serializers.SerializerMethodField()
    class_requires_stream = serializers.SerializerMethodField()

    class Meta:
        model = StudentProfile
        fields = [
            "selected_class",
            "selected_class_number",
            "selected_class_name",
            "selected_stream",
            "selected_stream_name",
            "class_requires_stream",
            "phone_number",
        ]
        read_only_fields = fields

    def get_selected_class_number(self, obj: StudentProfile) -> int | None:
        if obj.selected_class is None:
            return None
        return class_number_for(obj.selected_class)

    def get_class_requires_stream(self, obj: StudentProfile) -> bool:
        return bool(obj.selected_class and obj.selected_class.has_streams)


class ProfileSerializer(serializers.ModelSerializer):
    """Combined read model returned by `/api/v1/profile/me/`.

    The instance is the `User`. Fields resolve directly against it (or against
    its reverse one-to-one `profile`), so no `source` traversal into a
    non-existent attribute is needed.
    """

    full_name = serializers.CharField(read_only=True)
    avatar_url = serializers.SerializerMethodField()
    auth_provider = serializers.SerializerMethodField()

    # Resolves through the reverse one-to-one, so this is always present: the
    # view calls `ensure_profile` first.
    profile = StudentProfileSerializer(read_only=True)

    # Ownership. Derived from ACTIVE purchases, never from input.
    unlocked_classes = serializers.SerializerMethodField()
    has_access_to_selected_class = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "email_verified",
            "first_name",
            "last_name",
            "full_name",
            "avatar_url",
            "auth_provider",
            "profile",
            "unlocked_classes",
            "has_access_to_selected_class",
        ]
        read_only_fields = fields

    def get_avatar_url(self, obj: User) -> str | None:
        return UserSerializer().get_avatar_url(obj)

    def get_auth_provider(self, obj: User) -> str:
        """Which provider authenticated this account. Always `google`."""
        return "google"

    def get_unlocked_classes(self, obj: User) -> list[dict]:
        """Classes this student has actually paid for.

        Derived from ACTIVE purchases, which is the point of the field:
        it makes it visible that a selected class is not the same thing as an
        unlocked one.
        """
        from apps.purchases.models import PurchaseStatus

        rows = (
            obj.class_purchases.filter(status=PurchaseStatus.ACTIVE)
            .select_related("class_level", "stream")
            .order_by("class_level__display_order")
        )
        return [
            {
                "id": row.class_level_id,
                "number": class_number_for(row.class_level),
                "name": row.class_level.name,
                "stream": row.stream_id,
                "stream_name": row.stream.name if row.stream else None,
            }
            for row in rows
        ]

    def get_has_access_to_selected_class(self, obj: User) -> bool:
        """False whenever there is no selected class or no ACTIVE purchase."""
        from apps.purchases.services import has_class_access

        profile = getattr(obj, "profile", None)
        if profile is None or profile.selected_class_id is None:
            return False
        return has_class_access(obj, profile.selected_class)


class ProfileUpdateSerializer(serializers.Serializer):
    """Whitelisted update for `PATCH /api/v1/profile/me/`.

    Only these four fields can be changed by a student. Everything else in the
    request body is rejected, which is how `{"user_id": 999}` and
    `{"email": "victim@example.com"}` are refused instead of honoured.

    `id`, `user`, `email` and the privilege flags are absent by construction.
    """

    first_name = serializers.CharField(
        max_length=150, required=False, allow_blank=True, trim_whitespace=True
    )
    last_name = serializers.CharField(
        max_length=150, required=False, allow_blank=True, trim_whitespace=True
    )
    selected_class = serializers.PrimaryKeyRelatedField(
        queryset=ClassLevel.objects.filter(is_active=True),
        required=False,
        allow_null=True,
    )
    selected_stream = serializers.PrimaryKeyRelatedField(
        queryset=Stream.objects.filter(is_active=True),
        required=False,
        allow_null=True,
    )

    def validate(self, attrs):
        """Reject unknown fields, then enforce the class/stream relationship.

        DRF ignores input keys that are not declared on a serializer. That is
        a reasonable default, but here it would mean a request carrying
        `{"user_id": 999}` or `{"email": "victim@example.com"}` quietly
        succeeded. Naming the refused fields makes a tampering attempt visible
        instead of invisible, and gives the caller a clear 400.
        """
        from apps.accounts.services import ensure_profile

        rejected = sorted(set(self.initial_data or {}) - set(self.fields))
        if rejected:
            raise serializers.ValidationError(
                {
                    "not_writable": (
                        "These fields cannot be changed through this endpoint: "
                        f"{', '.join(rejected)}."
                    )
                }
            )

        request = self.context["request"]
        profile = ensure_profile(request.user)

        # Only consider values present in the request, so a partial update does
        # not fail validation against the stored value.
        class_given = "selected_class" in attrs
        class_level = attrs.get("selected_class", profile.selected_class)
        stream_given = "selected_stream" in attrs
        stream = attrs.get("selected_stream", profile.selected_stream)

        if class_given and class_level is None and stream_given and stream is not None:
            raise serializers.ValidationError(
                {"selected_stream": "Choose a class before choosing a stream."}
            )

        if class_level is None:
            return attrs

        if class_level.has_streams:
            if stream is None:
                raise serializers.ValidationError(
                    {
                        "selected_stream": (
                            f"{class_level.name} requires a stream. "
                            "Choose Science, Commerce or Humanities."
                        )
                    }
                )
            if not stream.class_levels.filter(pk=class_level.pk).exists():
                raise serializers.ValidationError(
                    {
                        "selected_stream": (
                            f"{stream.name} is not offered for {class_level.name}."
                        )
                    }
                )
        elif stream is not None:
            raise serializers.ValidationError(
                {
                    "selected_stream": (
                        f"{class_level.name} does not use streams."
                    )
                }
            )

        return attrs

    def save(self, **kwargs):
        """Write only whitelisted fields.

        Ownership is taken from `request.user`. There is no code path here that
        could reassign the profile to a different user.
        """
        from apps.accounts.services import ensure_profile

        request = self.context["request"]
        user = request.user
        profile = ensure_profile(user)

        data = self.validated_data

        if "first_name" in data:
            user.first_name = data["first_name"]
        if "last_name" in data:
            user.last_name = data["last_name"]

        if "first_name" in data or "last_name" in data:
            # `is_staff`, `is_superuser` and the password are not in the
            # whitelist, so they cannot appear in the update.
            user.save(update_fields=["first_name", "last_name", "updated_at"])

        profile_fields = []
        if "selected_class" in data:
            profile.selected_class = data["selected_class"]
            profile_fields.append("selected_class")
        if "selected_stream" in data:
            profile.selected_stream = data["selected_stream"]
            profile_fields.append("selected_stream")

        if profile_fields:
            profile.save(update_fields=[*profile_fields, "updated_at"])

        # Explicitly no purchase is created, activated or modified here.
        # Selecting a class records a preference and nothing more.
        return user


class AccountSerializer(serializers.ModelSerializer):
    """Minimal account record, used by admin listings and internal callers."""

    class Meta:
        model = User
        fields = ["id", "email", "first_name", "last_name", "is_active", "is_staff"]
        read_only_fields = fields
