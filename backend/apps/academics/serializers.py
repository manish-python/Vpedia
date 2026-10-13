"""Serializers for the academic catalogue.

Read-only. Prices are exposed so a client can display them, but nothing here
accepts a price — the amount on a purchase is always read from the database.
"""

from __future__ import annotations

import re

from rest_framework import serializers

from .models import Chapter, ClassLevel, Stream, Subject


def class_number_for(instance: ClassLevel) -> int | None:
    """Extract the class number (7-12) from a class slug or name.

    The frontend addresses classes by their *number* (`/classes/10/...`),
    because that is what students and administrators say out loud. The
    database primary key is an opaque sequence, and `display_order` is an
    admin-editable presentation setting, so neither is safe to use as
    identity.

    Exposing the number explicitly keeps that mapping unambiguous instead of
    leaving the client to parse strings. It is derived, never stored, so
    renaming a class cannot leave a stale number behind.
    """
    for candidate in (instance.slug, instance.name):
        if not candidate:
            continue
        match = re.search(r"(\d+)", candidate)
        if match:
            return int(match.group(1))
    return None


class ClassLevelSerializer(serializers.ModelSerializer):
    subject_count = serializers.SerializerMethodField()
    display_price = serializers.SerializerMethodField()
    number = serializers.SerializerMethodField()

    class Meta:
        model = ClassLevel
        fields = [
            "id",
            "number",
            "name",
            "slug",
            "description",
            "price",
            "display_price",
            "currency",
            "display_order",
            "has_streams",
            "is_active",
            "subject_count",
        ]
        read_only_fields = fields

    def get_number(self, obj: ClassLevel) -> int | None:
        return class_number_for(obj)

    def get_display_price(self, obj: ClassLevel) -> str:
        return f"₹{obj.price:.0f}"

    def get_subject_count(self, obj: ClassLevel) -> int:
        return obj.subjects.filter(is_active=True).count()


class StreamSerializer(serializers.ModelSerializer):
    class Meta:
        model = Stream
        fields = [
            "id",
            "name",
            "slug",
            "description",
            "display_order",
            "is_active",
            "class_levels",
        ]
        read_only_fields = fields


class SubjectSerializer(serializers.ModelSerializer):
    chapter_count = serializers.IntegerField(read_only=True)
    class_level_name = serializers.CharField(
        source="class_level.name", read_only=True
    )
    stream_name = serializers.CharField(source="stream.name", read_only=True, default=None)

    class Meta:
        model = Subject
        fields = [
            "id",
            "class_level",
            "class_level_name",
            "stream",
            "stream_name",
            "name",
            "slug",
            "description",
            "display_order",
            "is_active",
            "chapter_count",
        ]
        read_only_fields = fields


class ChapterSerializer(serializers.ModelSerializer):
    subject_name = serializers.CharField(source="subject.name", read_only=True)
    class_level = serializers.IntegerField(
        source="subject.class_level_id", read_only=True
    )
    # The client addresses subjects by slug, and a chapter row only carries the
    # subject's numeric id. Exposing the slug lets a page resolve
    # chapter -> subject -> class with one request per hop and no
    # client-side string surgery.
    subject_slug = serializers.CharField(source="subject.slug", read_only=True)

    class Meta:
        model = Chapter
        fields = [
            "id",
            "subject",
            "subject_name",
            "subject_slug",
            "class_level",
            "number",
            "name",
            "slug",
            "description",
            "display_order",
            "is_active",
        ]
        read_only_fields = fields


class ChapterWithContentsSerializer(ChapterSerializer):
    """Chapter plus a summary of its published material."""

    content_count = serializers.SerializerMethodField()
    content_types = serializers.SerializerMethodField()

    class Meta(ChapterSerializer.Meta):
        fields = ChapterSerializer.Meta.fields + ["content_count", "content_types"]

    def get_content_count(self, obj: Chapter) -> int:
        return obj.contents.filter(is_published=True).count()

    def get_content_types(self, obj: Chapter) -> list[str]:
        return sorted(
            obj.contents.filter(is_published=True)
            .values_list("content_type", flat=True)
            .distinct()
        )
