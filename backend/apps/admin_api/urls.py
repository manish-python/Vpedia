from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    ChapterViewSet, ClassViewSet, ContentViewSet, OtherResourceAdminViewSet,
    OtherResourceCategoryAdminViewSet, PaymentViewSet,
    PurchaseViewSet, StreamViewSet, StudentViewSet, SubjectViewSet,
    UPIViewSet, admin_login, admin_logout, admin_me, dashboard,
)
from .views_notifications import AdminNotificationViewSet

router = DefaultRouter()
router.register("students", StudentViewSet, basename="admin-student")
router.register("classes", ClassViewSet, basename="admin-class")
router.register("streams", StreamViewSet, basename="admin-stream")
router.register("subjects", SubjectViewSet, basename="admin-subject")
router.register("chapters", ChapterViewSet, basename="admin-chapter")
router.register("content", ContentViewSet, basename="admin-content")
router.register(
    "other-resource-categories",
    OtherResourceCategoryAdminViewSet,
    basename="admin-other-resource-category",
)
router.register("other-resources", OtherResourceAdminViewSet, basename="admin-other-resource")
router.register("purchases", PurchaseViewSet, basename="admin-purchase")
router.register("payments", PaymentViewSet, basename="admin-payment")
router.register("notifications", AdminNotificationViewSet, basename="admin-notification")
router.register("upi", UPIViewSet, basename="admin-upi")

urlpatterns = [
    path("login/", admin_login, name="admin-login"),
    path("logout/", admin_logout, name="admin-logout"),
    path("me/", admin_me, name="admin-me"),
    path("dashboard/", dashboard, name="admin-dashboard"),
    path("", include(router.urls)),
]
