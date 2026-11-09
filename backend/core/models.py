import os
from io import BytesIO
from xml.etree import ElementTree

from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.core.validators import FileExtensionValidator
from django.core.files.uploadedfile import UploadedFile
from django.db import models
from django.utils.text import slugify
from PIL import Image, UnidentifiedImageError

MAX_UPLOAD_SIZE = 10 * 1024 * 1024


def validate_upload_size(field_name, file_obj):
    upload = file_obj if isinstance(file_obj, UploadedFile) else getattr(file_obj, '_file', None)
    if isinstance(upload, UploadedFile) and upload.size > MAX_UPLOAD_SIZE:
        raise ValidationError({
            field_name: 'El archivo no puede superar los 10 MiB.'
        })


def _uploaded_file(file_obj):
    if isinstance(file_obj, UploadedFile):
        return file_obj
    upload = getattr(file_obj, '_file', None)
    return upload if isinstance(upload, UploadedFile) else None


def _validate_uploaded_media_content(file_obj, extension):
    upload = _uploaded_file(file_obj)
    if upload is None:
        return

    content_type = getattr(upload, 'content_type', None)
    if extension == 'pdf':
        if content_type and content_type != 'application/pdf':
            raise ValidationError({'file': 'El contenido del archivo no coincide con el PDF declarado.'})
        upload.seek(0)
        header = upload.read(1024)
        upload.seek(0)
        if b'%PDF-' not in header:
            raise ValidationError({'file': 'El archivo no contiene una cabecera PDF válida.'})
        return

    expected_content_types = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'webp': 'image/webp',
        'avif': 'image/avif',
        'gif': 'image/gif',
        'bmp': 'image/bmp',
        'svg': 'image/svg+xml',
    }
    expected_content_type = expected_content_types.get(extension)
    if content_type and content_type != expected_content_type:
        raise ValidationError({'file': 'El tipo MIME no coincide con la extensión de imagen.'})

    upload.seek(0)
    content = upload.read()
    upload.seek(0)
    try:
        if extension == 'svg':
            root = ElementTree.fromstring(content)
            if root.tag.rsplit('}', 1)[-1].lower() != 'svg':
                raise ValueError('El documento no tiene una raíz SVG.')
        else:
            with Image.open(BytesIO(content)) as image:
                expected_format = {
                    'jpg': 'JPEG',
                    'jpeg': 'JPEG',
                    'png': 'PNG',
                    'webp': 'WEBP',
                    'avif': 'AVIF',
                    'gif': 'GIF',
                    'bmp': 'BMP',
                }[extension]
                if image.format != expected_format:
                    raise ValueError('El contenido no coincide con la extensión.')
                image.verify()
    except (UnidentifiedImageError, OSError, ValueError, ElementTree.ParseError) as exc:
        raise ValidationError({'file': 'El contenido no es una imagen válida para su extensión.'}) from exc


class User(AbstractUser):
    class RoleChoices(models.TextChoices):
        ADMIN = 'ADMIN', 'Administrador'
        OWNER = 'OWNER', 'Propietario'
        COLLABORATOR = 'COLLABORATOR', 'Colaborador'
        VIEWER = 'VIEWER', 'Visor'

    email = models.EmailField(unique=True)
    role = models.CharField(
        max_length=20,
        choices=RoleChoices.choices,
        default=RoleChoices.VIEWER
    )

    def __str__(self):
        return f'{self.username} - {self.get_role_display()}'


