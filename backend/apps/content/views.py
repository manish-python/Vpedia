"""Protected content endpoints.

Every response is filtered through the entitlement rule:

    published  AND  has_class_access(user, owning class)

Unpublished rows are never listed at all. A row belonging to a class the
caller does not own is reported as `is_locked: true` with no file reference,
so metadata can be shown for a locked catalogue entry without leaking
anything.
"""

from __future__ import annotations

import mimetypes

from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.academics.models import Chapter
from apps.purchases.services import has_class_access

from .models import Content
from .serializers import ContentSerializer


class ContentViewSet(viewsets.ReadOnlyModelViewSet):
    """`/api/v1/contents/`"""

    serializer_class = ContentSerializer
    permission_classes = [AllowAny]
    pagination_class = None
    lookup_field = "slug"

    def get_queryset(self):
        queryset = Content.objects.published().select_related(
            "chapter",
            "chapter__subject",
            "chapter__subject__class_level",
        )

        chapter_slug = self.request.query_params.get("chapter")
        if chapter_slug:
            queryset = queryset.filter(chapter__slug=chapter_slug)

        subject_slug = self.request.query_params.get("subject")
        if subject_slug:
            queryset = queryset.filter(chapter__subject__slug=subject_slug)

        class_slug = self.request.query_params.get("class")
        if class_slug:
            queryset = queryset.filter(chapter__subject__class_level__slug=class_slug)

        content_type = self.request.query_params.get("type")
        if content_type:
            queryset = queryset.filter(content_type=content_type.upper())

        return queryset.order_by("chapter__display_order", "display_order", "id")

    @action(detail=True, methods=["get"])
    def access(self, request, slug: str | None = None) -> Response:
        """Report whether the caller may read this item, and why not.

        Useful for the frontend to render a lock badge without shipping the
        whole entitlement rule to the client.

        Note the model relationship: `Content.class_level` is a *property* that
        walks chapter -> subject -> class_level. There is no `class_level_id`
        column and no such attribute, so the id is read off the resolved object
        rather than assumed.
        """
        content = get_object_or_404(Content, slug=slug, is_published=True)
        class_level = content.class_level
        allowed = has_class_access(request.user, class_level)
        return Response(
            {
                "id": content.id,
                "class_level": class_level.pk,
                "class_name": class_level.name,
                "allowed": allowed,
                "reason": None if allowed else "Purchase this class to unlock.",
            }
        )

    @action(
        detail=True,
        methods=["get"],
        permission_classes=[IsAuthenticated],
        url_path="document",
    )
    def document(self, request, slug: str | None = None):
        """Stream the actual file to a student who owns the class.

        This is the only route that returns study-material bytes. It is
        deliberately separate from `apps.core.views.private_media`, which
        stays staff-only for payment screenshots and administrator uploads.

        The gate is `has_class_access`, the same function the metadata
        serializer uses to set `is_locked`. Selecting a class on the profile,
        or holding a PENDING purchase, does not pass it.

        The file is served with `no-store` so a payment-gated document is not
        written into a shared cache after access is later revoked.
        """
        content = get_object_or_404(Content, slug=slug, is_published=True)

        if not has_class_access(request.user, content.class_level):
            return Response(
                {"detail": "Purchase this class to access this material."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if not content.file:
            raise Http404("No file has been attached to this material yet.")

        handle = content.file.open("rb")
        content_type, _ = mimetypes.guess_type(content.file.name)

        response = FileResponse(handle, content_type=content_type or "application/octet-stream")
        response["Content-Disposition"] = f'inline; filename="{content.file.name.rsplit("/", 1)[-1]}"'
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response


class ChapterContentViewSet(viewsets.ViewSet):
    """`/api/v1/chapters/<slug>/contents/`"""

    permission_classes = [AllowAny]
    serializer_class = ContentSerializer

    def list(self, request, chapter_slug: str):
        chapter = get_object_or_404(
            Chapter.objects.select_related("subject", "subject__class_level"),
            slug=chapter_slug,
            is_active=True,
        )
        queryset = (
            Content.objects.published()
            .filter(chapter=chapter)
            .select_related("chapter", "chapter__subject", "chapter__subject__class_level")
        )
        content_type = request.query_params.get("type")
        if content_type:
            queryset = queryset.filter(content_type=content_type.upper())

        serializer = ContentSerializer(queryset, many=True, context={"request": request})
        data = serializer.data

        return Response(
            {
                "chapter": {
                    "id": chapter.id,
                    "name": chapter.name,
                    "number": chapter.number,
                    "subject": chapter.subject.name,
                    "class_level": chapter.subject.class_level_id,
                    "class_name": chapter.subject.class_level.name,
                },
                "has_access": has_class_access(request.user, chapter.subject.class_level),
                "count": len(data),
                "results": data,
            }
        )
