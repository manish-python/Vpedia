"""Independent educational resources, outside the class/stream/subject/chapter tree.

This is deliberately a SECOND content system, separate from
`apps.content.Content`:

* `Content` belongs to a Chapter, is priced through a `ClassPurchase`, and is
  gated by `has_class_access`.
* `OtherResource` belongs to nobody's syllabus. It has no class, no stream,
  no subject and no chapter, and it is **never** connected to a purchase.

Because there is no class foreign key, an Other Resource can never grant or
alter an entitlement: there is nothing for `has_class_access` to read. That
separation is structural rather than a rule that has to be remembered.

Files reuse the existing `TimeStampedModel`, `validate_document_upload` and
`unique_upload_path` abstractions from `apps.core.models`, so the storage layout
and the upload policy stay identical to study material.
"""

from __future__ import annotations

from django.db import models
from django.utils.text import slugify

from apps.core.models import TimeStampedModel, unique_upload_path, validate_document_upload


def other_resource_file_path(instance: "OtherResource", filename: str) -> str:
    """``other_resources/<yyyy>/<mm>/<category-slug>/<uuid>.pdf``.

    Its own tree, separate from `content/`, so the two can be moved to private
    object storage independently. The original filename is never reused.
    """
    return unique_upload_path(instance, filename, folder="other_resources")


class OtherResourceCategoryQuerySet(models.QuerySet):
    def active(self) -> "OtherResourceCategoryQuerySet":
        return self.filter(is_active=True)


class OtherResourceCategory(TimeStampedModel):
    """A grouping such as "Coding & Programming" or "Career Guidance".

    Administrator-managed: the defaults are seeded, but nothing here is
    hardcoded in the application. Deleting one is prevented while resources
    still reference it, so a published PDF can never lose its category.
    """

    name = models.CharField(max_length=80, unique=True, db_index=True)
    slug = models.SlugField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    display_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True, db_index=True)

    objects = OtherResourceCategoryQuerySet.as_manager()

    class Meta:
        db_table = "resources_other_resource_category"
        verbose_name = "other resource category"
        verbose_name_plural = "other resource categories"
        ordering = ["display_order", "name"]

    def __str__(self) -> str:
        return self.name

    def save(self, *args, **kwargs) -> None:
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

    @property
    def resource_count(self) -> int:
        """Published resources only, matching what a student can see."""
        return self.resources.filter(is_published=True).count()


class OtherResourceQuerySet(models.QuerySet):
    def published(self) -> "OtherResourceQuerySet":
        """Only rows an administrator has explicitly published.

        Mirrors `apps.content.ContentQuerySet.published`: a draft is invisible
        to students, and uploading a file does not publish it.
        """
        return self.filter(is_published=True, category__is_active=True)

    def visible_to(self, user) -> "OtherResourceQuerySet":
        """Everything a student may see.

        Deliberately does NOT consult `has_class_access`. An Other Resource is
        not part of any purchase, so ownership plays no part in visibility —
        only `is_published` and the category being active.
        """
        return self.published()


class OtherResource(TimeStampedModel):
    """One standalone PDF available to any signed-in student."""

    category = models.ForeignKey(
        OtherResourceCategory,
        on_delete=models.PROTECT,
        related_name="resources",
        help_text="Grouping shown to students.",
    )
    title = models.CharField(max_length=200, db_index=True)
    slug = models.SlugField(max_length=220, unique=True)
    description = models.TextField(blank=True)
    file = models.FileField(
        upload_to=other_resource_file_path,
        validators=[validate_document_upload],
        help_text="PDF document (JPG, PNG or WebP are rejected).",
    )
    page_count = models.PositiveIntegerField(null=True, blank=True)
    display_order = models.PositiveSmallIntegerField(default=0)
    # Default False: a new upload is a draft until an administrator publishes it.
    is_published = models.BooleanField(default=False, db_index=True)

    upload_discriminator = "resource"

    objects = OtherResourceQuerySet.as_manager()

    class Meta:
        db_table = "resources_other_resource"
        verbose_name = "other resource"
        verbose_name_plural = "other resources"
        ordering = ["display_order", "title"]
        indexes = [models.Index(fields=["category", "is_published"])]

    def __str__(self) -> str:
        return self.title

    def save(self, *args, **kwargs) -> None:
        if not self.slug:
            # Slugified server-side. A client-supplied slug is still honoured
            # when present, but uniqueness is enforced by the database.
            self.slug = slugify(f"{self.title}")
        super().save(*args, **kwargs)