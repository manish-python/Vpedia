"""Reading a real page count out of an uploaded PDF.

Why this exists
---------------
`Content.page_count` has existed since the model was written and is already in
the serializer, the API DTO and the frontend mapper — but nothing ever wrote to
it. Every row therefore held `null`, the mapper coerced that to `0`
(`dto.page_count ?? 0`), and `pageLabel` printed `PDF - 0 pages` on every card
in the product. The field was plumbed end to end and left empty.

So this reads the count from the bytes that were actually stored, rather than
trusting a filename, a client-supplied number, or a guess.

Safety
------
Every failure mode here is non-fatal and leaves `page_count` as `null`, which
the frontend renders as plain `PDF` rather than a wrong number:

  * no file, or an empty file
  * not a PDF at all
  * corrupt or truncated (a PDF whose xref table is broken still opens in some
    viewers, and `pypdf` is strict)
  * encrypted - reading the page count does not need the password, but a broken
    or password-protected *file* object can still raise
  * a file that vanishes from storage between upload and this call

`validate_document_upload` remains the gate that decides whether a file is
acceptable at all. Nothing here weakens it, and a file rejected there never
reaches this code.
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def pdf_page_count(file) -> int | None:
    """Number of pages in a stored PDF, or `None` when it cannot be determined.

    Never raises and never guesses. A `None` is a real answer meaning "unknown",
    and callers must persist it as `None` rather than substituting `0`, because
    `0` is a claim that the document has no pages, which is false.
    """
    if file is None:
        return None

    try:
        name = getattr(file, "name", "") or ""
        if name and not str(name).lower().endswith(".pdf"):
            return None

        # `size` is the cheapest possible pre-check; a zero-byte field is not a
        # document.
        if getattr(file, "size", None) == 0:
            return None
    except Exception:  # pragma: no cover - defensive
        return None

    try:
        # Imported lazily so that importing this module - which the model does at
        # class-definition time - cannot fail the app if the dependency is absent.
        from pypdf import PdfReader
        from pypdf.errors import PdfReadError
    except Exception:  # pragma: no cover - dependency missing
        logger.warning("pypdf is unavailable; page counts will stay unknown.")
        return None

    try:
        file.seek(0)
    except (AttributeError, OSError, ValueError):
        # Not seekable, e.g. an object still backed by a non-rewindable stream.
        return None

    try:
        reader = PdfReader(file)
        count = len(reader.pages)
    except (PdfReadError, ValueError, TypeError, OSError, IndexError, KeyError, RecursionError):
        logger.info("Could not read a page count from %s", getattr(file, "name", "?"))
        return None
    except Exception as exc:  # pragma: no cover - pypdf raises more than it documents
        logger.info("Unexpected error reading %s: %s", getattr(file, "name", "?"), exc)
        return None
    finally:
        try:
            file.seek(0)
        except (AttributeError, OSError, ValueError):
            pass

    # A PDF claiming zero or negative pages is malformed metadata, not a document
    # with no pages. Treat it as unknown rather than persisting a lie.
    return count if count and count > 0 else None