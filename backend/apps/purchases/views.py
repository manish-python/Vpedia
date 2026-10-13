"""Purchase endpoints.

* `POST /api/v1/purchases/`        — create a PENDING request (student)
* `GET  /api/v1/purchases/my/`     — the caller's own purchases
* `GET  /api/v1/purchases/upi/`    — UPI details + `upi://pay` URI for a purchase
* `GET  /api/v1/purchases/<id>/access/` — entitlement check

Write routes require authentication. Authentication itself lands in a later
stage, so until then no authenticator is enabled and these routes are closed
to real callers; tests drive them with `force_authenticate`.
"""

from __future__ import annotations

from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.academics.serializers import class_number_for
from apps.core.exceptions import ServiceError
from apps.core.permissions import IsOwnerOrStaff
from apps.payments.services import get_upi_payment_context

from .models import ClassPurchase
from .serializers import ClassPurchaseSerializer, PurchaseRequestSerializer
from .services import create_purchase_request, has_class_access


class ClassPurchaseViewSet(
    mixins.ListModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet
):
    """`/api/v1/purchases/`

    A `GenericViewSet` rather than a bare `ViewSet` so that `get_object()` is
    available and every detail route runs DRF's object permission check.
    """

    permission_classes = [IsAuthenticated]
    queryset = ClassPurchase.objects.select_related("class_level", "stream")
    serializer_class = ClassPurchaseSerializer

    def get_queryset(self):
        """Full queryset.

        Ownership is enforced by `IsOwnerOrStaff` on detail routes and by
        `list` below, so staff can still open any purchase.
        """
        return self.queryset.order_by("-created_at")

    def list(self, request):
        """Every purchase belonging to the caller, newest first."""
        queryset = self.get_queryset()
        if not request.user.is_staff:
            queryset = queryset.filter(user=request.user)
        return Response(ClassPurchaseSerializer(queryset, many=True).data)

    def create(self, request):
        """Create a PENDING purchase at the server-configured price."""
        serializer = PurchaseRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            purchase = create_purchase_request(
                user=request.user,
                class_level=serializer.validated_data["class_level"],
                stream=serializer.validated_data.get("stream"),
            )
        except ServiceError as exc:
            return Response({"detail": exc.message}, status=status.HTTP_409_CONFLICT)

        return Response(
            ClassPurchaseSerializer(purchase).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["get"], url_path="my")
    def my_purchases(self, request):
        """Alias kept explicit for the frontend contract."""
        return self.list(request)

    @action(detail=True, methods=["get"], permission_classes=[IsAuthenticated, IsOwnerOrStaff])
    def upi(self, request, pk: int | None = None):
        """UPI ID, QR and a standard `upi://pay` URI for this purchase.

        Returns instructions for completing payment in an external UPI
        application. Nothing here implies the payment succeeded.
        """
        purchase = self.get_object()

        try:
            context = get_upi_payment_context(purchase)
        except ServiceError as exc:
            return Response({"detail": exc.message}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        return Response(context)

    @action(detail=True, methods=["get"], url_path="access")
    def access(self, request, pk: int | None = None):
        """Server-side entitlement for this purchase."""
        purchase = self.get_object()

        has_access = has_class_access(request.user, purchase.class_level)
        return Response(
            {
                "purchase_id": purchase.id,
                "class_level": purchase.class_level_id,
                "class_name": purchase.class_level.name,
                "status": purchase.status,
                "has_access": has_access,
                "message": (
                    "Access active."
                    if has_access
                    else "Access is granted only after an administrator approves your payment."
                ),
            }
        )


class MyClassesAccessViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """`GET /api/v1/my-classes/` — every class the caller may read."""

    permission_classes = [IsAuthenticated]
    queryset = ClassPurchase.objects.select_related("class_level", "stream")
    serializer_class = ClassPurchaseSerializer

    def list(self, request):
        from apps.purchases.models import PurchaseStatus

        queryset = (
            ClassPurchase.objects.filter(
                user=request.user, status=PurchaseStatus.ACTIVE
            )
            .select_related("class_level", "stream")
            .order_by("class_level__display_order")
        )
        return Response(
            {
                "count": queryset.count(),
                "results": [
                    {
                        "class_level": purchase.class_level_id,
                        # Class number 7-12, derived. The frontend addresses
                        # classes by number, so shipping it here avoids
                        # mapping the primary key client-side.
                        "number": class_number_for(purchase.class_level),
                        "class_name": purchase.class_level.name,
                        "stream": purchase.stream_id,
                        "stream_name": purchase.stream.name if purchase.stream else None,
                        "activated_at": purchase.activated_at,
                    }
                    for purchase in queryset
                ],
            }
        )
