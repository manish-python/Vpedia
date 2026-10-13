"""Stage 4 — the identifiers the frontend addresses classes by.

Stage 4 added four derived, read-only fields so a browser client never has to
guess or parse:

* `ClassLevelSerializer.number`          — 7-12, from the slug or name
* `StudentProfileSerializer.selected_class_number`
* `ProfileSerializer.unlocked_classes[].number`
* `ChapterSerializer.subject_slug` / `ContentSerializer.chapter_slug`

Why this matters: the database primary key for a class is an opaque sequence
(1-6 after a seed), while students, URLs and the frontend all say "Class 10".
Asking a client to map between the two invites exactly the bug this file
prevents — a preference saved for Class 10 rendering as "Class 7".

None of these fields are stored, so none can go stale after a rename, and none
are writable, so none can be spoofed.
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.academics.models import Chapter, ClassLevel, Subject
from apps.academics.serializers import class_number_for
from apps.content.models import Content, ContentType
from apps.purchases.models import PurchaseStatus


@pytest.fixture
def seeded_classes(db) -> dict[int, ClassLevel]:
    rows: dict[int, ClassLevel] = {}
    for n in range(7, 13):
        rows[n] = ClassLevel.objects.create(
            name=f"Class {n}",
            slug=f"class-{n}",
            price=Decimal("199.00"),
            display_order=n,
            has_streams=n in (11, 12),
        )
    return rows


# ---------------------------------------------------------------------------
# Class number
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_class_number_is_7_to_12(client, seeded_classes):
    rows = client.get("/api/v1/classes/").json()

    assert sorted(row["number"] for row in rows) == [7, 8, 9, 10, 11, 12]


@pytest.mark.django_db
def test_class_number_is_derived_not_stored(client, class_10):
    """Renaming must not leave a stale number behind."""
    assert client.get(f"/api/v1/classes/{class_10.slug}/").json()["number"] == 10

    ClassLevel.objects.filter(pk=class_10.pk).update(name="Senior Year 10", slug="senior-year-10")
    row = client.get("/api/v1/classes/senior-year-10/").json()

    assert row["number"] == 10
    assert row["name"] == "Senior Year 10"


@pytest.mark.django_db
def test_class_number_is_null_when_the_name_carries_none(db, client):
    ClassLevel.objects.create(name="Foundation", slug="foundation", price=Decimal("50.00"))

    assert client.get("/api/v1/classes/foundation/").json()["number"] is None


@pytest.mark.django_db
def test_class_number_cannot_be_written(db, client, admin_user, class_10):
    """The catalogue is read-only over the API; `number` has no write path."""
    client.force_login(admin_user)

    assert (
        client.patch(
            "/api/v1/classes/class-10/",
            {"number": 12},
            content_type="application/json",
        ).status_code
        == 405
    )

    # Untouched: staff change classes in Django Admin, not through the API.
    class_10.refresh_from_db()
    assert class_number_for(class_10) == 10


# ---------------------------------------------------------------------------
# Profile preference
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_profile_reports_the_selected_class_number(client, student, class_10):
    """The bug this field exists to prevent: Class 10 rendering as Class 7."""
    from apps.accounts.models import StudentProfile

    profile, _ = StudentProfile.objects.get_or_create(user=student)
    profile.selected_class = class_10
    profile.save(update_fields=["selected_class"])

    client.force_login(student)
    body = client.get("/api/v1/profile/me/").json()

    # `class_10.pk` is the opaque key; `number` is what the UI needs.
    assert body["profile"]["selected_class"] == class_10.pk
    assert body["profile"]["selected_class_number"] == 10
    assert body["profile"]["selected_class_name"] == "Class 10"
    assert body["profile"]["class_requires_stream"] is False


@pytest.mark.django_db
def test_profile_class_number_is_null_when_nothing_selected(client, student):
    client.force_login(student)
    body = client.get("/api/v1/profile/me/").json()

    assert body["profile"]["selected_class"] is None
    assert body["profile"]["selected_class_number"] is None


@pytest.mark.django_db
def test_auth_me_reports_the_selected_class_number(client, student, class_10):
    from apps.accounts.models import StudentProfile

    profile, _ = StudentProfile.objects.get_or_create(user=student)
    profile.selected_class = class_10
    profile.save(update_fields=["selected_class"])

    client.force_login(student)
    body = client.get("/api/v1/auth/me/").json()

    assert body["authenticated"] is True
    assert body["profile"]["selected_class_number"] == 10


@pytest.mark.django_db
def test_unlocked_classes_report_their_number(client, student, class_10, class_12):
    student.class_purchases.create(
        class_level=class_10, amount=class_10.price, status=PurchaseStatus.ACTIVE
    )
    client.force_login(student)

    numbers = [row["number"] for row in client.get("/api/v1/my-classes/").json()["results"]]
    assert numbers == [10]

    unlocked = client.get("/api/v1/profile/me/").json()["unlocked_classes"]
    assert [row["number"] for row in unlocked] == [10]
    assert [row["id"] for row in unlocked] == [class_10.pk]

    del class_12


# ---------------------------------------------------------------------------
# Navigation slugs
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_chapter_exposes_the_subject_slug(client, class_10):
    subject = Subject.objects.create(
        class_level=class_10, name="Mathematics", slug="class-10-mathematics"
    )
    Chapter.objects.create(subject=subject, number=1, name="Real Numbers")

    row = client.get("/api/v1/chapters/?class=class-10").json()[0]

    assert row["subject_slug"] == "class-10-mathematics"
    assert row["subject_name"] == "Mathematics"


@pytest.mark.django_db
def test_content_exposes_chapter_and_subject_slugs(client, class_10):
    subject = Subject.objects.create(
        class_level=class_10, name="Mathematics", slug="class-10-mathematics"
    )
    chapter = Chapter.objects.create(subject=subject, number=1, name="Real Numbers")
    Content.objects.create(
        chapter=chapter,
        title="Real Numbers Notes",
        slug="class-10-mathematics-real-numbers-notes",
        content_type=ContentType.NOTES,
        file=SimpleUploadedFile("n.pdf", b"%PDF-1.4\n", content_type="application/pdf"),
        is_published=True,
    )

    row = client.get("/api/v1/contents/class-10-mathematics-real-numbers-notes/").json()

    assert row["chapter_slug"] == chapter.slug
    assert row["subject_slug"] == "class-10-mathematics"
    assert row["class_level_id"] == class_10.pk


@pytest.mark.django_db
def test_a_hyphenated_subject_name_does_not_break_slug_navigation(client, class_10):
    """Why slugs are exposed instead of parsed.

    `Social Science` contains a hyphen. Any client that split a slug to find
    the subject would resolve the wrong thing here.
    """
    subject = Subject.objects.create(
        class_level=class_10, name="Social Science", slug="class-10-social-science"
    )
    chapter = Chapter.objects.create(subject=subject, number=1, name="Constitution")

    row = client.get(f"/api/v1/subjects/{subject.slug}/chapters/").json()[0]

    assert row["subject_slug"] == "class-10-social-science"
    assert row["slug"] == chapter.slug


# ---------------------------------------------------------------------------
# These fields must not become an entitlement
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_a_selected_class_number_grants_no_access(client, student, class_10):
    """The number is metadata. It must not read as access."""
    from apps.accounts.models import StudentProfile

    profile, _ = StudentProfile.objects.get_or_create(user=student)
    profile.selected_class = class_10
    profile.save(update_fields=["selected_class"])

    client.force_login(student)

    assert client.get("/api/v1/my-classes/").json()["count"] == 0
    assert (
        client.get("/api/v1/profile/me/").json()["has_access_to_selected_class"] is False
    )