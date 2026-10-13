"""Payment endpoints.

* `GET  /api/v1/payments/upi/`        — active UPI configuration
* `POST /api/v1/payments/proofs/`     — submit payment evidence (student)
* `GET  /api/v1/payments/my/`         — the caller's own proofs
* `POST /api/v1/payments/proofs/<id>/approve/` — staff only
* `POST /api/v1/payments/proofs/<id>/reject/`  — staff only

Review routes are guarded by `IsPaymentReviewer`, so a student receives 403
even if they craft the request by hand. The endpoints delegate to
`apps.payments.services`; the business rules are not reimplemented here.
"""

from __future__ import annotations

import mimetypes

from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404  # noqa: F401  (kept for future views)
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.core.exceptions import ServiceError
from apps.purchases.models import ClassPurchase

from .models import PaymentProof, UPISettings
from .permissions import IsPaymentReviewer, IsPaymentOwnerOrStaff
from .serializers import (
    PaymentProofSerializer,
    PaymentProofSubmissionSerializer,
    UPISettingsSerializer,
)
from .services import add_admin_note, approve_payment, reject_payment, submit_payment_proof

#: Public route that serves the configured UPI QR. Defined in `serializers` so
#: the serializer and the view cannot drift apart; re-exported here for
#: readability.
from .serializers import UPI_QR_PATH  # noqa: E402


