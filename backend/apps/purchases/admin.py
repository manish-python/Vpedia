"""Django Admin for class purchase entitlements.

These records are read-only here. They are created through the API so the
amount is always derived from the server-side class price, and they become
ACTIVE only through the payment review service.
"""

from __future__ import annotations

from django.contrib import admin

from .models import ClassPurchase


@admin.register(ClassPurchase)
class ClassPurchaseAdmin(admin.ModelAdmin):
    list_display = (
        "created_at",
        "user",
        "class_level",
        "stream",
        "amount",
        "status",
        "activated_at",
        "approved_by",
    )
    list_display_links = ("user",)
    list_filter = ("status", "class_level", "stream", "currency", "created_at")
    search_fields = (
        "user__email",
        "user__first_name",
        "user__last_name",
        "class_level__name",
    )
    list_select_related = ("user", "class_level", "stream", "approved_by")
    date_hierarchy = "created_at"
    readonly_fields = (
        "user",
        "class_level",
        "stream",
        "amount",
        "currency",
        "status",
        "activated_at",
        "approved_by",
        "approved_at",
        "created_at",
        "updated_at",
    )
    autocomplete_fields = ("user", "class_level", "stream")

    def has_add_permission(self, request) -> bool:
        return False
