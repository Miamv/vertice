import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useOutletContext, Link } from 'react-router-dom';
import {
  getProject,
  createProject,
  updateProject,
  getProfiles,
  getMedia,
  createMedia,
  updateMedia,
  deleteMedia,
  resolveMediaUrl,
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import { PLAN_KEYS, PLAN_LABELS, normalizePlanType } from '../config/plans';
import LoadingSpinner from '../components/LoadingSpinner';

const CATEGORIES = [
  { value: 'architecture', label: 'Arquitectura' },
  { value: 'design', label: 'Diseño' },
  { value: 'interior_design', label: 'Diseño Interior' },
  { value: 'photography', label: 'Fotografía' },
  { value: 'render', label: 'Render' },
  { value: 'other', label: 'Otro' },
];

const MEDIA_TYPES = [
  { value: 'render', label: 'Render' },
  { value: 'image', label: 'Imagen / Plano' },
];

const MAX_MEDIA_SIZE = 10 * 1024 * 1024;
const MEDIA_MIME_TYPES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
};

function validateMediaFile(file) {
  if (file.size > MAX_MEDIA_SIZE) {
    return 'El archivo no puede superar los 10 MiB.';
  }

  const extension = file.name.split('.').pop()?.toLowerCase();
  const expectedMimeType = MEDIA_MIME_TYPES[extension];
  if (!expectedMimeType) {
    return 'Formato no permitido. Subí una imagen compatible.';
  }
  if (file.type && file.type !== expectedMimeType) {
    return 'El tipo de archivo no coincide con su extensión.';
  }

  return null;
}

const ZONE_OPTIONS = [
  { value: '', label: 'Sin zona' },
  { value: 'exterior', label: 'Exterior' },
  { value: 'interior', label: 'Interior' },
];

const PLAN_OPTIONS = [
  { value: '', label: 'Ninguno (Render / Galería general)' },
  ...PLAN_KEYS.map((key) => ({
    value: key,
    label: PLAN_LABELS[key] || key,
  })),
];

