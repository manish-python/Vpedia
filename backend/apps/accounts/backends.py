"""Authentication backends.

VPEDIA LEARNING has exactly one way for a *student* to be authenticated:
Google OAuth. This module makes that structurally true on the password side as
well, so the guarantee does not depend on every future view remembering a rule.

`ModelBackend` is retained because Django Admin needs it — `/admin/` sign-in for
staff is a Stage 2 feature that must keep working. It is narrowed so that it
can only ever authenticate a staff account.

The narrowed backend plus an unusable password on every student account means
there is no sequence of requests that can log a student in without Google.
"""

from __future__ import annotations

from typing import Any

from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend


class GoogleOnlyModelBackend(ModelBackend):
    """Password authentication restricted to staff accounts.

    Students authenticate through `allauth`'s Google provider, which verifies
    the OIDC response and creates the session. This backend exists solely so
    that an administrator can sign in to Django Admin.

    A student account reaching this backend is refused even if a password was
    somehow set on it, which closes the "promote a student by giving them a
    password" path.
    """

    def authenticate(
        self,
        request: Any,
        username: str | None = None,
        password: str | None = None,
        **kwargs: Any,
    ):
        user_model = get_user_model()
        if username is None:
            username = kwargs.get(user_model.USERNAME_FIELD)
        if username is None or password is None:
            return None

        try:
            user = user_model._default_manager.get_by_natural_key(username)
        except user_model.DoesNotExist:
            # Run the default hasher once to keep the timing of an unknown user
            # and a wrong password indistinguishable.
            user_model().set_password(password)
            return None

        if not user.check_password(password):
            return None

        # The only accounts allowed through the password path.
        if not (user.is_active and user.is_staff):
            return None

        return user
