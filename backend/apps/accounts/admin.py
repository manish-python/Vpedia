"""Django Admin for accounts."""

from __future__ import annotations

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import StudentProfile, User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    """Email-identified users.

    Staff accounts created here hold a usable password so they can sign in to
    Django Admin. Student accounts created through the API are given an
    unusable password, because authentication is handled by Google OAuth in a
    later stage.
    """

    ordering = ("-date_joined",)
    list_display = ("email", "first_name", "last_name", "is_active", "is_staff", "date_joined")
    list_filter = ("is_active", "is_staff", "is_superuser", "email_verified")
    search_fields = ("email", "first_name", "last_name", "google_subject_id")
    readonly_fields = ("date_joined", "last_login", "created_at", "updated_at", "last_login_at")
    filter_horizontal = ("groups", "user_permissions")
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Name", {"fields": ("first_name", "last_name")}),
        ("Permissions", {"fields": ("is_active", "is_staff", "is_superuser")}),
        (
            "Google identity",
            {
                "fields": ("google_subject_id", "email_verified", "avatar_url"),
                "description": "Populated by the Google OAuth stage.",
            },
        ),
        ("Dates", {"fields": ("last_login", "last_login_at", "date_joined")}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("email", "first_name", "last_name"),
                "fields": ("password1", "password2"),
            },
        ),
    )


@admin.register(StudentProfile)
class StudentProfileAdmin(admin.ModelAdmin):
    """Student preferences.

    `selected_class` and `selected_stream` are what a student is studying.
    They are NOT an entitlement: access to paid material comes only from an
    ACTIVE `ClassPurchase` on the Purchases page.
    """

    list_display = ("user", "selected_class", "selected_stream", "phone_number", "created_at")
    list_select_related = ("user", "selected_class", "selected_stream")
    list_filter = ("selected_class", "selected_stream")
    search_fields = ("user__email", "user__first_name", "user__last_name", "phone_number")
    raw_id_fields = ("user",)
    autocomplete_fields = ("selected_class", "selected_stream")
