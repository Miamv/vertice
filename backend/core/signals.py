from django.db import transaction
from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver

from .models import Media, ProfessionalProfile, StudioAbout, TeamMember

TRACKED_FILE_FIELDS = {
    ProfessionalProfile: ('avatar',),
    Media: ('file',),
    StudioAbout: ('image',),
    TeamMember: ('avatar',),
}


def is_file_referenced(file_name):
    """
    Verifica si algún registro en PostgreSQL sigue referenciando la ruta relativa `file_name`.
    Evita borrar archivos compartidos entre registros o el archivo nuevo en una actualización.
    """
    if not file_name:
        return False

    for model_cls, field_names in TRACKED_FILE_FIELDS.items():
        for field_name in field_names:
            if model_cls.objects.filter(**{field_name: file_name}).exists():
                return True
    return False


def delete_file_if_unreferenced(storage, file_name):
    """
    Elimina físicamente el archivo mediante la API Storage de Django únicamente si
    ningún registro en la base de datos mantiene referencia hacia él.
    """
    if not storage or not file_name:
        return
    if is_file_referenced(file_name):
        return
    try:
        if storage.exists(file_name):
            storage.delete(file_name)
    except Exception:
        # Evita interrumpir el flujo de negocio ante errores de E/S del proveedor de storage
        pass


@receiver(pre_save, sender=ProfessionalProfile)
@receiver(pre_save, sender=Media)
@receiver(pre_save, sender=StudioAbout)
@receiver(pre_save, sender=TeamMember)
def track_replaced_files_before_save(sender, instance, **kwargs):
    if kwargs.get('raw') or not instance.pk:
        return

    field_names = TRACKED_FILE_FIELDS.get(sender, ())
    if not field_names:
        return

    old_values = sender.objects.filter(pk=instance.pk).values(*field_names).first()
    if not old_values:
        return

    replaced = getattr(instance, '_replaced_files', None)
    if replaced is None:
        replaced = []

    for field_name in field_names:
        old_name = old_values.get(field_name)
        if not old_name:
            continue

        new_file = getattr(instance, field_name, None)
        new_name = getattr(new_file, 'name', None) or ''

        if old_name != new_name:
            storage = instance._meta.get_field(field_name).storage
            replaced.append((storage, old_name))

    instance._replaced_files = replaced


@receiver(post_save, sender=ProfessionalProfile)
@receiver(post_save, sender=Media)
@receiver(post_save, sender=StudioAbout)
@receiver(post_save, sender=TeamMember)
def cleanup_replaced_files_after_save(sender, instance, **kwargs):
    if kwargs.get('raw'):
        return

    replaced = getattr(instance, '_replaced_files', None)
    if not replaced:
        return

    instance._replaced_files = []
    for storage, old_name in replaced:
        transaction.on_commit(
            lambda s=storage, name=old_name: delete_file_if_unreferenced(s, name)
        )


@receiver(post_delete, sender=ProfessionalProfile)
@receiver(post_delete, sender=Media)
@receiver(post_delete, sender=StudioAbout)
@receiver(post_delete, sender=TeamMember)
def cleanup_deleted_record_files(sender, instance, **kwargs):
    field_names = TRACKED_FILE_FIELDS.get(sender, ())
    for field_name in field_names:
        file_field = getattr(instance, field_name, None)
        file_name = getattr(file_field, 'name', None)
        if file_name:
            storage = file_field.storage
            transaction.on_commit(
                lambda s=storage, name=file_name: delete_file_if_unreferenced(s, name)
            )
