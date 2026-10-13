"""Template context processors.

Exposes a small number of values to templates. Nothing secret is added:
`vpedia_frontend_url` is a public origin that is already sent to the browser in
the CORS headers.
"""

from __future__ import annotations

from typing import Any

from django.conf import settings
from django.http import HttpRequest


def vpedia(request: HttpRequest) -> dict[str, Any]:
    """Make the SPA origin and brand name available to error templates."""
    return {
        "vpedia_frontend_url": getattr(settings, "FRONTEND_URL", "").rstrip("/"),
        "vpedia_site_name": "VPEDIA LEARNING",
    }
