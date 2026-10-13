"""Payment routes, mounted under `/api/v1/`."""

from __future__ import annotations

from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import PaymentProofViewSet, UPISettingsView

router = DefaultRouter()
router.register("payments/proofs", PaymentProofViewSet, basename="payment-proof")

urlpatterns = [
    path("payments/upi/", UPISettingsView.as_view({"get": "list"}), name="upi-settings"),
    # The configured UPI QR. Public on purpose — a student has to be able to
    # see the QR they are paying with, and the receiving address is not
    # secret. Routed explicitly because `UPISettingsView` is not on a router,
    # so `@action` alone would never produce a route.
    path(
        "payments/upi/qr/",
        UPISettingsView.as_view({"get": "qr"}),
        name="upi-qr",
    ),
    # Flat alias so the frontend contract is `GET /api/v1/payments/my/`
    # rather than the router's nested `/payments/proofs/my/`.
    path(
        "payments/my/",
        PaymentProofViewSet.as_view({"get": "my_proofs"}),
        name="my-payment-proofs",
    ),
    *router.urls,
]