class ProfessionalProfile(models.Model):
    users = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        related_name='professional_profiles',
        blank=True,
    )
    slug = models.SlugField(max_length=100, unique=True, blank=True)
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    specialty = models.CharField(max_length=100, blank=True)
    services = models.TextField(blank=True)
    contact_email = models.EmailField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    location = models.CharField(max_length=200, blank=True)
    instagram = models.CharField(max_length=150, blank=True)
    avatar = models.ImageField(upload_to='profiles/', blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def _generate_unique_slug(self):
        base_slug = (slugify(self.name) or 'estudio')[:90]
        candidate = base_slug
        counter = 2
        while ProfessionalProfile.objects.exclude(pk=self.pk).filter(slug=candidate).exists():
            candidate = f'{base_slug}-{counter}'
            counter += 1
        return candidate

    def clean(self):
        super().clean()
        validate_upload_size('avatar', self.avatar)
        if not self.slug:
            self.slug = self._generate_unique_slug()

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = self._generate_unique_slug()
            if 'update_fields' in kwargs and kwargs['update_fields'] is not None:
                kwargs['update_fields'] = set(kwargs['update_fields']) | {'slug'}
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class Project(models.Model):
    CATEGORY_CHOICES = [
        ('architecture', 'Architecture'),
        ('design', 'Design'),
        ('photography', 'Photography'),
        ('interior_design', 'Interior Design'),
        ('render', 'Render'),
        ('other', 'Other'),
    ]
    profile = models.ForeignKey(
        ProfessionalProfile,
        on_delete=models.CASCADE,
        related_name='projects'
    )
    title = models.CharField(max_length=150)
    description = models.TextField()
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES)
    location = models.CharField(max_length=200, blank=True)
    google_earth_url = models.URLField(max_length=500, blank=True)
    order = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title

    class Meta:
        ordering = ['order', '-created_at']


class Media(models.Model):
    IMAGE_AND_PLAN_EXTENSIONS = ('jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'svg', 'bmp', 'pdf')
    VIDEO_EXTENSIONS = ('mp4', 'webm', 'mov', 'ogg')
    MODEL_3D_EXTENSIONS = ('obj', 'fbx', 'gltf', 'glb', 'stl')
    ALLOWED_MEDIA_EXTENSIONS = IMAGE_AND_PLAN_EXTENSIONS + VIDEO_EXTENSIONS + MODEL_3D_EXTENSIONS

    MEDIA_TYPES = [
        ('image', 'Image'),
        ('video', 'Video'),
        ('render', 'Render'),
        ('virtual_tour', 'Virtual Tour'),
        ('model_3d', '3D Model'),
        ('interactive', 'Interactive Content'),
    ]

    ZONE_CHOICES = [
        ('interior', 'Interior'),
        ('exterior', 'Exterior'),
    ]

    PLAN_TYPES = [
        ('planimetria', 'Planimetría'),
        ('planta', 'Planta'),
        ('cortes', 'Cortes'),
        ('vistas', 'Vistas'),
        ('detalle', 'Detalle'),
    ]

    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name='media'
    )
    file = models.FileField(
        upload_to='projects/%Y/%m/',
        validators=[FileExtensionValidator(allowed_extensions=ALLOWED_MEDIA_EXTENSIONS)],
    )
    media_type = models.CharField(max_length=20, choices=MEDIA_TYPES)
    zone = models.CharField(max_length=10, choices=ZONE_CHOICES, blank=True)
    plan_type = models.CharField(max_length=20, choices=PLAN_TYPES, blank=True, null=True)

    @classmethod
    def validate_media_coherence(cls, media_type, plan_type, file_obj=None):
        errors = {}
        if media_type not in ('image', 'render'):
            errors['media_type'] = 'Solo se admiten imágenes, renders y planos PDF.'
        if plan_type and media_type not in ('image', 'render'):
            errors['plan_type'] = (
                'Solo los archivos de tipo imagen o render pueden clasificarse como plano técnico.'
            )

        file_name = getattr(file_obj, 'name', None) or (file_obj if isinstance(file_obj, str) else None)
        if file_name:
            ext = os.path.splitext(file_name)[1].lstrip('.').lower()
            if ext:
                if ext not in cls.ALLOWED_MEDIA_EXTENSIONS:
                    errors['file'] = f'La extensión ".{ext}" no está permitida.'
                elif ext == 'pdf' and not plan_type:
                    errors['plan_type'] = 'Los archivos PDF deben clasificarse como un plano técnico.'
                elif plan_type and ext not in cls.IMAGE_AND_PLAN_EXTENSIONS:
                    errors['file'] = (
                        'Los renders, imágenes y planos deben tener una extensión de imagen o PDF válida.'
                    )
                elif media_type in ('image', 'render') and ext not in cls.IMAGE_AND_PLAN_EXTENSIONS:
                    errors['file'] = 'Las imágenes y renders deben usar una extensión de imagen válida.'
                elif media_type not in ('image', 'render'):
                    if media_type == 'video':
                        allowed_for_type = cls.VIDEO_EXTENSIONS
                    elif media_type == 'model_3d':
                        allowed_for_type = cls.MODEL_3D_EXTENSIONS
                    else:
                        allowed_for_type = ()
                    if ext not in allowed_for_type:
                        errors['file'] = 'El archivo no corresponde al tipo de medio seleccionado.'

        if errors:
            raise ValidationError(errors)
        if file_obj and file_name and ext:
            _validate_uploaded_media_content(file_obj, ext)

    def clean(self):
        super().clean()
        if self.plan_type == '':
            self.plan_type = None
        validate_upload_size('file', self.file)
        self.validate_media_coherence(self.media_type, self.plan_type, self.file)

    def save(self, *args, **kwargs):
        if self.plan_type == '':
            self.plan_type = None
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.media_type} - {self.project.title}'


