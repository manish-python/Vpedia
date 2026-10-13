"""Purchase routes, mounted under `/api/v1/`."""

from __future__ import annotations

from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import ClassPurchaseViewSet, MyClassesAccessViewSet

router = DefaultRouter()
router.register("purchases", ClassPurchaseViewSet, basename="purchase")

urlpatterns = [
    path(
        "my-classes/",
        MyClassesAccessViewSet.as_view({"get": "list"}),
        name="my-classes",
    ),
    *router.urls,
]
