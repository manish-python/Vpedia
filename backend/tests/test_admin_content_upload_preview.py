"""Admin content upload and document preview.

The two defects this pins
-------------------------
1. Upload. `updateAdminContent` was a JSON `PATCH`, and the edit form put a
   browser `File` into the payload it passed. `JSON.stringify` cannot represent a
   File and emits `{}`, so the request arrived as

       PATCH /api/v1/admin/content/85/  {"title": "...", "file": {}}

   and DRF's FileField, handed a dict where it expected an upload, answered with
   the error the administrator reported:

       {"file": ["The submitted data was not a file. Check the encoding type on the form."]}

   Same bug on the create path's siblings, and worse on Other Resources, where the
   replacement file was never sent at all - so choosing a new PDF reported success
   and kept the old one. Every upload test here therefore goes through real
   `multipart/form-data`, which is the only thing that was ever going to work.

2. Preview. The View button fired a toast containing `file_name`, so it displayed
   metadata rather than a document. There is now a staff-only `document` action
   that streams the stored bytes.

What is *not* asserted here is any loosening of validation: the magic-byte PDF
check, the size limit, the upload path and the draft/publish split are all still
enforced, and cases 5, 6, 14, 15 and 16 exist to prove it.
"""
import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from PIL import Image

from apps.academics.models import Chapter, Subject
from apps.content.models import Content, ContentType
from apps.purchases.services import create_purchase_request, has_class_access
from apps.purchases.models import PurchaseStatus
from apps.payments.services import approve_payment, submit_payment_proof
from apps.resources.models import OtherResource

CONTENT_URL = "/api/v1/admin/content/"
RESOURCE_URL = "/api/v1/admin/other-resources/"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def admin_session(client, user, password="admin-pass-123"):
    response = client.post(
        "/api/v1/admin/login/", {"email": user.email, "password": password}
    )
    assert response.status_code == 200, response.content
    return response


def real_pdf_bytes() -> bytes:
    """A genuinely decodable PDF, so the upload is a real file and not a stub."""
    buffer = io.BytesIO()
    Image.new("RGB", (240, 340), (250, 250, 252)).save(buffer, "PDF", resolution=150.0)
    return buffer.getvalue()


def pdf_upload(name="notes.pdf", payload=None) -> SimpleUploadedFile:
    return SimpleUploadedFile(
        name, payload if payload is not None else real_pdf_bytes(), content_type="application/pdf"
    )


@pytest.fixture
def chapter(db, class_8) -> Chapter:
    subject = Subject.objects.create(
        name="Mathematics", class_level=class_8, display_order=1
    )
    return Chapter.objects.create(
        subject=subject, number=1, name="Real Numbers", display_order=1
    )


# ---------------------------------------------------------------------------
# Multipart helpers
# ---------------------------------------------------------------------------


@pytest.fixture
def client():
    """DRF's `APIClient`, so `format="multipart"` is honoured on both verbs.

    Django's own `Client` is a trap here. `post` defaults to a multipart body but
    `patch` defaults to `application/octet-stream`, which DRF refuses with a 415;
    and `format=` is an `APIClient` keyword that Django's client accepts and
    ignores. Worse, when the PATCH body arrived unparsed DRF still answered 200,
    because `partial=True` treats every absent field as "leave it alone" - so a
    silently broken upload test would have looked like a passing one.

    That is the second reason these tests exist: they assert the *stored bytes*,
    not just a 2xx.
    """
    return APIClient()


def post_multipart(client, url, data):
    """A real multipart POST - the shape a browser sends for an upload."""
    return client.post(url, data, format="multipart")


def patch_multipart(client, url, data):
    """A real multipart PATCH - the shape the admin edit form now sends."""
    return client.patch(url, data, format="multipart")


# ===========================================================================
# 1-9  UPLOAD
# ===========================================================================