export default function ProjectForm() {
  const { id } = useParams();
  const isEditing = Boolean(id);
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const { user } = useAuth();
  const outletContext = useOutletContext();
  const activeStudio = outletContext?.studioContext?.profile || null;

  const role = (user?.role || '').toLowerCase();
  const isAdmin = role === 'admin';
  const isAdminOrOwner = role === 'admin' || role === 'owner';
  const isCollaborator = role === 'collaborator';

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'architecture',
    order: 1,
    location: '',
    google_earth_url: '',
    profile: activeStudio?.id || '',
  });

  const [profiles, setProfiles] = useState([]);
  const [existingMedia, setExistingMedia] = useState([]);
  const [pendingMedia, setPendingMedia] = useState([]);

  const [draftMedia, setDraftMedia] = useState({
    file: null,
    previewUrl: null,
    media_type: 'render',
    zone: '',
    plan_type: '',
  });

  const [previewModalUrl, setPreviewModalUrl] = useState(null);
  const [updatingMediaId, setUpdatingMediaId] = useState(null);
  const [deletingMediaId, setDeletingMediaId] = useState(null);
  const [mediaFeedback, setMediaFeedback] = useState(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const [prevActiveStudioId, setPrevActiveStudioId] = useState(activeStudio?.id);
  if (!isEditing && activeStudio?.id && prevActiveStudioId !== activeStudio.id) {
    setPrevActiveStudioId(activeStudio.id);
    setFormData((prev) => ({ ...prev, profile: activeStudio.id }));
  }

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      setLoading(true);
      setError(null);
      try {
        const [profilesRes, projectRes] = await Promise.all([
          getProfiles(!isAdmin ? { mine: 1 } : undefined),
          isEditing ? getProject(id) : Promise.resolve(null),
        ]);

        if (cancelled) return;

        const profilesData = Array.isArray(profilesRes.data)
          ? profilesRes.data
          : (profilesRes.data?.results ?? []);
        setProfiles(profilesData);

        if (isEditing && projectRes) {
          const p = projectRes.data;
          setFormData({
            title: p.title || '',
            description: p.description || '',
            category: p.category || 'architecture',
            order: p.order ?? 1,
            location: p.location || '',
            google_earth_url: p.google_earth_url || '',
            profile: p.profile || activeStudio?.id || (profilesData[0]?.id ?? ''),
          });

          let mediaItems = Array.isArray(p.media) ? p.media : null;
          if (mediaItems === null) {
            try {
              const mRes = await getMedia(id);
              mediaItems = Array.isArray(mRes.data)
                ? mRes.data
                : (mRes.data?.results ?? []);
            } catch {
              mediaItems = [];
            }
          }
          if (!cancelled) {
            setExistingMedia(mediaItems);
          }
        } else if (activeStudio?.id || profilesData.length > 0) {
          setFormData((prev) => ({
            ...prev,
            profile: activeStudio?.id || prev.profile || profilesData[0]?.id || '',
          }));
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err?.response?.data?.detail ||
              err?.message ||
              'Error al cargar los datos del formulario.'
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    initialize();

    return () => {
      cancelled = true;
    };
  }, [id, isEditing, isAdmin, activeStudio?.id]);

  useEffect(() => {
    return () => {
      if (draftMedia.previewUrl) {
        URL.revokeObjectURL(draftMedia.previewUrl);
      }
      pendingMedia.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleChange(e) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: null }));
    }
  }

  function handleDraftFileChange(e) {
    const file = e.target.files?.[0] || null;
    if (draftMedia.previewUrl) {
      URL.revokeObjectURL(draftMedia.previewUrl);
    }
    const previewUrl = file ? URL.createObjectURL(file) : null;
    setDraftMedia((prev) => ({
      ...prev,
      file,
      previewUrl,
    }));
  }

  function handleDraftFieldChange(e) {
    const { name, value } = e.target;
    setDraftMedia((prev) => {
      const next = { ...prev, [name]: value };
      if (name === 'plan_type' && value && prev.media_type === 'render') {
        next.media_type = 'image';
      }
      return next;
    });
  }

  function handleStageMedia() {
    if (!draftMedia.file) {
      setMediaFeedback({
        type: 'warning',
        message: 'Seleccioná un archivo antes de agregarlo a la lista del proyecto.',
      });
      return;
    }

    const fileError = validateMediaFile(draftMedia.file);
    if (fileError) {
      setMediaFeedback({ type: 'warning', message: fileError });
      return;
    }

    setMediaFeedback(null);
    setPendingMedia((prev) => [
      ...prev,
      {
        tempId: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file: draftMedia.file,
        previewUrl: draftMedia.previewUrl,
        media_type: draftMedia.media_type || 'image',
        zone: draftMedia.zone || '',
        plan_type: draftMedia.plan_type || '',
      },
    ]);

    setDraftMedia({
      file: null,
      previewUrl: null,
      media_type: 'render',
      zone: '',
      plan_type: '',
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function handleRemovePendingMedia(tempId) {
    setPendingMedia((prev) => {
      const target = prev.find((m) => m.tempId === tempId);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((m) => m.tempId !== tempId);
    });
  }

  function handleUpdatePendingField(tempId, field, value) {
    setPendingMedia((prev) =>
      prev.map((item) => {
        if (item.tempId !== tempId) return item;
        const updated = { ...item, [field]: value };
        if (field === 'plan_type' && value && item.media_type === 'render') {
          updated.media_type = 'image';
        }
        return updated;
      })
    );
  }

  async function handleUpdateExistingMedia(mediaItem, changes) {
    setUpdatingMediaId(mediaItem.id);
    setMediaFeedback(null);
    try {
      const payload = { ...changes };
      if ('plan_type' in payload && !payload.plan_type) {
        payload.plan_type = null;
      }
      const res = await updateMedia(mediaItem.id, payload);
      setExistingMedia((prev) =>
        prev.map((m) => (m.id === mediaItem.id ? res.data : m))
      );
      setMediaFeedback({
        type: 'success',
        message: 'Clasificación del archivo actualizada correctamente.',
      });
    } catch (err) {
      setMediaFeedback({
        type: 'danger',
        message:
          err?.response?.data?.detail ||
          'No se pudo actualizar el archivo multimedia.',
      });
    } finally {
      setUpdatingMediaId(null);
    }
  }

  async function handleDeleteExistingMedia(mediaItem) {
    const confirmed = window.confirm(
      '¿Estás seguro de que deseás eliminar este archivo multimedia del proyecto?'
    );
    if (!confirmed) return;

    setDeletingMediaId(mediaItem.id);
    setMediaFeedback(null);
    try {
      await deleteMedia(mediaItem.id);
      setExistingMedia((prev) => prev.filter((m) => m.id !== mediaItem.id));
      setMediaFeedback({
        type: 'success',
        message: 'Archivo eliminado del proyecto.',
      });
    } catch (err) {
      setMediaFeedback({
        type: 'danger',
        message:
          err?.response?.data?.detail ||
          'Error al eliminar el archivo multimedia.',
      });
    } finally {
      setDeletingMediaId(null);
    }
  }

  async function uploadMediaQueue(projectId, itemsToUpload) {
    for (const item of itemsToUpload) {
      const fd = new FormData();
      fd.append('project', projectId);
      fd.append('file', item.file);
      fd.append('media_type', item.media_type || 'image');
      if (item.zone) {
        fd.append('zone', item.zone);
      }
      if (item.plan_type) {
        fd.append('plan_type', item.plan_type);
      }
      await createMedia(fd);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setMediaFeedback(null);

    const queue = [...pendingMedia];
    if (draftMedia.file) {
      queue.push({
        file: draftMedia.file,
        media_type: draftMedia.media_type || (draftMedia.plan_type ? 'image' : 'render'),
        zone: draftMedia.zone || '',
        plan_type: draftMedia.plan_type || '',
      });
    }

    const invalidUpload = queue.find((item) => validateMediaFile(item.file));
    if (invalidUpload) {
      setMediaFeedback({
        type: 'danger',
        message: validateMediaFile(invalidUpload.file),
      });
      return;
    }

    if (isCollaborator && isEditing) {
      setSubmitting(true);
      try {
        if (queue.length > 0) {
          await uploadMediaQueue(id, queue);
        }
        navigate('/admin');
      } catch (err) {
        setError(
          err.response?.data?.detail ||
            err.message ||
            'No se pudieron subir los archivos multimedia.'
        );
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const errors = {};
    if (!formData.title.trim()) errors.title = 'El título es obligatorio.';
    if (!formData.description.trim()) errors.description = 'La descripción es obligatoria.';
    if (!formData.category) errors.category = 'Seleccioná una categoría.';
    if (!formData.profile) errors.profile = 'Debés asociar el proyecto a un perfil profesional.';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    const payload = {
      title: formData.title.trim(),
      description: formData.description.trim(),
      category: formData.category,
      order: Math.max(1, parseInt(formData.order, 10) || 1),
      location: formData.location.trim(),
      google_earth_url: formData.google_earth_url.trim(),
      profile: Number(formData.profile),
    };

    try {
      let savedProjectId = id;
      if (isEditing) {
        await updateProject(id, payload);
      } else {
        const createdRes = await createProject(payload);
        savedProjectId = createdRes.data?.id;
      }

      if (savedProjectId && queue.length > 0) {
        await uploadMediaQueue(savedProjectId, queue);
      }

      navigate('/admin', {
        state: {
          feedback: `Proyecto "${formData.title}" ${isEditing ? 'actualizado' : 'creado'} con éxito.`,
        },
      });
    } catch (err) {
      if (err.response?.status === 400 && err.response.data) {
        setFieldErrors(err.response.data);
      } else if (err.response?.status === 403) {
        setError('No tenés permisos para realizar esta acción sobre este perfil de proyecto.');
      } else {
        setError(
          err.response?.data?.detail ||
            err.message ||
            'Ocurrió un error inesperado al guardar el proyecto.'
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="container py-5 text-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (isCollaborator && !isEditing) {
    return (
      <div className="container py-5 my-4 text-center">
        <div className="mx-auto p-4 p-md-5 rounded-4 border bg-white" style={{ maxWidth: '560px' }}>
          <h1 className="h5 fw-bold mb-2">Creación reservada a Propietarios y Administradores</h1>
          <p className="text-muted small mb-4">
            Con rol de Colaborador podés ingresar a editar proyectos existentes de tu estudio para subir renders y clasificar planos técnicos.
          </p>
          <Link to="/admin" className="btn btn-dark rounded-pill px-4">
            Volver al Panel
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-4 py-md-5">
      <div className="mx-auto" style={{ maxWidth: '820px' }}>
        <nav aria-label="breadcrumb" className="mb-3">
          <ol className="breadcrumb small">
            <li className="breadcrumb-item">
              <Link to="/admin" className="text-decoration-none text-muted">
                Administración {activeStudio ? `(${activeStudio.name})` : ''}
              </Link>
            </li>
            <li className="breadcrumb-item active" aria-current="page">
              {isEditing ? 'Editar Proyecto' : 'Nuevo Proyecto'}
            </li>
          </ol>
        </nav>

        <div
          className="p-4 p-md-5 rounded-4 shadow-sm"
          style={{ background: '#fff', border: '1px solid rgba(15,27,42,0.08)' }}
        >
          <div className="mb-4 pb-2 border-bottom">
            <h1 className="h4 fw-bold mb-1" style={{ color: 'var(--color-ink)' }}>
              {isEditing ? `Editar: ${formData.title || 'Proyecto'}` : 'Crear Nuevo Proyecto'}
            </h1>
            <p className="text-muted small mb-0">
              {isCollaborator
                ? 'Gestioná los renders y planos técnicos (Planimetría, Planta, Cortes, Vistas, Detalle) de esta obra.'
                : 'Completá los datos del proyecto y adjuntá sus renders y planos técnicos (Planimetría, Planta, Cortes, Vistas, Detalle).'}
            </p>
          </div>

          {error && (
            <div className="alert alert-danger rounded-3 small mb-4" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="mb-3">
              <label htmlFor="title" className="form-label small fw-semibold">
                Título del Proyecto <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                id="title"
                name="title"
                className={`form-control rounded-3 ${fieldErrors.title ? 'is-invalid' : ''}`}
                value={formData.title}
                onChange={handleChange}
                placeholder="Ej. Casa Bosque, Módulo Chakal"
                disabled={submitting || isCollaborator}
                required
              />
              {fieldErrors.title && (
                <div className="invalid-feedback small">
                  {Array.isArray(fieldErrors.title) ? fieldErrors.title.join(' ') : fieldErrors.title}
                </div>
              )}
            </div>

            <div className="row g-3 mb-3">
              <div className="col-md-5">
                <label htmlFor="category" className="form-label small fw-semibold">
                  Categoría <span className="text-danger">*</span>
                </label>
                <select
                  id="category"
                  name="category"
                  className={`form-select rounded-3 ${fieldErrors.category ? 'is-invalid' : ''}`}
                  value={formData.category}
                  onChange={handleChange}
                  disabled={submitting || isCollaborator}
                  required
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
                {fieldErrors.category && (
                  <div className="invalid-feedback small">
                    {Array.isArray(fieldErrors.category)
                      ? fieldErrors.category.join(' ')
                      : fieldErrors.category}
                  </div>
                )}
              </div>

              <div className="col-md-5">
                <label htmlFor="profile" className="form-label small fw-semibold">
                  Estudio Profesional <span className="text-danger">*</span>
                </label>
                <select
                  id="profile"
                  name="profile"
                  className={`form-select rounded-3 ${fieldErrors.profile ? 'is-invalid' : ''}`}
                  value={formData.profile}
                  onChange={handleChange}
                  disabled={submitting || !isAdmin || profiles.length <= 1}
                  required
                >
                  {profiles.length === 0 ? (
                    <option value="">No hay perfiles disponibles</option>
                  ) : (
                    profiles.map((pr) => (
                      <option key={pr.id} value={pr.id}>
                        {pr.name}
                      </option>
                    ))
                  )}
                </select>
                {fieldErrors.profile && (
                  <div className="invalid-feedback small">
                    {Array.isArray(fieldErrors.profile)
                      ? fieldErrors.profile.join(' ')
                      : fieldErrors.profile}
                  </div>
                )}
              </div>

              <div className="col-md-2">
                <label htmlFor="order" className="form-label small fw-semibold">
                  Orden Visual
                </label>
                <input
                  type="number"
                  id="order"
                  name="order"
                  min="1"
                  className={`form-control rounded-3 ${fieldErrors.order ? 'is-invalid' : ''}`}
                  value={formData.order}
                  onChange={handleChange}
                  disabled={submitting || !isAdminOrOwner}
                />
                {fieldErrors.order ? (
                  <div className="invalid-feedback small">
                    {Array.isArray(fieldErrors.order)
                      ? fieldErrors.order.join(' ')
                      : fieldErrors.order}
                  </div>
                ) : (
                  <div className="form-text" style={{ fontSize: '0.7rem' }}>
                    1 = 1°, 2 = 2°...
                  </div>
                )}
              </div>
            </div>

            <div className="mb-3">
              <label htmlFor="description" className="form-label small fw-semibold">
                Memoria Descriptiva / Descripción <span className="text-danger">*</span>
              </label>
              <textarea
                id="description"
                name="description"
                rows="5"
                className={`form-control rounded-3 ${fieldErrors.description ? 'is-invalid' : ''}`}
                value={formData.description}
                onChange={handleChange}
                placeholder="Explicá las características espaciales, materialidad y concepto arquitectónico..."
                disabled={submitting || isCollaborator}
                required
              />
              {fieldErrors.description && (
                <div className="invalid-feedback small">
                  {Array.isArray(fieldErrors.description)
                    ? fieldErrors.description.join(' ')
                    : fieldErrors.description}
                </div>
              )}
            </div>

            <div className="row g-3 mb-3">
              <div className="col-md-5">
                <label htmlFor="location" className="form-label small fw-semibold">
                  Ubicación de la Obra (Opcional)
                </label>
                <input
                  type="text"
                  id="location"
                  name="location"
                  className={`form-control rounded-3 ${fieldErrors.location ? 'is-invalid' : ''}`}
                  value={formData.location}
                  onChange={handleChange}
                  placeholder="Ej. Chacras de Coria, Mendoza"
                  disabled={submitting || !isAdminOrOwner}
                />
                {fieldErrors.location ? (
                  <div className="invalid-feedback small">
                    {Array.isArray(fieldErrors.location)
                      ? fieldErrors.location.join(' ')
                      : fieldErrors.location}
                  </div>
                ) : (
                  <div className="form-text" style={{ fontSize: '0.73rem' }}>
                    Texto visible en la pestaña Ubicación del visor.
                  </div>
                )}
              </div>

              <div className="col-md-7">
                <label htmlFor="google_earth_url" className="form-label small fw-semibold">
                  Enlace de Ubicación — Google Maps / Earth (Opcional)
                </label>
                <input
                  type="url"
                  id="google_earth_url"
                  name="google_earth_url"
                  className={`form-control rounded-3 ${fieldErrors.google_earth_url ? 'is-invalid' : ''}`}
                  value={formData.google_earth_url}
                  onChange={handleChange}
                  placeholder="https://maps.google.com/... o https://earth.google.com/..."
                  disabled={submitting || !isAdminOrOwner}
                />
                {fieldErrors.google_earth_url ? (
                  <div className="invalid-feedback small">
                    {Array.isArray(fieldErrors.google_earth_url)
                      ? fieldErrors.google_earth_url.join(' ')
                      : fieldErrors.google_earth_url}
                  </div>
                ) : (
                  <div className="form-text" style={{ fontSize: '0.73rem' }}>
                    Enlace que abrirá el botón &ldquo;Ver ubicación&rdquo; del proyecto.
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 pt-4 border-top">
              <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
                <div>
                  <h2 className="h6 fw-bold mb-1" style={{ color: 'var(--color-ink)' }}>
                    Renders, Imágenes y Planos Técnicos
                  </h2>
                  <p className="text-muted small mb-0">
                    Subí renders de galería o clasificá láminas técnicas bajo su tipo de plano para habilitar las pestañas del visor.
                  </p>
                </div>
                <span className="badge bg-light text-dark border rounded-pill px-3 py-1">
                  {existingMedia.length + pendingMedia.length} archivo(s)
                </span>
              </div>

              {mediaFeedback && (
                <div
                  className={`alert alert-${mediaFeedback.type} alert-dismissible fade show rounded-3 small py-2 px-3 my-3`}
                  role="alert"
                >
                  {mediaFeedback.message}
                  <button
                    type="button"
                    className="btn-close"
                    style={{ padding: '0.6rem' }}
                    onClick={() => setMediaFeedback(null)}
                    aria-label="Cerrar"
                  />
                </div>
              )}

              <div
                className="p-3 rounded-3 mb-4 mt-3"
                style={{ background: '#f8fafc', border: '1px dashed rgba(15,27,42,0.18)' }}
              >
                <div className="row g-3 align-items-end">
                  <div className="col-12 col-md-5">
                    <label htmlFor="mediaFileInput" className="form-label small fw-semibold mb-1">
                      Archivo (Imagen / Plano / Render)
                    </label>
                    <input
                      ref={fileInputRef}
                      id="mediaFileInput"
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp,.avif,.gif,.svg,.bmp,image/jpeg,image/png,image/webp,image/avif,image/gif,image/svg+xml,image/bmp"
                      className="form-control form-control-sm rounded-3"
                      onChange={handleDraftFileChange}
                      disabled={submitting}
                    />
                  </div>

                  <div className="col-6 col-md-3">
                    <label htmlFor="draftMediaType" className="form-label small fw-semibold mb-1">
                      Tipo de Medio
                    </label>
                    <select
                      id="draftMediaType"
                      name="media_type"
                      className="form-select form-select-sm rounded-3"
                      value={draftMedia.media_type}
                      onChange={handleDraftFieldChange}
                      disabled={submitting}
                    >
                      {MEDIA_TYPES.map((mt) => (
                        <option key={mt.value} value={mt.value}>
                          {mt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-6 col-md-4">
                    <label htmlFor="draftPlanType" className="form-label small fw-semibold mb-1">
                      Categoría de Plano
                    </label>
                    <select
                      id="draftPlanType"
                      name="plan_type"
                      className="form-select form-select-sm rounded-3"
                      value={draftMedia.plan_type}
                      onChange={handleDraftFieldChange}
                      disabled={submitting}
                    >
                      {PLAN_OPTIONS.map((po) => (
                        <option key={po.value} value={po.value}>
                          {po.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-6 col-md-4">
                    <label htmlFor="draftZone" className="form-label small fw-semibold mb-1">
                      Zona (Opcional)
                    </label>
                    <select
                      id="draftZone"
                      name="zone"
                      className="form-select form-select-sm rounded-3"
                      value={draftMedia.zone}
                      onChange={handleDraftFieldChange}
                      disabled={submitting}
                    >
                      {ZONE_OPTIONS.map((zo) => (
                        <option key={zo.value} value={zo.value}>
                          {zo.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-6 col-md-8 d-flex justify-content-end align-items-center gap-2">
                    {draftMedia.previewUrl && draftMedia.file?.type.startsWith('image/') && (
                      <img
                        src={draftMedia.previewUrl}
                        alt="Vista previa"
                        className="rounded-2 border"
                        style={{ width: '44px', height: '34px', objectFit: 'cover' }}
                      />
                    )}
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-dark rounded-pill px-3 fw-semibold"
                      onClick={handleStageMedia}
                      disabled={submitting}
                    >
                      + Agregar archivo a la lista
                    </button>
                  </div>
                </div>
              </div>

              {pendingMedia.length > 0 && (
                <div className="mb-4">
                  <h3 className="small fw-bold text-uppercase text-muted mb-2" style={{ fontSize: '0.72rem', letterSpacing: '0.06em' }}>
                    Archivos listos para subir al guardar ({pendingMedia.length})
                  </h3>
                  <div className="d-flex flex-column gap-2">
                    {pendingMedia.map((item) => (
                      <div
                        key={item.tempId}
                        className="d-flex align-items-center justify-content-between gap-2 p-2 rounded-3 border bg-white flex-wrap"
                      >
                        <div className="d-flex align-items-center gap-2" style={{ minWidth: '180px' }}>
                          {item.previewUrl && item.file.type.startsWith('image/') ? (
                            <img
                              src={item.previewUrl}
                              alt={item.file.name}
                              className="rounded-2 border"
                              style={{ width: '54px', height: '40px', objectFit: 'cover', cursor: 'pointer' }}
                              onClick={() => setPreviewModalUrl(item.previewUrl)}
                              title="Clic para ampliar"
                            />
                          ) : (
                            <div
                              className="rounded-2 d-flex align-items-center justify-content-center bg-light text-muted small"
                              style={{ width: '54px', height: '40px', fontSize: '0.68rem' }}
                            >
                              Archivo
                            </div>
                          )}
                          <div className="text-truncate" style={{ maxWidth: '180px' }}>
                            <span className="d-block small fw-semibold text-truncate" title={item.file.name}>
                              {item.file.name}
                            </span>
                            <span className="badge bg-warning-subtle text-dark border" style={{ fontSize: '0.65rem' }}>
                              Pendiente de guardar
                            </span>
                          </div>
                        </div>

                        <div className="d-flex align-items-center gap-2 flex-wrap">
                          <select
                            className="form-select form-select-sm rounded-3"
                            style={{ width: '140px', fontSize: '0.78rem' }}
                            value={item.media_type}
                            onChange={(e) => handleUpdatePendingField(item.tempId, 'media_type', e.target.value)}
                            disabled={submitting}
                            aria-label="Tipo de medio"
                          >
                            {MEDIA_TYPES.map((mt) => (
                              <option key={mt.value} value={mt.value}>
                                {mt.label}
                              </option>
                            ))}
                          </select>

                          <select
                            className="form-select form-select-sm rounded-3"
                            style={{ width: '180px', fontSize: '0.78rem' }}
                            value={item.plan_type}
                            onChange={(e) => handleUpdatePendingField(item.tempId, 'plan_type', e.target.value)}
                            disabled={submitting}
                            aria-label="Tipo de plano"
                          >
                            {PLAN_OPTIONS.map((po) => (
                              <option key={po.value} value={po.value}>
                                {po.label}
                              </option>
                            ))}
                          </select>

                          {item.previewUrl && (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-secondary rounded-pill px-2"
                              onClick={() => setPreviewModalUrl(item.previewUrl)}
                            >
                              Ver
                            </button>
                          )}

                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger rounded-pill px-2"
                            onClick={() => handleRemovePendingMedia(item.tempId)}
                            disabled={submitting}
                          >
                            Quitar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {existingMedia.length > 0 ? (
                <div className="mb-3">
                  <h3 className="small fw-bold text-uppercase text-muted mb-2" style={{ fontSize: '0.72rem', letterSpacing: '0.06em' }}>
                    Archivos guardados en el proyecto ({existingMedia.length})
                  </h3>
                  <div className="d-flex flex-column gap-2">
                    {existingMedia.map((item) => {
                      const fileUrl = resolveMediaUrl(item.file || item.url);
                      const normalizedPlan = normalizePlanType(item.plan_type) || '';
                      const isUpdating = updatingMediaId === item.id;
                      const isDeleting = deletingMediaId === item.id;
                      const fileName = fileUrl ? decodeURIComponent(fileUrl.split('/').pop() || `Media #${item.id}`) : `Media #${item.id}`;

                      return (
                        <div
                          key={item.id}
                          className="d-flex align-items-center justify-content-between gap-2 p-2 rounded-3 border bg-white flex-wrap"
                        >
                          <div className="d-flex align-items-center gap-2" style={{ minWidth: '180px' }}>
                            {fileUrl ? (
                              <img
                                src={fileUrl}
                                alt={fileName}
                                className="rounded-2 border"
                                style={{ width: '54px', height: '40px', objectFit: 'cover', cursor: 'pointer' }}
                                onClick={() => setPreviewModalUrl(fileUrl)}
                                title="Clic para previsualizar"
                              />
                            ) : (
                              <div
                                className="rounded-2 d-flex align-items-center justify-content-center bg-light text-muted small"
                                style={{ width: '54px', height: '40px', fontSize: '0.68rem' }}
                              >
                                Sin vista
                              </div>
                            )}
                            <div className="text-truncate" style={{ maxWidth: '180px' }}>
                              <span className="d-block small fw-semibold text-truncate" title={fileName}>
                                {fileName}
                              </span>
                              <span className="text-muted" style={{ fontSize: '0.7rem' }}>
                                ID #{item.id} {normalizedPlan ? `· Plano: ${PLAN_LABELS[normalizedPlan] || normalizedPlan}` : '· Galería / Render'}
                              </span>
                            </div>
                          </div>

                          <div className="d-flex align-items-center gap-2 flex-wrap">
                            <select
                              className="form-select form-select-sm rounded-3"
                              style={{ width: '140px', fontSize: '0.78rem' }}
                              value={item.media_type || 'image'}
                              onChange={(e) =>
                                handleUpdateExistingMedia(item, { media_type: e.target.value })
                              }
                              disabled={isUpdating || isDeleting || submitting}
                              aria-label="Tipo de medio"
                            >
                              {MEDIA_TYPES.map((mt) => (
                                <option key={mt.value} value={mt.value}>
                                  {mt.label}
                                </option>
                              ))}
                            </select>

                            <select
                              className="form-select form-select-sm rounded-3"
                              style={{ width: '180px', fontSize: '0.78rem' }}
                              value={normalizedPlan}
                              onChange={(e) => {
                                const newPlan = e.target.value;
                                const payload = { plan_type: newPlan || null };
                                if (newPlan && item.media_type === 'render') {
                                  payload.media_type = 'image';
                                }
                                handleUpdateExistingMedia(item, payload);
                              }}
                              disabled={isUpdating || isDeleting || submitting}
                              aria-label="Tipo de plano"
                            >
                              {PLAN_OPTIONS.map((po) => (
                                <option key={po.value} value={po.value}>
                                  {po.label}
                                </option>
                              ))}
                            </select>

                            {fileUrl && (
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary rounded-pill px-2"
                                onClick={() => setPreviewModalUrl(fileUrl)}
                              >
                                Ver
                              </button>
                            )}

                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger rounded-pill px-2"
                              onClick={() => handleDeleteExistingMedia(item)}
                              disabled={isUpdating || isDeleting || submitting}
                            >
                              {isDeleting ? '...' : 'Eliminar'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                pendingMedia.length === 0 && (
                  <p className="text-muted small fst-italic mb-3">
                    Este proyecto aún no tiene archivos multimedia ni planos técnicos asociados.
                  </p>
                )
              )}
            </div>

            <div className="d-flex justify-content-end align-items-center gap-2 pt-3 mt-4 border-top">
              <Link
                to="/admin"
                className="btn btn-outline-secondary rounded-pill px-4"
                tabIndex={submitting ? -1 : 0}
              >
                Cancelar
              </Link>
              <button
                type="submit"
                className="btn btn-dark rounded-pill px-4 fw-semibold d-inline-flex align-items-center gap-2"
                disabled={submitting}
              >
                {submitting && (
                  <span
                    className="spinner-border spinner-border-sm"
                    role="status"
                    aria-hidden="true"
                  />
                )}
                {isCollaborator
                  ? 'Guardar Archivos Multimedia'
                  : isEditing
                  ? 'Actualizar Proyecto'
                  : 'Guardar Proyecto'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {previewModalUrl && (
        <div
          className="image-fullscreen-overlay"
          onClick={() => setPreviewModalUrl(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Previsualización de archivo"
        >
          <button
            type="button"
            className="image-fullscreen-close"
            onClick={() => setPreviewModalUrl(null)}
            aria-label="Cerrar vista previa"
          >
            &times;
          </button>
          <img
            src={previewModalUrl}
            alt="Previsualización de plano o render"
            className="image-fullscreen-img"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
