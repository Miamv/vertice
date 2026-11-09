from django.shortcuts import get_object_or_404
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from .models import ProfessionalProfile, Project, Media, Contact, StudioAbout, TeamMember
from .serializers import (
    ProfessionalProfileSerializer,
    ProjectSerializer,
    MediaSerializer,
    ContactSerializer,
    StudioAboutSerializer,
    TeamMemberSerializer,
)
from users.permissions import (
    CanManageProject,
    CanUploadMedia,
    CanManageProfile,
    CanManageContact,
    CanManageStudioContent,
)


def _is_platform_admin(user):
    return bool(
        user
        and user.is_authenticated
        and (user.is_superuser or getattr(user, 'role', None) == user.RoleChoices.ADMIN)
    )


def _is_studio_member_role(user):
    return bool(
        user
        and user.is_authenticated
        and not _is_platform_admin(user)
        and getattr(user, 'role', None) in (user.RoleChoices.OWNER, user.RoleChoices.COLLABORATOR)
    )


def _filter_by_profile_params(qs, request, prefix='profile'):
    profile_slug = request.query_params.get('profile_slug')
    profile_id = request.query_params.get('profile')

    if profile_slug:
        qs = qs.filter(**{f'{prefix}__slug': profile_slug})

    if profile_id is not None and profile_id != '':
        if str(profile_id).isdigit():
            qs = qs.filter(**{f'{prefix}_id': int(profile_id)})
        else:
            return qs.none()

    return qs


class ProfessionalProfileViewSet(viewsets.ModelViewSet):
    queryset = ProfessionalProfile.objects.all().order_by('id')
    serializer_class = ProfessionalProfileSerializer
    lookup_value_regex = r'[^/]+'

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user

        if _is_platform_admin(user):
            slug_param = self.request.query_params.get('slug')
            if slug_param:
                qs = qs.filter(slug=slug_param)
            return qs

        # Usuarios no administradores solo ven perfiles activos
        qs = qs.filter(is_active=True)

        slug_param = self.request.query_params.get('slug')
        if slug_param:
            qs = qs.filter(slug=slug_param)

        if self.request.query_params.get('mine') in ('1', 'true', 'True'):
            if not user.is_authenticated:
                return qs.none()
            return qs.filter(users=user)

        # OWNER y COLLABORATOR solo pueden listar o ver los perfiles de estudio a los que están asociados
        if _is_studio_member_role(user):
            if self.action in ['list', 'retrieve', 'by_slug']:
                return qs.filter(users=user)
            return qs

        # VIEWER o visitante anónimo:
        # En detalle (`retrieve` o `by_slug`) puede resolver el estudio del link recibido.
        # En listado (`list` sin slug explícito, ej. ruta raíz `/`), solo recibe el estudio principal (1 perfil)
        # para no exponer el catálogo completo de estudios creados en la plataforma.
        if self.action == 'list' and not slug_param:
            first_profile = qs.order_by('id').values_list('id', flat=True).first()
            if first_profile is None:
                return qs.none()
            return qs.filter(pk=first_profile)

        return qs

    @action(
        detail=False,
        methods=['get'],
        url_path=r'by-slug/(?P<slug>[^/]+)',
        permission_classes=[AllowAny],
    )
    def by_slug(self, request, slug=None):
        queryset = self.filter_queryset(self.get_queryset())
        obj = get_object_or_404(queryset, slug=slug)
        self.check_object_permissions(request, obj)
        serializer = self.get_serializer(obj)
        return Response(serializer.data)

    def get_object(self):
        queryset = self.filter_queryset(self.get_queryset())
        lookup_value = self.kwargs.get(self.lookup_url_kwarg or self.lookup_field)
        if lookup_value is not None and str(lookup_value).isdigit():
            obj = get_object_or_404(queryset, pk=int(lookup_value))
        else:
            obj = get_object_or_404(queryset, slug=lookup_value)
        self.check_object_permissions(self.request, obj)
        return obj

    def get_permissions(self):
        if self.action in ['list', 'retrieve', 'by_slug']:
            return [AllowAny()]
        return [CanManageProfile()]


