"""Tests for Class Content management and the independent Other Resources system.

Two things are under test, and the important one is that they stay separate:

* `apps.content.Content` — belongs to a chapter, gated by `has_class_access`.
* `apps.resources.OtherResource` — belongs to nothing, gated only by
  `is_published`, and must never touch a `ClassPurchase`.
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test.client import BOUNDARY, encode_multipart

from apps.academics.models import Chapter, ClassLevel, Stream, Subject
from apps.content.models import Content, ContentType
from apps.purchases.models import ClassPurchase, PurchaseStatus
from apps.resources.models import OtherResource, OtherResourceCategory

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def pdf_bytes() -> bytes:
    """A minimal but genuine PDF payload.

    Byte-for-byte the same document conftest.py builds, so a file uploaded
    through one fixture compares equal to bytes downloaded through another.
    """
    return b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"


def pdf_upload(name: str = "notes.pdf") -> SimpleUploadedFile:
    return SimpleUploadedFile(name, pdf_bytes(), content_type="application/pdf")


def post_multipart(client, url: str, data: dict):
    """POST/PATCH multipart the way a browser sends it (real boundary)."""
    return client.generic(
        "POST",
        url,
        data=encode_multipart(BOUNDARY, data),
        content_type=f"multipart/form-data; boundary={BOUNDARY}",
    )


def patch_multipart(client, url: str, data: dict):
    return client.generic(
        "PATCH",
        url,
        data=encode_multipart(BOUNDARY, data),
        content_type=f"multipart/form-data; boundary={BOUNDARY}",
    )


def admin_session(client, user, password="admin-pass-123"):
    response = client.post(
        "/api/v1/admin/login/", {"email": user.email, "password": password}
    )
    assert response.status_code == 200, response.content
    return response


# `resource_category` and `other_resource` now live in conftest.py so
# every admin test module can build the Other Resources tree.


# ===========================================================================
# CLASS CONTENT — staff CRUD
# ===========================================================================


@pytest.mark.django_db
def test_staff_can_list_class_content(client, admin_user, published_content):
    admin_session(client, admin_user)
    body = client.get("/api/v1/admin/content/").json()
    assert body["count"] == 1
    assert body["results"][0]["title"] == published_content.title


@pytest.mark.django_db
def test_staff_can_create_class_content_as_draft(client, admin_user, maths_chapter):
    admin_session(client, admin_user)
    response = post_multipart(
        client,
        "/api/v1/admin/content/",
        {
            "chapter": maths_chapter.pk,
            "title": "Real Numbers Complete Notes",
            "content_type": ContentType.NOTES,
            "is_published": "false",
            "file": pdf_upload("real-numbers-notes.pdf"),
        },
    )
    assert response.status_code == 201, response.content
    assert response.json()["is_published"] is False
    # No slug was sent; the backend derived one, as the admin form relies on.
    assert response.json()["slug"]
    assert Content.objects.filter(title="Real Numbers Complete Notes").exists()


@pytest.mark.django_db
def test_class_content_slug_is_optional_but_still_honoured(client, admin_user, maths_chapter):
    """An explicit slug keeps an existing URL stable; omitting one derives it."""
    admin_session(client, admin_user)

    derived = post_multipart(
        client,
        "/api/v1/admin/content/",
        {
            "chapter": maths_chapter.pk,
            "title": "Derived Slug",
            "content_type": ContentType.NOTES,
            "file": pdf_upload("a.pdf"),
        },
    )
    assert derived.status_code == 201
    assert derived.json()["slug"] == str(maths_chapter.pk) + "-derived-slug"

    explicit = post_multipart(
        client,
        "/api/v1/admin/content/",
        {
            "chapter": maths_chapter.pk,
            "title": "Explicit Slug",
            "slug": "stable-url-key",
            "content_type": ContentType.NOTES,
            "file": pdf_upload("b.pdf"),
        },
    )
    assert explicit.status_code == 201
    assert explicit.json()["slug"] == "stable-url-key"


@pytest.mark.django_db
def test_staff_can_publish_and_unpublish_class_content(client, admin_user, published_content):
    admin_session(client, admin_user)

    unpublish = client.patch(
        f"/api/v1/admin/content/{published_content.pk}/",
        {"is_published": "false"},
        content_type="application/json",
    )
    assert unpublish.status_code == 200
    published_content.refresh_from_db()
    assert published_content.is_published is False

    publish = client.patch(
        f"/api/v1/admin/content/{published_content.pk}/",
        {"is_published": "true"},
        content_type="application/json",
    )
    assert publish.status_code == 200
    published_content.refresh_from_db()
    assert published_content.is_published is True


@pytest.mark.django_db
def test_staff_can_update_class_content_metadata(
    client, admin_user, published_content
):
    admin_session(client, admin_user)
    response = client.patch(
        f"/api/v1/admin/content/{published_content.pk}/",
        {"title": "Renamed Notes", "display_order": 5},
        content_type="application/json",
    )
    assert response.status_code == 200
    published_content.refresh_from_db()
    assert published_content.title == "Renamed Notes"
    assert published_content.display_order == 5


@pytest.mark.django_db
def test_class_content_filters_by_class_subject_chapter_type(
    client, admin_user, class_10, maths_chapter, published_content
):
    admin_session(client, admin_user)

    for params in (
        f"class={class_10.pk}",
        f"subject={maths_chapter.subject_id}",
        f"chapter={maths_chapter.pk}",
        "type=NOTES",
        "published=true",
    ):
        body = client.get(f"/api/v1/admin/content/?{params}").json()
        assert body["count"] == 1, f"filter {params} returned nothing"

    assert client.get("/api/v1/admin/content/?type=PYQ").json()["count"] == 0


@pytest.mark.django_db
def test_class_content_filters_by_stream(client, admin_user, class_11, science_stream):
    """Stream is meaningful only for Classes 11 and 12."""
    subject = Subject.objects.create(
        class_level=class_11, stream=science_stream, name="Physics",
        slug="class-11-science-physics",
    )
    chapter = Chapter.objects.create(subject=subject, number=1, name="Units")
    Content.objects.create(
        chapter=chapter, title="Physics Notes", slug="class-11-science-physics-units-notes",
        content_type=ContentType.NOTES, file=pdf_upload(), is_published=True,
    )

    admin_session(client, admin_user)
    matched = client.get(f"/api/v1/admin/content/?stream={science_stream.pk}").json()
    assert matched["count"] == 1
    assert matched["results"][0]["class_name"] == "Class 11"

    other = client.get("/api/v1/admin/content/?stream=999999").json()
    assert other["count"] == 0


# ===========================================================================
# CLASS CONTENT — security
# ===========================================================================


@pytest.mark.django_db
def test_anonymous_cannot_reach_admin_content_api(client):
    assert client.get("/api/v1/admin/content/").status_code == 401
    assert client.post("/api/v1/admin/content/", {}).status_code == 401


@pytest.mark.django_db
def test_student_cannot_upload_publish_or_update_class_content(
    client, student, maths_chapter, published_content
):
    client.force_login(student)

    assert client.get("/api/v1/admin/content/").status_code == 403
    assert post_multipart(
        client,
        "/api/v1/admin/content/",
        {
            "chapter": maths_chapter.pk,
            "title": "Sneaky",
            "slug": "sneaky",
            "content_type": ContentType.NOTES,
            "file": pdf_upload(),
        },
    ).status_code == 403

    assert client.patch(
        f"/api/v1/admin/content/{published_content.pk}/",
        {"is_published": "true"},
        content_type="application/json",
    ).status_code == 403

    # Nothing was created and nothing was published.
    assert Content.objects.count() == 1
    published_content.refresh_from_db()
    assert published_content.is_published is True


@pytest.mark.django_db
def test_inactive_staff_account_cannot_use_admin_api(client, admin_user):
    admin_user.is_active = False
    admin_user.save(update_fields=["is_active"])
    client.force_login(admin_user)

    # Django's auth backend refuses to resolve an inactive account from a
    # session at all, so the caller becomes anonymous (401). Either refusal is
    # correct; what matters is that the admin API is not reachable.
    assert client.get("/api/v1/admin/content/").status_code in (401, 403)


@pytest.mark.django_db
def test_non_staff_cannot_use_admin_password_login(client, student):
    response = client.post(
        "/api/v1/admin/login/", {"email": student.email, "password": "anything"}
    )
    assert response.status_code == 401


# ===========================================================================
# CLASS CONTENT — validation
# ===========================================================================


@pytest.mark.django_db
def test_invalid_pdf_extension_is_rejected(client, admin_user, maths_chapter):
    admin_session(client, admin_user)
    response = post_multipart(
        client,
        "/api/v1/admin/content/",
        {
            "chapter": maths_chapter.pk,
            "title": "Malware",
            "content_type": ContentType.NOTES,
            "file": SimpleUploadedFile("payload.exe", b"MZ\x90\x00", "application/pdf"),
        },
    )
    assert response.status_code == 400
    assert "pdf" in str(response.json()).lower()
    assert Content.objects.count() == 0


@pytest.mark.django_db
def test_renamed_zip_is_rejected_even_with_a_pdf_extension(
    client, admin_user, maths_chapter
):
    """The extension check alone is forgeable; magic bytes are not."""
    admin_session(client, admin_user)
    response = post_multipart(
        client,
        "/api/v1/admin/content/",
        {
            "chapter": maths_chapter.pk,
            "title": "Disguised archive",
            "content_type": ContentType.NOTES,
            "file": SimpleUploadedFile("notes.pdf", b"PK\x03\x04zip-content", "application/pdf"),
        },
    )
    assert response.status_code == 400
    assert Content.objects.count() == 0


@pytest.mark.django_db
def test_content_for_unknown_chapter_is_rejected(client, admin_user):
    admin_session(client, admin_user)
    response = post_multipart(
        client,
        "/api/v1/admin/content/",
        {
            "chapter": 999999,
            "title": "Orphan",
            "content_type": ContentType.NOTES,
            "file": pdf_upload(),
        },
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_invalid_content_type_is_rejected(client, admin_user, maths_chapter):
    admin_session(client, admin_user)
    response = post_multipart(
        client,
        "/api/v1/admin/content/",
        {
            "chapter": maths_chapter.pk,
            "title": "Bad type",
            "content_type": "VIDEO",
            "file": pdf_upload(),
        },
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_invalid_subject_stream_relation_is_rejected(client, admin_user, class_10, science_stream):
    """Class 10 does not use streams; Class 11 requires one."""
    admin_session(client, admin_user)

    with_stream = client.post(
        "/api/v1/admin/subjects/",
        {
            "class_level": class_10.pk,
            "stream": science_stream.pk,
            "name": "Wrong",
            "slug": "class-10-wrong",
        },
        content_type="application/json",
    )
    assert with_stream.status_code == 400
    assert "stream" in str(with_stream.json()).lower()


@pytest.mark.django_db
def test_subject_for_stream_class_requires_a_stream(client, admin_user, class_11):
    admin_session(client, admin_user)
    response = client.post(
        "/api/v1/admin/subjects/",
        {"class_level": class_11.pk, "name": "Missing stream", "slug": "class-11-missing"},
        content_type="application/json",
    )
    assert response.status_code == 400
    assert "stream" in str(response.json()).lower()


@pytest.mark.django_db
def test_stream_not_offered_for_class_is_rejected(client, admin_user, class_11, science_stream):
    Stream.objects.filter(pk=science_stream.pk).update()
    orphan_stream = Stream.objects.create(name="Vocational", slug="vocational")

    admin_session(client, admin_user)
    response = client.post(
        "/api/v1/admin/subjects/",
        {
            "class_level": class_11.pk,
            "stream": orphan_stream.pk,
            "name": "Bad pairing",
            "slug": "class-11-bad-pairing",
        },
        content_type="application/json",
    )
    assert response.status_code == 400


# ===========================================================================
# CLASS CONTENT — draft visibility and purchase gating (unchanged)
# ===========================================================================


@pytest.mark.django_db
def test_draft_class_content_is_hidden_from_students(client, student, maths_chapter):
    draft = Content.objects.create(
        chapter=maths_chapter,
        title="Draft Notes",
        slug="class-10-mathematics-real-numbers-draft",
        content_type=ContentType.NOTES,
        file=pdf_upload("draft.pdf"),
        is_published=False,
    )

    client.force_login(student)
    assert client.get(f"/api/v1/contents/?chapter={maths_chapter.slug}").json() == []
    assert client.get(f"/api/v1/contents/{draft.slug}/").status_code == 404
    assert client.get(f"/api/v1/contents/{draft.slug}/document/").status_code == 404


@pytest.mark.django_db
def test_class_content_still_requires_an_active_purchase(
    client, student, class_10, maths_chapter
):
    readable = Content.objects.create(
        chapter=maths_chapter,
        title="Real Numbers Complete Notes",
        slug="class-10-mathematics-real-numbers-complete",
        content_type=ContentType.NOTES,
        file=pdf_upload("complete.pdf"),
        is_published=True,
    )

    # Signed in, no purchase: metadata is listed but the bytes are refused.
    client.force_login(student)
    listed = client.get(f"/api/v1/contents/?chapter={maths_chapter.slug}").json()
    assert len(listed) == 1
    assert listed[0]["is_locked"] is True
    assert client.get(f"/api/v1/contents/{readable.slug}/document/").status_code == 403

    student.class_purchases.create(
        class_level=class_10, amount=class_10.price, status=PurchaseStatus.ACTIVE
    )
    assert client.get(f"/api/v1/contents/{readable.slug}/document/").status_code == 200


@pytest.mark.django_db
def test_student_cannot_reach_another_classs_content_by_changing_the_url(
    client, student, class_10, class_11, science_stream
):
    """The URL is not an entitlement."""
    subject = Subject.objects.create(
        class_level=class_11, stream=science_stream, name="Physics",
        slug="class-11-science-physics",
    )
    chapter = Chapter.objects.create(subject=subject, number=1, name="Units")
    other = Content.objects.create(
        chapter=chapter,
        title="Physics Notes",
        slug="class-11-science-physics-units-notes",
        content_type=ContentType.NOTES,
        file=pdf_upload("physics.pdf"),
        is_published=True,
    )

    student.class_purchases.create(
        class_level=class_10, amount=class_10.price, status=PurchaseStatus.ACTIVE
    )
    client.force_login(student)

    assert client.get(f"/api/v1/contents/{other.slug}/document/").status_code == 403
    assert client.get(f"/api/v1/contents/{other.slug}/access/").json()["allowed"] is False


# ===========================================================================
# OTHER RESOURCES — categories
# ===========================================================================


@pytest.mark.django_db
def test_staff_can_create_and_update_a_category(client, admin_user):
    admin_session(client, admin_user)

    created = client.post(
        "/api/v1/admin/other-resource-categories/",
        {"name": "Coding & Programming", "description": "Programming basics."},
        content_type="application/json",
    )
    assert created.status_code == 201, created.content
    assert created.json()["slug"] == "coding-programming"  # generated server-side
    pk = created.json()["id"]

    updated = client.patch(
        f"/api/v1/admin/other-resource-categories/{pk}/",
        {"name": "Coding and Programming", "display_order": 20},
        content_type="application/json",
    )
    assert updated.status_code == 200
    assert updated.json()["display_order"] == 20


@pytest.mark.django_db
def test_whitespace_only_category_name_is_rejected(client, admin_user):
    admin_session(client, admin_user)
    response = client.post(
        "/api/v1/admin/other-resource-categories/",
        {"name": "   "},
        content_type="application/json",
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_student_cannot_manage_categories(client, student, resource_category):
    client.force_login(student)
    assert client.get("/api/v1/admin/other-resource-categories/").status_code == 403
    assert client.post(
        "/api/v1/admin/other-resource-categories/",
        {"name": "Sneaky"},
        content_type="application/json",
    ).status_code == 403
    assert client.patch(
        f"/api/v1/admin/other-resource-categories/{resource_category.pk}/",
        {"name": "Hacked"},
        content_type="application/json",
    ).status_code == 403


# ===========================================================================
# OTHER RESOURCES — CRUD
# ===========================================================================


@pytest.mark.django_db
def test_staff_can_create_resource_as_draft(client, admin_user, resource_category):
    admin_session(client, admin_user)
    response = post_multipart(
        client,
        "/api/v1/admin/other-resources/",
        {
            "category": resource_category.pk,
            "title": "Python Beginner Notes",
            "description": "Learn the fundamentals of Python programming.",
            "is_published": "false",
            "file": pdf_upload("python.pdf"),
        },
    )
    assert response.status_code == 201, response.content
    body = response.json()
    assert body["is_published"] is False
    assert body["slug"] == "python-beginner-notes"  # derived server-side
    # The stored name is a generated UUID, never the uploaded filename:
    # `unique_upload_path` exists to keep client-supplied names off disk.
    assert body["file_name"].endswith(".pdf")
    assert body["file_name"] != "python.pdf"
    assert body["file_size"] == len(pdf_bytes())


@pytest.mark.django_db
def test_resource_publish_and_unpublish(client, admin_user, resource_category):
    admin_session(client, admin_user)
    created = OtherResource.objects.create(
        category=resource_category,
        title="Draft",
        slug="draft-resource",
        file=pdf_upload(),
        is_published=False,
    )

    assert client.patch(
        f"/api/v1/admin/other-resources/{created.pk}/",
        {"is_published": "true"},
        content_type="application/json",
    ).status_code == 200
    created.refresh_from_db()
    assert created.is_published is True

    assert client.patch(
        f"/api/v1/admin/other-resources/{created.pk}/",
        {"is_published": "false"},
        content_type="application/json",
    ).status_code == 200
    created.refresh_from_db()
    assert created.is_published is False


@pytest.mark.django_db
def test_resource_requires_a_category_and_a_pdf(
    client, admin_user, resource_category
):
    admin_session(client, admin_user)

    no_category = post_multipart(
        client,
        "/api/v1/admin/other-resources/",
        {"title": "No category", "file": pdf_upload()},
    )
    assert no_category.status_code == 400

    no_file = client.post(
        "/api/v1/admin/other-resources/",
        {"category": resource_category.pk, "title": "No file"},
        content_type="application/json",
    )
    assert no_file.status_code == 400


@pytest.mark.django_db
def test_whitespace_only_resource_title_is_rejected(client, admin_user, resource_category):
    admin_session(client, admin_user)
    response = post_multipart(
        client,
        "/api/v1/admin/other-resources/",
        {"category": resource_category.pk, "title": "   ", "file": pdf_upload()},
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_invalid_pdf_is_rejected_for_resources(client, admin_user, resource_category):
    admin_session(client, admin_user)

    bad_ext = post_multipart(
        client,
        "/api/v1/admin/other-resources/",
        {
            "category": resource_category.pk,
            "title": "Bad",
            "file": SimpleUploadedFile("x.php", b"<?php ?>", "application/pdf"),
        },
    )
    assert bad_ext.status_code == 400

    renamed_zip = post_multipart(
        client,
        "/api/v1/admin/other-resources/",
        {
            "category": resource_category.pk,
            "title": "Bad 2",
            "file": SimpleUploadedFile("y.pdf", b"PK\x03\x04", "application/pdf"),
        },
    )
    assert renamed_zip.status_code == 400
    assert OtherResource.objects.count() == 0


@pytest.mark.django_db
def test_resource_filters_and_search(client, admin_user, other_resource, resource_category):
    OtherResource.objects.create(
        category=resource_category, title="Career Options After Class 12",
        slug="career-options", file=pdf_upload("career.pdf"), is_published=False,
    )
    admin_session(client, admin_user)

    assert client.get("/api/v1/admin/other-resources/").json()["count"] == 2
    assert (
        client.get(f"/api/v1/admin/other-resources/?category={resource_category.pk}").json()[
            "count"
        ]
        == 2
    )
    assert (
        client.get("/api/v1/admin/other-resources/?published=true").json()["count"] == 1
    )
    assert client.get("/api/v1/admin/other-resources/?search=python").json()["count"] == 1


@pytest.mark.django_db
def test_student_cannot_manage_resources(client, student, resource_category):
    client.force_login(student)
    assert client.get("/api/v1/admin/other-resources/").status_code == 403
    assert post_multipart(
        client,
        "/api/v1/admin/other-resources/",
        {"category": resource_category.pk, "title": "Sneaky", "file": pdf_upload()},
    ).status_code == 403


# ===========================================================================
# OTHER RESOURCES — student visibility
# ===========================================================================


@pytest.mark.django_db
def test_published_resource_is_visible_to_a_signed_in_student(
    client, student, other_resource
):
    client.force_login(student)
    rows = client.get("/api/v1/other-resources/").json()
    assert len(rows) == 1
    assert rows[0]["title"] == "Python Beginner Notes"
    assert rows[0]["category_name"] == "Coding & Programming"
    # No file URL leaks through the list.
    assert "file" not in rows[0]
    assert "url" not in rows[0]


@pytest.mark.django_db
def test_other_resources_require_authentication(client, other_resource):
    assert client.get("/api/v1/other-resources/").status_code == 401
    assert client.get("/api/v1/other-resource-categories/").status_code == 401
    assert client.get(f"/api/v1/other-resources/{other_resource.slug}/").status_code == 401
    assert client.get(f"/api/v1/other-resources/{other_resource.slug}/document/").status_code == 401


@pytest.mark.django_db
def test_draft_resource_is_invisible_to_students(client, student, other_resource):
    other_resource.is_published = False
    other_resource.save(update_fields=["is_published"])
    client.force_login(student)

    assert client.get("/api/v1/other-resources/").json() == []
    assert client.get(f"/api/v1/other-resources/{other_resource.slug}/").status_code == 404
    assert client.get(f"/api/v1/other-resources/{other_resource.slug}/document/").status_code == 404


@pytest.mark.django_db
def test_published_resource_document_is_served_to_any_student(
    client, student, other_resource
):
    """No purchase required — this is the whole point of Other Resources."""
    client.force_login(student)
    response = client.get(f"/api/v1/other-resources/{other_resource.slug}/document/")

    assert response.status_code == 200
    assert b"".join(response.streaming_content) == pdf_bytes()
    assert response["Content-Type"] == "application/pdf"
    assert "no-store" in response["Cache-Control"]


@pytest.mark.django_db
def test_resource_in_inactive_category_is_hidden(client, student, other_resource, resource_category):
    resource_category.is_active = False
    resource_category.save(update_fields=["is_active"])
    client.force_login(student)

    assert client.get("/api/v1/other-resources/").json() == []
    assert client.get(f"/api/v1/other-resources/{other_resource.slug}/document/").status_code == 404


@pytest.mark.django_db
def test_resource_category_filter_and_counts(client, student, other_resource, resource_category):
    client.force_login(student)

    rows = client.get(f"/api/v1/other-resources/?category={resource_category.slug}").json()
    assert len(rows) == 1

    cats = client.get("/api/v1/other-resource-categories/").json()
    assert len(cats) == 1
    assert cats[0]["slug"] == "coding-programming"
    assert cats[0]["resource_count"] == 1


@pytest.mark.django_db
def test_storage_path_is_never_exposed(client, student, other_resource):
    client.force_login(student)
    body = client.get("/api/v1/other-resources/").json()[0]
    serialised = str(body)
    assert "other_resources/" not in serialised
    assert "media" not in serialised


# ===========================================================================
# OTHER RESOURCES — never touch a purchase
# ===========================================================================


@pytest.mark.django_db
def test_other_resource_never_activates_a_class_purchase(
    client, admin_user, student, other_resource, class_10
):
    """Uploading a resource must not grant, create or alter an entitlement."""
    assert ClassPurchase.objects.count() == 0

    admin_session(client, admin_user)
    response = post_multipart(
        client,
        "/api/v1/admin/other-resources/",
        {
            "category": other_resource.category_id,
            "title": "Bonus Material",
            "is_published": "true",
            "file": pdf_upload("bonus.pdf"),
        },
    )
    assert response.status_code == 201

    assert ClassPurchase.objects.count() == 0
    client.force_login(student)
    assert client.get("/api/v1/my-classes/").json()["count"] == 0


@pytest.mark.django_db
def test_other_resource_does_not_unlock_class_content(
    client, admin_user, student, resource_category, published_content, class_10
):
    """A student holding only a published Other Resource still cannot read Class 10."""
    OtherResource.objects.create(
        category=resource_category,
        title="Free Python Notes",
        slug="free-python-notes",
        file=pdf_upload(),
        is_published=True,
    )
    client.force_login(student)

    assert client.get("/api/v1/other-resources/").json()  # they can read it
    assert (
        client.get(f"/api/v1/contents/{published_content.slug}/document/").status_code
        == 403
    )


@pytest.mark.django_db
def test_other_resource_model_has_no_academic_foreign_keys():
    """Structural proof of independence, rather than a rule to remember."""
    field_names = {field.name for field in OtherResource._meta.get_fields()}
    for forbidden in ("class_level", "stream", "subject", "chapter", "user", "class_purchase"):
        assert forbidden not in field_names


@pytest.mark.django_db
def test_category_cannot_be_deleted_while_resources_reference_it(other_resource):
    """`on_delete=PROTECT`, so a published PDF never loses its category."""
    from django.db.models import ProtectedError

    with pytest.raises(ProtectedError):
        other_resource.category.delete()


# ===========================================================================
# Seed command
# ===========================================================================


@pytest.mark.django_db
def test_seed_resource_categories_is_idempotent(db):
    from django.core.management import call_command

    call_command("seed_resource_categories", verbosity=0)
    first = OtherResourceCategory.objects.count()
    assert first == 7

    call_command("seed_resource_categories", verbosity=0)
    assert OtherResourceCategory.objects.count() == first


@pytest.mark.django_db
def test_seed_does_not_overwrite_admin_edits(db):
    from django.core.management import call_command

    call_command("seed_resource_categories", verbosity=0)
    category = OtherResourceCategory.objects.get(slug="coding-programming")
    category.name = "Renamed By Admin"
    category.description = "Edited."
    category.is_active = False
    category.save()

    call_command("seed_resource_categories", verbosity=0)

    category.refresh_from_db()
    assert category.name == "Renamed By Admin"
    assert category.description == "Edited."
    assert category.is_active is False


@pytest.mark.django_db
def test_seed_can_add_a_custom_category(db):
    from django.core.management import call_command

    call_command("seed_resource_categories", "--add", "Entrance Exams", verbosity=0)
    assert OtherResourceCategory.objects.filter(slug="entrance-exams").exists()

    call_command("seed_resource_categories", "--add", "Entrance Exams", verbosity=0)
    assert OtherResourceCategory.objects.filter(slug="entrance-exams").count() == 1


# ===========================================================================
# Existing behaviour must be untouched
# ===========================================================================


@pytest.mark.django_db
def test_public_upi_endpoint_and_class_pricing_are_unaffected(
    client, admin_user, class_10, upi_settings
):
    admin_session(client, admin_user)
    client.patch(
        f"/api/v1/admin/classes/{class_10.pk}/",
        {"price": str(Decimal("249.00"))},
        content_type="application/json",
    )

    detail = client.get(f"/api/v1/classes/{class_10.slug}/").json()
    assert detail["price"] == "249.00"
    assert client.get("/api/v1/payments/upi/").json()["upi_id"] == "vpedialearning@upi"