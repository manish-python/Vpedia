from __future__ import annotations

import mimetypes

from django.contrib.auth import authenticate, login, logout
from django.db.models import Count, Q
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.academics.models import Chapter, ClassLevel, Stream, Subject
from apps.accounts.models import User
from apps.content.models import Content
from apps.payments.models import PaymentProof, PaymentStatus, UPISettings
from apps.payments.services import approve_payment, reject_payment
from apps.purchases.models import ClassPurchase, PurchaseStatus
from apps.resources.models import OtherResource, OtherResourceCategory

from .permissions import IsStaffUser
from .serializers import (
    AdminChapterSerializer, AdminClassSerializer, AdminContentSerializer,
    AdminOtherResourceCategorySerializer, AdminOtherResourceSerializer,
    AdminPaymentSerializer, AdminPurchaseSerializer, AdminStreamSerializer,
    AdminSubjectSerializer, AdminUPISerializer, AdminUserSerializer,
)
from apps.core.pagination import StandardPagination


def serve_inline_document(field_file) -> FileResponse:
    """Stream a stored study document inline, or 404 when nothing is attached.

    Mirrors the headers on the student route in `apps/content/views.py`: inline
    disposition so the browser renders it in place, `private, no-store` because
    material can be unpublished or replaced and a cached copy would outlive that,
    and `nosniff` so nothing may be coerced into another type.

    The download name is only ever the basename. The directory is part of the
    storage path and is not exposed, and the row was resolved from an id rather
    than from a path the caller supplied.
    """
    if not field_file:
        # A 404 rather than an empty 200: "no file attached" is a real state, and
        # a zero-byte body would present as a corrupt PDF instead.
        raise Http404("No file has been attached to this item yet.")

    download_name = field_file.name.rsplit("/", 1)[-1]
    guessed, _ = mimetypes.guess_type(download_name)

    response = FileResponse(field_file.open("rb"), content_type=guessed or "application/pdf")
    response["Content-Disposition"] = f'inline; filename="{download_name}"'
    response["Cache-Control"] = "private, no-store"
    response["X-Content-Type-Options"] = "nosniff"
    return response


@api_view(["POST"])
@permission_classes([AllowAny])
def admin_login(request):
    email = (request.data.get("email") or "").strip().lower()
    password = request.data.get("password") or ""
    user = authenticate(request, username=email, password=password)
    if not user or not user.is_staff:
        return Response({"detail": "Invalid administrator credentials."}, status=401)
    login(request, user)
    return Response({"authenticated": True, "user": AdminUserSerializer(user).data})


@api_view(["POST"])
@permission_classes([IsStaffUser])
def admin_logout(request):
    logout(request)
    return Response(status=204)


@api_view(["GET"])
@permission_classes([IsStaffUser])
def admin_me(request):
    return Response({"authenticated": True, "user": AdminUserSerializer(request.user).data})


@api_view(["GET"])
@permission_classes([IsStaffUser])
def dashboard(request):
    """Everything the dashboard renders, in one aggregated request.

    `apps.admin_api.dashboard` computes this with grouped queries, so the
    browser never receives rows to count. The previous `payments` key is kept
    alongside the new `payment_status` for any existing consumer.
    """
    from apps.admin_api import dashboard as dashboard_data

    payload = dashboard_data.build_dashboard()
    payload["payments"] = payload["payment_status"]
    payload["recent_payments"] = AdminPaymentSerializer(
        PaymentProof.objects.select_related(
            "user", "class_purchase__class_level"
        ).order_by("-submitted_at")[:8],
        many=True,
    ).data
    return Response(payload)


class StaffModelViewSet(viewsets.ModelViewSet):
    permission_classes = [IsStaffUser]
    pagination_class = StandardPagination
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]


class StaffReadOnlyViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only, staff-only, and actually searchable.

    DRF's default `filter_backends` is an empty list. A viewset that declares
    `search_fields` but forgets to declare `filter_backends` therefore accepts
    `?search=` and silently ignores it — the page looks like it is searching and
    quietly returns the whole collection.

    Every read-only admin list inherits this so that cannot happen by omission.
    """

    permission_classes = [IsStaffUser]
    pagination_class = StandardPagination
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]


class StudentViewSet(StaffReadOnlyViewSet):
    serializer_class = AdminUserSerializer
    search_fields = ["email", "first_name", "last_name"]
    ordering_fields = ["date_joined", "email"]

    def get_queryset(self):
        return User.objects.filter(is_staff=False).select_related("profile").annotate(_purchase_count=Count("class_purchases", filter=Q(class_purchases__status=PurchaseStatus.ACTIVE))).order_by("-date_joined")


class ClassViewSet(StaffModelViewSet):
    serializer_class = AdminClassSerializer
    search_fields = ["name", "slug"]
    queryset = ClassLevel.objects.all()


class StreamViewSet(StaffModelViewSet):
    serializer_class = AdminStreamSerializer
    search_fields = ["name", "slug"]
    queryset = Stream.objects.prefetch_related("class_levels")


class SubjectViewSet(StaffModelViewSet):
    serializer_class = AdminSubjectSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "slug", "description"]
    ordering_fields = ["display_order", "name", "created_at"]

    def get_queryset(self):
        # NOTE the annotation alias.
        #
        # `Subject.chapter_count` is a Python `@property` on the model, and
        # Django applies query annotations with `setattr(instance, name, value)`.
        # Annotating under that same name raises
        # `AttributeError: property 'chapter_count' of 'Subject' object has no
        # setter`, which surfaced as a 500 across this whole endpoint.
        #
        # Annotating as `admin_chapter_count` keeps the list to a single query
        # while leaving the model property untouched.
        queryset = Subject.objects.select_related("class_level", "stream").annotate(
            admin_chapter_count=Count("chapters", filter=Q(chapters__is_active=True))
        )

        params = self.request.query_params
        if params.get("class"):
            queryset = queryset.filter(class_level_id=params["class"])
        if params.get("stream"):
            queryset = queryset.filter(stream_id=params["stream"])
        if params.get("status") in ("true", "false"):
            queryset = queryset.filter(is_active=params["status"] == "true")

        return queryset.order_by("class_level__display_order", "display_order", "name")


class ChapterViewSet(StaffModelViewSet):
    """Chapters, filterable down the same hierarchy the create form walks.

    `class`, `stream`, `subject` and `status` all narrow the same queryset, so
    a chapter can be found by any level of Class -> Stream -> Subject without
    the client having to know the primary keys of the levels above.
    """

    serializer_class = AdminChapterSerializer
    search_fields = ["name", "slug", "description"]
    ordering_fields = ["display_order", "number", "name", "created_at"]

    def get_queryset(self):
        # `Chapter` has no `content_count` property, so unlike `Subject` this
        # annotation cannot collide with the model.
        queryset = Chapter.objects.select_related(
            "subject", "subject__class_level", "subject__stream"
        ).annotate(content_count=Count("contents"))

        params = self.request.query_params
        if params.get("class"):
            queryset = queryset.filter(subject__class_level_id=params["class"])
        if params.get("stream"):
            queryset = queryset.filter(subject__stream_id=params["stream"])
        if params.get("subject"):
            queryset = queryset.filter(subject_id=params["subject"])
        if params.get("status") in ("true", "false"):
            queryset = queryset.filter(is_active=params["status"] == "true")

        return queryset.order_by(
            "subject__class_level__display_order",
            "subject__display_order",
            "number",
            "id",
        )


class ContentViewSet(StaffModelViewSet):
    serializer_class = AdminContentSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    search_fields = ["title", "slug", "description"]

    def get_queryset(self):
        queryset = Content.objects.select_related("chapter__subject__class_level")
        if self.request.query_params.get("class"):
            queryset = queryset.filter(chapter__subject__class_level_id=self.request.query_params["class"])
        if self.request.query_params.get("stream"):
            queryset = queryset.filter(chapter__subject__stream_id=self.request.query_params["stream"])
        if self.request.query_params.get("subject"):
            queryset = queryset.filter(chapter__subject_id=self.request.query_params["subject"])
        if self.request.query_params.get("chapter"):
            queryset = queryset.filter(chapter_id=self.request.query_params["chapter"])
        if self.request.query_params.get("type"):
            queryset = queryset.filter(content_type=self.request.query_params["type"])
        if self.request.query_params.get("published") in ("true", "false"):
            queryset = queryset.filter(is_published=self.request.query_params["published"] == "true")
        return queryset

    @action(detail=True, methods=["get"], url_path="document")
    def document(self, request, pk=None):
        """`GET /api/v1/admin/content/{id}/document/` - the stored PDF bytes.

        Staff-only, by inheritance from `IsStaffUser`. Deliberately *not*
        filtered by `is_published` and deliberately *not* gated by
        `has_class_access`: an administrator has to be able to check a draft
        before publishing it, and staff are the authors of this material. No
        purchase is consulted and none is implied.
        """
        instance = self.get_object()
        return serve_inline_document(instance.file)

    def perform_create(self, serializer):
        instance = serializer.save()
        if instance.is_published:
            _notify_publication("content", instance)
        return None

    def perform_update(self, serializer):
        was_published = serializer.instance.is_published
        instance = serializer.save()
        if instance.is_published and not was_published:
            _notify_publication("content", instance)
        return None


def _notify_publication(kind: str, row) -> None:
    """Announce a newly published row. No-op unless it just became published."""
    from apps.admin_api import notifications

    if kind == "content":
        notifications.content_published(title=row.title, content_id=row.pk)
    else:
        notifications.resource_published(title=row.title, resource_id=row.pk)


class PurchaseViewSet(StaffReadOnlyViewSet):
    serializer_class = AdminPurchaseSerializer
    search_fields = ["user__email", "user__first_name", "user__last_name"]

    def get_queryset(self):
        queryset = ClassPurchase.objects.select_related("user", "class_level", "approved_by")
        if self.request.query_params.get("status"):
            queryset = queryset.filter(status=self.request.query_params["status"])
        if self.request.query_params.get("class"):
            queryset = queryset.filter(class_level_id=self.request.query_params["class"])
        return queryset


class PaymentViewSet(StaffReadOnlyViewSet):
    serializer_class = AdminPaymentSerializer
    search_fields = ["user__email", "user__first_name", "user__last_name", "utr", "transaction_id"]
    ordering_fields = ["submitted_at", "reviewed_at", "status"]

    def get_queryset(self):
        queryset = PaymentProof.objects.select_related("user", "class_purchase__class_level", "reviewed_by").order_by("-submitted_at")
        if self.request.query_params.get("status"):
            queryset = queryset.filter(status=self.request.query_params["status"])
        if self.request.query_params.get("class"):
            queryset = queryset.filter(class_purchase__class_level_id=self.request.query_params["class"])
        return queryset

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        proof = self.get_object()
        approved = approve_payment(proof, request.user)
        return Response(AdminPaymentSerializer(approved).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        reason = (request.data.get("reason") or "").strip()
        if not reason:
            return Response({"reason": ["A rejection reason is required."]}, status=400)
        rejected = reject_payment(self.get_object(), request.user, reason)
        return Response(AdminPaymentSerializer(rejected).data)


class OtherResourceCategoryAdminViewSet(viewsets.ModelViewSet):
    """`/api/v1/admin/other-resource-categories/`"""

    permission_classes = [IsStaffUser]
    pagination_class = StandardPagination
    serializer_class = AdminOtherResourceCategorySerializer
    # Required, not optional: without it DRF never applies SearchFilter and a
    # `?search=` parameter is silently ignored.
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "slug", "description"]
    ordering_fields = ["display_order", "name", "created_at"]
    queryset = OtherResourceCategory.objects.all()


class OtherResourceAdminViewSet(viewsets.ModelViewSet):
    """`/api/v1/admin/other-resources/`

    Publishing is a PATCH of `is_published`; there is no separate "publish"
    endpoint, so the flag can never be set inconsistently with a status change.
    """

    permission_classes = [IsStaffUser]
    pagination_class = StandardPagination
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    serializer_class = AdminOtherResourceSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["title", "slug", "description"]
    ordering_fields = ["display_order", "title", "created_at"]
    queryset = OtherResource.objects.select_related("category")

    def get_queryset(self):
        queryset = OtherResource.objects.select_related("category")

        category = self.request.query_params.get("category")
        if category:
            queryset = queryset.filter(category_id=category)

        published = self.request.query_params.get("published")
        if published in ("true", "false"):
            queryset = queryset.filter(is_published=published == "true")

        return queryset.order_by("display_order", "title")

    @action(detail=True, methods=["get"], url_path="document")
    def document(self, request, pk=None):
        """`GET /api/v1/admin/other-resources/{id}/document/`

        The same staff-only inline preview as class content. Other Resources have
        no class, chapter or purchase, so there is nothing here for
        `has_class_access` to decide even in principle.
        """
        instance = self.get_object()
        return serve_inline_document(instance.file)

    def perform_create(self, serializer):
        instance = serializer.save()
        if instance.is_published:
            _notify_publication("resource", instance)
        return None

    def perform_update(self, serializer):
        was_published = serializer.instance.is_published
        instance = serializer.save()
        if instance.is_published and not was_published:
            _notify_publication("resource", instance)
        return None


class UPIViewSet(viewsets.ViewSet):
    permission_classes = [IsStaffUser]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def list(self, request):
        return Response(AdminUPISerializer(UPISettings.load() or UPISettings(pk=1)).data)

    def partial_update(self, request, pk=None):
        instance = UPISettings.load() or UPISettings(pk=1)
        serializer = AdminUPISerializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(AdminUPISerializer(serializer.instance).data)
