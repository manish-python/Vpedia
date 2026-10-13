"""Backfill `Content.page_count` for PDFs uploaded before the count existed.

The column was in the model, the serializer and the API from the start, but
nothing ever wrote it, so every existing row is `null` and every student-facing
card read "PDF - 0 pages". New uploads are counted in `Content.save`; this
command covers the rows that predate that.

    python manage.py backfill_page_count            # report only, changes nothing
    python manage.py backfill_page_count --apply    # write what it can read

Safe to re-run: it only writes a row whose `page_count` is still `NULL`, so a
second run touches nothing. Rows it cannot read are left `NULL` on purpose -
`NULL` means "unknown", and the frontend renders that as plain `PDF` rather than
a wrong number.
"""
from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.content.models import Content
from apps.content.pagecount import pdf_page_count


class Command(BaseCommand):
    help = "Fill in Content.page_count for existing PDFs by reading the stored files."

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Actually write the counts. Without this the command only reports.",
        )
        parser.add_argument(
            "--batch",
            type=int,
            default=200,
            help="How many rows to read per database query (default 200).",
        )

    def handle(self, *args, **options):
        apply = options["apply"]
        batch_size = max(1, options["batch"])

        queryset = Content.objects.exclude(file="").order_by("id")
        unknown = queryset.filter(page_count__isnull=True)
        already = queryset.filter(page_count__isnull=False)

        self.stdout.write(f"rows with a file      : {queryset.count()}")
        self.stdout.write(f"already counted       : {already.count()}")
        self.stdout.write(f"awaiting a count      : {unknown.count()}")

        if not apply:
            self.stdout.write(self.style.WARNING("\nDry run. Pass --apply to write."))
            return

        filled = 0
        unreadable = 0
        seen = 0

        # `iterator` keeps memory flat over the whole catalogue, which is the
        # point of running this against a seeded database.
        for row in unknown.iterator(chunk_size=batch_size):
            seen += 1
            count = pdf_page_count(row.file)
            if count is None:
                unreadable += 1
                continue
            # Narrow UPDATE: no other column is touched, and no signal handler
            # re-opens the file.
            Content.objects.filter(pk=row.pk, page_count__isnull=True).update(
                page_count=count
            )
            filled += 1
            if filled % 100 == 0:
                self.stdout.write(f"  ... {filled} filled ({seen} read)")

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(f"filled {filled} row(s); {unreadable} could not be read")
        )
        if unreadable:
            self.stdout.write(
                self.style.WARNING(
                    "Unreadable rows stay NULL and will show as 'PDF', not '0 pages'."
                )
            )