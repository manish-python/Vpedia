"""Academic catalogue: ClassLevel -> Stream -> Subject -> Chapter.

Prices live on `ClassLevel` and are the server-side source of truth. A client
never supplies the payable amount; it is read from here when a purchase is
created and snapshotted onto the purchase record.
"""

from __future__ import annotations

from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models
from django.utils.text import slugify

from apps.core.models import TimeStampedModel


class Currency(models.TextChoices):
    INR = "INR", "Indian Rupee"


class ClassLevelQuerySet(models.QuerySet):
    def active(self) -> "ClassLevelQuerySet":
        return self.filter(is_active=True)

    def order_for_display(self) -> "ClassLevelQuerySet":
        return self.order_by("display_order", "id")


class ClassLevel(TimeStampedModel):
    """A class from 7 to 12."""

    name = models.CharField(max_length=32, unique=True, db_index=True)
    slug = models.SlugField(max_length=64, unique=True)
    description = models.TextField(blank=True)
    # Server-side price. Configurable by an administrator at any time.
    price = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.00"))],
        help_text="One-time price for complete access to this class.",
    )
    currency = models.CharField(
        max_length=3, choices=Currency.choices, default=Currency.INR
    )
    display_order = models.PositiveSmallIntegerField(default=0, db_index=True)
    # Classes 11 and 12 require a stream; 7-10 do not.
    has_streams = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True, db_index=True)

    objects = ClassLevelQuerySet.as_manager()

    class Meta:
        db_table = "academics_class_level"
        verbose_name = "class level"
        verbose_name_plural = "class levels"
        ordering = ["display_order", "id"]

    def __str__(self) -> str:
        return self.name

    def save(self, *args, **kwargs) -> None:
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)


class Stream(TimeStampedModel):
    """Science, Commerce or Humanities.

    `class_levels` records where the stream applies, so an administrator can
    change that without a code change.
    """

    name = models.CharField(max_length=64, unique=True, db_index=True)
    slug = models.SlugField(max_length=64, unique=True)
    description = models.TextField(blank=True)
    display_order = models.PositiveSmallIntegerField(default=0)
    class_levels = models.ManyToManyField(
        ClassLevel,
        related_name="streams",
        blank=True,
        help_text="Classes where this stream is offered.",
    )
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "academics_stream"
        verbose_name = "stream"
        verbose_name_plural = "streams"
        ordering = ["display_order", "name"]

    def __str__(self) -> str:
        return self.name

    def save(self, *args, **kwargs) -> None:
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)


class SubjectQuerySet(models.QuerySet):
    def active(self) -> "SubjectQuerySet":
        return self.filter(is_active=True)

    def for_class_and_stream(self, class_level, stream=None) -> "SubjectQuerySet":
        """Subjects for a class, narrowed to a stream when one applies."""
        if getattr(class_level, "has_streams", False):
            return self.filter(class_level=class_level, stream=stream)
        return self.filter(class_level=class_level, stream__isnull=True)


class Subject(TimeStampedModel):
    """A subject belonging to a class, and optionally to a stream."""

    class_level = models.ForeignKey(
        ClassLevel, on_delete=models.CASCADE, related_name="subjects"
    )
    stream = models.ForeignKey(
        Stream,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="subjects",
        help_text="Required only for classes that have streams.",
    )
    name = models.CharField(max_length=120, db_index=True)
    slug = models.SlugField(max_length=140)
    description = models.TextField(blank=True)
    display_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True, db_index=True)

    objects = SubjectQuerySet.as_manager()

    class Meta:
        db_table = "academics_subject"
        verbose_name = "subject"
        verbose_name_plural = "subjects"
        ordering = ["display_order", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["class_level", "stream", "slug"],
                name="academics_subject_unique_per_class_stream",
            ),
        ]
        indexes = [models.Index(fields=["class_level", "stream", "is_active"])]

    def __str__(self) -> str:
        return f"{self.name} ({self.class_level.name})"

    def save(self, *args, **kwargs) -> None:
        if not self.slug:
            self.slug = slugify(f"{self.class_level_id}-{self.name}")
        super().save(*args, **kwargs)

    @property
    def chapter_count(self) -> int:
        """Derived rather than stored, so it cannot drift."""
        return self.chapters.filter(is_active=True).count()


class ChapterQuerySet(models.QuerySet):
    def active(self) -> "ChapterQuerySet":
        return self.filter(is_active=True)

    def published(self) -> "ChapterQuerySet":
        return self.filter(is_active=True)


class Chapter(TimeStampedModel):
    """A chapter within a subject."""

    subject = models.ForeignKey(
        Subject, on_delete=models.CASCADE, related_name="chapters"
    )
    number = models.PositiveSmallIntegerField(default=1)
    name = models.CharField(max_length=180, db_index=True)
    slug = models.SlugField(max_length=200)
    description = models.TextField(blank=True)
    display_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True, db_index=True)

    objects = ChapterQuerySet.as_manager()

    class Meta:
        db_table = "academics_chapter"
        verbose_name = "chapter"
        verbose_name_plural = "chapters"
        ordering = ["number", "display_order", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["subject", "slug"], name="academics_chapter_unique_per_subject"
            ),
        ]
        indexes = [models.Index(fields=["subject", "is_active"])]

    def __str__(self) -> str:
        return f"{self.number}. {self.name}"

    def save(self, *args, **kwargs) -> None:
        if not self.slug:
            self.slug = slugify(f"{self.subject_id}-{self.name}")
        if not self.display_order:
            self.display_order = self.number
        super().save(*args, **kwargs)

    @property
    def class_level(self) -> ClassLevel:
        return self.subject.class_level
