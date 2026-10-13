"""Seed development data.

Creates the class catalogue, streams, sample subjects and chapters, the UPI
configuration, and a small amount of placeholder material.

Idempotent: running it repeatedly updates existing rows rather than
duplicating them, so it is safe to call on an existing database.

Prices written here are *development defaults*. They are ordinary rows in
`ClassLevel.price` and can be changed at any time in Django Admin.
"""

from __future__ import annotations

from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils.text import slugify

from apps.academics.models import Chapter, ClassLevel, Stream, Subject
from apps.content.models import Content, ContentType
from apps.payments.models import UPISettings

# Development defaults. Administrators own the real values.
CLASS_DEFAULTS: list[dict] = [
    {
        "name": "Class 7",
        "price": Decimal("99.00"),
        "display_order": 7,
        "has_streams": False,
        "description": "Foundation years for Classes 7 and 8.",
    },
    {
        "name": "Class 8",
        "price": Decimal("99.00"),
        "display_order": 8,
        "has_streams": False,
        "description": "Building concepts with confidence.",
    },
    {
        "name": "Class 9",
        "price": Decimal("149.00"),
        "display_order": 9,
        "has_streams": False,
        "description": "Preparation for the secondary board exams.",
    },
    {
        "name": "Class 10",
        "price": Decimal("199.00"),
        "display_order": 10,
        "has_streams": False,
        "description": "Complete board preparation for Class 10.",
    },
    {
        "name": "Class 11",
        "price": Decimal("249.00"),
        "display_order": 11,
        "has_streams": True,
        "description": "Senior secondary, organised by stream.",
    },
    {
        "name": "Class 12",
        "price": Decimal("299.00"),
        "display_order": 12,
        "has_streams": True,
        "description": "Final year with stream-specific material.",
    },
]

STREAM_DEFAULTS = [
    ("Science", "Physics, Chemistry, Mathematics, Biology and English."),
    ("Commerce", "Accountancy, Business Studies, Economics, Mathematics and English."),
    ("Humanities", "History, Political Science, Geography, Economics and English."),
]

# Subjects per class. Classes 11 and 12 key their subjects by stream.
CLASS_SUBJECTS: dict[str, list[str]] = {
    "Class 7": ["Mathematics", "Science", "English", "Social Science", "Hindi", "Computer"],
    "Class 8": ["Mathematics", "Science", "English", "Social Science", "Hindi", "Computer"],
    "Class 9": [
        "Mathematics",
        "Science",
        "English",
        "Social Science",
        "Hindi",
        "Computer",
        "Information Technology",
    ],
    "Class 10": [
        "Mathematics",
        "Science",
        "English",
        "Social Science",
        "Hindi",
        "Computer",
    ],
}

STREAM_SUBJECTS: dict[str, list[str]] = {
    "Science": ["Physics", "Chemistry", "Mathematics", "Biology", "English"],
    "Commerce": ["Accountancy", "Business Studies", "Economics", "Mathematics", "English"],
    "Humanities": ["History", "Political Science", "Geography", "Economics", "English"],
}

# Placeholder chapter names. Deliberately generic: no copyrighted material.
CHAPTER_SEEDS: dict[str, list[str]] = {
    "Mathematics": [
        "Real Numbers",
        "Polynomials",
        "Pair of Linear Equations",
        "Quadratic Equations",
        "Arithmetic Progressions",
        "Triangles",
        "Coordinate Geometry",
        "Introduction to Trigonometry",
        "Some Applications of Trigonometry",
        "Circles",
        "Constructions",
        "Areas Related to Circles",
    ],
    "Science": [
        "Chemical Reactions and Equations",
        "Acids, Bases and Salts",
        "Metals and Non-metals",
        "Carbon and its Compounds",
        "Life Processes",
        "Control and Coordination",
        "Light - Reflection and Refraction",
        "Electricity",
    ],
    "English": [
        "Reading Comprehension",
        "Grammar and Vocabulary",
        "Writing Skills",
        "Literature",
    ],
}

DEFAULT_CHAPTER_COUNT = 6


