"""Password non-reachability for student accounts.

The rule is absolute: a student is authenticated by Google and by nothing else.
These tests pin the structural half of that — no student account can be reached
through a password — independently of the fact that no password endpoint is
routed.
"""

from __future__ import annotations

import pytest
from django.contrib.auth import authenticate, get_user_model

from apps.accounts.services import get_or_create_student

User = get_user_model()


@pytest.mark.django_db
def test_student_created_through_the_manager_has_an_unusable_password(student):
    assert student.has_usable_password() is False


@pytest.mark.django_db
def test_student_created_by_a_bare_queryset_create_also_cannot_use_a_password():
    """`User.objects.create()` bypasses the manager. The model must still hold."""
    user = User.objects.create(email="bypass@example.com")

    user.refresh_from_db()
    assert user.has_usable_password() is False
    assert user.password.startswith("!")


@pytest.mark.django_db
def test_blank_password_is_normalised_on_every_write_path():
    user = User(email="blank@example.com", password="")
    user.save()

    user.refresh_from_db()
    assert user.has_usable_password() is False


@pytest.mark.django_db
def test_authenticate_refuses_a_student_even_with_the_right_password():
    """The narrowed backend is the real guarantee, not the password column."""
    student = User.objects.create(email="noreach@example.com")
    student.set_password("a-perfectly-valid-password-123")
    student.save()

    assert authenticate(username=student.email, password="a-perfectly-valid-password-123") is None


@pytest.mark.django_db
def test_authenticate_refuses_an_empty_password():
    student = User.objects.create(email="empty@example.com")

    assert authenticate(username=student.email, password="") is None
    assert authenticate(username=student.email, password=None) is None
    assert authenticate(username=student.email) is None


@pytest.mark.django_db
def test_get_or_create_student_produces_an_unusable_password():
    user = get_or_create_student(email="helper@example.com", first_name="Test")

    assert user.has_usable_password() is False


@pytest.mark.django_db
def test_only_staff_accounts_can_hold_a_usable_password(student, admin_user):
    """A single usable password in the system belongs to an administrator."""
    users_with_password = User.objects.filter(is_staff=False).exclude(password="")
    assert not [
        u for u in users_with_password if u.has_usable_password()
    ], [u.email for u in users_with_password]

    assert admin_user.has_usable_password() is True


@pytest.mark.django_db
def test_staff_still_authenticates_with_its_password(admin_user):
    assert (
        authenticate(username=admin_user.email, password="admin-pass-123") is not None
    )
    assert authenticate(username=admin_user.email, password="wrong") is None


@pytest.mark.django_db
def test_password_column_is_not_exposed_by_the_profile_api(google_student):
    body = google_student.get("/api/v1/profile/me/").json()
    assert "password" not in body
    assert "password" not in body["user"] if "user" in body else True
