"""Reusable DRF permissions.

Access control lives here and in `apps.purchases.services`; the frontend is
never consulted for an entitlement decision.
"""

from __future__ import annotations

from rest_framework.permissions import SAFE_METHODS, BasePermission


class IsAuthenticatedUser(BasePermission):
    """Only a signed-in user may perform this action."""

    message = "Authentication is required."

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and user.is_active)


class IsStaffUser(BasePermission):
    """Only an active staff member may perform this action."""

    message = "Administrator access is required."

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and user.is_active and user.is_staff)


class IsOwnerOrStaff(BasePermission):
    """Object access for the owning student or any staff member.

    Applied to detail routes so a student cannot read or modify another
    student's purchase or payment proof.
    """

    message = "You may only access your own records."

    def has_object_permission(self, request, view, obj) -> bool:
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if user.is_staff:
            return True
        owner = getattr(obj, "user", None)
        return owner is not None and owner.pk == user.pk


class ReadOnlyOrStaff(BasePermission):
    """Anyone may read; only staff may write.

    Used for catalogue endpoints that are public by nature.
    """

    message = "This resource is read-only."

    def has_permission(self, request, view) -> bool:
        if request.method in SAFE_METHODS:
            return True
        user = request.user
        return bool(user and user.is_authenticated and user.is_active and user.is_staff)
