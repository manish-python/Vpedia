"""Django Admin for the academic catalogue.

Class prices are editable here so pricing is a configuration change rather
than a code change.
"""

from __future__ import annotations

from django.contrib import admin

from .models import Chapter, ClassLevel, Stream, Subject


@admin.register(ClassLevel)
class ClassLevelAdmin(admin.ModelAdmin):
    list_display = (
        "display_order",
        "name",
        "price",
        "currency",
        "has_streams",
        "is_active",
        "subject_total",
    )
    list_display_links = ("name",)
    list_editable = ("price", "currency", "has_streams", "is_active", "display_order")
    list_filter = ("is_active", "has_streams")
    search_fields = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}
    ordering = ("display_order", "name")

    @admin.display(description="Subjects")
    def subject_total(self, obj: ClassLevel) -> int:
        return obj.subjects.count()

    fieldsets = (
        (None, {"fields": ("name", "slug", "description")}),
        (
            "Pricing",
            {
                "fields": ("price", "currency"),
                "description": "Server-side price. Always used for purchases; "
                "the frontend cannot supply an amount.",
            },
        ),
        ("Behaviour", {"fields": ("has_streams", "display_order", "is_active")}),
    )


@admin.register(Stream)
class StreamAdmin(admin.ModelAdmin):
    list_display = ("display_order", "name", "class_count", "is_active")
    list_display_links = ("name",)
    list_editable = ("display_order", "is_active")
    list_filter = ("is_active", "class_levels")
    search_fields = ("name",)
    prepopulated_fields = {"slug": ("name",)}
    filter_horizontal = ("class_levels",)

    @admin.display(description="Classes")
    def class_count(self, obj: Stream) -> int:
        return obj.class_levels.count()


@admin.register(Subject)
class SubjectAdmin(admin.ModelAdmin):
    list_display = ("display_order", "name", "class_level", "stream", "chapter_total", "is_active")
    list_display_links = ("name",)
    list_editable = ("display_order", "is_active")
    list_filter = ("class_level", "stream", "is_active")
    search_fields = ("name", "slug", "class_level__name")
    prepopulated_fields = {"slug": ("name",)}
    list_select_related = ("class_level", "stream")
    autocomplete_fields = ("class_level", "stream")

    @admin.display(description="Chapters")
    def chapter_total(self, obj: Subject) -> int:
        return obj.chapters.count()


@admin.register(Chapter)
class ChapterAdmin(admin.ModelAdmin):
    list_display = ("subject", "number", "name", "content_total", "is_active")
    list_display_links = ("name",)
    list_editable = ("number", "is_active")
    list_filter = ("subject__class_level", "subject", "is_active")
    search_fields = ("name", "subject__name")
    prepopulated_fields = {"slug": ("name",)}
    list_select_related = ("subject", "subject__class_level")
    autocomplete_fields = ("subject",)

    @admin.display(description="Materials")
    def content_total(self, obj: Chapter) -> int:
        return obj.contents.count()
