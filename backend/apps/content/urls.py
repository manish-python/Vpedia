"""Content routes, mounted under `/api/v1/`."""

from __future__ import annotations

from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import ChapterContentViewSet, ContentViewSet

router = DefaultRouter()
router.register("contents", ContentViewSet, basename="content")

urlpatterns = [
    path(
        "chapters/<slug:chapter_slug>/contents/",
        ChapterContentViewSet.as_view({"get": "list"}),
        name="chapter-contents",
    ),
    *router.urls,
]
