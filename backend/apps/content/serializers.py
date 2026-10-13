"""Serializers for study material.

`ContentSerializer` exposes metadata only. The file itself is never returned
by the API, and `download_url` is populated only when the requesting user
actually owns the class.
"""

from __future__ import annotations

from rest_framework import serializers

from apps.purchases.services import has_class_access

from .models import Content


class ContentSerializer(serializers.ModelSerializer):
    content_type_label = serializers.CharField(
        source="get_content_type_display", read_only=True
    )
    chapter_name = serializers.CharField(source="chapter.name", read_only=True)
    chapter_number = serializers.IntegerField(source="chapter.number", read_only=True)
    # Slugs alongside the ids, so a client can build working breadcrumb links
    # without a second round trip per hop.
    chapter_slug = serializers.CharField(source="chapter.slug", read_only=True)
    subject_slug = serializers.CharField(
        source="chapter.subject.slug", read_only=True
    )
    subject_name = serializers.CharField(
        source="chapter.subject.name", read_only=True
    )
    class_level_id = serializers.IntegerField(
        source="chapter.subject.class_level_id", read_only=True
    )
    class_level_name = serializers.CharField(
        source="chapter.subject.class_level.name", read_only=True
    )
    is_locked = serializers.SerializerMethodField()

    class Meta:
        model = Content
        fields = [
            "id",
            "chapter",
            "chapter_name",
            "chapter_number",
            "chapter_slug",
            "subject_name",
            "subject_slug",
            "class_level_id",
            "class_level_name",
            "title",
            "slug",
            "description",
            "content_type",
            "content_type_label",
            "page_count",
            "display_order",
            "is_published",
            "is_locked",
        ]
        read_only_fields = fields

    def get_is_locked(self, obj: Content) -> bool:
        """Locked unless the requester owns the class.

        Unpublished material always reads as locked.
        """
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if not obj.is_published:
            return True
        return not has_class_access(user, obj.class_level)
