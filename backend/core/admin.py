from django import forms
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.forms import UserCreationForm, UserChangeForm
from django.utils.html import format_html
from .models import User, Brand, ProfessionalProfile, Project, Media, Contact, StudioAbout, TeamMember


class CustomUserCreationForm(UserCreationForm):
    email = forms.EmailField(
        required=True,
        help_text='Requerido. Dirección de correo electrónico única para el usuario.',
    )

    class Meta(UserCreationForm.Meta):
        model = User
        fields = ('username', 'email', 'role')


class CustomUserChangeForm(UserChangeForm):
    email = forms.EmailField(
        required=True,
        help_text='Requerido. Dirección de correo electrónico única para el usuario.',
    )

    class Meta(UserChangeForm.Meta):
        model = User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    form = CustomUserChangeForm
    add_form = CustomUserCreationForm
    list_display = ('username', 'email', 'role', 'is_active')
    list_filter = ('role', 'is_active', 'is_staff', 'is_superuser')
    search_fields = ('username', 'email')
    fieldsets = BaseUserAdmin.fieldsets + (
        ('Rol', {'fields': ('role',)}),
    )
    add_fieldsets = (
        (
            None,
            {
                'classes': ('wide',),
                'fields': ('username', 'email', 'role', 'password1', 'password2'),
            },
        ),
    )


def _is_platform_admin(user):
    return bool(
        user
        and user.is_authenticated
        and (user.is_superuser or getattr(user, 'role', None) == User.RoleChoices.ADMIN)
    )


class StudioScopedAdminMixin:
    """
    Aísla en Django Admin los registros y selectores ForeignKey para que usuarios
    no administradores de plataforma (ej. OWNER con acceso staff) solo vean y
    administren recursos pertenecientes a sus propios estudios (ProfessionalProfile).
    """
    profile_lookup = 'profile'

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if _is_platform_admin(request.user):
            return qs
        return qs.filter(**{f'{self.profile_lookup}__users': request.user}).distinct()

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if not _is_platform_admin(request.user):
            if db_field.name == 'profile':
                kwargs['queryset'] = ProfessionalProfile.objects.filter(users=request.user).distinct()
            elif db_field.name == 'project':
                kwargs['queryset'] = Project.objects.filter(profile__users=request.user).distinct()
        return super().formfield_for_foreignkey(db_field, request, **kwargs)


@admin.register(Brand)
class BrandAdmin(admin.ModelAdmin):
    list_display = ('name',)
    search_fields = ('name',)

    def has_add_permission(self, request):
        return _is_platform_admin(request.user)

    def has_change_permission(self, request, obj=None):
        return _is_platform_admin(request.user)

    def has_delete_permission(self, request, obj=None):
        return _is_platform_admin(request.user)


@admin.register(ProfessionalProfile)
class ProfessionalProfileAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'specialty', 'contact_email', 'phone', 'is_active', 'created_at')
    list_filter = ('is_active', 'created_at')
    search_fields = ('name', 'slug', 'users__username', 'users__email')
    prepopulated_fields = {'slug': ('name',)}
    filter_horizontal = ('users',)

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if _is_platform_admin(request.user):
            return qs
        return qs.filter(users=request.user).distinct()

    def get_readonly_fields(self, request, obj=None):
        readonly = list(super().get_readonly_fields(request, obj))
        if not _is_platform_admin(request.user) and 'users' not in readonly:
            readonly.append('users')
        return tuple(readonly)

    def has_add_permission(self, request):
        return _is_platform_admin(request.user)

    def has_delete_permission(self, request, obj=None):
        return _is_platform_admin(request.user)


class MediaInline(admin.TabularInline):
    model = Media
    extra = 1
    fields = ('file', 'preview', 'media_type', 'zone', 'plan_type')
    readonly_fields = ('preview',)

    def preview(self, instance):
        if instance.pk and instance.file:
            return format_html(
                '<img src="{}" style="max-height: 50px; max-width: 90px; object-fit: cover; border-radius: 4px;" alt="preview" />',
                instance.file.url
            )
        return "-"
    preview.short_description = "Vista previa"


@admin.register(Project)
class ProjectAdmin(StudioScopedAdminMixin, admin.ModelAdmin):
    list_display = ('title', 'profile', 'category', 'location', 'google_earth_url', 'created_at')
    list_filter = ('profile', 'category', 'created_at')
    search_fields = ('title', 'location')
    fields = (
        'profile',
        'title',
        'category',
        'description',
        'location',
        'google_earth_url',
        'brands',
    )
    filter_horizontal = ('brands',)
    inlines = [MediaInline]

    def get_readonly_fields(self, request, obj=None):
        readonly = list(super().get_readonly_fields(request, obj))
        is_owner_or_admin = _is_platform_admin(request.user) or (
            request.user.is_authenticated and getattr(request.user, 'role', None) == User.RoleChoices.OWNER
        )
        if not is_owner_or_admin:
            for field_name in ('location', 'google_earth_url'):
                if field_name not in readonly:
                    readonly.append(field_name)
        return tuple(readonly)


@admin.register(Media)
class MediaAdmin(StudioScopedAdminMixin, admin.ModelAdmin):
    profile_lookup = 'project__profile'
    list_display = ('project', 'preview', 'media_type', 'zone', 'plan_type')
    list_filter = ('media_type', 'zone', 'plan_type')
    readonly_fields = ('preview',)

    def preview(self, instance):
        if instance.pk and instance.file:
            return format_html(
                '<img src="{}" style="max-height: 50px; max-width: 90px; object-fit: cover; border-radius: 4px;" alt="preview" />',
                instance.file.url
            )
        return "-"
    preview.short_description = "Vista previa"


@admin.register(Contact)
class ContactAdmin(StudioScopedAdminMixin, admin.ModelAdmin):
    list_display = ('name', 'profile', 'created_at')
    list_filter = ('profile', 'created_at')
    search_fields = ('name', 'email')


@admin.register(StudioAbout)
class StudioAboutAdmin(StudioScopedAdminMixin, admin.ModelAdmin):
    list_display = ('title', 'profile', 'updated_at')
    list_filter = ('profile',)
    search_fields = ('title', 'description')


@admin.register(TeamMember)
class TeamMemberAdmin(StudioScopedAdminMixin, admin.ModelAdmin):
    list_display = ('full_name', 'role', 'profile', 'order', 'preview')
    list_editable = ('order',)
    list_filter = ('profile',)
    search_fields = ('full_name', 'role')
    readonly_fields = ('preview',)

    def preview(self, instance):
        if instance.pk and instance.avatar:
            return format_html(
                '<img src="{}" style="max-height: 40px; max-width: 40px; border-radius: 50%; object-fit: cover;" alt="preview" />',
                instance.avatar.url
            )
        return "-"
    preview.short_description = "Avatar"
