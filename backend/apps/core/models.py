"""Shared abstract models and validators.

Uploaded files are validated by actually opening them with Pillow rather
than trusting the client-supplied content type. Storage paths are
deterministic and human-legible so that a later move to private object
storage (for example Cloudflare R2 or S3) is a settings change rather than
a data migration.
"""

from __future__ import annotations

import uuid
from pathlib import Path

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from PIL import Image, UnidentifiedImageError

# Image formats accepted for payment screenshots.
ALLOWED_IMAGE_FORMATS: dict[str, str] = {
    "JPEG": ".jpg",
    "PNG": ".png",
    "WEBP": ".webp",
}

# Pillow maps format names to MIME types; kept explicit for error messages.
_ALLOWED_IMAGE_MIME = {
    "JPEG": "image/jpeg",
    "PNG": "image/png",
    "WEBP": "image/webp",
}


def get_max_upload_bytes() -> int:
    """Maximum permitted upload size, in bytes, from settings."""
    return int(getattr(settings, "MAX_UPLOAD_SIZE_MB", 5)) * 1024 * 1024


def validate_image_upload(file) -> None:
    """Validate an uploaded image by decoding it.

    The client-supplied ``Content-Type`` is never trusted. The file is
    opened with Pillow, which reads the real container and format, and then
    fully decoded so truncated or corrupt files are rejected too.
    """
    if file is None:
        raise ValidationError("A file is required.")

    size = getattr(file, "size", None)
    if size is not None:
        limit = get_max_upload_bytes()
        if size > limit:
            raise ValidationError(
                f"File is too large. Maximum size is {getattr(settings, 'MAX_UPLOAD_SIZE_MB', 5)} MB."
            )

    try:
        file.seek(0)
        with Image.open(file) as image:
            image_format = (image.format or "").upper()
            # Force a full decode so corrupt/truncated payloads fail here.
            image.load()
    except UnidentifiedImageError as exc:
        raise ValidationError(
            "Unsupported file type. Upload a JPG, PNG or WebP image."
        ) from exc
    except (OSError, ValueError) as exc:
        raise ValidationError("The uploaded file could not be read as an image.") from exc
    finally:
        try:
            file.seek(0)
        except (AttributeError, ValueError):  # pragma: no cover - defensive
            pass

    if image_format not in ALLOWED_IMAGE_FORMATS:
        supported = ", ".join(sorted(_ALLOWED_IMAGE_MIME.values()))
        raise ValidationError(f"Unsupported file type. Allowed types are {supported}.")


#: Every PDF begins with this marker, per the PDF specification. Some writers
#: emit leading whitespace, so a short prefix is tolerated.
PDF_MAGIC = b"%PDF-"


def validate_document_upload(file) -> None:
    """Validate a study-material document (PDF).

    Three independent checks, because a filename and a client-supplied
    ``Content-Type`` are both attacker-controlled and either can be forged:

    1. size, against the configured limit;
    2. the ``.pdf`` extension;
    3. the ``%PDF-`` magic bytes at the start of the file.

    Check 3 is what stops ``payload.zip`` or ``payload.exe`` being uploaded
    under a ``.pdf`` name. Kept separate from image validation so the two
    policies can diverge without touching call sites.
    """
    if file is None:
        raise ValidationError("A file is required.")

    size = getattr(file, "size", None)
    if size is not None and size > get_max_upload_bytes():
        raise ValidationError(
            f"File is too large. Maximum size is {getattr(settings, 'MAX_UPLOAD_SIZE_MB', 5)} MB."
        )

    name = (getattr(file, "name", "") or "").lower()
    if not name.endswith(".pdf"):
        raise ValidationError("Only PDF documents are accepted.")

    # Read the header rather than trusting the name. Restores the stream
    # afterwards so Django can still write the file from the start.
    try:
        file.seek(0)
        header = file.read(len(PDF_MAGIC) + 8)
    except (AttributeError, OSError, ValueError):  # pragma: no cover - defensive
        header = b""

    try:
        file.seek(0)
    except (AttributeError, ValueError):  # pragma: no cover - defensive
        pass

    if PDF_MAGIC not in header:
        raise ValidationError(
            "This file is not a valid PDF. Upload a genuine PDF document."
        )


def unique_upload_path(instance, filename: str, *, folder: str) -> str:
    """Build a deterministic, collision-free storage path.

    Layout::

        <folder>/<yyyy>/<mm>/<discriminator>/<uuid4>.<ext>

    The original filename is never reused, which removes both path
    traversal and name-collision problems.
    """
    extension = Path(filename).suffix.lower()[:10] or ".bin"
    discriminator = getattr(instance, "upload_discriminator", None) or "misc"
    now = instance.created_at or __import__("django.utils.timezone", fromlist=["now"]).now()
    token = uuid.uuid4().hex
    return f"{folder}/{now:%Y}/{now:%m}/{discriminator}/{token}{extension}"


class TimeStampedModel(models.Model):
    """Adds creation and modification timestamps.

    Abstract: this contributes fields only and never becomes a table of its
    own. Without `abstract = True` every subclass would be joined to a
    concrete parent table by multi-table inheritance.
    """

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


def make_slug_source(*parts: str) -> str:
    """Join the non-empty parts used to build a slug."""
    return " ".join(part for part in parts if part)


__all__ = [
    "ALLOWED_IMAGE_FORMATS",
    "PDF_MAGIC",
    "TimeStampedModel",
    "get_max_upload_bytes",
    "make_slug_source",
    "unique_upload_path",
    "validate_document_upload",
    "validate_image_upload",
    "MaxValueValidator",
    "MinValueValidator",
]
