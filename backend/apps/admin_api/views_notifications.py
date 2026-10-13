"""Admin notification endpoints.

    GET   /api/v1/admin/notifications/            list, filter, paginate
    GET   /api/v1/admin/notifications/unread-count/
    PATCH /api/v1/admin/notifications/<id>/read/
    POST  /api/v1/admin/notifications/mark-all-read/

Deliberately **no** create endpoint. Notifications are produced by the code that
performs the underlying work; letting a client POST one would let anyone forge
"payment approved". A `POST` to the collection returns 405.

All routes are `IsStaffUser`, so a student receives 403 and an anonymous
caller 401.
"""

from __future__ import annotations

from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import AdminNotification
from .serializers import AdminNotificationSerializer
from .views import StaffReadOnlyViewSet


class AdminNotificationViewSet(StaffReadOnlyViewSet):
    serializer_class = AdminNotificationSerializer
    search_fields = ["title", "message"]
    ordering_fields = ["created_at"]

    def get_queryset(self):
        queryset = AdminNotification.objects.all()
        params = self.request.query_params

        if params.get("unread") in ("true", "false"):
            queryset = queryset.filter(is_read=params["unread"] != "true")

        notification_type = params.get("type")
        if notification_type:
            queryset = queryset.filter(type=notification_type)

        # `group` backs the Notification Center's tabs.
        group = params.get("group")
        if group == "payments":
            queryset = queryset.filter(
                type__in=[
                    "PAYMENT_REQUEST",
                    "PAYMENT_APPROVED",
                    "PAYMENT_REJECTED",
                ]
            )
        elif group == "students":
            queryset = queryset.filter(type="NEW_STUDENT")
        elif group == "system":
            queryset = queryset.filter(type__in=["SYSTEM_ALERT", "CONTENT_PUBLISHED", "RESOURCE_PUBLISHED"])

        return queryset.order_by("-created_at", "-id")

    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request):
        """Cheap poll target for the header bell."""
        return Response({"unread": self.get_queryset().filter(is_read=False).count()})

    @action(detail=True, methods=["patch"], url_path="read")
    def mark_read(self, request, pk=None):
        note = self.get_object()
        if not note.is_read:
            note.mark_read()
        return Response(self.get_serializer(note).data)

    @action(detail=False, methods=["post"], url_path="mark-all-read")
    def mark_all_read(self, request):
        from django.utils import timezone

        updated = self.get_queryset().filter(is_read=False).update(
            is_read=True, read_at=timezone.now()
        )
        return Response({"marked": updated}, status=status.HTTP_200_OK)