from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import Brand, ProfessionalProfile, Project, Media, Contact, StudioAbout, TeamMember


class AbsoluteMediaUrlMixin:
    """
    Convierte los campos de archivo configurados en `media_fields` en URLs absolutas
    al serializar la respuesta, manteniendo los campos del modelo habilitados para
    escritura (POST, PUT, PATCH con multipart/form-data).
    """
    media_fields = ()

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get('request')
        for field_name in self.media_fields:
            file_field = getattr(instance, field_name, None)
            if file_field:
                data[field_name] = (
                    request.build_absolute_uri(file_field.url)
                    if request
                    else file_field.url
                )
            else:
                data[field_name] = None
        return data


class BrandSerializer(AbsoluteMediaUrlMixin, serializers.ModelSerializer):
    media_fields = ('logo',)

    class Meta:
        model = Brand
        fields = ('id', 'name', 'logo')


class ProfessionalProfileSerializer(AbsoluteMediaUrlMixin, serializers.ModelSerializer):
    media_fields = ('avatar',)

    class Meta:
        model = ProfessionalProfile
        exclude = ('users',)
        read_only_fields = ('id', 'created_at', 'updated_at')

    def validate(self, attrs):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        is_admin = bool(
            user
            and user.is_authenticated
            and (user.is_superuser or getattr(user, 'role', None) == 'ADMIN')
        )

        if self.instance is not None and request is not None and not is_admin:
            if 'slug' in attrs and attrs['slug'] != self.instance.slug:
                raise serializers.ValidationError({
                    'slug': 'Solo un administrador de plataforma puede modificar el slug público del estudio.'
                })
            if 'is_active' in attrs and attrs['is_active'] != self.instance.is_active:
                raise serializers.ValidationError({
                    'is_active': 'Solo un administrador de plataforma puede modificar el estado del estudio.'
                })
        return attrs


class MediaSerializer(AbsoluteMediaUrlMixin, serializers.ModelSerializer):
    media_fields = ('file',)

    class Meta:
        model = Media
        fields = ('id', 'project', 'file', 'media_type', 'zone', 'plan_type')

    def validate(self, attrs):
        instance = self.instance
        media_type = attrs.get('media_type', getattr(instance, 'media_type', None))
        plan_type = attrs.get('plan_type', getattr(instance, 'plan_type', None))
        if plan_type == '':
            plan_type = None
            attrs['plan_type'] = None
        file_obj = attrs.get('file', getattr(instance, 'file', None))

        try:
            Media.validate_media_coherence(media_type, plan_type, file_obj)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict)

        return attrs


class ProjectSerializer(serializers.ModelSerializer):
    profile_slug = serializers.ReadOnlyField(source='profile.slug')
    profile_name = serializers.ReadOnlyField(source='profile.name')
    brands = BrandSerializer(many=True, read_only=True)
    brand_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        write_only=True,
        queryset=Brand.objects.all(),
        source='brands',
        required=False,
    )
    media = MediaSerializer(many=True, read_only=True)
    cover_image = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = (
            'id',
            'profile',
            'profile_slug',
            'profile_name',
            'title',
            'description',
            'category',
            'location',
            'google_earth_url',
            'brands',
            'brand_ids',
            'media',
            'cover_image',
            'created_at',
            'updated_at',
        )

    def _get_cover_url(self, obj):
        # Iterar sobre `obj.media.all()` reutiliza automáticamente la caché de
        # `prefetch_related('media')` de Django sin acoplarse a `_prefetched_objects_cache`.
        media_items = list(obj.media.all())
        first_media = next(
            (
                m for m in media_items
                if m.media_type in ('image', 'render') and not m.plan_type
            ),
            None,
        )
        if first_media is None:
            first_media = next(
                (m for m in media_items if m.media_type in ('image', 'render')),
                None,
            )

        if not first_media or not first_media.file:
            return None
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(first_media.file.url)
        return first_media.file.url

    def get_cover_image(self, obj):
        return self._get_cover_url(obj)


class ContactSerializer(serializers.ModelSerializer):
    profile_name = serializers.ReadOnlyField(source='profile.name')
    profile_slug = serializers.ReadOnlyField(source='profile.slug')

    class Meta:
        model = Contact
        fields = (
            'id',
            'profile',
            'profile_name',
            'profile_slug',
            'name',
            'email',
            'message',
            'created_at',
            'updated_at',
        )

    def validate_profile(self, value):
        if value and not value.is_active:
            raise serializers.ValidationError('El estudio destinatario no se encuentra disponible.')
        return value


class StudioAboutSerializer(AbsoluteMediaUrlMixin, serializers.ModelSerializer):
    media_fields = ('image',)
    profile_slug = serializers.ReadOnlyField(source='profile.slug')

    class Meta:
        model = StudioAbout
        fields = (
            'id',
            'profile',
            'profile_slug',
            'title',
            'description',
            'image',
            'updated_at',
        )


class TeamMemberSerializer(AbsoluteMediaUrlMixin, serializers.ModelSerializer):
    media_fields = ('avatar',)
    profile_slug = serializers.ReadOnlyField(source='profile.slug')

    class Meta:
        model = TeamMember
        fields = (
            'id',
            'profile',
            'profile_slug',
            'full_name',
            'role',
            'avatar',
            'order',
            'created_at',
        )
