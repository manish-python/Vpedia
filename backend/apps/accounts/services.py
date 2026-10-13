"""User and profile helpers.

Shared by the seed command, the Google OAuth adapter and the profile API.

The single rule enforced here: a student's identity comes from Google or from
the authenticated request — never from a value supplied in a request body.
"""

from __future__ import annotations

from typing import Any

from .models import StudentProfile, User


def get_or_create_student(email: str, **extra: Any) -> User:
    """Return the student for `email`, creating it when absent.

    `password` is intentionally never accepted, so no code path can create a
    student account that is usable for password sign-in.
    """
    email = email.strip().lower()
    user = User.objects.filter(email__iexact=email).first()
    if user is not None:
        return user

    user = User.objects.create_user(
        email=email,
        first_name=extra.pop("first_name", ""),
        last_name=extra.pop("last_name", ""),
        **extra,
    )
    return user


def get_or_create_staff(email: str, password: str, **extra: Any) -> User:
    """Return a staff account, creating it with a usable password if absent."""
    email = email.strip().lower()
    user = User.objects.filter(email__iexact=email).first()
    if user is not None:
        return user
    return User.objects.create_superuser(email=email, password=password, **extra)


# ---------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------


def ensure_profile(user: User) -> StudentProfile:
    """Return the student's profile, creating it if it does not exist.

    Called after every successful Google sign-in so that a student account
    always has a profile row. Safe to call repeatedly.

    Class selection is deliberately left unset: signing in must not imply any
    class, and certainly must not imply access to one.
    """
    profile, _ = StudentProfile.objects.get_or_create(user=user)
    return profile
