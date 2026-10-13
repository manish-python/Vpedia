"""Other Resource registration.

Django Admin stays a complete fallback for this feature: an administrator can
manage categories, resources, publishing and ordering here exactly as in the
custom panel, and file downloads route through the staff-guarded media view.
"""

from __future__ import annotations

from django.contrib import admin

from .models import OtherResource, OtherResourceCategory


@admin.register(OtherResourceCategory)
class OtherResourceCategoryAdmin(admin.ModelAdmin):
    list_display = ["name", "slug", "display_order", "is_active", "created_at"]
    list_filter = ["is_active"]
    search_fields = ["name", "slug", "description"]
    list_editable = ["display_order", "is_active"]
    ordering = ["display_order", "name"]
    prepopulated_fields = {"slug": ("name",)}

    @admin.display(description="Published resources")
    def published_resource_count(self, obj: OtherResourceCategory) -> int:
        return obj.resource_count


@admin.register(OtherResource)
class OtherResourceAdmin(admin.ModelAdmin):
    list_display = [
        "title",
        "category",
        "is_published",
        "display_order",
        "created_at",
    ]
    list_filter = ["is_published", "category"]
    search_fields = ["title", "slug", "description"]
    list_editable = ["is_published", "display_order"]
    ordering = ["display_order", "title"]
    autocomplete_fields = []
    prepopulated_fields = {"slug": ("title",)}

    @admin.display(description="File")
    def file_name(self, obj: OtherResource) -> str:
        return obj.file.name.rsplit("/", 1)[-1] if obj.file else "—"