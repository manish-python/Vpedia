"""Resource routes, mounted under `/api/v1/`.

Route order matters: `other-resource-categories/` is declared before the
`other-resources/` router so the literal prefix cannot be swallowed by it.
"""

from __future__ import annotations

from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import OtherResourceCategoryViewSet, OtherResourceViewSet

router = DefaultRouter()
router.register("other-resources", OtherResourceViewSet, basename="other-resource")

urlpatterns = [
    path(
        "other-resource-categories/",
        OtherResourceCategoryViewSet.as_view({"get": "list"}),
        name="other-resource-categories",
    ),
    *router.urls,
]