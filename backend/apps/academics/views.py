"""Public catalogue endpoints.

Classes, streams, subjects and chapters are safe to expose: they reveal no
paid material. Nothing here returns file content.
"""

from __future__ import annotations

from django.shortcuts import get_object_or_404
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.permissions import ReadOnlyOrStaff

from .models import Chapter, ClassLevel, Stream, Subject
from .serializers import (
    ChapterSerializer,
    ChapterWithContentsSerializer,
    ClassLevelSerializer,
    StreamSerializer,
    SubjectSerializer,
)


class ClassLevelViewSet(viewsets.ReadOnlyModelViewSet):
    """`/api/v1/classes/`"""

    serializer_class = ClassLevelSerializer
    permission_classes = [ReadOnlyOrStaff]
    pagination_class = None
    lookup_field = "slug"

    def get_queryset(self):
        queryset = ClassLevel.objects.active().order_for_display()
        if self.request.query_params.get("all") != "1":
            # Staff can still request inactive rows for the admin screens.
            queryset = queryset.filter(is_active=True)
        return queryset.prefetch_related("streams")

    @action(detail=True, methods=["get"])
    def subjects(self, request, slug: str | None = None):
        """Subjects in this class, optionally narrowed to a stream."""
        class_level = self.get_object()
        stream_id = request.query_params.get("stream")
        queryset = Subject.objects.active().for_class_and_stream(
            class_level, stream_id
        )
        return Response(SubjectSerializer(queryset, many=True).data)


class StreamViewSet(viewsets.ReadOnlyModelViewSet):
    """`/api/v1/streams/`"""

    serializer_class = StreamSerializer
    permission_classes = [ReadOnlyOrStaff]
    pagination_class = None
    lookup_field = "slug"

    def get_queryset(self):
        queryset = Stream.objects.filter(is_active=True).order_by("display_order", "name")
        class_slug = self.request.query_params.get("class")
        if class_slug:
            queryset = queryset.filter(class_levels__slug=class_slug).distinct()
        return queryset


class SubjectViewSet(viewsets.ReadOnlyModelViewSet):
    """`/api/v1/subjects/`"""

    serializer_class = SubjectSerializer
    permission_classes = [ReadOnlyOrStaff]
    pagination_class = None
    lookup_field = "slug"

    def get_queryset(self):
        queryset = Subject.objects.active().select_related("class_level", "stream")
        class_slug = self.request.query_params.get("class")
        if class_slug:
            queryset = queryset.filter(class_level__slug=class_slug)
        stream = self.request.query_params.get("stream")
        if stream:
            queryset = queryset.filter(stream__slug=stream)
        return queryset.order_by("display_order", "name")

    @action(detail=True, methods=["get"])
    def chapters(self, request, slug: str | None = None):
        """Chapters in this subject, with published-material counts only."""
        subject = get_object_or_404(Subject, slug=slug, is_active=True)
        queryset = Chapter.objects.active().filter(subject=subject).prefetch_related("contents")
        return Response(ChapterWithContentsSerializer(queryset, many=True).data)


class ChapterViewSet(viewsets.ReadOnlyModelViewSet):
    """`/api/v1/chapters/`"""

    serializer_class = ChapterSerializer
    permission_classes = [ReadOnlyOrStaff]
    pagination_class = None
    lookup_field = "slug"

    def get_queryset(self):
        queryset = Chapter.objects.active().select_related("subject", "subject__class_level")
        subject_slug = self.request.query_params.get("subject")
        if subject_slug:
            queryset = queryset.filter(subject__slug=subject_slug)
        class_slug = self.request.query_params.get("class")
        if class_slug:
            queryset = queryset.filter(subject__class_level__slug=class_slug)
        return queryset.order_by("subject__display_order", "number")
