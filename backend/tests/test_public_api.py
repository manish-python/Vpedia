"""Catalogue and infrastructure endpoints.

Covers required tests 1 and 2.
"""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.academics.models import Chapter, ClassLevel, Subject


@pytest.fixture
def api() -> APIClient:
    return APIClient()


# --- 1. Health endpoint ---------------------------------------------------


@pytest.mark.django_db
def test_health_endpoint_reports_ok(api):
    response = api.get("/api/v1/health/")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "VPEDIA LEARNING API"}


# --- 2. Classes can be retrieved -----------------------------------------


@pytest.mark.django_db
def test_classes_endpoint_lists_purchasable_classes(api, class_7, class_10):
    response = api.get("/api/v1/classes/")

    assert response.status_code == 200
    names = [row["name"] for row in response.json()]
    assert "Class 7" in names
    assert "Class 10" in names


@pytest.mark.django_db
def test_classes_endpoint_hides_inactive_classes(api, class_7):
    ClassLevel.objects.filter(pk=class_7.pk).update(is_active=False)

    response = api.get("/api/v1/classes/")

    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.django_db
def test_subjects_and_chapters_are_retrievable(api, maths_chapter):
    subject_response = api.get("/api/v1/subjects/")
    chapter_response = api.get("/api/v1/chapters/")

    assert subject_response.status_code == 200
    assert any(row["name"] == "Mathematics" for row in subject_response.json())

    assert chapter_response.status_code == 200
    assert any(row["name"] == "Real Numbers" for row in chapter_response.json())


@pytest.mark.django_db
def test_stream_endpoint_lists_configured_streams(api, class_11, science_stream):
    response = api.get("/api/v1/streams/?class=class-11")

    assert response.status_code == 200
    assert [row["name"] for row in response.json()] == ["Science"]
