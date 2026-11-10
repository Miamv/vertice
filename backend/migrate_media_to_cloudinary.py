
import json
import os
from datetime import datetime
from pathlib import Path

from django.conf import settings
from django.core.files.uploadedfile import UploadedFile

from cloudinary_storage.storage import MediaCloudinaryStorage

from core.models import (
    ProfessionalProfile,
    Media,
    StudioAbout,
    TeamMember,
)


# False = solamente verificar.
# True = subir archivos y actualizar sus rutas en PostgreSQL.
UPLOAD_TO_CLOUDINARY = True


def get_records():
    """Obtiene todos los campos multimedia de los estudios."""

    records = []

    for obj in ProfessionalProfile.objects.all():
        if obj.avatar:
            records.append((obj, "avatar"))

    for obj in Media.objects.all():
        if obj.file:
            records.append((obj, "file"))

    for obj in StudioAbout.objects.all():
        if obj.image:
            records.append((obj, "image"))

    for obj in TeamMember.objects.all():
        if obj.avatar:
            records.append((obj, "avatar"))

    return records


def main():
    storage = MediaCloudinaryStorage()
    records = get_records()

    prefix = settings.CLOUDINARY_STORAGE.get("PREFIX", "vertice").strip("/")
    media_root = Path(settings.MEDIA_ROOT).resolve()

    print("\n===== MIGRACIÓN DE MULTIMEDIA =====")
    print("Archivos encontrados:", len(records))
    print("Prefijo Cloudinary:", prefix)
    print("Modo:", "CARGA REAL" if UPLOAD_TO_CLOUDINARY else "PRUEBA")
    print()

    # Validar credenciales y respaldar las rutas originales.
    if UPLOAD_TO_CLOUDINARY:
        config = __import__("cloudinary").config()

        if not all([
            config.cloud_name,
            config.api_key,
            config.api_secret,
        ]):
            raise RuntimeError("Faltan credenciales de Cloudinary.")

        backup = []

        for obj, field_name in records:
            backup.append({
                "model": obj._meta.label,
                "pk": obj.pk,
                "field": field_name,
                "original_name": getattr(obj, field_name).name,
            })

        backup_path = (
            settings.BASE_DIR.parent.parent
            / f"backup_rutas_media_{datetime.now():%Y%m%d_%H%M%S}.json"
        )

        backup_path.write_text(
            json.dumps(backup, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        print("Backup de rutas:", backup_path)

    uploaded = 0
    errors = 0

    for obj, field_name in records:
        field_file = getattr(obj, field_name)
        original_name = field_file.name

        normalized = storage._normalise_name(original_name)
        cloudinary_name = storage._prepend_prefix(normalized)

        # Evitar procesar registros que ya tienen el prefijo.
        if normalized.startswith(f"{prefix}/"):
            print(
                f"[YA MIGRADO] {obj._meta.label} "
                f"#{obj.pk}: {original_name}"
            )
            continue

        local_path = (media_root / original_name).resolve()

        # Evitar rutas fuera de MEDIA_ROOT.
        if not local_path.is_relative_to(media_root):
            print(f"[ERROR] Ruta no permitida: {original_name}")
            errors += 1
            continue

        if not local_path.is_file():
            print(f"[ERROR] No existe el archivo: {local_path}")
            errors += 1
            continue

        resource_type = storage._get_resource_type(cloudinary_name)

        print(f"[ARCHIVO] {obj._meta.label} #{obj.pk}")
        print("  Origen:", original_name)
        print("  Destino:", cloudinary_name)
        print("  Tipo:", resource_type)

        if not UPLOAD_TO_CLOUDINARY:
            continue

        try:
            with open(local_path, "rb") as file:
                content = UploadedFile(
                    file,
                    name=os.path.basename(cloudinary_name),
                )

                # Utiliza el mecanismo interno de carga del storage.
                result = storage._upload(cloudinary_name, content)

            public_id = result["public_id"]

            # Actualizar únicamente el campo multimedia correspondiente.
            setattr(obj, field_name, public_id)
            obj.save(update_fields=[field_name])

            uploaded += 1
            print("  [SUBIDO] Public ID:", public_id)

        except Exception as exc:
            errors += 1
            print("  [ERROR]:", str(exc))

    print("\n===== RESULTADO =====")
    print("Archivos encontrados:", len(records))
    print("Subidos:", uploaded)
    print("Errores:", errors)

    if not UPLOAD_TO_CLOUDINARY:
        print("\nMODO DE PRUEBA: no se modificó nada.")


main()