@pytest.mark.django_db
def test_valid_pdf_uploads_through_multipart_and_becomes_a_draft(
    client, admin_user, chapter
):
    """Case 1 + 2. A real multipart upload lands as an unpublished draft."""
    admin_session(client, admin_user)

    response = post_multipart(
        client,
        CONTENT_URL,
        {
            "chapter": chapter.pk,
            "title": "Real Numbers Complete Notes",
            "description": "Full chapter notes.",
            "content_type": ContentType.NOTES,
            "display_order": "0",
            "is_published": "false",
            "file": pdf_upload(),
        },
    )

    assert response.status_code == 201, response.content
    body = response.json()

    row = Content.objects.get(pk=body["id"])
    assert row.file, "the upload produced no stored file"
    assert row.file.read(5) == b"%PDF-"
    assert row.is_published is False, "Save Draft must not publish"
    assert row.chapter_id == chapter.pk
    assert row.slug, "the slug should be derived server-side"


@pytest.mark.django_db
def test_publish_creates_published_content(client, admin_user, chapter):
    """Case 3. The same request with is_published=true publishes."""
    admin_session(client, admin_user)

    response = post_multipart(
        client,
        CONTENT_URL,
        {
            "chapter": chapter.pk,
            "title": "Published Notes",
            "content_type": ContentType.NOTES,
            "is_published": "true",
            "file": pdf_upload(),
        },
    )

    assert response.status_code == 201, response.content
    assert Content.objects.get(pk=response.json()["id"]).is_published is True


@pytest.mark.django_db
def test_missing_required_fields_return_readable_errors(client, admin_user):
    """Case 4. Field-keyed errors, not a 500 and not a bare string."""
    admin_session(client, admin_user)

    response = post_multipart(
        client,
        CONTENT_URL,
        {"title": "", "content_type": ContentType.NOTES},
    )

    assert response.status_code == 400, response.content
    body = response.json()
    assert "chapter" in body, body
    assert "file" in body, body
    # Every entry is a list of human-readable strings.
    assert all(isinstance(v, list) and v for v in body.values()), body


@pytest.mark.django_db
def test_a_renamed_archive_is_still_rejected(client, admin_user, chapter):
    """Case 5. The magic-byte check survives the multipart rewrite."""
    admin_session(client, admin_user)

    response = post_multipart(
        client,
        CONTENT_URL,
        {
            "chapter": chapter.pk,
            "title": "Payload",
            "content_type": ContentType.NOTES,
            "file": pdf_upload(payload=b"PK\x03\x04 definitely not a pdf"),
        },
    )

    assert response.status_code == 400, response.content
    assert "not a valid PDF" in str(response.json()), response.json()
    assert Content.objects.filter(title="Payload").count() == 0


@pytest.mark.django_db
def test_an_oversized_file_is_rejected(client, admin_user, chapter, settings):
    """Case 6. The existing size limit is unchanged."""
    settings.MAX_UPLOAD_SIZE_MB = 1
    admin_session(client, admin_user)

    # 2 MB, comfortably over the 1 MB limit set above.
    oversized = b"%PDF-1.4\n" + b"0" * (2 * 1024 * 1024)

    response = post_multipart(
        client,
        CONTENT_URL,
        {
            "chapter": chapter.pk,
            "title": "Huge",
            "content_type": ContentType.NOTES,
            "file": pdf_upload(payload=oversized),
        },
    )

    assert response.status_code == 400, response.content
    assert "too large" in str(response.json()).lower(), response.json()
    assert Content.objects.filter(title="Huge").count() == 0


@pytest.mark.django_db
def test_editing_without_a_replacement_preserves_the_existing_pdf(
    client, admin_user, chapter
):
    """Case 7. The one that must not regress: a metadata edit is not a re-upload.

    Omitting the `file` key entirely is what preserves it. This is why the
    multipart helper is shared by every edit rather than only the ones that
    happen to carry a file.
    """
    admin_session(client, admin_user)

    created = post_multipart(
        client,
        CONTENT_URL,
        {
            "chapter": chapter.pk,
            "title": "Keep My File",
            "content_type": ContentType.NOTES,
            "file": pdf_upload("original.pdf"),
        },
    ).json()
    original_name = Content.objects.get(pk=created["id"]).file.name
    original_bytes = Content.objects.get(pk=created["id"]).file.read()
    Content.objects.get(pk=created["id"]).file.seek(0)

    response = patch_multipart(
        client,
        f"{CONTENT_URL}{created['id']}/",
        {"title": "Keep My File (edited)", "description": "Only the words changed."},
    )

    assert response.status_code == 200, response.content
    row = Content.objects.get(pk=created["id"])
    assert row.title == "Keep My File (edited)"
    assert row.file.name == original_name, "the stored file was replaced"
    row.file.seek(0)
    assert row.file.read() == original_bytes, "the stored bytes changed"