class Command(BaseCommand):
    help = "Seed development classes, streams, subjects, chapters and UPI settings."

    def add_arguments(self, parser):
        parser.add_argument(
            "--with-content",
            action="store_true",
            help="Also create placeholder Content rows (no real PDFs are shipped).",
        )
        parser.add_argument(
            "--publish-content",
            action="store_true",
            help="Publish the placeholder content. Off by default so nothing is reachable by accident.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        classes = self._seed_classes()
        streams = self._seed_streams(classes)
        subjects = self._seed_subjects(classes, streams)
        chapters = self._seed_chapters(subjects)
        self._seed_upi()

        content_count = 0
        if options["with_content"]:
            content_count = self._seed_content(chapters, publish=options["publish_content"])

        self._summary(classes, streams, subjects, chapters, content_count)

    # -- seeding steps ---------------------------------------------------

    def _seed_classes(self) -> dict[str, ClassLevel]:
        result: dict[str, ClassLevel] = {}
        for defaults in CLASS_DEFAULTS:
            obj, created = ClassLevel.objects.update_or_create(
                name=defaults["name"],
                defaults={
                    "slug": slugify(defaults["name"]),
                    "description": defaults["description"],
                    "price": defaults["price"],
                    "display_order": defaults["display_order"],
                    "has_streams": defaults["has_streams"],
                    "is_active": True,
                },
            )
            result[obj.name] = obj
            verb = "created" if created else "updated"
            self.stdout.write(f"  class {obj.name} -> {obj.price} ({verb})")
        return result

    def _seed_streams(self, classes: dict[str, ClassLevel]) -> dict[str, Stream]:
        streamed = [c for c in classes.values() if c.has_streams]
        result: dict[str, Stream] = {}
        for order, (name, description) in enumerate(STREAM_DEFAULTS, start=1):
            obj, _ = Stream.objects.update_or_create(
                name=name,
                defaults={
                    "slug": slugify(name),
                    "description": description,
                    "display_order": order,
                    "is_active": True,
                },
            )
            if streamed:
                obj.class_levels.set(streamed)
            result[name] = obj
            self.stdout.write(f"  stream {obj.name}")
        return result

    def _seed_subjects(
        self, classes: dict[str, ClassLevel], streams: dict[str, Stream]
    ) -> list[Subject]:
        created: list[Subject] = []

        for class_name, names in CLASS_SUBJECTS.items():
            class_level = classes[class_name]
            for order, name in enumerate(names, start=1):
                obj, _ = Subject.objects.update_or_create(
                    class_level=class_level,
                    stream=None,
                    slug=slugify(f"{class_level.slug}-{name}"),
                    defaults={
                        "name": name,
                        "description": "",
                        "display_order": order,
                        "is_active": True,
                    },
                )
                created.append(obj)

        # Streamed classes get one subject set per stream.
        for class_name in ("Class 11", "Class 12"):
            class_level = classes[class_name]
            for stream_name, names in STREAM_SUBJECTS.items():
                stream = streams[stream_name]
                for order, name in enumerate(names, start=1):
                    obj, _ = Subject.objects.update_or_create(
                        class_level=class_level,
                        stream=stream,
                        slug=slugify(f"{class_level.slug}-{stream.slug}-{name}"),
                        defaults={
                            "name": name,
                            "description": "",
                            "display_order": order,
                            "is_active": True,
                        },
                    )
                    created.append(obj)

        self.stdout.write(f"  subjects -> {len(created)}")
        return created

    def _seed_chapters(self, subjects: list[Subject]) -> list[Chapter]:
        created: list[Chapter] = []
        for subject in subjects:
            names = CHAPTER_SEEDS.get(subject.name)
            if names is None:
                names = [f"{subject.name} — Unit {n}" for n in range(1, DEFAULT_CHAPTER_COUNT + 1)]

            for index, name in enumerate(names, start=1):
                obj, _ = Chapter.objects.update_or_create(
                    subject=subject,
                    slug=slugify(f"{subject.slug}-{name}"),
                    defaults={
                        "number": index,
                        "name": name,
                        "description": "",
                        "display_order": index,
                        "is_active": True,
                    },
                )
                created.append(obj)
        self.stdout.write(f"  chapters -> {len(created)}")
        return created

    def _seed_upi(self) -> None:
        from django.conf import settings

        settings_row, created = UPISettings.objects.update_or_create(
            pk=1,
            defaults={
                "upi_id": getattr(settings, "VPEDIA_UPI_ID", ""),
                "display_name": getattr(settings, "VPEDIA_UPI_NAME", "VPEDIA LEARNING"),
                "instructions": (
                    "Pay the exact amount using any UPI app, then upload the "
                    "screenshot and the UTR below. Access is activated after an "
                    "administrator verifies the payment."
                ),
                "is_active": True,
            },
        )
        verb = "created" if created else "updated"
        self.stdout.write(f"  UPI settings -> {settings_row.upi_id or '(unset)'} ({verb})")

    def _seed_content(self, chapters: list[Chapter], *, publish: bool) -> int:
        """Placeholder rows so the catalogue shape is visible in admin.

        No file is attached and nothing is published unless asked, so no
        placeholder can ever be served to a student.
        """
        template = [
            (ContentType.NOTES, "Chapter Notes", 24),
            (ContentType.PYQ, "Previous Year Questions", 12),
            (ContentType.SOLVED_PYQ, "Solved PYQs", 32),
            (ContentType.IMPORTANT_QUESTIONS, "Important Questions", 8),
            (ContentType.PRACTICE_PAPER, "Practice Paper", 16),
            (ContentType.MODEL_PAPER, "Model Paper", 18),
        ]

        count = 0
        for chapter in chapters:
            for order, (content_type, label, pages) in enumerate(template, start=1):
                _, created = Content.objects.update_or_create(
                    chapter=chapter,
                    slug=slugify(f"{chapter.slug}-{content_type.lower()}"),
                    defaults={
                        "title": f"{label} — {chapter.name}",
                        "description": "Development placeholder. Attach a file in admin.",
                        "content_type": content_type,
                        "page_count": pages,
                        "display_order": order,
                        "is_published": publish,
                    },
                )
                count += 1 if created else 0
        return count

    def _summary(self, classes, streams, subjects, chapters, content_count) -> None:
        self.stdout.write(self.style.SUCCESS("\nSeed complete."))
        self.stdout.write(f"  classes  : {len(classes)}")
        self.stdout.write(f"  streams  : {len(streams)}")
        self.stdout.write(f"  subjects : {len(subjects)}")
        self.stdout.write(f"  chapters : {len(chapters)}")
        self.stdout.write(f"  new content rows: {content_count}")
        self.stdout.write("\nNext: python manage.py createsuperuser, then verify /admin/")
