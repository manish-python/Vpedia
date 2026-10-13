"""PDF page counts, and the chapter content type filter.

Bug 2 - "PDF - 0 pages"
------------------------
`Content.page_count` has been in the model, the serializer and the API since the
start, but nothing ever wrote to it. Every row held `null`, the frontend mapper
coerced that to `0`, and every content card in the product read `PDF - 0 pages`.

The count is now read from the stored bytes when a file is first attached, and
the assertions below are about the *stored bytes*: a count that appears in the
API without matching the file would be worse than no count at all.

Bug 1 - tabs
------------
`/chapters/<slug>/contents/?type=` filters by a single content type, and that is
what the tab strip depends on. These tests pin that each of the six tab values
returns only its own rows, and only from the requested chapter, so a tab can
never show another chapter's material.
"""
import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

from apps.academics.models import Chapter, Subject
from apps.content.models import Content, ContentType
from apps.content.pagecount import pdf_page_count


def make_pdf(pages: int) -> bytes:
    """A genuine multi-page PDF, so the parser is reading a real document."""
    images = [Image.new("RGB", (200, 280), (255, 255, 255)) for _ in range(pages)]
    buffer = io.BytesIO()
    images[0].save(buffer, "PDF", resolution=150.0, save_all=True, append_images=images[1:])
    return buffer.getvalue()


def upload(pages: int, name: str = "material.pdf") -> SimpleUploadedFile:
    return SimpleUploadedFile(name, make_pdf(pages), content_type="application/pdf")


# ===========================================================================
# READING THE COUNT
# ===========================================================================


@pytest.mark.parametrize("pages", [1, 2, 7, 24])
def test_page_count_is_read_from_the_stored_file(pages):
    assert pdf_page_count(upload(pages)) == pages


def test_a_truncated_pdf_reads_as_unknown_not_as_zero():
    """A 15-byte stub is not a document with no pages.

    Persisting `0` here is what produced the original lie; `None` is the honest
    answer and the frontend renders it as plain `PDF`.
    """
    stub = SimpleUploadedFile("stub.pdf", b"%PDF-1.4\n%%E", content_type="application/pdf")
    assert pdf_page_count(stub) is None


def test_a_non_pdf_reads_as_unknown():
    assert pdf_page_count(SimpleUploadedFile("x.pdf", b"PK\x03\x04", content_type="application/pdf")) is None


def test_an_empty_file_reads_as_unknown():
    assert pdf_page_count(SimpleUploadedFile("x.pdf", b"", content_type="application/pdf")) is None


def test_a_non_pdf_name_is_ignored_even_if_the_bytes_look_right():
    """A PDF stored under another extension is not this field's business."""
    assert pdf_page_count(SimpleUploadedFile("notes.txt", make_pdf(3), content_type="text/plain")) is None


def test_missing_file_reads_as_unknown():
    assert pdf_page_count(None) is None
    assert pdf_page_count("") is None


def test_the_parser_never_raises_on_hostile_input():
    """Every failure has to be an answer, never an exception on an upload."""
    for payload in (b"%PDF-1.4", b"%PDF-1.7\nstartxref\n999999\n%%EOF", b"\x00" * 512, b"%PDF"):
        file = SimpleUploadedFile("hostile.pdf", payload, content_type="application/pdf")
        result = pdf_page_count(file)
        assert result is None or result > 0


def test_the_file_position_is_restored_after_reading():
    """Reading must not consume the stream the caller is about to save."""
    file = upload(5)
    file.seek(0)
    pdf_page_count(file)
    assert file.tell() == 0
    assert len(file.read()) == len(make_pdf(5))


# ===========================================================================
# PERSISTING IT
# ===========================================================================


@pytest.mark.django_db
def test_uploading_content_stores_the_real_page_count(maths_chapter):
    row = Content.objects.create(
        chapter=maths_chapter,
        title="Twenty Four Page Notes",
        content_type=ContentType.NOTES,
        file=upload(24),
    )
    row.refresh_from_db()
    assert row.page_count == 24


@pytest.mark.django_db
def test_replacing_the_file_recounts_it(maths_chapter):
    row = Content.objects.create(
        chapter=maths_chapter, title="Replaced", content_type=ContentType.NOTES, file=upload(2)
    )
    assert row.page_count == 2

    row.file = upload(11)
    row.save()
    row.refresh_from_db()
    assert row.page_count == 11, "a replacement file must be re-counted"


@pytest.mark.django_db
def test_a_metadata_edit_keeps_the_existing_count_and_does_not_reparse(maths_chapter):
    row = Content.objects.create(
        chapter=maths_chapter, title="Stable", content_type=ContentType.NOTES, file=upload(9)
    )
    assert row.page_count == 9

    row.title = "Stable, renamed"
    row.save()
    row.refresh_from_db()
    assert row.page_count == 9


@pytest.mark.django_db
def test_a_structurally_truncated_upload_leaves_the_count_unknown(maths_chapter):
    """Accepted at upload, unreadable for a page count.

    `validate_document_upload` deliberately checks the `%PDF-` header and the
    size, not the xref table, so a truncated file still passes - that is existing
    behaviour and this change does not touch it. What matters here is that such
    a row records `None`, not `0`, because `0` is what the UI used to print.
    """
    from apps.core.models import validate_document_upload

    stub = SimpleUploadedFile("stub.pdf", b"%PDF-1.4\n%%E", content_type="application/pdf")
    validate_document_upload(stub)  # still accepted, exactly as before

    row = Content.objects.create(
        chapter=maths_chapter, title="Broken", content_type=ContentType.NOTES, file=stub
    )
    assert row.page_count is None


