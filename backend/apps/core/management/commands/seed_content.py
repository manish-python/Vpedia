"""Generate local development study material.

Stage 4 connects the frontend to real `Content` rows. The academic catalogue
(seeded by `seed_data`) creates classes, subjects and chapters but no files, so
every content page would otherwise be permanently empty and the gated document
route — the one endpoint that actually returns study-material bytes — would
never run.

This command fills that gap with real PDFs on disk, attached to real rows. It
is a *development* tool: nothing in the application imports it, and running it
is not part of deploying the product.

    python manage.py seed_content                  # every chapter
    python manage.py seed_content --class 10       # one class
    python manage.py seed_content --limit 40       # cap the volume

Idempotent: existing content rows are left alone, so it is safe to re-run after
adding classes.
"""

from __future__ import annotations

import io
import textwrap

from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.academics.models import Chapter
from apps.content.models import Content, ContentType


def build_pdf(title: str, lines: list[str]) -> bytes:
    """A small, genuinely valid single-page PDF.

    Written by hand rather than pulled from a PDF library so the command has no
    dependency the project does not already have. PDF.js renders this, so the
    viewer path is exercised for real rather than against a placeholder.
    """

    def escape(text: str) -> str:
        # The document is Latin-1; drop anything outside it rather than
        # emitting bytes a PDF reader would choke on.
        return "".join(ch if ord(ch) < 256 else "?" for ch in text).replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

    body = [f"BT /F1 16 Tf 60 760 Td ({escape(title)}) Tj ET"]
    y = 720
    for line in lines:
        body.append(f"BT /F1 11 Tf 60 {y} Td ({escape(line)}) Tj ET")
        y -= 18
        if y < 60:
            break

    content = "\n".join(body).encode("latin-1", "replace")

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
        b"/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        b"<< /Length " + str(len(content)).encode() + b" >>\nstream\n" + content + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]

    out = io.BytesIO()
    out.write(b"%PDF-1.4\n")
    offsets: list[int] = []
    for index, body_bytes in enumerate(objects, start=1):
        offsets.append(out.tell())
        out.write(f"{index} 0 obj\n".encode())
        out.write(body_bytes)
        out.write(b"\nendobj\n")

    xref_at = out.tell()
    out.write(f"xref\n0 {len(objects) + 1}\n".encode())
    out.write(b"0000000000 65535 f \n")
    for offset in offsets:
        out.write(f"{offset:010d} 00000 n \n".encode())
    out.write(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_at}\n%%EOF\n".encode()
    )

    return out.getvalue()


#: What to create per chapter. Two types is enough to exercise the tab UI and
#: the type filter without filling the disk.
PER_CHAPTER = (
    (ContentType.NOTES, "Notes"),
    (ContentType.PYQ, "Previous Year Questions"),
)


class Command(BaseCommand):
    help = "Attach real generated PDFs to chapters, so content pages have data."

    def add_arguments(self, parser) -> None:
        parser.add_argument("--class", dest="class_number", type=int, default=None)
        parser.add_argument("--limit", type=int, default=None, help="Max chapters to touch.")
        parser.add_argument(
            "--unpublished-every",
            type=int,
            default=10,
            help="Leave every Nth row unpublished, so draft filtering is visible.",
        )

    def handle(self, *args, **options) -> None:
        chapters = Chapter.objects.select_related("subject", "subject__class_level").filter(
            subject__class_level__is_active=True,
            subject__is_active=True,
            is_active=True,
        )

        number = options["class_number"]
        if number is not None:
            chapters = chapters.filter(subject__class_level__name=f"Class {number}")
            if not chapters.exists():
                raise CommandError(f"No active chapters for Class {number}. Run seed_data first.")

        chapters = chapters.order_by("subject__class_level__display_order", "subject__display_order", "number")

        limit = options["limit"]
        if limit:
            chapters = chapters[:limit]

        created = 0
        skipped = 0
        every = max(1, options["unpublished_every"])

        with transaction.atomic():
            for index, chapter in enumerate(chapters):
                for content_type, label in PER_CHAPTER:
                    slug = f"{chapter.slug}-{content_type.lower().replace('_', '-')}"
                    if Content.objects.filter(slug=slug).exists():
                        skipped += 1
                        continue

                    subject = chapter.subject
                    vclass = subject.class_level
                    title = f"{chapter.name} — {label}"

                    pdf = build_pdf(
                        title=f"{vclass.name} | {subject.name} | {label}",
                        lines=textwrap.wrap(
                            f"Chapter {chapter.number}: {chapter.name}. "
                            f"{subject.name}, {vclass.name}. "
                            "Generated sample material for local development. "
                            "Replace this file from Django Admin with real study material.",
                            width=78,
                        ),
                    )

                    Content.objects.create(
                        chapter=chapter,
                        title=title,
                        slug=slug,
                        description=f"{label} for {subject.name}, Chapter {chapter.number}.",
                        content_type=content_type,
                        file=ContentFile(pdf, name=f"{slug}.pdf"),
                        page_count=1,
                        display_order=0 if content_type == ContentType.NOTES else 1,
                        # Leave a sprinkle unpublished so the draft filter is
                        # visible in development rather than theoretical.
                        is_published=index % every != every - 1,
                    )
                    created += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Created {created} content row(s); {skipped} already existed."
            )
        )
        if number is not None:
            self.stdout.write(f"Scoped to Class {number}.")