"""Class access control — the core business rule.

Covers required tests 7, 8, 9 and 10.
"""

from __future__ import annotations

import pytest

from apps.payments.services import submit_payment_proof
from apps.purchases.models import PurchaseStatus
from apps.purchases.services import create_purchase_request, has_class_access


# --- 7. Pending does not grant access -------------------------------------


@pytest.mark.django_db
def test_pending_purchase_does_not_grant_access(student, class_10):
    purchase = create_purchase_request(user=student, class_level=class_10)

    assert purchase.status == PurchaseStatus.PENDING
    assert not has_class_access(student, class_10)


# --- 8. Rejected does not grant access ------------------------------------


@pytest.mark.django_db
def test_rejected_purchase_does_not_grant_access(student, class_10):
    purchase = create_purchase_request(user=student, class_level=class_10)
    purchase.status = PurchaseStatus.REJECTED
    purchase.save(update_fields=["status", "updated_at"])

    assert not has_class_access(student, class_10)


@pytest.mark.django_db
def test_cancelled_purchase_does_not_grant_access(student, class_10):
    purchase = create_purchase_request(user=student, class_level=class_10)
    purchase.status = PurchaseStatus.CANCELLED
    purchase.save(update_fields=["status", "updated_at"])

    assert not has_class_access(student, class_10)


# --- 9. Approved grants access --------------------------------------------


@pytest.mark.django_db
def test_active_purchase_grants_access(active_purchase, student, class_10):
    assert active_purchase.status == PurchaseStatus.ACTIVE
    assert has_class_access(student, class_10)


# --- 10. One class never unlocks another ----------------------------------


@pytest.mark.django_db
def test_class_10_purchase_does_not_grant_class_11_access(
    active_purchase, student, class_11
):
    assert has_class_access(student, active_purchase.class_level) is True
    assert has_class_access(student, class_11) is False


@pytest.mark.django_db
def test_active_purchase_does_not_grant_any_other_class(
    active_purchase, student, class_7, class_12
):
    for other in (class_7, class_12):
        assert not has_class_access(student, other)


# --- Additional access-control guarantees ---------------------------------


@pytest.mark.django_db
def test_no_purchase_grants_no_access(student, class_10):
    assert not has_class_access(student, class_10)


@pytest.mark.django_db
def test_anonymous_user_never_has_access(class_10):
    from django.contrib.auth.models import AnonymousUser

    assert not has_class_access(AnonymousUser(), class_10)
    assert not has_class_access(None, class_10)


@pytest.mark.django_db
def test_inactive_user_loses_access(active_purchase, student, class_10):
    assert has_class_access(student, class_10) is True

    student.is_active = False
    student.save(update_fields=["is_active", "updated_at"])

    # An inactive account is treated as unauthenticated for entitlement.
    assert not has_class_access(student, class_10)


@pytest.mark.django_db
def test_one_students_access_is_not_visible_to_another(
    active_purchase, other_student, class_10
):
    assert not has_class_access(other_student, class_10)


@pytest.mark.django_db
def test_access_accepts_a_class_primary_key(active_purchase, student, class_10):
    assert has_class_access(student, class_10.pk) is True
    assert has_class_access(student, 999999) is False
    assert has_class_access(student, None) is False


@pytest.mark.django_db
def test_user_model_helper_matches_the_service(active_purchase, student, class_10):
    assert student.has_class_access(class_10) is True
