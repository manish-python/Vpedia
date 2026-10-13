"""Dashboard aggregation.

Everything here runs as SQL `COUNT`/`SUM`/`values(...)` over the database. The
frontend never receives rows to count, so opening the dashboard stays a fixed
number of queries no matter how much data the platform holds.

Revenue rule
------------
`approved_revenue` sums **ACTIVE** purchases only. A PENDING or REJECTED
purchase is never counted, because no money has been accepted for it.
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone

from apps.academics.models import ClassLevel
from apps.accounts.models import User
from apps.content.models import Content, ContentType
from apps.payments.models import PaymentProof, PaymentStatus
from apps.purchases.models import ClassPurchase, PurchaseStatus

from .models import AdminNotification, NotificationType


def _window_start(days: int):
    return timezone.now() - timedelta(days=days)


def student_stats() -> dict:
    """Totals and growth windows. Staff accounts are excluded."""
    students = User.objects.filter(is_staff=False)
    now = timezone.now()

    return {
        "total": students.count(),
        "today": students.filter(date_joined__gte=_start_of_day(now)).count(),
        "week": students.filter(date_joined__gte=_window_start(7)).count(),
        "month": students.filter(date_joined__gte=_window_start(30)).count(),
    }


def _start_of_day(now):
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def registration_trend(days: int = 14) -> list[dict]:
    """Daily sign-up counts for the last `days` days.

    Issued as one grouped query. Days with no sign-ups are included with a zero
    so the chart does not silently skip them.
    """
    since = _start_of_day(_window_start(days - 1))
    counts = {
        row["day"]: row["n"]
        for row in User.objects.filter(is_staff=False, date_joined__gte=since)
        .annotate(day=TruncDate("date_joined"))
        .values("day")
        .annotate(n=Count("id"))
    }

    series = []
    for offset in range(days):
        day = (since + timedelta(days=offset)).date()
        series.append({"date": day.isoformat(), "count": counts.get(day, 0)})
    return series


def purchase_stats() -> dict:
    grouped = {
        row["status"]: row["n"]
        for row in ClassPurchase.objects.values("status").annotate(n=Count("id"))
    }
    return {
        "active": grouped.get(PurchaseStatus.ACTIVE, 0),
        "pending": grouped.get(PurchaseStatus.PENDING, 0),
        "rejected": grouped.get(PurchaseStatus.REJECTED, 0),
        "cancelled": grouped.get(PurchaseStatus.CANCELLED, 0),
    }


def purchases_by_class() -> list[dict]:
    """ACTIVE purchases per class, ordered by the class display order."""
    rows = {
        row["class_level_id"]: row["n"]
        for row in ClassPurchase.objects.filter(status=PurchaseStatus.ACTIVE)
        .values("class_level_id")
        .annotate(n=Count("id"))
    }
    return [
        {"class_id": level.pk, "name": level.name, "number": _class_number(level), "count": rows.get(level.pk, 0)}
        for level in ClassLevel.objects.all()
    ]


def _class_number(level: ClassLevel) -> int | None:
    from apps.academics.serializers import class_number_for

    return class_number_for(level)


def payment_stats() -> dict:
    grouped = {
        row["status"]: row["n"]
        for row in PaymentProof.objects.values("status").annotate(n=Count("id"))
    }
    pending_total = (
        PaymentProof.objects.filter(status=PaymentStatus.PENDING)
        .aggregate(total=Sum("amount"))["total"]
        or Decimal("0.00")
    )
    return {
        "pending": grouped.get(PaymentStatus.PENDING, 0),
        "approved": grouped.get(PaymentStatus.APPROVED, 0),
        "rejected": grouped.get(PaymentStatus.REJECTED, 0),
        "pending_amount": str(pending_total),
    }


def approved_revenue() -> str:
    """Money actually accepted: ACTIVE purchases only."""
    total = (
        ClassPurchase.objects.filter(status=PurchaseStatus.ACTIVE)
        .aggregate(total=Sum("amount"))["total"]
        or Decimal("0.00")
    )
    return str(total)


def content_stats() -> dict:
    grouped = {
        row["content_type"]: row["n"]
        for row in Content.objects.values("content_type").annotate(n=Count("id"))
    }
    # Every enum member present, so the UI never renders an undefined bar.
    by_type = {choice.value: grouped.get(choice.value, 0) for choice in ContentType}
    return {
        "total": sum(by_type.values()),
        "published": Content.objects.filter(is_published=True).count(),
        "draft": Content.objects.filter(is_published=False).count(),
        "by_type": by_type,
    }


def resource_stats() -> dict:
    from apps.resources.models import OtherResource, OtherResourceCategory

    return {
        "total": OtherResource.objects.count(),
        "published": OtherResource.objects.filter(is_published=True).count(),
        "draft": OtherResource.objects.filter(is_published=False).count(),
        "active_categories": OtherResourceCategory.objects.filter(is_active=True).count(),
    }


def recent_activity(limit: int = 8) -> list[dict]:
    """The newest notifications, rendered for the dashboard feed.

    Reads the same rows as the notification feed rather than re-deriving
    activity, so "what the bell says" and "what the dashboard says" cannot
    disagree.
    """
    rows = AdminNotification.objects.recent()[:limit]
    return [
        {
            "id": note.id,
            "type": note.type,
            "title": note.title,
            "message": note.message,
            "link": note.link,
            "is_read": note.is_read,
            "created_at": note.created_at,
        }
        for note in rows
    ]


def unread_notifications() -> int:
    return AdminNotification.objects.unread().count()


def build_dashboard() -> dict:
    """One payload for the whole dashboard — a single request, not eight."""
    students = student_stats()
    purchases = purchase_stats()
    payments = payment_stats()
    content = content_stats()
    resources = resource_stats()

    return {
        # Top-line cards
        "students": students["total"],
        "classes": ClassLevel.objects.count(),
        "active_purchases": purchases["active"],
        "pending_payments": payments["pending"],
        "pending_purchases": purchases["pending"],
        "rejected_purchases": purchases["rejected"],
        "approved_revenue": approved_revenue(),
        "published_content": content["published"],
        "draft_content": content["draft"],
        "other_resources": resources["total"],
        "unread_notifications": unread_notifications(),
        # Breakdowns
        "student_growth": {
            "today": students["today"],
            "week": students["week"],
            "month": students["month"],
        },
        "registration_trend": registration_trend(),
        "purchases_by_class": purchases_by_class(),
        "payment_status": payments,
        "purchase_status": purchases,
        "content_types": content["by_type"],
        "resource_stats": resources,
        "recent_activity": recent_activity(),
    }


__all__ = [
    "NotificationType",
    "build_dashboard",
    "approved_revenue",
    "content_stats",
    "payment_stats",
    "purchase_stats",
    "purchases_by_class",
    "recent_activity",
    "registration_trend",
    "resource_stats",
    "student_stats",
    "unread_notifications",
]