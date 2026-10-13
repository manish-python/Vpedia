"""Admin Portal V2 — subjects, chapters, notifications and dashboard statistics.

Everything the acceptance criteria call out that could regress silently:
relationship validation, rename integrity, search/filter plumbing, the
notification lifecycle, and the aggregated dashboard numbers.
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.academics.models import Chapter, ClassLevel, Subject
from apps.accounts.models import User
from apps.admin_api.models import AdminNotification, NotificationType
from apps.admin_api.notifications import notify
from apps.content.models import Content, ContentType
from apps.payments.models import PaymentStatus
from apps.purchases.models import ClassPurchase, PurchaseStatus


def admin_session(client, user, password="admin-pass-123"):
    response = client.post(
        "/api/v1/admin/login/", {"email": user.email, "password": password}
    )
    assert response.status_code == 200, response.content
    return response


def pdf_upload(name="notes.pdf"):
    return SimpleUploadedFile(name, b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n",
                              content_type="application/pdf")


# ===========================================================================
# REGRESSION: the Subjects 500
# ===========================================================================


@pytest.mark.django_db
def test_admin_subjects_endpoint_does_not_return_500(client, admin_user, class_10, science_stream):
    """Regression for the root cause of the Django DEBUG page.

    `Subject.chapter_count` is a model `@property`, and Django applies query
    annotations with `setattr`. Annotating under that same name raised
    `AttributeError: property 'chapter_count' of 'Subject' object has no
    setter`, which surfaced as a 500 across the whole endpoint and rendered a
    raw Django traceback in the admin UI.
    """
    Subject.objects.create(
        class_level=class_10, name="Mathematics", slug="class-10-mathematics"
    )
    admin_session(client, admin_user)

    response = client.get("/api/v1/admin/subjects/")

    assert response.status_code == 200, response.content
    assert response["Content-Type"].startswith("application/json")

    body = response.json()
    assert body["count"] == 1
    assert body["results"][0]["chapter_count"] == 0


@pytest.mark.django_db
def test_subject_chapter_count_is_accurate(client, admin_user, maths_subject, maths_chapter):
    Chapter.objects.create(subject=maths_subject, number=2, name="Polynomials")
    admin_session(client, admin_user)

    rows = client.get("/api/v1/admin/subjects/").json()["results"]
    assert rows[0]["chapter_count"] == 2


@pytest.mark.django_db
def test_subject_chapter_count_excludes_inactive_chapters(
    client, admin_user, maths_subject, maths_chapter
):
    Chapter.objects.create(subject=maths_subject, number=2, name="Draft", is_active=False)
    admin_session(client, admin_user)

    rows = client.get("/api/v1/admin/subjects/").json()["results"]
    assert rows[0]["chapter_count"] == 1


# ===========================================================================
# SUBJECTS
# ===========================================================================


@pytest.mark.django_db
def test_staff_can_list_create_and_edit_subject(client, admin_user, class_10):
    admin_session(client, admin_user)

    created = client.post(
        "/api/v1/admin/subjects/",
        {
            "class_level": class_10.pk,
            "name": "Computer Applications",
            "slug": "class-10-computer-applications",
            "display_order": 3,
        },
        content_type="application/json",
    )
    assert created.status_code == 201, created.content
    subject_id = created.json()["id"]
    assert created.json()["class_name"] == "Class 10"
    assert created.json()["is_active"] is True

    edited = client.patch(
        f"/api/v1/admin/subjects/{subject_id}/",
        {"name": "Computer Science", "display_order": 4, "is_active": False},
        content_type="application/json",
    )
    assert edited.status_code == 200
    assert edited.json()["name"] == "Computer Science"
    assert edited.json()["display_order"] == 4
    assert edited.json()["is_active"] is False


@pytest.mark.django_db
def test_subject_rename_preserves_id_and_children(
    client, admin_user, class_10, maths_subject, maths_chapter, published_content
):
    """Renaming must mutate the row, never replace it."""
    original_pk = maths_subject.pk
    content_pk = published_content.pk

    admin_session(client, admin_user)
    response = client.patch(
        f"/api/v1/admin/subjects/{maths_subject.pk}/",
        {"name": "Mathematics & Applied Mathematics"},
        content_type="application/json",
    )
    assert response.status_code == 200

    maths_subject.refresh_from_db()
    published_content.refresh_from_db()

    assert maths_subject.pk == original_pk, "rename replaced the row"
    assert maths_subject.name == "Mathematics & Applied Mathematics"
    assert maths_subject.class_level_id == class_10.pk
    assert maths_subject.chapters.filter(pk=maths_chapter.pk).exists()
    assert published_content.pk == content_pk
    assert published_content.chapter_id == maths_chapter.pk
    assert published_content.is_published is True


@pytest.mark.django_db
def test_subject_relationship_validation(client, admin_user, class_10, class_11, science_stream):
    admin_session(client, admin_user)

    # Class 7-10 must not carry a stream.
    bad = client.post(
        "/api/v1/admin/subjects/",
        {"class_level": class_10.pk, "stream": science_stream.pk, "name": "Wrong", "slug": "w"},
        content_type="application/json",
    )
    assert bad.status_code == 400

    # Class 11 requires a stream.
    missing = client.post(
        "/api/v1/admin/subjects/",
        {"class_level": class_11.pk, "name": "No stream", "slug": "class-11-no-stream"},
        content_type="application/json",
    )
    assert missing.status_code == 400

    # A stream not offered for the class is refused.
    from apps.academics.models import Stream

    orphan = Stream.objects.create(name="Vocational", slug="vocational")
    mismatched = client.post(
        "/api/v1/admin/subjects/",
        {"class_level": class_11.pk, "stream": orphan.pk, "name": "Bad", "slug": "class-11-bad"},
        content_type="application/json",
    )
    assert mismatched.status_code == 400


@pytest.mark.django_db
def test_subject_search_and_filters_reach_the_backend(
    client, admin_user, class_10, class_11, science_stream
):
    Subject.objects.create(class_level=class_10, name="Mathematics", slug="c10-maths")
    Subject.objects.create(class_level=class_10, name="Science", slug="c10-sci")
    Subject.objects.create(
        class_level=class_11, stream=science_stream, name="Physics", slug="c11-physics"
    )
    Subject.objects.create(class_level=class_10, name="Retired", slug="c10-retired", is_active=False)

    admin_session(client, admin_user)

    assert client.get("/api/v1/admin/subjects/?search=Math").json()["count"] == 1
    assert client.get(f"/api/v1/admin/subjects/?class={class_10.pk}").json()["count"] == 3
    assert client.get(f"/api/v1/admin/subjects/?stream={science_stream.pk}").json()["count"] == 1
    assert client.get("/api/v1/admin/subjects/?status=false").json()["count"] == 1
    # Filters combine.
    combined = client.get(
        f"/api/v1/admin/subjects/?class={class_10.pk}&search=Science"
    ).json()
    assert combined["count"] == 1


@pytest.mark.django_db
def test_student_cannot_manage_subjects(client, student, maths_subject):
    client.force_login(student)
    assert client.get("/api/v1/admin/subjects/").status_code == 403
    assert client.post(
        "/api/v1/admin/subjects/",
        {"class_level": 1, "name": "Hack", "slug": "hack"},
        content_type="application/json",
    ).status_code == 403
    assert client.patch(
        f"/api/v1/admin/subjects/{maths_subject.pk}/",
        {"name": "Hack"},
        content_type="application/json",
    ).status_code == 403


# ===========================================================================
# CHAPTERS
# ===========================================================================


@pytest.mark.django_db
def test_chapter_list_exposes_class_stream_and_content_count(
    client, admin_user, class_10, maths_chapter, published_content
):
    admin_session(client, admin_user)
    row = client.get("/api/v1/admin/chapters/").json()["results"][0]

    assert row["class_name"] == "Class 10"
    assert row["subject_name"] == "Mathematics"
    assert row["content_count"] == 1


@pytest.mark.django_db
def test_chapter_create_edit_and_rename_preserve_everything(
    client, admin_user, maths_subject, maths_chapter, published_content
):
    chapter_pk = maths_chapter.pk
    subject_pk = maths_subject.pk
    content_pk = published_content.pk

    # Give the content a real file so the rename can be shown not to disturb it.
    published_content.file = pdf_upload("keep-me.pdf")
    published_content.save()
    stored_file = published_content.file.name

    admin_session(client, admin_user)

    created = client.post(
        "/api/v1/admin/chapters/",
        {
            "subject": maths_subject.pk,
            "number": 2,
            "name": "Polynomials",
            "slug": "class-10-mathematics-polynomials",
            "display_order": 2,
        },
        content_type="application/json",
    )
    assert created.status_code == 201, created.content
    assert created.json()["subject_name"] == "Mathematics"
    assert created.json()["class_name"] == "Class 10"

    # Rename the existing chapter that owns content.
    renamed = client.patch(
        f"/api/v1/admin/chapters/{chapter_pk}/",
        {"name": "Real Numbers & Applications"},
        content_type="application/json",
    )
    assert renamed.status_code == 200

    maths_chapter.refresh_from_db()
    published_content.refresh_from_db()

    assert maths_chapter.pk == chapter_pk, "rename replaced the chapter row"
    assert maths_chapter.subject_id == subject_pk
    assert maths_chapter.name == "Real Numbers & Applications"
    # Content stays attached, with its file and publication state intact.
    assert published_content.pk == content_pk
    assert published_content.chapter_id == chapter_pk
    assert published_content.is_published is True
    # The uploaded PDF itself is untouched by the rename.
    assert published_content.file.name == stored_file


@pytest.mark.django_db
def test_chapter_cannot_reference_an_unknown_subject(client, admin_user):
    admin_session(client, admin_user)
    response = client.post(
        "/api/v1/admin/chapters/",
        {"subject": 999999, "number": 1, "name": "Orphan", "slug": "orphan"},
        content_type="application/json",
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_chapter_search_and_filters_combine(
    client, admin_user, class_11, science_stream, maths_subject, maths_chapter
):
    other_subject = Subject.objects.create(
        class_level=class_11, stream=science_stream, name="Physics",
        slug="class-11-science-physics",
    )
    Chapter.objects.create(subject=other_subject, number=1, name="Units")
    Chapter.objects.create(subject=other_subject, number=2, name="Draft unit", is_active=False)

    admin_session(client, admin_user)

    assert client.get("/api/v1/admin/chapters/?search=Real").json()["count"] == 1
    assert client.get(f"/api/v1/admin/chapters/?class={class_11.pk}").json()["count"] == 2
    assert client.get(f"/api/v1/admin/chapters/?subject={maths_subject.pk}").json()["count"] == 1
    assert client.get("/api/v1/admin/chapters/?status=false").json()["count"] == 1
    combined = client.get(
        f"/api/v1/admin/chapters/?class={class_11.pk}&status=true&search=Units"
    ).json()
    assert combined["count"] == 1


@pytest.mark.django_db
def test_student_cannot_manage_chapters(client, student, maths_chapter):
    client.force_login(student)
    assert client.get("/api/v1/admin/chapters/").status_code == 403
    assert client.post(
        "/api/v1/admin/chapters/",
        {"subject": 1, "number": 1, "name": "Hack", "slug": "hack"},
        content_type="application/json",
    ).status_code == 403


# ===========================================================================
# NOTIFICATIONS
# ===========================================================================


@pytest.mark.django_db
def test_new_student_creates_an_admin_notification(client, google_settings):
    """Sign in with Google for the first time; a notification must follow.

    Driven through the real OAuth harness rather than by calling `notify`
    directly, so this proves the wiring in `VpediaSocialAccountAdapter` and not
    just that the helper works.
    """
    from tests.conftest import finish_oauth, google_claims, start_oauth

    AdminNotification.objects.all().delete()

    state = start_oauth(client)
    finish_oauth(client, state, google_claims(email="meera.new@example.com", given_name="Meera"))

    assert User.objects.filter(email="meera.new@example.com").exists()

    notes = AdminNotification.objects.filter(type=NotificationType.NEW_STUDENT)
    assert notes.count() == 1

    note = notes.first()
    assert note.is_read is False
    assert note.title == "New Student Registered"
    assert "Meera Sharma" in note.message
    assert "meera.new@example.com" in note.message
    # The link points at the Students page already filtered to this student.
    assert note.link == "/admin-panel/students?search=meera.new@example.com"


@pytest.mark.django_db
def test_signing_in_again_does_not_re_notify(client, google_student):
    """A returning student is not a new registration.

    The `google_student` fixture already created the account and its
    notification, so clearing the feed here isolates the *second* sign-in.
    """
    from tests.conftest import finish_oauth, google_claims, start_oauth

    assert AdminNotification.objects.filter(type=NotificationType.NEW_STUDENT).count() == 1
    AdminNotification.objects.all().delete()

    state = start_oauth(client)
    # Same verified email, different Google subject id: the adapter matches the
    # existing account, so `save_user` must not run a second time.
    finish_oauth(client, state, google_claims(sub="a-completely-different-sub"))

    assert not AdminNotification.objects.exists()
    assert User.objects.filter(email="rahul@gmail.com").count() == 1


@pytest.mark.django_db
def test_payment_proof_creates_a_pending_request_notification(
    client, admin_user, proof, pending_purchase
):
    AdminNotification.objects.all().delete()
    notify(
        NotificationType.PAYMENT_REQUEST,
        title="New Payment Request",
        message=f"UTR {proof.utr} submitted.",
        link=f"/admin-panel/payments?payment={proof.pk}",
    )

    note = AdminNotification.objects.first()
    assert note.type == NotificationType.PAYMENT_REQUEST
    assert note.link.endswith(str(proof.pk))


@pytest.mark.django_db
def test_unread_count_and_mark_read(client, admin_user):
    AdminNotification.objects.all().delete()
    notify(NotificationType.SYSTEM_ALERT, title="A", message="a", link="/admin-panel")
    notify(NotificationType.SYSTEM_ALERT, title="B", message="b", link="/admin-panel")

    admin_session(client, admin_user)
    assert client.get("/api/v1/admin/notifications/unread-count/").json()["unread"] == 2

    first = AdminNotification.objects.order_by("id").first()
    marked = client.patch(
        f"/api/v1/admin/notifications/{first.pk}/read/",
        content_type="application/json",
    )
    assert marked.status_code == 200
    assert client.get("/api/v1/admin/notifications/unread-count/").json()["unread"] == 1

    assert client.post("/api/v1/admin/notifications/mark-all-read/").status_code == 200
    assert client.get("/api/v1/admin/notifications/unread-count/").json()["unread"] == 0


@pytest.mark.django_db
def test_notifications_are_staff_only(client, student, admin_user):
    AdminNotification.objects.all().delete()
    notify(NotificationType.SYSTEM_ALERT, title="A", message="a", link="/admin-panel")
    note = AdminNotification.objects.first()

    client.force_login(student)
    assert client.get("/api/v1/admin/notifications/").status_code == 403
    assert client.get("/api/v1/admin/notifications/unread-count/").status_code == 403
    assert client.patch(
        f"/api/v1/admin/notifications/{note.pk}/read/", content_type="application/json"
    ).status_code == 403
    assert client.post("/api/v1/admin/notifications/mark-all-read/").status_code == 403

    # Unauthenticated too.
    client.logout()
    assert client.get("/api/v1/admin/notifications/").status_code == 401


@pytest.mark.django_db
def test_notification_type_filter(client, admin_user):
    AdminNotification.objects.all().delete()
    notify(NotificationType.PAYMENT_REQUEST, title="P", message="p", link="/a")
    notify(NotificationType.NEW_STUDENT, title="S", message="s", link="/b")
    notify(NotificationType.SYSTEM_ALERT, title="X", message="x", link="/c")

    admin_session(client, admin_user)
    assert client.get("/api/v1/admin/notifications/").json()["count"] == 3
    assert (
        client.get("/api/v1/admin/notifications/?type=PAYMENT_REQUEST").json()["count"] == 1
    )
    assert client.get("/api/v1/admin/notifications/?unread=true").json()["count"] == 3

    AdminNotification.objects.all().update(is_read=True)
    assert client.get("/api/v1/admin/notifications/?unread=true").json()["count"] == 0
    assert client.get("/api/v1/admin/notifications/").json()["count"] == 3


@pytest.mark.django_db
def test_frontend_cannot_create_notifications(client, admin_user):
    """Creation is server-controlled; a staff POST must not be accepted."""
    admin_session(client, admin_user)
    before = AdminNotification.objects.count()

    response = client.post(
        "/api/v1/admin/notifications/",
        {
            "type": "PAYMENT_APPROVED",
            "title": "Forged",
            "message": "nope",
            "link": "/admin-panel",
        },
        content_type="application/json",
    )
    assert response.status_code == 405
    assert AdminNotification.objects.count() == before


# ===========================================================================
# DASHBOARD V2
# ===========================================================================


@pytest.mark.django_db
def test_dashboard_returns_every_aggregated_statistic(client, admin_user):
    admin_session(client, admin_user)
    body = client.get("/api/v1/admin/dashboard/").json()

    for key in (
        "students", "classes", "active_purchases", "pending_purchases",
        "approved_revenue", "published_content", "other_resources",
        "unread_notifications",
    ):
        assert key in body, f"missing {key}"

    for key in (
        "student_growth", "purchases_by_class", "payment_status",
        "content_types", "resource_stats", "recent_activity",
    ):
        assert key in body, f"missing {key}"


@pytest.mark.django_db
def test_dashboard_counts_are_correct(client, admin_user, student, other_student, class_10, class_11):
    student.class_purchases.create(
        class_level=class_10, amount=class_10.price, status=PurchaseStatus.ACTIVE
    )
    student.class_purchases.create(
        class_level=class_11, amount=class_11.price, status=PurchaseStatus.PENDING
    )
    other_student.class_purchases.create(
        class_level=class_10, amount=class_10.price, status=PurchaseStatus.REJECTED
    )

    admin_session(client, admin_user)
    body = client.get("/api/v1/admin/dashboard/").json()

    assert body["students"] == 2  # admin is staff, excluded
    assert body["classes"] == 2
    assert body["active_purchases"] == 1
    assert body["pending_purchases"] == 1
    assert body["rejected_purchases"] == 1


@pytest.mark.django_db
def test_approved_revenue_excludes_pending_and_rejected(
    client, admin_user, student, class_10, class_11
):
    """Revenue must only ever come from ACTIVE purchases."""
    student.class_purchases.create(
        class_level=class_10, amount=class_10.price, status=PurchaseStatus.ACTIVE
    )
    student.class_purchases.create(
        class_level=class_11, amount=class_11.price, status=PurchaseStatus.PENDING
    )
    other = User.objects.create_user(email="r@example.com")
    other.class_purchases.create(
        class_level=class_10, amount=class_10.price, status=PurchaseStatus.REJECTED
    )

    admin_session(client, admin_user)
    body = client.get("/api/v1/admin/dashboard/").json()

    assert body["approved_revenue"] == "199.00"
    assert body["approved_revenue"] != "448.00"
    assert Decimal(body["approved_revenue"]) == Decimal("199.00")


@pytest.mark.django_db
def test_dashboard_content_and_resource_statistics(
    client, admin_user, maths_chapter, published_content, resource_category, other_resource
):
    """One published and one draft, on top of the published fixture."""
    Content.objects.create(
        chapter=maths_chapter, title="Draft Notes", slug="draft-notes",
        content_type=ContentType.NOTES, file=pdf_upload(), is_published=False,
    )
    admin_session(client, admin_user)
    body = client.get("/api/v1/admin/dashboard/").json()

    assert body["published_content"] == 1
    assert body["draft_content"] == 1
    assert body["other_resources"] == 1
    assert body["resource_stats"]["published"] == 1
    assert body["resource_stats"]["active_categories"] == 1

    types = body["content_types"]
    assert isinstance(types, dict)
    assert types["NOTES"] >= 1


@pytest.mark.django_db
def test_dashboard_student_growth_window(client, admin_user, student):
    admin_session(client, admin_user)
    body = client.get("/api/v1/admin/dashboard/").json()

    growth = body["student_growth"]
    assert set(growth) >= {"today", "week", "month"}
    assert growth["today"] >= 1
    assert growth["month"] >= 1


@pytest.mark.django_db
def test_dashboard_does_not_return_html_on_error(client, student):
    """A student must get a clean JSON 403, never a Django debug page."""
    client.force_login(student)
    response = client.get("/api/v1/admin/dashboard/")

    assert response.status_code == 403
    assert response["Content-Type"].startswith("application/json")
    assert b"Traceback" not in response.content
    assert b"INSTALLED_APPS" not in response.content


# ===========================================================================
# EXISTING BEHAVIOUR MUST NOT REGRESS
# ===========================================================================


@pytest.mark.django_db
def test_payment_approval_still_works_after_admin_v2(client, admin_user, proof, pending_purchase):
    AdminNotification.objects.all().delete()
    admin_session(client, admin_user)

    response = client.post(f"/api/v1/admin/payments/{proof.pk}/approve/")
    assert response.status_code == 200

    proof.refresh_from_db()
    pending_purchase.refresh_from_db()
    assert proof.status == PaymentStatus.APPROVED
    assert pending_purchase.status == PurchaseStatus.ACTIVE

    # And the activity feed records it.
    activities = client.get("/api/v1/admin/dashboard/").json()["recent_activity"]
    assert any(item["type"] in ("PAYMENT_APPROVED", "PAYMENT_REQUEST") for item in activities)


@pytest.mark.django_db
def test_payment_rejection_still_requires_a_reason(client, admin_user, proof):
    admin_session(client, admin_user)
    assert client.post(f"/api/v1/admin/payments/{proof.pk}/reject/", {}).status_code == 400
    assert client.post(
        f"/api/v1/admin/payments/{proof.pk}/reject/", {"reason": "No match"}
    ).status_code == 200


@pytest.mark.django_db
def test_upi_settings_still_round_trip(client, admin_user, upi_settings):
    admin_session(client, admin_user)
    assert client.get("/api/v1/admin/upi/").json()["upi_id"] == "vpedialearning@upi"
    assert client.patch(
        "/api/v1/admin/upi/1/", {"upi_id": "new@upi"}, content_type="application/json"
    ).status_code == 200
    assert client.get("/api/v1/payments/upi/").json()["upi_id"] == "new@upi"


@pytest.mark.django_db
def test_class_content_and_resources_still_manageable(
    client, admin_user, maths_chapter, resource_category
):
    from django.test.client import BOUNDARY, encode_multipart

    admin_session(client, admin_user)

    content = client.generic(
        "POST",
        "/api/v1/admin/content/",
        data=encode_multipart(
            BOUNDARY,
            {
                "chapter": maths_chapter.pk,
                "title": "Regression Notes",
                "content_type": ContentType.NOTES,
                "is_published": "false",
                "file": pdf_upload("r.pdf"),
            },
        ),
        content_type=f"multipart/form-data; boundary={BOUNDARY}",
    )
    assert content.status_code == 201, content.content

    resource = client.generic(
        "POST",
        "/api/v1/admin/other-resources/",
        data=encode_multipart(
            BOUNDARY,
            {
                "category": resource_category.pk,
                "title": "Regression Resource",
                "is_published": "false",
                "file": pdf_upload("rr.pdf"),
            },
        ),
        content_type=f"multipart/form-data; boundary={BOUNDARY}",
    )
    assert resource.status_code == 201, resource.content


@pytest.mark.django_db
def test_class_access_rule_untouched(client, student, class_10, maths_chapter):
    """`has_class_access` behaviour must be unchanged by this stage."""
    from apps.purchases.services import has_class_access

    content = Content.objects.create(
        chapter=maths_chapter, title="Gated", slug="class-10-mathematics-real-numbers-gated",
        content_type=ContentType.NOTES, file=pdf_upload("g.pdf"), is_published=True,
    )

    client.force_login(student)
    assert has_class_access(student, class_10) is False
    assert client.get(f"/api/v1/contents/{content.slug}/document/").status_code == 403

    student.class_purchases.create(
        class_level=class_10, amount=class_10.price, status=PurchaseStatus.ACTIVE
    )
    student.refresh_from_db()
    assert has_class_access(student, class_10) is True
    assert client.get(f"/api/v1/contents/{content.slug}/document/").status_code == 200


@pytest.mark.django_db
def test_pricing_change_still_only_affects_future_purchases(
    client, admin_user, student, class_10
):
    purchase = ClassPurchase.objects.create(
        user=student, class_level=class_10, amount=Decimal("199.00"),
        status=PurchaseStatus.ACTIVE,
    )
    admin_session(client, admin_user)

    client.patch(
        f"/api/v1/admin/classes/{class_10.pk}/",
        {"price": "209.00"},
        content_type="application/json",
    )
    purchase.refresh_from_db()
    assert purchase.amount == Decimal("199.00")

# ===========================================================================
# SLUG DERIVATION
#
# An administrator must never have to invent a slug. Each model has a
# UniqueConstraint, which DRF turns into a UniqueTogetherValidator that
# requires *both* fields in the payload -- so before this was fixed, omitting
# the slug produced `{"slug": ["This field is required."]}` even though the
# field was declared optional.
# ===========================================================================


@pytest.mark.django_db
def test_subject_slug_is_derived_when_omitted(client, admin_user, class_10):
    admin_session(client, admin_user)

    response = client.post(
        "/api/v1/admin/subjects/",
        {"class_level": class_10.pk, "name": "Applied Mathematics"},
        content_type="application/json",
    )
    assert response.status_code == 201, response.content
    assert response.json()["slug"] == f"{class_10.pk}-applied-mathematics"


@pytest.mark.django_db
def test_subject_slug_is_still_honoured_when_supplied(client, admin_user, class_10):
    """An explicit slug is respected so an existing URL can be kept stable."""
    admin_session(client, admin_user)

    response = client.post(
        "/api/v1/admin/subjects/",
        {
            "class_level": class_10.pk,
            "name": "Applied Mathematics",
            "slug": "maths-applied",
        },
        content_type="application/json",
    )
    assert response.status_code == 201, response.content
    assert response.json()["slug"] == "maths-applied"


@pytest.mark.django_db
def test_chapter_slug_is_derived_when_omitted(client, admin_user, maths_subject):
    admin_session(client, admin_user)

    response = client.post(
        "/api/v1/admin/chapters/",
        {"subject": maths_subject.pk, "number": 3, "name": "Trigonometry"},
        content_type="application/json",
    )
    assert response.status_code == 201, response.content
    assert response.json()["slug"] == f"{maths_subject.pk}-trigonometry"


@pytest.mark.django_db
def test_duplicate_subject_name_is_rejected(client, admin_user, class_10, maths_subject):
    """Classes 7-10 have no stream, so the database constraint cannot help.

    `UNIQUE(class_level, stream, slug)` treats a NULL stream as distinct from
    every other NULL in PostgreSQL, so a name check in the serializer is the
    only thing stopping two "Mathematics" rows in Class 10.
    """
    assert maths_subject.stream is None
    admin_session(client, admin_user)

    response = client.post(
        "/api/v1/admin/subjects/",
        {"class_level": class_10.pk, "name": "Mathematics"},
        content_type="application/json",
    )
    assert response.status_code == 400
    assert "already exists" in response.json()["name"][0]


@pytest.mark.django_db
def test_same_subject_name_is_allowed_in_a_different_class(
    client, admin_user, class_10, class_11, science_stream, maths_subject
):
    """The check is scoped to one class/stream, not global."""
    admin_session(client, admin_user)

    response = client.post(
        "/api/v1/admin/subjects/",
        {
            "class_level": class_11.pk,
            "stream": science_stream.pk,
            "name": "Mathematics",
        },
        content_type="application/json",
    )
    assert response.status_code == 201, response.content


@pytest.mark.django_db
def test_renaming_a_subject_keeps_its_own_name(
    client, admin_user, class_10, maths_subject
):
    """Re-saving a subject without changing the name is not a duplicate."""
    admin_session(client, admin_user)

    response = client.patch(
        f"/api/v1/admin/subjects/{maths_subject.pk}/",
        {"display_order": 7},
        content_type="application/json",
    )
    assert response.status_code == 200, response.content
    assert response.json()["display_order"] == 7


@pytest.mark.django_db
def test_renaming_a_subject_leaves_its_slug_and_urls_alone(
    client, admin_user, maths_subject, maths_chapter
):
    """A rename changes the display name only.

    The slug is derived on create and then never recomputed, so a rename cannot
    silently break a URL a student has already bookmarked.
    """
    original_slug = maths_subject.slug
    admin_session(client, admin_user)

    response = client.patch(
        f"/api/v1/admin/subjects/{maths_subject.pk}/",
        {"name": "Mathematics & Applied Mathematics"},
        content_type="application/json",
    )
    assert response.status_code == 200

    maths_subject.refresh_from_db()
    assert maths_subject.name == "Mathematics & Applied Mathematics"
    assert maths_subject.slug == original_slug
    assert maths_subject.chapters.filter(pk=maths_chapter.pk).exists()


@pytest.mark.django_db
def test_renaming_a_chapter_leaves_its_slug_and_content_alone(
    client, admin_user, maths_chapter, published_content
):
    original_slug = maths_chapter.slug
    content_pk = published_content.pk
    admin_session(client, admin_user)

    response = client.patch(
        f"/api/v1/admin/chapters/{maths_chapter.pk}/",
        {"name": "Real Numbers & Applications"},
        content_type="application/json",
    )
    assert response.status_code == 200

    maths_chapter.refresh_from_db()
    published_content.refresh_from_db()
    assert maths_chapter.slug == original_slug
    assert published_content.pk == content_pk
    assert published_content.chapter_id == maths_chapter.pk


@pytest.mark.django_db
def test_chapter_row_exposes_the_ids_the_edit_form_needs(
    client, admin_user, maths_chapter
):
    """The edit form preselects Class and Subject from the row itself.

    Without `class_level_id` and `stream_id` the form would need a second
    request per row just to learn which class a chapter belongs to, which is
    where the old "Class not preselected" bug came from.
    """
    admin_session(client, admin_user)
    row = client.get("/api/v1/admin/chapters/").json()["results"][0]

    assert row["class_level_id"] == maths_chapter.subject.class_level_id
    assert row["stream_id"] is None
    assert row["stream_name"] is None
    assert row["subject_name"] == "Mathematics"

# ===========================================================================
# STUDENTS PAGE
# ===========================================================================


@pytest.mark.django_db
def test_student_selected_class_is_reported_when_set(client, admin_user, student, class_10):
    """The Students page must show the real `StudentProfile.selected_class`.

    Not a dash, and never inferred from purchases.
    """
    from apps.accounts.services import ensure_profile

    profile = ensure_profile(student)
    profile.selected_class = class_10
    profile.save()

    admin_session(client, admin_user)
    row = client.get("/api/v1/admin/students/").json()["results"][0]
    assert row["selected_class"]["name"] == "Class 10"
    assert row["selected_class"]["number"] == 10


@pytest.mark.django_db
def test_student_selected_class_is_null_and_not_inferred_from_purchases(
    client, admin_user, student, class_10
):
    """A purchase does not imply a selected class.

    `selected_class` is what the student chose in onboarding; access is what a
    payment granted. Conflating them would report a preference the student never
    expressed.
    """
    student.class_purchases.create(
        class_level=class_10, amount=class_10.price, status=PurchaseStatus.ACTIVE
    )
    from apps.accounts.services import ensure_profile

    profile = ensure_profile(student)
    profile.selected_class = None
    profile.save()

    admin_session(client, admin_user)
    row = client.get("/api/v1/admin/students/").json()["results"][0]
    assert row["active_purchases"] == 1
    assert row["selected_class"] is None


@pytest.mark.django_db
def test_students_list_excludes_staff(client, admin_user, student, other_student):
    admin_session(client, admin_user)
    emails = {
        row["email"]
        for row in client.get("/api/v1/admin/students/").json()["results"]
    }
    assert emails == {student.email, other_student.email}


@pytest.mark.django_db
def test_students_search_matches_name_and_email(client, admin_user, student, other_student):
    """`?search=` must actually reach the backend and filter.

    Search spans email, first name and last name, so each probe asserts on which
    rows came back rather than on a bare count.
    """
    admin_session(client, admin_user)

    def emails_for(term: str) -> set[str]:
        response = client.get("/api/v1/admin/students/", {"search": term})
        assert response.status_code == 200
        return {row["email"] for row in response.json()["results"]}

    assert emails_for("Priya") == {other_student.email}
    assert emails_for("priya@example.com") == {other_student.email}
    assert emails_for("Verma") == {other_student.email}
    assert emails_for("Rahul") == {student.email}
    assert emails_for("rahul@example.com") == {student.email}
    assert emails_for("nobody-at-all") == set()


# ===========================================================================
# ERROR HANDLING — no raw Django output may reach the browser
# ===========================================================================


@pytest.mark.django_db
def test_admin_endpoints_answer_json_on_error_not_html(client, student):
    """Every admin endpoint must answer a refusal with JSON.

    Under `DEBUG=True` an unhandled exception answers with an HTML page. If the
    frontend ever trusts that body it renders the traceback inside the app, so
    the contract to assert is the content type, not just the status code.
    """
    client.force_login(student)

    for path in (
        "/api/v1/admin/dashboard/",
        "/api/v1/admin/subjects/",
        "/api/v1/admin/chapters/",
        "/api/v1/admin/students/",
        "/api/v1/admin/payments/",
        "/api/v1/admin/purchases/",
        "/api/v1/admin/notifications/",
        "/api/v1/admin/notifications/unread-count/",
        "/api/v1/admin/content/",
        "/api/v1/admin/other-resources/",
        "/api/v1/admin/upi/",
    ):
        response = client.get(path)
        assert response.status_code == 403, f"{path} -> {response.status_code}"
        assert response["Content-Type"].startswith("application/json"), path
        body = response.content
        assert b"Traceback" not in body, path
        assert b"<html" not in body.lower(), path
        assert b"INSTALLED_APPS" not in body, path
        assert b"SECRET_KEY" not in body, path
        assert b"upi_id" not in body, path


@pytest.mark.django_db
def test_writes_are_refused_with_json_too(client, student, maths_subject):
    client.force_login(student)

    for path in (
        "/api/v1/admin/notifications/mark-all-read/",
    ):
        response = client.post(path)
        assert response.status_code == 403
        assert response["Content-Type"].startswith("application/json")

    response = client.patch(
        f"/api/v1/admin/chapters/{maths_subject.pk}/",
        {"name": "Hacked"},
        content_type="application/json",
    )
    assert response.status_code == 403
    assert response["Content-Type"].startswith("application/json")


@pytest.mark.django_db
def test_anonymous_admin_access_is_401_json(client):
    response = client.get("/api/v1/admin/dashboard/")
    assert response.status_code == 401
    assert response["Content-Type"].startswith("application/json")
    assert b"Traceback" not in response.content


@pytest.mark.django_db
def test_unread_count_is_a_bare_integer_so_polling_is_cheap(client, admin_user):
    """The bell polls this endpoint, so the payload must stay tiny."""
    admin_session(client, admin_user)
    response = client.get("/api/v1/admin/notifications/unread-count/")

    assert response.status_code == 200
    assert set(response.json()) == {"unread"}
    assert len(response.content) < 100

# ===========================================================================
# SEARCH PLUMBING
#
# DRF's default `filter_backends` is an empty list. A viewset that declares
# `search_fields` without also declaring `filter_backends` accepts `?search=`
# and silently discards it, so the page looks like it is searching and quietly
# returns the whole collection. Students, Purchases and Payments all had exactly
# that defect.
# ===========================================================================


@pytest.mark.django_db
def test_students_search_reaches_the_backend(client, admin_user, student, other_student):
    admin_session(client, admin_user)

    def emails_for(term: str) -> set[str]:
        response = client.get("/api/v1/admin/students/", {"search": term})
        assert response.status_code == 200
        return {row["email"] for row in response.json()["results"]}

    assert emails_for("Priya") == {other_student.email}
    assert emails_for("priya@example.com") == {other_student.email}
    assert emails_for("Verma") == {other_student.email}
    assert emails_for("Rahul") == {student.email}
    assert emails_for("nobody-at-all") == set()
    # An empty term must not narrow anything.
    assert len(emails_for("")) == 2


@pytest.mark.django_db
def test_purchases_search_reaches_the_backend(
    client, admin_user, student, other_student, class_10, class_11
):
    student.class_purchases.create(
        class_level=class_10, amount=class_10.price, status=PurchaseStatus.ACTIVE
    )
    other_student.class_purchases.create(
        class_level=class_11, amount=class_11.price, status=PurchaseStatus.PENDING
    )
    admin_session(client, admin_user)

    def ids_for(term: str) -> set[int]:
        response = client.get("/api/v1/admin/purchases/", {"search": term})
        return {row["user"] for row in response.json()["results"]}

    assert ids_for("priya") == {other_student.id}
    assert ids_for("rahul@example.com") == {student.id}
    assert ids_for("") == {student.id, other_student.id}


@pytest.mark.django_db
def test_payments_search_reaches_the_backend(client, admin_user, proof):
    """Payments are usually searched by UTR, which is a field on the proof."""
    admin_session(client, admin_user)

    by_utr = client.get("/api/v1/admin/payments/", {"search": proof.utr})
    assert by_utr.json()["count"] == 1
    assert by_utr.json()["results"][0]["utr"] == proof.utr

    by_student = client.get("/api/v1/admin/payments/", {"search": "rahul@example.com"})
    assert by_student.json()["count"] == 1

    assert client.get("/api/v1/admin/payments/", {"search": "no-such-utr"}).json()["count"] == 0


@pytest.mark.django_db
def test_ordering_reaches_the_backend(client, admin_user, student, other_student):
    admin_session(client, admin_user)

    ascending = client.get("/api/v1/admin/students/", {"ordering": "email"})
    assert [row["email"] for row in ascending.json()["results"]] == sorted(
        [student.email, other_student.email]
    )

    descending = client.get("/api/v1/admin/students/", {"ordering": "-email"})
    assert [row["email"] for row in descending.json()["results"]] == sorted(
        [student.email, other_student.email], reverse=True
    )


@pytest.mark.django_db
def test_no_admin_list_ignores_a_search_parameter(client, admin_user, class_10, maths_subject):
    """A blanket guard: every searchable admin list must honour `?search=`.

    Guards the whole class of defect rather than one endpoint at a time, so a
    future viewset cannot reintroduce it unnoticed.
    """
    Subject.objects.create(class_level=class_10, name="UniquelyFindableSubject", slug="uqfs")
    Chapter.objects.create(subject=maths_subject, number=99, name="UniquelyFindableChapter")
    admin_session(client, admin_user)

    paths = [
        "students",
        "classes",
        "subjects",
        "chapters",
        "content",
        "payments",
        "purchases",
        "notifications",
        "other-resources",
        "other-resource-categories",
    ]

    for path in paths:
        response = client.get(f"/api/v1/admin/{path}/", {"search": "zzz-no-such-row-zzz"})
        assert response.status_code == 200, path
        body = response.json()
        assert body["count"] == 0, f"{path} ignored ?search= (returned {body['count']} rows)"