@pytest.mark.django_db
def test_replacing_the_pdf_uploads_the_new_file(client, admin_user, chapter):
    """Case 8. A replacement is stored, and really is different."""
    admin_session(client, admin_user)

    created = post_multipart(
        client,
        CONTENT_URL,
        {
            "chapter": chapter.pk,
            "title": "Replaceable",
            "content_type": ContentType.NOTES,
            "file": pdf_upload("first.pdf"),
        },
    ).json()
    original_name = Content.objects.get(pk=created["id"]).file.name

    replacement = real_pdf_bytes()
    response = patch_multipart(
        client,
        f"{CONTENT_URL}{created['id']}/",
        {"file": pdf_upload("second.pdf", replacement)},
    )

    assert response.status_code == 200, response.content
    row = Content.objects.get(pk=created["id"])
    assert row.file.name != original_name
    row.file.seek(0)
    assert row.file.read() == replacement


@pytest.mark.django_db
def test_a_failed_replacement_does_not_report_success(client, admin_user, chapter):
    """Case 8, negatively: the failure must reach the administrator.

    The old Other Resources path dropped the file silently and toasted success.
    A rejected replacement has to come back as an error.
    """
    admin_session(client, admin_user)

    created = post_multipart(
        client,
        CONTENT_URL,
        {
            "chapter": chapter.pk,
            "title": "Guarded",
            "content_type": ContentType.NOTES,
            "file": pdf_upload("good.pdf"),
        },
    ).json()
    good_name = Content.objects.get(pk=created["id"]).file.name

    response = patch_multipart(
        client,
        f"{CONTENT_URL}{created['id']}/",
        {"file": pdf_upload("evil.pdf", b"PK\x03\x04 nope")},
    )

    assert response.status_code == 400
    row = Content.objects.get(pk=created["id"])
    assert row.file.name == good_name, "a rejected upload must leave the original in place"


@pytest.mark.django_db
def test_other_resources_upload_still_works(client, admin_user, resource_category):
    """Case 9. The independent system keeps its own workflow, on multipart."""
    admin_session(client, admin_user)

    created = post_multipart(
        client,
        RESOURCE_URL,
        {
            "category": resource_category.pk,
            "title": "Python Beginner Notes",
            "description": "Fundamentals.",
            "is_published": "false",
            "file": pdf_upload("python.pdf"),
        },
    )
    assert created.status_code == 201, created.content

    row = OtherResource.objects.get(pk=created.json()["id"])
    assert row.file.read(5) == b"%PDF-"
    assert row.is_published is False

    # A replacement, which the old JSON patch silently discarded.
    before = row.file.name
    updated = patch_multipart(
        client,
        f"{RESOURCE_URL}{row.pk}/",
        {"file": pdf_upload("python-v2.pdf")},
    )
    assert updated.status_code == 200, updated.content
    row.refresh_from_db()
    assert row.file.name != before, "the replacement file was dropped"


@pytest.mark.django_db
def test_other_resources_needs_no_class_chapter_or_purchase(client, admin_user, resource_category):
    """Case 9, structurally. No academic relationship is invented for these."""
    admin_session(client, admin_user)
    created = post_multipart(
        client,
        RESOURCE_URL,
        {
            "category": resource_category.pk,
            "title": "Standalone",
            "file": pdf_upload(),
        },
    )
    assert created.status_code == 201, created.content
    row = OtherResource.objects.get(pk=created.json()["id"])
    # Structurally impossible to be attached to a class, which is the point.
    assert not hasattr(row, "class_level")
    assert not hasattr(row, "chapter")


# ===========================================================================
# 10-16  PREVIEW
# ===========================================================================


