from rest_framework.permissions import BasePermission


class IsStaffUser(BasePermission):
    """Only active Django staff accounts may use the custom admin API."""

    message = "Administrator access is required."

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and user.is_active
            and user.is_staff
        )
