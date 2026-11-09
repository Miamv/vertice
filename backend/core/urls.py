from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .views import (
    ProfessionalProfileViewSet,
    ProjectViewSet,
    MediaViewSet,
    ContactViewSet,
    StudioAboutViewSet,
    TeamMemberViewSet,
)

router = DefaultRouter()

router.register(r'profiles', ProfessionalProfileViewSet)
router.register(r'projects', ProjectViewSet)
router.register(r'media', MediaViewSet)
router.register(r'contacts', ContactViewSet)
router.register(r'about', StudioAboutViewSet)
router.register(r'team', TeamMemberViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
