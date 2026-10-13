"""Purchase creation, pricing and duplicate protection.

Covers required tests 3, 4 and 11.
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.academics.models import ClassLevel
from apps.core.exceptions import PurchaseConflict
from apps.purchases.models import ClassPurchase, PurchaseStatus
from apps.purchases.services import create_purchase_request


@pytest.mark.django_db
def test_purchase_can_be_created_with_server_side_price(student, class_10):
    purchase = create_purchase_request(user=student, class_level=class_10)

    assert purchase.pk is not None
    assert purchase.status == PurchaseStatus.PENDING
    # The amount came from ClassLevel.price, not from the caller.
    assert purchase.amount == class_10.price == Decimal("199.00")
    assert purchase.currency == class_10.currency
    assert purchase.activated_at is None


@pytest.mark.django_db
def test_each_class_uses_its_own_configured_price(student, class_7, class_10):
    cheap = create_purchase_request(user=student, class_level=class_7)
    mid = create_purchase_request(user=student, class_level=class_10)

    assert cheap.amount == Decimal("99.00")
    assert mid.amount == Decimal("199.00")


@pytest.mark.django_db
def test_price_change_is_reflected_in_new_purchases_only(student, class_10):
    original = create_purchase_request(user=student, class_level=class_10)

    class_10.price = Decimal("249.00")
    class_10.save(update_fields=["price", "updated_at"])

    # The historical snapshot is unchanged...
    original.refresh_from_db()
    assert original.amount == Decimal("199.00")

    # ...and a later purchase for the same class would use the new price.
    # The original is still PENDING, so cancel it first.
    original.status = PurchaseStatus.CANCELLED
    original.save(update_fields=["status", "updated_at"])

    second = create_purchase_request(user=student, class_level=class_10)
    assert second.amount == Decimal("249.00")


@pytest.mark.django_db
def test_highest_class_uses_its_configured_price(student, class_12, science_stream):
    purchase = create_purchase_request(
        user=student, class_level=class_12, stream=science_stream
    )
    assert purchase.amount == Decimal("299.00")


@pytest.mark.django_db
def test_duplicate_active_purchase_is_blocked(student, class_10, admin_user):
    first = create_purchase_request(user=student, class_level=class_10)
    first.grant_access(reviewer=admin_user)
    first.save()

    with pytest.raises(PurchaseConflict):
        create_purchase_request(user=student, class_level=class_10)

    assert ClassPurchase.objects.filter(
        user=student, class_level=class_10, status=PurchaseStatus.ACTIVE
    ).count() == 1


@pytest.mark.django_db
def test_duplicate_pending_purchase_is_blocked(student, class_10):
    create_purchase_request(user=student, class_level=class_10)

    with pytest.raises(PurchaseConflict):
        create_purchase_request(user=student, class_level=class_10)


@pytest.mark.django_db
def test_database_constraint_blocks_duplicate_active_purchase(student, class_10, admin_user):
    """Bypass the service layer to prove the database also refuses it."""
    from django.db import IntegrityError, transaction

    purchase = create_purchase_request(user=student, class_level=class_10)
    purchase.grant_access(reviewer=admin_user)
    purchase.save()

    with pytest.raises(IntegrityError):
        with transaction.atomic():
            ClassPurchase.objects.create(
                user=student,
                class_level=class_10,
                amount=Decimal("199.00"),
                status=PurchaseStatus.ACTIVE,
            )


@pytest.mark.django_db
def test_student_may_request_again_after_rejection(student, class_10):
    first = create_purchase_request(user=student, class_level=class_10)
    first.status = PurchaseStatus.REJECTED
    first.save(update_fields=["status", "updated_at"])

    second = create_purchase_request(user=student, class_level=class_10)

    assert second.status == PurchaseStatus.PENDING
    assert second.pk != first.pk


@pytest.mark.django_db
def test_inactive_class_cannot_be_purchased(student, class_10):
    ClassLevel.objects.filter(pk=class_10.pk).update(is_active=False)
    class_10.refresh_from_db()

    with pytest.raises(PurchaseConflict):
        create_purchase_request(user=student, class_level=class_10)


@pytest.mark.django_db
def test_streamed_class_requires_a_stream(student, class_11, science_stream):
    with pytest.raises(PurchaseConflict):
        create_purchase_request(user=student, class_level=class_11)

    purchase = create_purchase_request(
        user=student, class_level=class_11, stream=science_stream
    )
    assert purchase.stream_id == science_stream.pk


@pytest.mark.django_db
def test_non_streamed_class_rejects_a_stream(student, class_10, science_stream):
    with pytest.raises(PurchaseConflict):
        create_purchase_request(user=student, class_level=class_10, stream=science_stream)
