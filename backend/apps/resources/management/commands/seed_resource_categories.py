"""Seed the default Other Resource categories.

Idempotent by construction: every row is looked up by its slug with
`get_or_create`, so running this repeatedly never duplicates a category.

Administrator changes are preserved. `get_or_create` only ever supplies
`defaults` for a row that does not exist; an existing category keeps whatever
name, description, ordering or active flag an administrator has given it.
Rename a seeded category in the admin panel and re-running this command will
not revert it.

    python manage.py seed_resource_categories
    python manage.py seed_resource_categories --add "My New Category"
"""

from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils.text import slugify

from apps.resources.models import OtherResourceCategory

#: (slug, name, description, display_order)
DEFAULTS: list[tuple[str, str, str, int]] = [
    (
        "general-study-material",
        "General Study Material",
        "Revision material that is useful across the whole syllabus.",
        10,
    ),
    (
        "coding-programming",
        "Coding & Programming",
        "Programming fundamentals, languages and computer-science basics.",
        20,
    ),
    (
        "career-guidance",
        "Career Guidance",
        "Streams, courses and career paths to think about after Class 12.",
        30,
    ),
    (
        "competitive-exams",
        "Competitive Exams",
        "Preparation material for national and state-level competitive exams.",
        40,
    ),
    (
        "scholarships",
        "Scholarships",
        "Scholarship schemes, eligibility and application guidance.",
        50,
    ),
    (
        "study-resources",
        "Study Resources",
        "Planning tools, study techniques and timetables.",
        60,
    ),
    (
        "reference-material",
        "Reference Material",
        "Reference tables, formula sheets and quick-look documents.",
        70,
    ),
]


class Command(BaseCommand):
    help = "Create the default Other Resource categories (idempotent)."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--add",
            action="append",
            default=[],
            metavar="NAME",
            help="Additional category to create if missing. Repeatable.",
        )

    @transaction.atomic
    def handle(self, *args, **options) -> None:
        created, existing = [], []

        for slug, name, description, order in DEFAULTS:
            _, was_created = OtherResourceCategory.objects.get_or_create(
                slug=slug,
                defaults={
                    "name": name,
                    "description": description,
                    "display_order": order,
                    "is_active": True,
                },
            )
            (created if was_created else existing).append(name)

        for raw in options["add"]:
            name = (raw or "").strip()
            if not name:
                continue
            _, was_created = OtherResourceCategory.objects.get_or_create(
                slug=slugify(name),
                defaults={
                    "name": name,
                    "description": "",
                    "display_order": 100,
                    "is_active": True,
                },
            )
            (created if was_created else existing).append(name)

        if created:
            self.stdout.write(self.style.SUCCESS(f"Created: {', '.join(created)}"))
        if existing:
            self.stdout.write(f"Already present (left untouched): {', '.join(existing)}")

        self.stdout.write(
            f"Total categories: {OtherResourceCategory.objects.count()}"
        )