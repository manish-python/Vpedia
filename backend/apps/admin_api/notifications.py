"""The single place an admin notification is created.

Every caller is the code that actually performed the work, so a notification
cannot exist without the underlying event having happened. Import this rather
than constructing `AdminNotification` directly: it is what keeps the feed
honest, and it gives one place to change the wording.

Nothing here is ever presented to a student.
"""

from __future__ import annotations

import logging

from .models import AdminNotification, NotificationType

logger = logging.getLogger(__name__)

#: Guards against a runaway loop (a bad import, a repeated signal) turning into
#: thousands of rows. 50 is far more than a real session produces.
MAX_NOTIFICATIONS = 200


def notify(
    notification_type: NotificationType | str,
    *,
    title: str,
    message: str = "",
    link: str = "",
) -> AdminNotification | None:
    """Create one notification. Returns None if it could not be written.

    Failures are logged and swallowed on purpose: a notification is
    informational, and it must never take down the registration or payment
    request that triggered it.
    """
    try:
        note = AdminNotification.objects.create(
            type=notification_type, title=title[:200], message=message, link=link[:300]
        )
    except Exception:  # noqa: BLE001 - never break the caller
        logger.exception("Could not create admin notification %s", title)
        return None

    _trim()
    return note


def _trim() -> None:
    """Keep the table bounded; the feed is only ever read recent-first."""
    try:
        excess = AdminNotification.objects.count() - MAX_NOTIFICATIONS
        if excess > 0:
            oldest = list(
                AdminNotification.objects.order_by("-created_at", "-id")
                .values_list("id", flat=True)[excess:]
            )
            if oldest:
                AdminNotification.objects.filter(id__in=oldest).delete()
    except Exception:  # noqa: BLE001
        logger.exception("Could not trim admin notifications")


# ---------------------------------------------------------------------------
# Event helpers — the wording lives here, not at each call site
# ---------------------------------------------------------------------------


def student_registered(*, name: str, email: str, user_id: int) -> None:
    notify(
        NotificationType.NEW_STUDENT,
        title="New Student Registered",
        message=f"{name} registered with {email}.",
        link=f"/admin-panel/students?search={email}",
    )
    del user_id


def payment_requested(*, proof) -> None:
    notify(
        NotificationType.PAYMENT_REQUEST,
        title="New Payment Request",
        message=(
            f"{proof.user.email} submitted a {proof.class_purchase.class_level.name} "
            f"payment of INR {proof.amount} (UTR {proof.utr})."
        ),
        link=f"/admin-panel/payments?payment={proof.pk}",
    )


def payment_approved(*, proof) -> None:
    notify(
        NotificationType.PAYMENT_APPROVED,
        title="Payment Approved",
        message=(
            f"{proof.class_purchase.class_level.name} access activated for "
            f"{proof.user.email}."
        ),
        link=f"/admin-panel/payments?payment={proof.pk}",
    )


def payment_rejected(*, proof) -> None:
    notify(
        NotificationType.PAYMENT_REJECTED,
        title="Payment Rejected",
        message=(
            f"Payment from {proof.user.email} was rejected: {proof.rejection_reason}"
        ),
        link=f"/admin-panel/payments?payment={proof.pk}",
    )


def content_published(*, title: str, content_id: int) -> None:
    notify(
        NotificationType.CONTENT_PUBLISHED,
        title="Content Published",
        message=f"“{title}” is now visible to students.",
        link=f"/admin-panel/content?class_content={content_id}",
    )


def resource_published(*, title: str, resource_id: int) -> None:
    notify(
        NotificationType.RESOURCE_PUBLISHED,
        title="Other Resource Published",
        message=f"“{title}” is now visible to students.",
        link=f"/admin-panel/content?resource={resource_id}",
    )