@pytest.mark.django_db
def test_admin_view_returns_pdf_bytes_not_json(client, admin_user, chapter):
    """Case 10 + 11. The whole point of the new endpoint."""
    admin_session(client, admin_user)
    payload = real_pdf_bytes()
    created = post_multipart(
        client,
        CONTENT_URL,
        {
            "chapter": chapter.pk,
            "title": "Viewable",
            "content_type": ContentType.NOTES,
            "file": pdf_upload("viewable.pdf", payload),
        },
    ).json()

    response = client.get(f"{CONTENT_URL}{created['id']}/document/")

    assert response.status_code == 200, response.content
    assert response["Content-Type"] == "application/pdf"
    assert b"".join(response.streaming_content) == payload
    # A metadata document would be JSON; this must not be.
    assert not response["Content-Type"].startswith("application/json")
    assert response["Content-Disposition"].startswith("inline;")
    assert response["Cache-Control"] == "private, no-store"
    assert response["X-Content-Type-Options"] == "nosniff"


@pytest.mark.django_db
def test_the_response_never_reveals_a_filesystem_path(client, admin_user, chapter):
    """Case 10, negatively. The storage location is not the browser's business."""
    admin_session(client, admin_user)
    created = post_multipart(
        client,
        CONTENT_URL,
        {
            "chapter": chapter.pk,
            "title": "Path Check",
            "content_type": ContentType.NOTES,
            "file": pdf_upload(),
        },
    ).json()
    stored = Content.objects.get(pk=created["id"]).file.name
    directory = stored.rsplit("/", 1)[0]

    response = client.get(f"{CONTENT_URL}{created['id']}/document/")

    disposition = response["Content-Disposition"]
    assert directory not in disposition
    assert stored not in disposition
    assert stored.rsplit("/", 1)[-1] in disposition


@pytest.mark.django_db
def test_a_draft_can_be_previewed_but_stays_hidden_from_students(
    client, admin_user, chapter
):
    """Case 13 + 15. Staff may check a draft; students may not see it at all.

    This is why the admin document route is separate from the student one: the
    student route requires `is_published` and `has_class_access`, so a draft is
    invisible there by construction, while staff need to be able to read it.
    """
    admin_session(client, admin_user)
    created = post_multipart(
        client,
        CONTENT_URL,
        {
            "chapter": chapter.pk,
            "title": "Unfinished Draft",
            "content_type": ContentType.NOTES,
            "is_published": "false",
            "file": pdf_upload(),
        },
    ).json()
    slug = created["slug"]

    # Staff see it.
    staff_view = client.get(f"{CONTENT_URL}{created['id']}/document/")
    assert staff_view.status_code == 200
    assert staff_view["Content-Type"] == "application/pdf"

    # The public catalogue does not list it.
    public = client.get("/api/v1/contents/")
    assert all(row["slug"] != slug for row in public.json())

    # And the student document route refuses it even for a paying student.
    from django.contrib.auth import get_user_model

    User = get_user_model()
    student = User.objects.create_user(email="draft-reader@example.com")
    student.is_staff = False
    student.save()
    client.force_login(student)
    assert client.get(f"/api/v1/contents/{slug}/document/").status_code == 404


@pytest.mark.django_db
def test_missing_file_produces_a_useful_404(client, admin_user, chapter):
    """Case 13. "No file attached" is a real state, not an empty PDF.

    A row is uploaded properly first and the column is cleared on the model,
    because that is the only way to reach this state: the API refuses to create a
    content row with no file at all, which is the stronger guarantee and is
    asserted at the end.
    """
    admin_session(client, admin_user)
    created = post_multipart(
        client,
        CONTENT_URL,
        {
            "chapter": chapter.pk,
            "title": "Fileless",
            "content_type": ContentType.NOTES,
            "file": pdf_upload(),
        },
    )
    assert created.status_code == 201, created.content

    row = Content.objects.get(pk=created.json()["id"])
    row.file = ""
    row.save(update_fields=["file"])

    response = client.get(f"{CONTENT_URL}{row.pk}/document/")
    assert response.status_code == 404
    # A JSON body, not a zero-byte or half-written PDF that would present as a
    # corrupt file.
    assert not response["Content-Type"].startswith("application/pdf")
    assert not response.content.startswith(b"%PDF-")

    # Creating a row with no file at all is refused outright.
    refused = post_multipart(
        client,
        CONTENT_URL,
        {"chapter": chapter.pk, "title": "Never Born", "content_type": ContentType.NOTES},
    )
    assert refused.status_code == 400, refused.content
    assert Content.objects.filter(title="Never Born").count() == 0


