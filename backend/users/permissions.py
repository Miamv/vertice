from django.contrib.auth import get_user_model
from rest_framework import permissions

from core.models import ProfessionalProfile, Project

User = get_user_model()


def _is_platform_admin(user):
    return bool(
        user
        and user.is_authenticated
        and (user.is_superuser or getattr(user, 'role', None) == User.RoleChoices.ADMIN)
    )


def _user_owns_profile(user, profile_id):
    try:
        return ProfessionalProfile.objects.filter(pk=int(profile_id), users=user).exists()
    except (ValueError, TypeError):
        return False


def _user_owns_project(user, project_id):
    try:
        return Project.objects.filter(pk=int(project_id), profile__users=user).exists()
    except (ValueError, TypeError):
        return False


class IsAdminRole(permissions.BasePermission):
    """Permiso para usuarios con rol ADMIN."""
    def has_permission(self, request, view):
        return _is_platform_admin(request.user)


class IsOwnerRole(permissions.BasePermission):
    """Permiso para usuarios con rol OWNER."""
    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated and request.user.role == User.RoleChoices.OWNER


class IsCollaboratorRole(permissions.BasePermission):
    """Permiso para usuarios con rol COLLABORATOR."""
    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated and request.user.role == User.RoleChoices.COLLABORATOR


class CanManageProject(permissions.BasePermission):
    """
    ADMIN y OWNER pueden crear y eliminar proyectos.
    ADMIN, OWNER y COLLABORATOR pueden editar.
    Validación: El usuario (no ADMIN) debe pertenecer al perfil del proyecto tanto en creación como en edición/borrado.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        role = request.user.role
        if _is_platform_admin(request.user):
            return True

        if view.action == 'create':
            if role != User.RoleChoices.OWNER:
                return False
            profile_id = request.data.get('profile')
            if profile_id is not None and profile_id != '':
                return _user_owns_profile(request.user, profile_id)
            return ProfessionalProfile.objects.filter(users=request.user).exists()

        if view.action == 'destroy':
            return role == User.RoleChoices.OWNER

        if view.action in ['update', 'partial_update']:
            return role in [User.RoleChoices.OWNER, User.RoleChoices.COLLABORATOR]

        return True

    def has_object_permission(self, request, view, obj):
        if _is_platform_admin(request.user):
            return True

        if not obj.profile.users.filter(id=request.user.id).exists():
            return False

        # Si en un update/partial_update se envía `profile`, verificar que pertenezca al usuario
        if view.action in ['update', 'partial_update'] and 'profile' in request.data:
            if not _user_owns_profile(request.user, request.data.get('profile')):
                return False

        # La administración de Ubicación y Google Earth está reservada a ADMIN y OWNER del estudio
        if (
            view.action in ['update', 'partial_update']
            and request.user.role == User.RoleChoices.COLLABORATOR
            and ('google_earth_url' in request.data or 'location' in request.data)
        ):
            return False

        return True


class CanUploadMedia(permissions.BasePermission):
    """
    ADMIN, OWNER y COLLABORATOR pueden subir y gestionar contenido multimedia,
    únicamente sobre proyectos pertenecientes a sus perfiles autorizados.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        role = request.user.role
        if _is_platform_admin(request.user):
            return True

        if role not in [User.RoleChoices.OWNER, User.RoleChoices.COLLABORATOR]:
            return False

        if view.action == 'create':
            project_id = request.data.get('project')
            if project_id is not None and project_id != '':
                return _user_owns_project(request.user, project_id)
            return Project.objects.filter(profile__users=request.user).exists()

        return True

    def has_object_permission(self, request, view, obj):
        if _is_platform_admin(request.user):
            return True

        if not obj.project.profile.users.filter(id=request.user.id).exists():
            return False

        if view.action in ['update', 'partial_update'] and 'project' in request.data:
            return _user_owns_project(request.user, request.data.get('project'))

        return True


