"""Custom user model.

Email is the unique identifier. There is no username field and no
student-facing password authentication in this stage: Google OAuth arrives
later and will populate `email`, `first_name`, `last_name` and, if provided,
`avatar_url`.

`AbstractBaseUser` still provides the `password` column because Django Admin
requires it for staff sign-in. Student accounts are created with an unusable
password, so possessing an account cannot be used to sign in anywhere. Only
staff accounts created via `createsuperuser` hold a usable password, and that
is for Django Admin access only.
"""

from __future__ import annotations

import secrets
from typing import Any, ClassVar

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.core.validators import RegexValidator
from django.db import models
from django.utils import timezone

from apps.core.models import TimeStampedModel, unique_upload_path, validate_image_upload


def profile_image_path(instance: "StudentProfile", filename: str) -> str:
    return unique_upload_path(instance, filename, folder="profile_images")


def avatar_url_path(instance: "User", filename: str) -> str:
    return unique_upload_path(instance, filename, folder="avatars")


EMAIL_VALIDATOR = RegexValidator(
    regex=r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$",
    message="Enter a valid email address.",
)


class UserManager(BaseUserManager["User"]):
    """Manager for the email-based user model."""

    use_in_migrations = True

    def _create_user(self, email: str, password: str | None, **extra: Any) -> "User":
        if not email:
            raise ValueError("An email address is required.")
        email = self.normalize_email(email).lower()
        user = self.model(email=email, **extra)
        if password:
            user.set_password(password)
        else:
            # Students cannot sign in with a password at this stage.
            user.set_unusable_password()
        user.full_clean(exclude=["password"])
        user.save(using=self._db)
        return user

    def create_user(self, email: str, password: str | None = None, **extra: Any) -> "User":
        extra.setdefault("is_staff", False)
        extra.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra)

    def create_staff(self, email: str, password: str, **extra: Any) -> "User":
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra)

    def create_superuser(self, email: str, password: str, **extra: Any) -> "User":
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        extra.setdefault("is_active", True)
        if not extra["is_staff"] or not extra["is_superuser"]:
            raise ValueError("A superuser must have is_staff and is_superuser set to True.")
        return self._create_user(email, password, **extra)

    def get_by_natural_key(self, username: str) -> "User | None":
        return self.get(email__iexact=username)


class User(AbstractBaseUser, PermissionsMixin, TimeStampedModel):
    """A student or staff member."""

    email = models.EmailField(
        "email address",
        max_length=254,
        unique=True,
        db_index=True,
        validators=[EMAIL_VALIDATOR],
        error_messages={"unique": "An account with this email already exists."},
    )
    first_name = models.CharField("first name", max_length=150, blank=True)
    last_name = models.CharField("last name", max_length=150, blank=True)
    avatar_url = models.URLField("avatar URL", max_length=500, blank=True)

    is_active = models.BooleanField(
        "active",
        default=True,
        help_text="Inactive accounts cannot sign in.",
    )
    is_staff = models.BooleanField(
        "staff status",
        default=False,
        help_text="Designates access to Django Admin.",
    )
    is_superuser = models.BooleanField(
        "superuser status",
        default=False,
        help_text="Designates full administrative access.",
    )
    date_joined = models.DateTimeField("date joined", default=timezone.now)

    # Records that the account came from a verified Google identity, so the
    # later OAuth stage can refuse to merge a local account silently.
    google_subject_id = models.CharField(
        "Google subject id",
        max_length=255,
        blank=True,
        help_text="Immutable subject identifier supplied by Google.",
    )
    email_verified = models.BooleanField("email verified", default=False)
    last_login_at = models.DateTimeField("last login", null=True, blank=True)

    objects: ClassVar[UserManager] = UserManager()

    USERNAME_FIELD = "email"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS: ClassVar[list[str]] = ["first_name", "last_name"]

    class Meta:
        db_table = "accounts_user"
        verbose_name = "user"
        verbose_name_plural = "users"
        ordering = ["-date_joined"]
        constraints = [
            models.UniqueConstraint(
                fields=["google_subject_id"],
                condition=models.Q(google_subject_id__gt=""),
                name="accounts_user_unique_google_subject",
            ),
        ]

    def __str__(self) -> str:
        return self.email

    def get_full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip() or self.email

    def get_short_name(self) -> str:
        return self.first_name or self.email.split("@")[0]

    @property
    def full_name(self) -> str:
        return self.get_full_name()

    def record_login(self) -> None:
        self.last_login_at = timezone.now()
        self.save(update_fields=["last_login_at", "updated_at"])

    def get_avatar_fallback_token(self) -> str:
        """Deterministic fallback for avatar-less accounts."""
        return secrets.token_hex(4)

    # Access control is provided by services, never by a field on the user,
    # so an entitlement cannot be granted by editing the row.
    def has_class_access(self, class_level) -> bool:
        from apps.purchases.services import has_class_access

        return has_class_access(self, class_level)

    def save(self, *args, **kwargs):
        """Guarantee a blank password can never survive to the database.

        `UserManager.create_user` already calls `set_unusable_password()`, but
        the manager is not the only way to create a row: `User.objects.create()`
        and `QuerySet.create()` bypass it entirely.

        That matters more than it looks. Django treats an empty string as a
        *usable* password, because `is_password_usable()` only checks for the
        `!` prefix. So a student created outside the manager would report
        `has_usable_password() == True` and the stated invariant — students are
        never reachable by a password — would quietly stop holding.

        Normalising here makes the guarantee hold for every write path.
        Staff accounts always arrive with a real password, so this only ever
        affects rows that had none.
        """
        if not self.password:
            self.set_unusable_password()
        super().save(*args, **kwargs)


class StudentProfile(TimeStampedModel):
    """Per-student settings.

    Created automatically alongside the account when a student first signs in
    with Google, so profile endpoints always have a row to read.

    IMPORTANT
    ---------
    `selected_class` and `selected_stream` are *preferences only*. They record
    what the student is studying and shape the default dashboard. They grant
    nothing.

    Access to paid material comes exclusively from an ACTIVE `ClassPurchase`,
    checked by `apps.purchases.services.has_class_access`. Selecting Class 10
    leaves `has_class_access(student, class_10)` False until a payment is
    approved.
    """

    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="profile",
        primary_key=False,
    )
    selected_class = models.ForeignKey(
        "academics.ClassLevel",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="students",
        help_text="The class the student is currently studying. "
        "A preference only — it does not unlock any material.",
    )
    selected_stream = models.ForeignKey(
        "academics.Stream",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="students",
        help_text="Chosen for classes that offer streams (11 and 12). "
        "A preference only — it does not unlock any material.",
    )
    phone_number = models.CharField(max_length=20, blank=True)
    profile_image = models.ImageField(
        upload_to=profile_image_path,
        blank=True,
        null=True,
        validators=[validate_image_upload],
    )

    class Meta:
        db_table = "accounts_student_profile"
        verbose_name = "student profile"
        verbose_name_plural = "student profiles"

    def __str__(self) -> str:
        return f"Profile of {self.user.email}"
