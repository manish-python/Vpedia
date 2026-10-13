"""Serializers for Other Resources.

Read models enumerate exactly what may leave the backend. In particular the
`file` field is never serialised into a URL: files are streamed only through
the gated `document` route, so a storage path can never be discovered by
listing resources.
"""

from __future__ import annotations

from rest_framework import serializers

from .models import OtherResource, OtherResourceCategory


class OtherResourceCategorySerializer(serializers.ModelSerializer):
    """Published categories, as a student sees them."""

    resource_count = serializers.SerializerMethodField()

    class Meta:
        model = OtherResourceCategory
        fields = ["id", "name", "slug", "description", "display_order", "resource_count"]
        read_only_fields = fields

    def get_resource_count(self, obj: OtherResourceCategory) -> int:
        return obj.resource_count


class OtherResourceSerializer(serializers.ModelSerializer):
    """A published resource's metadata. No file URL."""

    category_name = serializers.CharField(source="category.name", read_only=True)
    category_slug = serializers.CharField(source="category.slug", read_only=True)
    file_name = serializers.SerializerMethodField()

    class Meta:
        model = OtherResource
        fields = [
            "id",
            "category",
            "category_name",
            "category_slug",
            "title",
            "slug",
            "description",
            "page_count",
            "display_order",
            "file_name",
            "created_at",
        ]
        read_only_fields = fields

    def get_file_name(self, obj: OtherResource) -> str | None:
        return obj.file.name.rsplit("/", 1)[-1] if obj.file else None