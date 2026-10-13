"""Catalogue routes, mounted under `/api/v1/`."""

from __future__ import annotations

from rest_framework.routers import DefaultRouter

from .views import ChapterViewSet, ClassLevelViewSet, StreamViewSet, SubjectViewSet

router = DefaultRouter()
router.register("classes", ClassLevelViewSet, basename="class")
router.register("streams", StreamViewSet, basename="stream")
router.register("subjects", SubjectViewSet, basename="subject")
router.register("chapters", ChapterViewSet, basename="chapter")

urlpatterns = router.urls