class Contact(models.Model):
    class StatusChoices(models.TextChoices):
        PENDING = 'pending', 'Pendiente'
        IN_REVIEW = 'in_review', 'En revisión'
        RESPONDED = 'responded', 'Respondida'
        CLOSED = 'closed', 'Cerrada'

    profile = models.ForeignKey(
        ProfessionalProfile,
        on_delete=models.CASCADE,
        related_name='contacts'
    )
    project = models.ForeignKey(
        Project,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='contacts',
    )

    name = models.CharField(max_length=100)
    email = models.EmailField()
    message = models.TextField()
    status = models.CharField(
        max_length=20,
        choices=StatusChoices.choices,
        default=StatusChoices.PENDING,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def clean(self):
        super().clean()
        if self.project_id and self.profile_id:
            if self.project.profile_id != self.profile_id:
                raise ValidationError({
                    'project': 'El proyecto asociado debe pertenecer al mismo estudio de la consulta.'
                })

    def __str__(self):
        return f'Message to {self.profile} from {self.name} ({self.get_status_display()})'

    class Meta:
        ordering = ['-created_at']


class StudioAbout(models.Model):
    profile = models.ForeignKey(
        ProfessionalProfile,
        on_delete=models.CASCADE,
        related_name='about_sections',
    )
    title = models.CharField(max_length=200, default='Sobre el Estudio')
    description = models.TextField(blank=True)
    image = models.ImageField(upload_to='about/', blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)

    def clean(self):
        super().clean()
        validate_upload_size('image', self.image)

    def __str__(self):
        return self.title

    class Meta:
        verbose_name = 'Sección Nosotros'
        verbose_name_plural = 'Sección Nosotros'
        constraints = [
            models.UniqueConstraint(fields=['profile'], name='unique_studioabout_per_profile'),
        ]


class TeamMember(models.Model):
    profile = models.ForeignKey(
        ProfessionalProfile,
        on_delete=models.CASCADE,
        related_name='team_members',
    )
    full_name = models.CharField(max_length=120)
    role = models.CharField(max_length=120)
    avatar = models.ImageField(upload_to='team/', blank=True, null=True)
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    def clean(self):
        super().clean()
        validate_upload_size('avatar', self.avatar)

    class Meta:
        ordering = ['order', 'id']
        verbose_name = 'Miembro del Equipo'
        verbose_name_plural = 'Miembros del Equipo'

    def __str__(self):
        return f'{self.full_name} ({self.role})'
