"""Django Admin for study material.

Uploading a file does not publish it: `is_published` defaults to False and is
an explicit, auditable toggle.
"""

from __future__ import annotations

from django.contrib import admin

from .models import Content


@admin.register(Content)
class ContentAdmin(admin.ModelAdmin):
    list_display = (
        "display_order",
        "title",
        "content_type",
        "chapter",
        "is_published",
    )
    list_display_links = ("title",)
    list_editable = ("display_order", "is_published")
    list_filter = ("content_type", "is_published", "chapter__subject__class_level")
    search_fields = ("title", "description", "chapter__name")
    list_select_related = ("chapter", "chapter__subject")
    autocomplete_fields = ("chapter",)
    readonly_fields = ("created_at", "updated_at")

    fieldsets = (
        (None, {"fields": ("chapter", "title", "description", "content_type")}),
        ("File", {"fields": ("file", "page_count")}),
        (
            "Visibility",
            {
                "fields": ("is_published", "display_order"),
                "description": "Unpublished material is never returned by the API, "
                "even to a student who owns the class.",
            },
        ),
        ("Timestamps", {"fields": ("created_at", "updated_at")}),
    )
