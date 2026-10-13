"""API authentication classes.

Session-cookie only. There is no token authenticator and no password
authenticator in the chain: the cookie exists only because allauth completed a
verified Google OIDC exchange.
"""

from __future__ import annotations

from rest_framework.authentication import SessionAuthentication


class SessionAuthenticationWithChallenge(SessionAuthentication):
    """DRF's `SessionAuthentication`, answering 401 instead of 403.

    DRF's version declares no `WWW-Authenticate` header, so an unauthenticated
    request is reported as 403 Forbidden. That conflates two different things:
    "you are not signed in" (401) versus "you are signed in but not allowed"
    (403). This subclass separates them, which is what lets the SPA tell a
    signed-out student apart from a permission problem.

    CSRF behaviour is inherited unchanged: a missing or invalid CSRF token on
    an unsafe method still raises `PermissionDenied` and returns 403, because
    that really is a forbidden request rather than a missing identity.
    """

    def authenticate_header(self, request) -> str:
        return 'Session realm="vpedia"'
