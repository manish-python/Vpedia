"""Shared exceptions for service-layer use."""

from __future__ import annotations


class ServiceError(Exception):
    """Base class for business-rule violations raised by the service layer."""

    default_message = "The operation could not be completed."

    def __init__(self, message: str | None = None) -> None:
        super().__init__(message or self.default_message)
        self.message = message or self.default_message


class PurchaseConflict(ServiceError):
    """The student already has an in-flight or active purchase for the class."""

    default_message = "A purchase for this class is already in progress."


class InvalidPaymentState(ServiceError):
    """The payment proof is not in a state that allows this transition."""

    default_message = "This payment can no longer be reviewed."


class AmountMismatch(ServiceError):
    """The submitted amount does not match the server-side purchase amount."""

    default_message = "The payment amount does not match the amount due."


class AccessDenied(ServiceError):
    """The user is not entitled to the requested class."""

    default_message = "You do not have access to this class."
