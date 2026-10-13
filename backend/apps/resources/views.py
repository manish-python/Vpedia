"""Student-facing Other Resource endpoints.

    GET /api/v1/other-resource-categories/
    GET /api/v1/other-resources/
    GET /api/v1/other-resources/<slug>/
    GET /api/v1/other-resources/<slug>/document/

Access rule
-----------
Published + signed in. Nothing else.

In particular `has_class_access` is deliberately NOT consulted anywhere in
this module. An Other Resource is not part of any purchase, is not tied to a
class, and must never influence an entitlement. There is no class foreign key
on the model for it to be resolved through.

Only published rows are ever returned, so a draft is invisible here even to
an administrator browsing with a student session.
"""

from __future__ import annotations

import mimetypes

from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import OtherResource, OtherResourceCategory
from .serializers import OtherResourceCategorySerializer, OtherResourceSerializer


class OtherResourceCategoryViewSet(viewsets.ReadOnlyModelViewSet):
    """`/api/v1/other-resource-categories/`"""

    serializer_class = OtherResourceCategorySerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None
    lookup_field = "slug"

    def get_queryset(self):
        return OtherResourceCategory.objects.active().order_by("display_order", "name")


class OtherResourceViewSet(viewsets.ReadOnlyModelViewSet):
    """`/api/v1/other-resources/`"""

    serializer_class = OtherResourceSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None
    lookup_field = "slug"

    def get_queryset(self):
        queryset = OtherResource.objects.published().select_related("category")

        category = self.request.query_params.get("category")
        if category:
            queryset = queryset.filter(category__slug=category)

        search = (self.request.query_params.get("search") or "").strip()
        if search:
            queryset = queryset.filter(title__icontains=search)

        return queryset.order_by("display_order", "title")

    @action(
        detail=True,
        methods=["get"],
        permission_classes=[IsAuthenticated],
        url_path="document",
    )
    def document(self, request, slug: str | None = None):
        """Stream the PDF to a signed-in student.

        `published()` is the whole gate: a draft returns 404, not 403, so an
        unpublished resource is indistinguishable from one that does not
        exist. No purchase is involved.
        """
        resource = get_object_or_404(
            OtherResource.objects.published().select_related("category"),
            slug=slug,
        )

        if not resource.file:
            raise Http404("No file has been attached to this resource yet.")

        handle = resource.file.open("rb")
        content_type, _ = mimetypes.guess_type(resource.file.name)

        response = FileResponse(
            handle, content_type=content_type or "application/octet-stream"
        )
        response["Content-Disposition"] = (
            f'inline; filename="{resource.file.name.rsplit("/", 1)[-1]}"'
        )
        # Not cached: publishing can be withdrawn at any time.
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response