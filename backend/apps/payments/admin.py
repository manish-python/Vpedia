"""Django Admin for manual UPI payments.

This is the operational console. Approving or rejecting here calls
`apps.payments.services`, the same functions the REST API uses, so the rules
cannot diverge between the two surfaces.

The service layer — not this file — decides whether an approval is allowed.
This module only collects intent and reports the outcome.
"""

from __future__ import annotations

from django.contrib import admin, messages

from apps.core.exceptions import ServiceError

from .models import PaymentProof, UPISettings
from .services import add_admin_note, approve_payment, reject_payment


# ---------------------------------------------------------------------------
# UPI configuration
# ---------------------------------------------------------------------------


@admin.register(UPISettings)
class UPISettingsAdmin(admin.ModelAdmin):
    """Singleton holding the live UPI receiving details.

    Change the UPI ID, display name or QR code here; no code change or
    redeploy is needed.
    """

    list_display = ("upi_id", "display_name", "is_active", "updated_at")
    list_editable = ("display_name", "is_active")
    readonly_fields = ("created_at", "updated_at")

    def has_add_permission(self, request) -> bool:
        # Enforced singleton: no second row may be created.
        return not UPISettings.objects.exists()

    def has_delete_permission(self, request, obj=None) -> bool:
        return False


# ---------------------------------------------------------------------------
# Payment proofs
# ---------------------------------------------------------------------------


@admin.register(PaymentProof)
class PaymentProofAdmin(admin.ModelAdmin):
    """Payment evidence awaiting manual verification."""

    list_display = (
        "submitted_at",
        "user",
        "class_column",
        "amount",
        "utr",
        "status",
        "reviewed_by",
        "reviewed_at",
    )
    list_display_links = ("utr",)
    list_filter = (
        "status",
        "class_purchase__class_level",
        "payment_method",
        "submitted_at",
        "currency",
    )
    search_fields = (
        "user__email",
        "user__first_name",
        "user__last_name",
        "utr",
        "transaction_id",
    )
    list_select_related = (
        "user",
        "class_purchase",
        "class_purchase__class_level",
        "reviewed_by",
    )
    date_hierarchy = "submitted_at"
    readonly_fields = (
        "user",
        "class_purchase",
        "amount",
        "currency",
        "payment_method",
        "utr",
        "transaction_id",
        "screenshot",
        "submitted_at",
        "created_at",
        "updated_at",
    )
    actions = ("approve_selected_payments", "reject_selected_payments")
    autocomplete_fields = ("user", "class_purchase")

    fieldsets = (
        (
            "Payment evidence",
            {
                "fields": (
                    "user",
                    "class_purchase",
                    "amount",
                    "currency",
                    "payment_method",
                    "utr",
                    "transaction_id",
                    "screenshot",
                )
            },
        ),
        (
            "Review",
            {
                "fields": ("rejection_reason", "admin_note", "reviewed_by", "reviewed_at"),
                "description": "Status is changed through the approve/reject "
                "controls below, which call the shared payment service.",
            },
        ),
        ("Timestamps", {"fields": ("submitted_at", "created_at", "updated_at")}),
    )

    def get_queryset(self, request):
        return (
            super()
            .get_queryset(request)
            .select_related(
                "user", "class_purchase", "class_purchase__class_level", "reviewed_by"
            )
        )

    @admin.display(description="Class", ordering="class_purchase__class_level__display_order")
    def class_column(self, obj: PaymentProof) -> str:
        return obj.class_purchase.class_level.name

    @admin.display(description="Reviewable")
    def is_reviewable(self, obj: PaymentProof) -> bool:
        return obj.is_reviewable

    # --- Single-record review ------------------------------------------

    def change_view(self, request, object_id, form_url="", extra_context=None):
        extra = extra_context or {}
        proof = self.get_object(request, object_id)
        extra["show_review_actions"] = bool(proof and proof.is_reviewable)
        extra["pending_proof"] = proof
        return super().change_view(request, object_id, form_url, extra_context=extra)

    def response_change(self, request, obj: PaymentProof):
        action_name = request.POST.get("_vpedia_action")
        if not action_name:
            return super().response_change(request, obj)

        class_name = obj.class_purchase.class_level.name

        try:
            if action_name == "approve":
                approve_payment(obj, request.user)
                self.message_user(
                    request,
                    f"Approved. {class_name} access is now active for {obj.user.email}.",
                    messages.SUCCESS,
                )
            elif action_name == "reject":
                reason = (request.POST.get("rejection_reason") or "").strip()
                if not reason:
                    self.message_user(
                        request, "A rejection reason is required to reject.", messages.ERROR
                    )
                    return self.changeform_view(request, obj.pk)
                reject_payment(obj, request.user, reason)
                self.message_user(
                    request,
                    f"Rejected. {obj.user.email} remains locked out of {class_name}.",
                    messages.WARNING,
                )
        except ServiceError as exc:
            # A business-rule refusal. Nothing was written; report and reload.
            self.message_user(request, exc.message, messages.ERROR)
            return self.changeform_view(request, obj.pk)

        return self.changeform_view(request, obj.pk)

    # --- Bulk actions ---------------------------------------------------

    @admin.action(description="Approve selected payments (activates class access)")
    def approve_selected_payments(self, request, queryset):
        done, failures = self._review(request, queryset, approve=True)
        if done:
            self.message_user(
                request, f"{done} payment(s) approved and activated.", messages.SUCCESS
            )
        self._report_failures(request, failures)

    @admin.action(description="Reject selected payments (keeps class locked)")
    def reject_selected_payments(self, request, queryset):
        reason = (request.POST.get("rejection_reason") or "").strip()
        if not reason:
            self.message_user(
                request,
                "Enter a rejection reason before rejecting selected payments.",
                messages.ERROR,
            )
            return
        done, failures = self._review(request, queryset, approve=False, reason=reason)
        if done:
            self.message_user(request, f"{done} payment(s) rejected.", messages.WARNING)
        self._report_failures(request, failures)

    @staticmethod
    def _review(request, queryset, *, approve: bool, reason: str = "") -> tuple[int, list[str]]:
        """Apply the service layer per row so one bad row cannot stop the rest."""
        done = 0
        failures: list[str] = []
        for proof in list(queryset):
            try:
                if approve:
                    approve_payment(proof, request.user)
                else:
                    reject_payment(proof, request.user, reason)
                done += 1
            except ServiceError as exc:
                failures.append(f"UTR {proof.utr}: {exc.message}")
        return done, failures

    def _report_failures(self, request, failures: list[str]) -> None:
        for failure in failures:
            self.message_user(request, failure, messages.ERROR)