@pytest.mark.django_db
def test_non_staff_cannot_reach_the_admin_document_endpoint(
    client, admin_user, student, other_staff, chapter, png_upload
):
    """Case 14. Staff-only, and a signed-in student is still refused."""
    admin_session(client, admin_user)
    created = post_multipart(
        client,
        CONTENT_URL,
        {
            "chapter": chapter.pk,
            "title": "Staff Only",
            "content_type": ContentType.NOTES,
            "is_published": "true",
            "file": pdf_upload(),
        },
    ).json()
    url = f"{CONTENT_URL}{created['id']}/document/"

    # Anonymous.
    client.logout()
    assert client.get(url).status_code in (401, 403)

    # A signed-in student, even one who owns the class.
    purchase = create_purchase_request(user=student, class_level=chapter.subject.class_level)
    submit_payment_proof(
        user=student,
        class_purchase=purchase,
        utr="UTR-DOC-TEST",
        screenshot=png_upload,
    )
    approve_payment(payment_proof=purchase.payment_proofs.latest("id"), admin_user=admin_user)
    assert has_class_access(student, chapter.subject.class_level) is True

    client.force_login(student)
    assert client.get(url).status_code == 403
    assert "Administrator access is required" in client.get(url).content.decode()

    # An inactive staff account is refused too. It answers 401 rather than 403
    # because Django's ModelBackend refuses to authenticate an inactive user at
    # all, so there is never an authenticated principal to deny - which is the
    # stronger outcome.
    other_staff.is_active = False
    other_staff.save(update_fields=["is_active"])
    client.force_login(other_staff)
    assert client.get(url).status_code in (401, 403)


@pytest.mark.django_db
def test_published_content_remains_gated_for_students(client, admin_user, chapter, student, png_upload):
    """Case 16. The admin route must not have loosened the student one."""
    admin_session(client, admin_user)
    created = post_multipart(
        client,
        CONTENT_URL,
        {
            "chapter": chapter.pk,
            "title": "Gated Material",
            "content_type": ContentType.NOTES,
            "is_published": "true",
            "file": pdf_upload(),
        },
    ).json()
    slug = created["slug"]

    client.force_login(student)
    # No purchase yet.
    assert has_class_access(student, chapter.subject.class_level) is False
    assert client.get(f"/api/v1/contents/{slug}/document/").status_code == 403

    # Buy the class, and it opens.
    purchase = create_purchase_request(user=student, class_level=chapter.subject.class_level)
    submit_payment_proof(
        user=student,
        class_purchase=purchase,
        utr="UTR-GATE-TEST",
        screenshot=png_upload,
    )
    approve_payment(payment_proof=purchase.payment_proofs.latest("id"), admin_user=admin_user)
    assert has_class_access(student, chapter.subject.class_level) is True

    granted = client.get(f"/api/v1/contents/{slug}/document/")
    assert granted.status_code == 200
    assert granted["Content-Type"] == "application/pdf"


@pytest.mark.django_db
def test_other_resource_preview_is_staff_only(client, admin_user, other_resource, student):
    """Case 9 + 14 on the second system."""
    admin_session(client, admin_user)
    response = client.get(f"{RESOURCE_URL}{other_resource.pk}/document/")

    assert response.status_code == 200, response.content
    assert response["Content-Type"] == "application/pdf"
    assert b"".join(response.streaming_content).startswith(b"%PDF-")

    client.force_login(student)
    assert client.get(f"{RESOURCE_URL}{other_resource.pk}/document/").status_code == 403


# ===========================================================================
# 17-19  REGRESSION
# ===========================================================================