class UPISettingsView(mixins.ListModelMixin, viewsets.GenericViewSet):
    permission_classes = [AllowAny]
    queryset = UPISettings.objects.none()
    serializer_class = UPISettingsSerializer

    def list(self, request):
        settings_row = UPISettings.load()
        if settings_row is None:
            return Response(
                {"detail": "Payments are not available at the moment."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response(UPISettingsSerializer(settings_row).data)

    @action(detail=False, methods=["get"], url_path="qr")
    def qr(self, request):
        """`GET /api/v1/payments/upi/qr/` — the configured QR image.

        The one deliberately public file in this project.

        `apps.core.views.private_media` stays staff-only, which is right for
        payment screenshots and administrator uploads. But a student cannot pay
        from a QR they are not allowed to see, and the receiving UPI address is
        not secret — it is published on the site deliberately, so anyone may
        read it.

        Narrowly scoped to this single configured file rather than loosening
        the media guard: no path is taken from the request, so there is nothing
        here to traverse.
        """
        settings_row = UPISettings.load()
        if settings_row is None or not settings_row.qr_code:
            raise Http404("No UPI QR code has been configured.")

        handle = settings_row.qr_code.open("rb")
        content_type, _ = mimetypes.guess_type(settings_row.qr_code.name)
        response = FileResponse(handle, content_type=content_type or "image/png")
        # Short cache only. An administrator replacing the QR changes the
        # stored path, so a stale entry cannot be served for long.
        response["Cache-Control"] = "public, max-age=300"
        response["X-Content-Type-Options"] = "nosniff"
        return response


class PaymentProofViewSet(
    mixins.ListModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet
):
    """`/api/v1/payments/proofs/`

    A `GenericViewSet` rather than a bare `ViewSet` so that `get_object()` is
    available and every detail route runs DRF's object permission check.
    """

    permission_classes = [IsAuthenticated]
    queryset = PaymentProof.objects.select_related(
        "class_purchase", "class_purchase__class_level", "reviewed_by"
    )
    serializer_class = PaymentProofSerializer

    # NOTE: `IsPaymentOwnerOrStaff` is applied per-method below rather than as
    # a viewset default, because `list` and `create` have no object to check.
    # Every method that resolves a single proof (retrieve, approve, reject,
    # note) declares it explicitly.

    def get_queryset(self):
        """Full queryset.

        Deliberately not filtered by owner here: ownership is enforced by
        `IsPaymentOwnerOrStaff` on detail routes and by `list` below, so a
        staff member can still open any proof for review.
        """
        return self.queryset.order_by("-submitted_at")

    def list(self, request):
        queryset = self.get_queryset()

        if not request.user.is_staff:
            queryset = queryset.filter(user=request.user)
        elif request.query_params.get("scope") != "all":
            # Staff see their own proofs by default; `?scope=all` lists every
            # proof for the review queue.
            queryset = queryset.filter(user=request.user)

        return Response(PaymentProofSerializer(queryset, many=True).data)

    @action(
        detail=False,
        methods=["get"],
        url_path="my",
    )
    def my_proofs(self, request):
        """Alias kept explicit for the frontend contract."""
        return self.list(request)

    @action(
        detail=True,
        methods=["get"],
        permission_classes=[IsAuthenticated, IsPaymentOwnerOrStaff],
        url_path="detail",
    )
    def proof_detail(self, request, pk: int | None = None):
        """`GET /api/v1/payments/proofs/{id}/detail/`

        Uses `self.get_object()`, so DRF's object permission check runs and a
        student cannot read another student's proof even with a valid id.
        """
        proof = self.get_object()
        return Response(PaymentProofSerializer(proof).data)

    def create(self, request):
        """Record payment evidence. Does NOT unlock anything."""
        serializer = PaymentProofSubmissionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        purchase: ClassPurchase = data["class_purchase"]

        try:
            proof = submit_payment_proof(
                user=request.user,
                class_purchase=purchase,
                utr=data["utr"],
                transaction_id=data.get("transaction_id", ""),
                screenshot=data["screenshot"],
            )
        except ServiceError as exc:
            return Response({"detail": exc.message}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:  # noqa: BLE001 - surfaced as 400 below
            # Unique UTR collisions land here as an integrity error.
            if "utr" in str(exc).lower():
                return Response(
                    {"utr": ["This transaction reference has already been submitted."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            raise

        return Response(
            PaymentProofSerializer(proof).data, status=status.HTTP_201_CREATED
        )

    @action(
        detail=True,
        methods=["get"],
        permission_classes=[IsAuthenticated, IsPaymentOwnerOrStaff],
    )
    def detail(self, request, pk: int | None = None):
        # `self.get_object()` runs DRF's object permission check, so a student
        # cannot read another student's proof even with a valid id.
        proof = self.get_object()
        return Response(PaymentProofSerializer(proof).data)

    # --- Staff review ---------------------------------------------------
    # `IsPaymentReviewer` requires an active staff member, so a student
    # cannot approve or reject, including their own payment.

    @action(
        detail=True,
        methods=["post"],
        permission_classes=[IsAuthenticated, IsPaymentReviewer],
    )
    def approve(self, request, pk: int | None = None):
        proof = self.get_object()
        try:
            approved = approve_payment(proof, request.user)
        except ServiceError as exc:
            return Response({"detail": exc.message}, status=status.HTTP_409_CONFLICT)

        purchase = approved.class_purchase
        return Response(
            {
                "payment": PaymentProofSerializer(approved).data,
                "purchase": {
                    "id": purchase.id,
                    "status": purchase.status,
                    "activated_at": purchase.activated_at,
                    "class_level": purchase.class_level_id,
                },
            }
        )

    @action(
        detail=True,
        methods=["post"],
        permission_classes=[IsAuthenticated, IsPaymentReviewer],
    )
    def reject(self, request, pk: int | None = None):
        proof = self.get_object()
        reason = (request.data.get("reason") or "").strip()
        if not reason:
            return Response(
                {"reason": ["A rejection reason is required."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            rejected = reject_payment(proof, request.user, reason)
        except ServiceError as exc:
            return Response({"detail": exc.message}, status=status.HTTP_409_CONFLICT)

        return Response(PaymentProofSerializer(rejected).data)

    @action(
        detail=True,
        methods=["post"],
        permission_classes=[IsAuthenticated, IsPaymentReviewer],
    )
    def note(self, request, pk: int | None = None):
        proof = self.get_object()
        note = request.data.get("admin_note", "")
        updated = add_admin_note(proof, request.user, note)
        return Response(PaymentProofSerializer(updated).data)