class CanManageProfile(permissions.BasePermission):
    """
    ADMIN puede crear, editar y eliminar cualquier estudio (ProfessionalProfile).
    OWNER solo puede actualizar (PUT/PATCH) los estudios a los que pertenece,
    sin poder crear estudios nuevos ni eliminar los existentes.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if _is_platform_admin(request.user):
            return True
        if view.action in ['create', 'destroy']:
            return False
        return request.user.role == User.RoleChoices.OWNER

    def has_object_permission(self, request, view, obj):
        if _is_platform_admin(request.user):
            return True
        if view.action in ['create', 'destroy']:
            return False
        return request.user.role == User.RoleChoices.OWNER and obj.users.filter(id=request.user.id).exists()


class CanManageContact(permissions.BasePermission):
    """
    ADMIN puede gestionar cualquier contacto.
    OWNER puede consultar y eliminar los contactos de sus propios perfiles.
    COLLABORATOR puede consultar (list/retrieve) los contactos de sus perfiles asignados.
    Cualquier usuario (incluso anónimo o VIEWER) puede crear un contacto, pero
    no leer consultas por coincidencia de email no verificado.
    """
    def has_permission(self, request, view):
        if view.action == 'create':
            return True

        if not request.user or not request.user.is_authenticated:
            return False

        if _is_platform_admin(request.user):
            return True

        if view.action in ['list', 'retrieve']:
            return request.user.role in (User.RoleChoices.OWNER, User.RoleChoices.COLLABORATOR)

        return request.user.role == User.RoleChoices.OWNER

    def has_object_permission(self, request, view, obj):
        if _is_platform_admin(request.user):
            return True

        if view.action in ['list', 'retrieve'] and request.user.role in (
            User.RoleChoices.OWNER,
            User.RoleChoices.COLLABORATOR,
        ):
            return obj.profile.users.filter(id=request.user.id).exists()

        if request.user.role == User.RoleChoices.OWNER:
            return obj.profile.users.filter(id=request.user.id).exists()

        return False


class CanManageBrand(permissions.BasePermission):
    """
    Catálogo global de marcas (Brand):
    - Cualquier usuario puede listar o consultar marcas públicamente.
    - Solo ADMIN de plataforma puede crear, editar o eliminar marcas globales.
    - Los OWNER asocian marcas existentes a sus proyectos mediante ProjectSerializer.
    """
    def has_permission(self, request, view):
        if view.action in ['list', 'retrieve']:
            return True
        return _is_platform_admin(request.user)

    def has_object_permission(self, request, view, obj):
        if view.action in ['list', 'retrieve']:
            return True
        return _is_platform_admin(request.user)


class CanManageStudioContent(permissions.BasePermission):
    """
    ADMIN y OWNER pueden gestionar contenido institucional del estudio (Nosotros, Equipo).
    Cualquiera puede listar o consultar públicamente.
    El OWNER solo puede operar sobre estudios a los que pertenece.
    """
    def has_permission(self, request, view):
        if view.action in ['list', 'retrieve']:
            return True
        if not request.user or not request.user.is_authenticated:
            return False
        if _is_platform_admin(request.user):
            return True
        if request.user.role != User.RoleChoices.OWNER:
            return False

        if view.action == 'create':
            profile_id = request.data.get('profile')
            if profile_id is not None and profile_id != '':
                return _user_owns_profile(request.user, profile_id)
            return ProfessionalProfile.objects.filter(users=request.user).exists()

        return True

    def has_object_permission(self, request, view, obj):
        if _is_platform_admin(request.user):
            return True
        if request.user.role != User.RoleChoices.OWNER:
            return False
        if getattr(obj, 'profile_id', None) is None or not obj.profile.users.filter(id=request.user.id).exists():
            return False
        if view.action in ['update', 'partial_update'] and 'profile' in request.data:
            return _user_owns_profile(request.user, request.data.get('profile'))
        return True