# ===========================================================================
# API + TYPE FILTER  (Bug 1)
# ===========================================================================


ALL_TYPES = [
    ContentType.NOTES,
    ContentType.PYQ,
    ContentType.SOLVED_PYQ,
    ContentType.IMPORTANT_QUESTIONS,
    ContentType.PRACTICE_PAPER,
    ContentType.MODEL_PAPER,
]


@pytest.mark.django_db
@pytest.mark.parametrize("content_type", ALL_TYPES)
def test_each_tab_returns_only_its_own_type(client, maths_chapter, content_type):
    """One row per type, so an over-broad query is impossible to miss.

    Asserted on the count as well as the types: a filter that quietly returned
    the whole chapter would still satisfy a set-equality check on one tab.
    """
    for value in ALL_TYPES:
        Content.objects.create(
            chapter=maths_chapter,
            title=f"{value} row",
            content_type=value,
            file=upload(3),
            is_published=True,
        )

    payload = client.get(f"/api/v1/chapters/{maths_chapter.slug}/contents/?type={content_type}").json()

    assert payload["results"], f"tab {content_type} returned nothing"
    assert len(payload["results"]) == 1, "the tab returned more than its own row"
    assert payload["results"][0]["content_type"] == content_type
    assert payload["results"][0]["title"] == f"{content_type} row"


@pytest.mark.django_db
def test_a_tab_returns_every_row_of_its_type(client, maths_chapter):
    """The other half: a tab with several items must show all of them."""
    for n in range(3):
        Content.objects.create(
            chapter=maths_chapter,
            title=f"PYQ number {n}",
            content_type=ContentType.PYQ,
            file=upload(3),
            is_published=True,
        )
    Content.objects.create(
        chapter=maths_chapter, title="A note", content_type=ContentType.NOTES,
        file=upload(3), is_published=True,
    )

    payload = client.get(f"/api/v1/chapters/{maths_chapter.slug}/contents/?type=PYQ").json()

    assert payload["count"] == 3
    assert len(payload["results"]) == 3
    assert {row["title"] for row in payload["results"]} == {
        "PYQ number 0",
        "PYQ number 1",
        "PYQ number 2",
    }


@pytest.mark.django_db
def test_an_empty_tab_returns_an_empty_list_not_an_error(client, maths_chapter):
    """A type with nothing behind it must be an empty result, not a failure."""
    Content.objects.create(
        chapter=maths_chapter, title="Only notes", content_type=ContentType.NOTES,
        file=upload(2), is_published=True,
    )
    response = client.get(f"/api/v1/chapters/{maths_chapter.slug}/contents/?type=MODEL_PAPER")

    assert response.status_code == 200
    payload = response.json()
    assert payload["results"] == []
    assert payload["count"] == 0


@pytest.mark.django_db
def test_the_filter_is_case_insensitive(client, maths_chapter):
    """The tab strip sends the enum value; the view upper-cases it."""
    Content.objects.create(
        chapter=maths_chapter, title="Lower", content_type=ContentType.SOLVED_PYQ,
        file=upload(2), is_published=True,
    )
    payload = client.get(f"/api/v1/chapters/{maths_chapter.slug}/contents/?type=solved_pyq").json()
    assert [row["content_type"] for row in payload["results"]] == [ContentType.SOLVED_PYQ]


@pytest.mark.django_db
def test_an_unknown_type_returns_nothing_rather_than_everything(client, maths_chapter):
    """A typo must not silently widen the query to the whole chapter."""
    for value in ALL_TYPES:
        Content.objects.create(
            chapter=maths_chapter, title=f"{value} row", content_type=value,
            file=upload(2), is_published=True,
        )
    payload = client.get(f"/api/v1/chapters/{maths_chapter.slug}/contents/?type=NOPE").json()
    assert payload["results"] == []


@pytest.mark.django_db
def test_a_tab_never_returns_another_chapters_content(client, maths_chapter, class_10, maths_subject):
    other_subject = Subject.objects.create(
        name="Science", class_level=class_10, display_order=2
    )
    other_chapter = Chapter.objects.create(
        subject=other_subject, number=9, name="Elsewhere", display_order=9
    )

    mine = Content.objects.create(
        chapter=maths_chapter, title="Mine", content_type=ContentType.NOTES,
        file=upload(2), is_published=True,
    )
    theirs = Content.objects.create(
        chapter=other_chapter, title="Theirs", content_type=ContentType.NOTES,
        file=upload(2), is_published=True,
    )

    payload = client.get(f"/api/v1/chapters/{maths_chapter.slug}/contents/?type=NOTES").json()
    slugs = [row["slug"] for row in payload["results"]]

    assert mine.slug in slugs
    assert theirs.slug not in slugs


@pytest.mark.django_db
def test_the_api_exposes_the_stored_page_count(client, maths_chapter):
    Content.objects.create(
        chapter=maths_chapter, title="Counted", content_type=ContentType.NOTES,
        file=upload(13), is_published=True,
    )
    payload = client.get(f"/api/v1/chapters/{maths_chapter.slug}/contents/?type=NOTES").json()
    assert payload["results"][0]["page_count"] == 13


@pytest.mark.django_db
def test_the_api_reports_an_unknown_count_as_null_not_zero(client, maths_chapter):
    """The frontend used to turn this null into a displayed "0 pages"."""
    row = Content.objects.create(
        chapter=maths_chapter, title="Unknown", content_type=ContentType.NOTES,
        file=upload(4), is_published=True,
    )
    Content.objects.filter(pk=row.pk).update(page_count=None)

    payload = client.get(f"/api/v1/chapters/{maths_chapter.slug}/contents/?type=NOTES").json()
    assert payload["results"][0]["page_count"] is None