"""Payment-specific permissions.

These enforce the rules on the server. The frontend is never consulted.

A student may create a proof for their own purchase and read their own
proofs. Nobody but an active staff member may approve, reject, change a
status, change an amount after submission, or touch another student's
proof or screenshot.
"""

from __future__ import annotations

from rest_framework.permissions import BasePermission


class IsPaymentOwnerOrStaff(BasePermission):
    """Read access limited to the owning student or staff."""

    message = "You may only access your own payment records."

    def has_object_permission(self, request, view, obj) -> bool:
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if user.is_staff:
            return True
        return obj.user_id == user.pk


class CanSubmitPaymentProof(BasePermission):
    """Allow proof submission only by an active, signed-in student.

    Staff may also act through the service layer, but the public submission
    endpoint is for students.
    """

    message = "Authentication is required."

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and user.is_active)


class IsPaymentReviewer(BasePermission):
    """Review is staff-only.

    A student never satisfies this, so a self-approval attempt through the
    API is rejected with 403 regardless of what the client renders.
    """

    message = "Only an administrator can review a payment."

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(
            user and user.is_authenticated and user.is_active and user.is_staff
        )

    def has_object_permission(self, request, view, obj) -> bool:
        return self.has_permission(request, view)
