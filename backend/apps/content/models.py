"""Study material attached to a chapter.

A file existing on disk never makes content reachable. Delivery is gated by
`has_class_access` in `apps.purchases.services`, and the file is served only
through the staff-guarded view registered in `config/urls.py`.

`file` uses `django.db.models.FileField` for development. Moving to private
object storage (Cloudflare R2 / S3) later is a storage-backend change: the
field name, validators and service calls all stay the same.
"""

from __future__ import annotations

from django.db import models
from django.utils.text import slugify

from apps.core.models import TimeStampedModel, unique_upload_path, validate_document_upload

from .pagecount import pdf_page_count


def content_file_path(instance: "Content", filename: str) -> str:
    """``content/<class>/<subject>/<chapter>/<uuid>.<ext>``.

    Deterministic, human-legible and free of original filenames.
    """
    return unique_upload_path(instance, filename, folder="content")


class ContentType(models.TextChoices):
    NOTES = "NOTES", "Notes"
    PYQ = "PYQ", "Previous Year Questions"
    SOLVED_PYQ = "SOLVED_PYQ", "Solved PYQs"
    IMPORTANT_QUESTIONS = "IMPORTANT_QUESTIONS", "Important Questions"
    PRACTICE_PAPER = "PRACTICE_PAPER", "Practice Papers"
    MODEL_PAPER = "MODEL_PAPER", "Model Papers"


class ContentQuerySet(models.QuerySet):
    def published(self) -> "ContentQuerySet":
        """Only content an administrator has explicitly published."""
        return self.filter(is_published=True, chapter__is_active=True, chapter__subject__is_active=True)

    def of_type(self, content_type: str) -> "ContentQuerySet":
        return self.filter(content_type=content_type)


class Content(TimeStampedModel):
    """A single downloadable study resource."""

    chapter = models.ForeignKey(
        "academics.Chapter", on_delete=models.CASCADE, related_name="contents"
    )
    title = models.CharField(max_length=200, db_index=True)
    slug = models.SlugField(max_length=220)
    description = models.TextField(blank=True)
    content_type = models.CharField(
        max_length=32, choices=ContentType.choices, db_index=True
    )
    file = models.FileField(upload_to=content_file_path, validators=[validate_document_upload])
    page_count = models.PositiveIntegerField(null=True, blank=True)
    display_order = models.PositiveSmallIntegerField(default=0)
    # Default False: material is not reachable until an administrator
    # publishes it. Uploading a file does not publish it.
    is_published = models.BooleanField(default=False, db_index=True)

    objects = ContentQuerySet.as_manager()

    class Meta:
        db_table = "content_content"
        verbose_name = "content"
        verbose_name_plural = "contents"
        ordering = ["chapter", "display_order", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["chapter", "slug"], name="content_unique_per_chapter"
            ),
        ]
        indexes = [models.Index(fields=["content_type", "is_published"])]

    def __str__(self) -> str:
        return self.title

    def _stored_file_name(self) -> str:
        """The file path currently in the database, or `""` for an unsaved row."""
        if self.pk is None:
            return ""
        return (
            type(self)
            .objects.filter(pk=self.pk)
            .values_list("file", flat=True)
            .first()
            or ""
        )

    def save(self, *args, **kwargs) -> None:
        if not self.slug:
            self.slug = slugify(f"{self.chapter_id}-{self.title}")

        # Count the pages of a newly attached file.
        #
        # The column has always been in the serializer and the API but nothing
        # ever wrote it, so every card in the product read "PDF - 0 pages". The
        # count comes from the stored bytes on first attach only: an existing row
        # that keeps its file keeps its count, and a metadata-only edit does not
        # reopen and re-parse the file.
        update_fields = kwargs.get("update_fields")
        is_new = self._state.adding
        file_is_written = is_new or update_fields is None or "file" in (update_fields or ())

        if file_is_written and self.file:
            if is_new or self.page_count is None:
                self.page_count = pdf_page_count(self.file)
            elif self._stored_file_name() != self.file.name:
                # A genuinely different document, so the old count is wrong.
                # Compared by name rather than re-read unconditionally: a
                # metadata-only save would otherwise reopen and re-parse the file
                # on every keystroke-triggered PATCH, and an unreadable file
                # would wipe a good count it had already established.
                self.page_count = pdf_page_count(self.file)

        super().save(*args, **kwargs)

    # --- Convenience accessors used by future API views ------------------

    @property
    def subject(self):
        return self.chapter.subject

    @property
    def class_level(self):
        return self.chapter.subject.class_level

    @property
    def stream(self):
        return self.chapter.subject.stream

    def user_can_access(self, user) -> bool:
        """Server-side entitlement check for this piece of content.

        A published flag is necessary but not sufficient: the requesting user
        must additionally own an ACTIVE purchase of the owning class.
        """
        from apps.purchases.services import has_class_access

        if not self.is_published:
            return False
        return has_class_access(user, self.class_level)