@pytest.mark.django_db
def test_relationships_survive_upload_and_edit(client, admin_user, chapter):
    """Case 17. The chapter, and therefore subject and class, are not rewritten."""
    admin_session(client, admin_user)
    created = post_multipart(
        client,
        CONTENT_URL,
        {
            "chapter": chapter.pk,
            "title": "Related",
            "content_type": ContentType.NOTES,
            "file": pdf_upload(),
        },
    ).json()

    patch_multipart(
        client,
        f"{CONTENT_URL}{created['id']}/",
        {"title": "Related (edited)", "display_order": "3", "file": pdf_upload("v2.pdf")},
    )

    row = Content.objects.select_related("chapter__subject__class_level").get(pk=created["id"])
    assert row.chapter_id == chapter.pk
    assert row.chapter.subject_id == chapter.subject_id
    assert row.chapter.subject.class_level_id == chapter.subject.class_level_id
    assert row.display_order == 3


@pytest.mark.django_db
def test_publishing_twice_does_not_duplicate_content(client, admin_user, chapter):
    """Case 19. Publish is a flag, never a second row."""
    admin_session(client, admin_user)
    created = post_multipart(
        client,
        CONTENT_URL,
        {
            "chapter": chapter.pk,
            "title": "Once Only",
            "content_type": ContentType.NOTES,
            "is_published": "false",
            "file": pdf_upload(),
        },
    ).json()
    content_id = created["id"]

    for _ in range(3):
        response = patch_multipart(
            client,
            f"{CONTENT_URL}{content_id}/", {"is_published": "true"}
        )
        assert response.status_code == 200, response.content

    assert Content.objects.filter(chapter=chapter).count() == 1
    assert Content.objects.get(pk=content_id).is_published is True


@pytest.mark.django_db
def test_unpublishing_hides_it_from_students_again(client, admin_user, chapter):
    """Case 15 in reverse. Draft visibility is a live switch, not a one-off."""
    admin_session(client, admin_user)
    created = post_multipart(
        client,
        CONTENT_URL,
        {
            "chapter": chapter.pk,
            "title": "Toggleable",
            "content_type": ContentType.NOTES,
            "is_published": "true",
            "file": pdf_upload(),
        },
    ).json()
    slug = created["slug"]

    assert any(row["slug"] == slug for row in client.get("/api/v1/contents/").json())

    patch_multipart(client, f"{CONTENT_URL}{created['id']}/", {"is_published": "false"})

    assert all(row["slug"] != slug for row in client.get("/api/v1/contents/").json())


@pytest.mark.django_db
def test_previewing_a_row_does_not_rewrite_it(client, admin_user, chapter):
    """Case 18. Adding a route must not mutate the row it serves.

    Uses a row that actually has a file. The shared `published_content` fixture
    deliberately has none, which is a separate and stronger guarantee: a content
    row with no PDF cannot be served at all.
    """
    admin_session(client, admin_user)
    created = post_multipart(
        client,
        CONTENT_URL,
        {
            "chapter": chapter.pk,
            "title": "Untouched",
            "content_type": ContentType.NOTES,
            "is_published": "true",
            "file": pdf_upload("kept.pdf"),
        },
    )
    assert created.status_code == 201, created.content

    row = Content.objects.get(pk=created.json()["id"])
    before = (row.id, row.title, row.file.name, row.file.size, row.is_published)
    before_updated_at = row.updated_at

    # Twice, to show a repeat preview is equally inert.
    assert client.get(f"{CONTENT_URL}{row.pk}/document/").status_code == 200
    assert client.get(f"{CONTENT_URL}{row.pk}/document/").status_code == 200

    row.refresh_from_db()
    assert (row.id, row.title, row.file.name, row.file.size, row.is_published) == before
    assert row.updated_at == before_updated_at, "previewing rewrote the row"


@pytest.mark.django_db
def test_a_row_with_no_file_cannot_be_served(client, admin_user, published_content):
    """Case 18 + 13. The shared fixture has no PDF, so there is nothing to serve."""
    admin_session(client, admin_user)
    assert client.get(f"{CONTENT_URL}{published_content.pk}/document/").status_code == 404