<div align="center">

# Vértice

### Plataforma multiestudio para presentar proyectos de arquitectura y diseño

![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?logo=python&logoColor=white)
![Django](https://img.shields.io/badge/Django-5.2-092E20?logo=django&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-database-4169E1?logo=postgresql&logoColor=white)

</div>

Vértice es una plataforma web multiestudio pensada para que profesionales y equipos de arquitectura, diseño y disciplinas creativas puedan reunir sus trabajos en un portfolio digital. Cada estudio construye una presencia propia, organiza sus proyectos y comparte páginas públicas con clientes o visitantes.

El proyecto combina presentación visual y gestión de contenido: además de mostrar imágenes, renders y documentación de cada obra, ofrece herramientas para mantener la información del estudio, colaborar en proyectos y recibir consultas. La experiencia busca que una persona pueda conocer un proyecto desde un enlace directo y ponerse en contacto con el estudio sin tener que crear una cuenta.

> **Estado:** en desarrollo. Todavía no hay una versión pública desplegada.

## Contenidos

- [Propósito](#propósito)
- [Qué ofrece hoy](#qué-ofrece-hoy)
- [Ideas de evolución](#ideas-de-evolución)
- [Arquitectura](#arquitectura)
- [Modelo multiestudio y permisos](#modelo-multiestudio-y-permisos)
- [Tecnologías](#tecnologías)
- [Estructura](#estructura-del-repositorio)
- [Ejecución local](#ejecución-local)
- [Variables de entorno](#variables-de-entorno)
- [API y documentación](#api-y-documentación)
- [Preparación para producción](#preparación-para-producción)

## Propósito

Vértice busca facilitar la creación y administración de portfolios profesionales en un espacio que puede alojar más de un estudio. La plataforma organiza la información para que cada equipo presente su identidad, sus servicios y sus proyectos de manera coherente, y para que cada proyecto tenga una página propia que se pueda compartir directamente.

El modelo separa la administración del contenido de la identidad del estudio. La plataforma puede administrar la estructura general, mientras que cada perfil concentra la información profesional, los trabajos y las consultas que le corresponden. Así, varios estudios pueden convivir sin mezclar su contenido.

Los objetivos que orientan el proyecto son:

- Dar a cada profesional o estudio un espacio propio para presentar su identidad y sus servicios.
- Organizar uno o varios proyectos en un portfolio visual coherente.
- Compartir cada proyecto mediante un enlace directo y fácil de abrir.
- Permitir que los equipos colaboren sin perder de vista a qué estudio pertenece cada contenido.
- Facilitar el contacto entre quienes visitan el portfolio y los profesionales responsables.

## Qué ofrece hoy

- Perfiles públicos de estudios con información de contacto, servicios y ubicación.
- Proyectos asociados a un estudio, con galería de imágenes/renders y planos técnicos en formato de imagen.
- Sección institucional y miembros del equipo.
- Consultas de visitantes relacionadas con un estudio y, opcionalmente, un proyecto.
- Registro, inicio de sesión con JWT y cierre de sesión con invalidación del token de refresco.
- Panel de administración y permisos para administración de plataforma, propietarios y colaboradores.

El sistema permite asociar un proyecto con su estudio, categoría, descripción y ubicación. Sus medios se relacionan con ese proyecto; el contenido institucional, el equipo y las consultas se relacionan con el perfil correspondiente.

## Ideas de evolución

La idea original contempla ampliar la presentación más allá de las galerías: recorridos virtuales, experiencias 360°, modelos 3D y otros recursos interactivos podrían enriquecer la forma de explorar los proyectos. También se planteó distinguir entre el estado de publicación de un proyecto y su situación comercial. Estas ideas forman parte de la visión del producto, pero todavía no están implementadas en el sistema actual.

## Arquitectura

```text
Navegador ── React + Vite (frontend/) ── REST/JSON ── Django + DRF (backend/)
                                                        ├── PostgreSQL
                                                        └── Cloudinary (medios en producción)
```

En desarrollo, los archivos se guardan en `backend/media/`. Para el despliegue previsto, Django usa Cloudinary para los medios y WhiteNoise para los archivos estáticos. Los datos de negocio permanecen en PostgreSQL; Cloudinary guarda los archivos, no reemplaza la base de datos.

## Modelo multiestudio y permisos

Un usuario puede estar asociado a varios perfiles profesionales. Cada perfil agrupa sus proyectos, contenido institucional, equipo y consultas. Cada proyecto pertenece a un único perfil y sus medios pertenecen al proyecto.

| Entidad | Función dentro de la plataforma |
| --- | --- |
| Usuario | Se autentica y recibe permisos según su rol y los estudios a los que está asociado. |
| Perfil profesional | Reúne identidad, descripción, servicios, contacto, equipo y proyectos de un estudio. |
| Proyecto | Presenta un trabajo con título, descripción, categoría, ubicación y página compartible. |
| Medio | Adjunta imágenes, renders o planos a un proyecto. |
| Consulta | Registra un mensaje de un visitante para el perfil y, si corresponde, un proyecto. |

Los perfiles públicos se visitan mediante su slug (`/estudios/:slug`) y los proyectos tienen una ruta propia (`/estudios/:slug/proyecto/:id`).

| Rol | Alcance implementado |
| --- | --- |
| `ADMIN` | Administra la plataforma y sus perfiles, proyectos y contenido. |
| `OWNER` | Edita perfiles asociados, crea y elimina proyectos, gestiona sus medios y consultas. |
| `COLLABORATOR` | Edita proyectos y carga medios de los estudios a los que está asociado; puede consultar sus consultas recibidas. |
| `VIEWER` | Rol inicial del registro; no tiene permisos de edición en la API. |
| Visitante | Puede consultar los recursos públicos y enviar consultas de contacto. No es una cuenta ni un rol de usuario. |

Los permisos se comprueban en la API y tienen en cuenta tanto el rol como la asociación del usuario con cada estudio. El visitante es público y no forma parte de los roles de cuenta: puede recorrer perfiles y proyectos disponibles y enviar una consulta sin registrarse.

## Tecnologías

| Área | Tecnologías |
| --- | --- |
| Backend | Python, Django 5.2, Django REST Framework, SimpleJWT, drf-spectacular |
| Datos | PostgreSQL, psycopg 3 |
| Archivos | Cloudinary y `django-cloudinary-storage` en producción; almacenamiento local en desarrollo |
| Frontend | React 19, React Router, Axios, Vite 8 |
| Producción prevista | Railway (Django/PostgreSQL), Vercel (frontend), Cloudinary (medios) |

## Estructura del repositorio

```text
backend/
├── core/                 # perfiles, proyectos, medios, equipo y contactos
├── users/                # registro, perfil, permisos y autenticación
├── studio/               # settings, URLs y WSGI de Django
├── requirements.txt
└── manage.py
frontend/
├── src/                  # vistas, componentes y cliente de API
├── public/
├── package.json
└── vite.config.js
```

## Ejecución local

Requisitos: Python 3.11 o posterior compatible con las dependencias, Node.js 20.19+ o 22.12+, npm y PostgreSQL.

1. Crea una base PostgreSQL local y un usuario con permiso para conectarse a ella.
2. Copia `backend/.env.example` como `backend/.env` y completa `DJANGO_SECRET_KEY` y las variables `DB_*` con la conexión local. El ejemplo activa `DEBUG` solo para desarrollo.
3. Instala e inicia el backend:

   ```powershell
   python -m venv venv
   .\venv\Scripts\Activate.ps1
   pip install -r backend/requirements.txt
   cd backend
   python manage.py migrate
   python manage.py createsuperuser
   python manage.py runserver
   ```

4. En otra terminal, copia `frontend/.env.example` como `frontend/.env.local`, instala e inicia el frontend:

   ```powershell
   cd frontend
   npm install
   npm run dev
   ```

   Vite muestra la dirección local (normalmente `http://localhost:5173`). La API queda en `http://localhost:8000/api/` y el admin en `http://localhost:8000/admin/`.

Las migraciones locales aplican cambios al esquema de tu base. Antes de ejecutar migraciones sobre datos que quieras conservar, revisa el plan de migración y confirma que exista un respaldo restaurable.

## Variables de entorno

Los archivos `.env` reales no se incluyen en Git. Usa los ejemplos como plantillas y no guardes credenciales en el README.

| Variable | Uso |
| --- | --- |
| `DJANGO_SECRET_KEY` | Clave secreta de Django; obligatoria. |
| `DJANGO_DEBUG` | `True` solo en desarrollo local; en producción debe ser `False`. |
| `DJANGO_ALLOWED_HOSTS` | Hosts permitidos por Django, separados por coma. |
| `DATABASE_URL` | URL PostgreSQL preferida en Railway. |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT` | Alternativa para PostgreSQL local; `PG*` también se admite. |
| `DJANGO_CORS_ALLOWED_ORIGINS` | Orígenes del frontend autorizados por CORS, separados por coma. |
| `DJANGO_CORS_ALLOWED_ORIGIN_REGEXES` | Regex opcionales para previews; limita el patrón a los dominios de tu proyecto Vercel. |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | Orígenes HTTPS confiables para CSRF, separados por coma. |
| `CLOUDINARY_URL` | Credencial de Cloudinary para el backend; se configura como variable privada en Railway. |
| `CLOUDINARY_MEDIA_PREFIX` | Carpeta raíz de medios; por defecto `vertice`. |
| `DJANGO_SECURE_HSTS_SECONDS` | HSTS; mantener en `0` hasta verificar HTTPS y dominios en producción. |

El frontend usa `VITE_API_URL`, `VITE_STUDIO_WHATSAPP_MESSAGE` y `VITE_STUDIO_DEFAULT_LOCATION`. Las variables `VITE_*` se incorporan al bundle del navegador: no deben contener secretos.

## API y documentación

La API usa el prefijo `/api/`. Entre sus rutas están:

| Recurso | Ruta base |
| --- | --- |
| Perfiles | `/api/profiles/` |
| Proyectos | `/api/projects/` |
| Medios | `/api/media/` |
| Consultas | `/api/contacts/` |
| Sección institucional | `/api/about/` |
| Equipo | `/api/team/` |
| Registro, perfil y logout | `/api/auth/` |
| Login y renovación JWT | `/api/auth/login/`, `/api/auth/refresh/` |

Con el backend activo, Swagger está en [`/api/docs/`](http://localhost:8000/api/docs/) y el esquema OpenAPI en [`/api/schema/`](http://localhost:8000/api/schema/).

## Preparación para producción

### Railway — backend

Configura el directorio raíz del servicio como `/backend`, agrega PostgreSQL y define las variables privadas. Railway proporciona `DATABASE_URL`; el backend la usa primero y admite `PG*` o `DB_*` como alternativa. En la configuración del servicio usa `python manage.py collectstatic --noinput` como comando de construcción y `gunicorn studio.wsgi:application --bind 0.0.0.0:$PORT` como inicio. Define `/api/schema/` como healthcheck. No ejecutes migraciones automáticamente al iniciar el servicio: primero hay que revisar las migraciones existentes y decidir el procedimiento de respaldo y aplicación. `backend/.python-version` fija la versión de Python del backend.

### Vercel — frontend

Configura `frontend/` como directorio raíz, `npm run build` como comando de construcción y `dist` como salida. Define `VITE_API_URL` con la URL HTTPS del backend y agrega los dominios de Vercel a CORS/CSRF en Railway. Las previews también necesitan orígenes permitidos si van a consumir el backend.

### Cloudinary — archivos

Las nuevas cargas se guardan bajo el prefijo `vertice/`. El flujo actual admite imágenes y renders, incluidos los planos técnicos en formato de imagen, con un límite de **10 MiB por archivo**.

Durante el desarrollo local, los medios se guardan en el servidor. Al cambiar a Cloudinary, los archivos locales no se transfieren automáticamente.

## Créditos

Proyecto académico desarrollado por **Mia Valeriana Manchaca**.