class ProjectViewSet(viewsets.ModelViewSet):
    queryset = Project.objects.select_related('profile').prefetch_related('media').order_by('order', '-created_at')
    serializer_class = ProjectSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if not _is_platform_admin(user):
            qs = qs.filter(profile__is_active=True)
        if _is_studio_member_role(user) and self.action in ['list', 'retrieve']:
            qs = qs.filter(profile__users=user)
        return _filter_by_profile_params(qs, self.request, prefix='profile')

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [AllowAny()]
        return [CanManageProject()]


class MediaViewSet(viewsets.ModelViewSet):
    queryset = Media.objects.select_related('project', 'project__profile').order_by('id')
    serializer_class = MediaSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if not _is_platform_admin(user):
            qs = qs.filter(project__profile__is_active=True)
        if _is_studio_member_role(user) and self.action in ['list', 'retrieve']:
            qs = qs.filter(project__profile__users=user)

        project_id = self.request.query_params.get('project')
        if project_id is not None and project_id != '':
            if str(project_id).isdigit():
                qs = qs.filter(project_id=int(project_id))
            else:
                return qs.none()

        return _filter_by_profile_params(qs, self.request, prefix='project__profile')

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [AllowAny()]
        return [CanUploadMedia()]


class StudioAboutViewSet(viewsets.ModelViewSet):
    queryset = StudioAbout.objects.select_related('profile').order_by('id')
    serializer_class = StudioAboutSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if not _is_platform_admin(user):
            qs = qs.filter(profile__is_active=True)
        if _is_studio_member_role(user) and self.action in ['list', 'retrieve']:
            qs = qs.filter(profile__users=user)
        return _filter_by_profile_params(qs, self.request, prefix='profile')

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [AllowAny()]
        return [CanManageStudioContent()]


class TeamMemberViewSet(viewsets.ModelViewSet):
    queryset = TeamMember.objects.select_related('profile').order_by('order', 'id')
    serializer_class = TeamMemberSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if not _is_platform_admin(user):
            qs = qs.filter(profile__is_active=True)
        if _is_studio_member_role(user) and self.action in ['list', 'retrieve']:
            qs = qs.filter(profile__users=user)
        return _filter_by_profile_params(qs, self.request, prefix='profile')

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [AllowAny()]
        return [CanManageStudioContent()]


class ContactViewSet(viewsets.ModelViewSet):
    queryset = Contact.objects.select_related('profile', 'project').order_by('-created_at')
    serializer_class = ContactSerializer

    def _apply_contact_filters(self, qs):
        qs = _filter_by_profile_params(qs, self.request, prefix='profile')

        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)

        project_param = self.request.query_params.get('project')
        if project_param is not None and project_param != '':
            if str(project_param).lower() in ('none', 'null', '0'):
                qs = qs.filter(project__isnull=True)
            elif str(project_param).isdigit():
                qs = qs.filter(project_id=int(project_param))
            else:
                return qs.none()

        date_param = self.request.query_params.get('date')
        if date_param:
            qs = qs.filter(created_at__date=date_param)

        date_from = self.request.query_params.get('date_from')
        if date_from:
            qs = qs.filter(created_at__date__gte=date_from)

        date_to = self.request.query_params.get('date_to')
        if date_to:
            qs = qs.filter(created_at__date__lte=date_to)

        return qs

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return Contact.objects.none()

        qs = super().get_queryset()
        if _is_platform_admin(user):
            return self._apply_contact_filters(qs)

        if user.role in (user.RoleChoices.OWNER, user.RoleChoices.COLLABORATOR):
            qs = qs.filter(profile__users=user)
            return self._apply_contact_filters(qs)

        return Contact.objects.none()

    def get_permissions(self):
        return [CanManageContact()]
