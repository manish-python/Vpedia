"""Infrastructure views: health check and guarded media delivery."""

from __future__ import annotations

import mimetypes
from pathlib import Path

from django.conf import settings
from django.core.exceptions import PermissionDenied
from django.http import FileResponse, Http404, HttpRequest, JsonResponse
from django.views.static import serve

SERVICE_NAME = "VPEDIA LEARNING API"


def health(_request: HttpRequest) -> JsonResponse:
    """Liveness probe.

    Deliberately does not touch the database so a liveness check cannot fail
    for an unrelated reason.
    """
    return JsonResponse({"status": "ok", "service": SERVICE_NAME})


def private_media(request: HttpRequest, path: str) -> FileResponse:
    """Serve an uploaded file to staff only.

    Payment screenshots contain transaction details, so `MEDIA_URL` resolves
    here rather than to Django's public static helper. An anonymous or
    non-staff caller receives 403 and never learns whether the file exists.

    `django.views.static.serve` is development-only tooling; in production
    this view is replaced by signed, short-lived URLs from private object
    storage.
    """
    user = request.user
    if not (user and user.is_authenticated and user.is_active and user.is_staff):
        raise PermissionDenied("Administrator access is required to view uploaded files.")

    root = Path(settings.MEDIA_ROOT).resolve()
    target = (root / path).resolve()

    # Reject traversal attempts such as `../../.env`.
    if not str(target).startswith(str(root)):
        raise Http404("File not found.")
    if not target.is_file():
        raise Http404("File not found.")

    content_type, _ = mimetypes.guess_type(target.name)
    response = serve(request, str(target.relative_to(root).as_posix()), document_root=str(root))
    if content_type:
        response.headers["Content-Type"] = content_type
    # Never let a browser cache a payment screenshot indefinitely.
    response.headers["Cache-Control"] = "private, no-store"
    return response
