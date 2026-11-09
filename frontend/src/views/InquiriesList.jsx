import { useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getContacts, updateContact, deleteContact, getProjects } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';

const CONTACT_STATUS_OPTIONS = [
  {
    value: 'pending',
    label: 'Pendiente',
    meaning: 'Consulta recibida',
    bg: '#fff3bf',
    color: '#8f5b00',
  },
  {
    value: 'in_review',
    label: 'En revisión',
    meaning: 'El estudio está evaluándola',
    bg: '#d0ebff',
    color: '#1864ab',
  },
  {
    value: 'responded',
    label: 'Respondida',
    meaning: 'Ya se respondió',
    bg: '#d3f9d8',
    color: '#2b8a3e',
  },
  {
    value: 'closed',
    label: 'Cerrada',
    meaning: 'La gestión terminó',
    bg: '#e9ecef',
    color: '#495057',
  },
];

function getContactStatusMeta(status) {
  return (
    CONTACT_STATUS_OPTIONS.find((opt) => opt.value === status) || CONTACT_STATUS_OPTIONS[0]
  );
}

function toLocalDateInputValue(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch {
    return String(iso).slice(0, 10);
  }
}

function buildContactReplyMailto(contact, fallbackStudioName = 'Vértice') {
  if (!contact?.email) return '#';
  const rawStudio = (contact.profile_name || fallbackStudioName || 'Vértice').trim();
  const shortStudio = rawStudio.replace(/^Estudio\s+/i, '').trim() || rawStudio;
  const signatureStudio = /^Estudio\s+/i.test(rawStudio)
    ? rawStudio
    : `Estudio ${rawStudio}`;

  const recipientName = (contact.name || '').trim() || 'Interesado/a';

  let topicClause = '';
  const serviceMatch = String(contact.message || '').match(
    /\[Servicio requerido\]:\s*([^\n\r]+)/i
  );
  if (contact.project_title) {
    topicClause = ` sobre el proyecto "${contact.project_title}"`;
  } else if (serviceMatch && serviceMatch[1]?.trim()) {
    topicClause = ` sobre ${serviceMatch[1].trim().toLowerCase()}`;
  }

  const subject = `Respuesta a tu consulta — ${shortStudio}`;
  const body = [
    `Hola, ${recipientName}:`,
    '',
    `Gracias por comunicarte con nuestro estudio. Hemos recibido tu consulta${topicClause} y nos gustaría brindarte más información.`,
    '',
    'Saludos,',
    signatureStudio,
  ].join('\r\n');

  return `mailto:${contact.email.trim()}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;
}

function formatDate(iso) {
  if (!iso) return 'Reciente';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function InquiriesList() {
  const { user } = useAuth();
  const outletContext = useOutletContext();
  const studioContext = outletContext?.studioContext;
  const activeProfile = studioContext?.profile || null;
  const initializingStudio = Boolean(studioContext?.initializingStudio);

  const role = (user?.role || '').toLowerCase();
  const isAdminOrOwner = role === 'admin' || role === 'owner';
  const isStaffMember = role === 'admin' || role === 'owner' || role === 'collaborator';

  const [contacts, setContacts] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(isStaffMember);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const activeProfileId = activeProfile?.id ?? null;
  const newQuoteUrl = activeProfile?.slug
    ? `/solicitud?studio=${encodeURIComponent(activeProfile.slug)}`
    : '/solicitud';

  // Limpiar inmediatamente y reiniciar carga al cambiar el estudio activo
  const [prevProfileId, setPrevProfileId] = useState(activeProfileId);
  if (prevProfileId !== activeProfileId) {
    setPrevProfileId(activeProfileId);
    setContacts([]);
    setProjects([]);
    setLoading(isStaffMember);
    setError(null);
    setSelectedMessage(null);
    setStatusFilter('all');
    setDateFrom('');
    setDateTo('');
  }

  useEffect(() => {
    if (initializingStudio || !isStaffMember) return;
    let cancelled = false;

    async function loadData() {
      try {
        const params = activeProfileId ? { profile: activeProfileId } : undefined;
        const [contactsRes, projectsRes] = await Promise.allSettled([
          getContacts(params),
          getProjects(params),
        ]);
        if (cancelled) return;

        if (contactsRes.status === 'fulfilled') {
          const data = Array.isArray(contactsRes.value.data)
            ? contactsRes.value.data
            : (contactsRes.value.data?.results ?? []);
          setContacts(data);
        } else {
          throw contactsRes.reason;
        }

        if (projectsRes.status === 'fulfilled') {
          const pData = Array.isArray(projectsRes.value.data)
            ? projectsRes.value.data
            : (projectsRes.value.data?.results ?? []);
          setProjects(pData);
        } else {
          setProjects([]);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err?.response?.data?.detail ||
              err?.message ||
              'No se pudo cargar el historial de solicitudes.'
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, [initializingStudio, isStaffMember, activeProfileId, reloadKey]);

  function handleRetry() {
    setLoading(true);
    setError(null);
    setReloadKey((k) => k + 1);
  }

  async function handleUpdateContact(contact, updates) {
    if (!isAdminOrOwner) return;
    setUpdatingId(contact.id);
    setFeedback(null);
    try {
      const res = await updateContact(contact.id, updates);
      const updated = res.data;
      setContacts((prev) => prev.map((c) => (c.id === contact.id ? updated : c)));
      setSelectedMessage((prev) => (prev && prev.id === contact.id ? updated : prev));
      setFeedback({
        type: 'success',
        message: `Consulta #${contact.id} actualizada correctamente.`,
      });
    } catch (err) {
      setFeedback({
        type: 'danger',
        message:
          err?.response?.data?.project?.[0] ||
          err?.response?.data?.status?.[0] ||
          err?.response?.data?.detail ||
          'No se pudo actualizar la solicitud.',
      });
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleDelete(contact) {
    const confirmed = window.confirm(
      `¿Deseás eliminar la solicitud de ${contact.name}? Esta acción no se puede deshacer.`
    );
    if (!confirmed) return;

    setDeletingId(contact.id);
    setFeedback(null);
    try {
      await deleteContact(contact.id);
      setContacts((prev) => prev.filter((c) => c.id !== contact.id));
      setFeedback({
        type: 'success',
        message: 'La solicitud fue eliminada correctamente.',
      });
      if (selectedMessage?.id === contact.id) {
        setSelectedMessage(null);
      }
    } catch (err) {
      setFeedback({
        type: 'danger',
        message:
          err?.response?.data?.detail ||
          err?.message ||
          'No se pudo eliminar la solicitud.',
      });
    } finally {
      setDeletingId(null);
    }
  }

  const filtered = useMemo(() => {
    const normalize = (val) =>
      String(val || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();

    const q = normalize(searchQuery);

    return contacts.filter((c) => {
      const statusVal = c.status || 'pending';
      if (statusFilter !== 'all' && statusVal !== statusFilter) {
        return false;
      }

      if (dateFrom || dateTo) {
        const itemDate = toLocalDateInputValue(c.created_at);
        if (dateFrom && itemDate && itemDate < dateFrom) return false;
        if (dateTo && itemDate && itemDate > dateTo) return false;
      }

      if (!q) return true;
      const statusMeta = getContactStatusMeta(statusVal);
      return (
        normalize(c.name).includes(q) ||
        normalize(c.email).includes(q) ||
        normalize(c.profile_name).includes(q) ||
        normalize(c.project_title).includes(q) ||
        normalize(statusMeta.label).includes(q) ||
        normalize(c.message).includes(q)
      );
    });
  }, [contacts, searchQuery, statusFilter, dateFrom, dateTo]);

  if (initializingStudio || loading) {
    return (
      <div className="d-flex justify-content-center align-items-center py-5" style={{ minHeight: '60vh' }}>
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="container py-5 my-md-4">
      {/* Encabezado */}
      <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-3 mb-4 pb-3 border-bottom">
        <div>
          <span
            className="text-uppercase fw-bold text-muted small"
            style={{ letterSpacing: '0.12em' }}
          >
            {isStaffMember
              ? `Panel de Consultas${activeProfile ? ` · ${activeProfile.name}` : ''}`
              : 'Mis Gestiones'}
          </span>
          <h1 className="h3 fw-bold mb-1" style={{ color: 'var(--color-ink)' }}>
            {isStaffMember
              ? `Consultas y Solicitudes${activeProfile ? ` — ${activeProfile.name}` : ''}`
              : 'Historial de Solicitudes'}
          </h1>
          <p className="text-muted small mb-0">
            {isStaffMember
              ? `Consultas y pedidos de presupuesto recibidos por ${activeProfile?.name || 'el estudio'}.`
              : 'Seguimiento de tus solicitudes de presupuesto y proyectos enviados.'}
          </p>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          {!isStaffMember && (
            <Link to={newQuoteUrl} className="btn btn-dark btn-sm rounded-pill px-3 fw-semibold">
              + Nueva Solicitud
            </Link>
          )}
          {isStaffMember && (
            <Link to="/admin" className="btn btn-dark btn-sm rounded-pill px-3 fw-semibold">
              Panel de Administración
            </Link>
          )}
          <Link to="/perfil" className="btn btn-outline-dark btn-sm rounded-pill px-3">
            Mi Perfil
          </Link>
        </div>
      </div>

      {feedback && (
        <div
          className={`alert alert-${feedback.type} alert-dismissible fade show rounded-4 mb-4`}
          role="alert"
        >
          {feedback.message}
          <button
            type="button"
            className="btn-close"
            aria-label="Cerrar"
            onClick={() => setFeedback(null)}
          />
        </div>
      )}

      {error ? (
        <div
          className="p-5 text-center rounded-4"
          style={{ background: '#fff', border: '1px solid rgba(15, 27, 42, 0.1)' }}
        >
          <h2 className="h5 fw-bold text-danger mb-2">Error de conexión</h2>
          <p className="text-muted small mb-3">{error}</p>
          <button
            type="button"
            className="btn btn-dark rounded-pill px-4"
            onClick={handleRetry}
          >
            Reintentar
          </button>
        </div>
      ) : (
        <>
          {/* Barra de Filtro */}
          {contacts.length > 0 && (
            <div
              className="p-3 rounded-4 mb-4 shadow-sm"
              style={{ background: '#fff', border: '1px solid rgba(15, 27, 42, 0.08)' }}
            >
              <div className="row g-2 align-items-end">
                <div className="col-12 col-md-4">
                  <label className="form-label small fw-semibold text-muted mb-1">
                    Buscar solicitud
                  </label>
                  <input
                    type="text"
                    className="form-control form-control-sm rounded-pill px-3"
                    placeholder="Remitente, correo, proyecto o mensaje..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className="col-12 col-sm-4 col-md-3">
                  <label className="form-label small fw-semibold text-muted mb-1">
                    Estado
                  </label>
                  <select
                    className="form-select form-select-sm rounded-pill px-3"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="all">Todos los estados</option>
                    {CONTACT_STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label} — {opt.meaning}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-6 col-sm-4 col-md-2">
                  <label className="form-label small fw-semibold text-muted mb-1">
                    Desde fecha
                  </label>
                  <input
                    type="date"
                    className="form-control form-control-sm rounded-pill px-3"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                </div>
                <div className="col-6 col-sm-4 col-md-2">
                  <label className="form-label small fw-semibold text-muted mb-1">
                    Hasta fecha
                  </label>
                  <input
                    type="date"
                    className="form-control form-control-sm rounded-pill px-3"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                  />
                </div>
                <div className="col-12 col-md-1 d-flex justify-content-end">
                  {(statusFilter !== 'all' || dateFrom || dateTo || searchQuery) && (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary rounded-pill px-3 w-100"
                      onClick={() => {
                        setStatusFilter('all');
                        setDateFrom('');
                        setDateTo('');
                        setSearchQuery('');
                      }}
                    >
                      Limpiar
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {!isStaffMember ? (
            <div
              className="p-5 text-center rounded-4"
              style={{
                background: '#fff',
                border: '1px dashed rgba(15, 27, 42, 0.2)',
              }}
            >
              <div
                className="d-inline-flex justify-content-center align-items-center rounded-circle mb-3"
                style={{ width: '56px', height: '56px', background: '#f1f3f5', color: '#495057' }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
              </div>
              <h2 className="h5 fw-bold mb-2" style={{ color: 'var(--color-ink)' }}>
                El historial de solicitudes no está disponible por el momento
              </h2>
              <p className="text-muted small mb-4" style={{ maxWidth: '460px', margin: '0 auto' }}>
                Por razones de privacidad, las consultas enviadas son recibidas y gestionadas directamente por el estudio destinatario. Podés enviar una nueva solicitud de presupuesto cuando lo desees.
              </p>
              <Link to={newQuoteUrl} className="btn btn-dark rounded-pill px-4 fw-semibold">
                Iniciar Solicitud de Presupuesto
              </Link>
            </div>
          ) : contacts.length === 0 ? (
            <div
              className="p-5 text-center rounded-4"
              style={{
                background: '#fff',
                border: '1px dashed rgba(15, 27, 42, 0.2)',
              }}
            >
              <div
                className="d-inline-flex justify-content-center align-items-center rounded-circle mb-3"
                style={{ width: '56px', height: '56px', background: '#f1f3f5', color: '#495057' }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
              </div>
              <h2 className="h5 fw-bold mb-2" style={{ color: 'var(--color-ink)' }}>
                No hay solicitudes registradas{activeProfile ? ` en ${activeProfile.name}` : ''}
              </h2>
              <p className="text-muted small mb-0" style={{ maxWidth: '420px', margin: '0 auto' }}>
                Aún no se han recibido consultas para {activeProfile?.name || 'este estudio'}.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-center text-muted">
              No se encontraron solicitudes que coincidan con los filtros seleccionados.
            </div>
          ) : (
            <div
              className="table-responsive rounded-4 shadow-sm"
              style={{ background: '#fff', border: '1px solid rgba(15, 27, 42, 0.08)' }}
            >
              <table className="table table-hover align-middle mb-0">
                <thead style={{ background: '#f8f9fa' }}>
                  <tr className="small text-uppercase text-muted" style={{ letterSpacing: '0.06em' }}>
                    <th scope="col" className="py-3 px-3">Fecha</th>
                    <th scope="col" className="py-3 px-3">Estudio</th>
                    <th scope="col" className="py-3 px-3">Remitente</th>
                    <th scope="col" className="py-3 px-3">Proyecto asociado</th>
                    <th scope="col" className="py-3 px-3">Mensaje</th>
                    <th scope="col" className="py-3 px-3 text-center">Estado</th>
                    <th scope="col" className="py-3 px-3 text-end">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => {
                    const statusMeta = getContactStatusMeta(c.status || 'pending');
                    const isUpdating = updatingId === c.id;
                    return (
                      <tr key={c.id}>
                        <td className="px-3 small text-muted text-nowrap">
                          {formatDate(c.created_at)}
                        </td>
                        <td className="px-3 fw-semibold small text-nowrap">
                          {c.profile_name || activeProfile?.name || `Perfil #${c.profile}`}
                        </td>
                        <td className="px-3">
                          <div className="fw-semibold small">{c.name}</div>
                          <div className="small text-muted">{c.email}</div>
                        </td>
                        <td className="px-3" style={{ minWidth: '175px' }}>
                          {isAdminOrOwner ? (
                            <select
                              className="form-select form-select-sm rounded-pill px-3"
                              style={{ fontSize: '0.78rem' }}
                              value={c.project ?? ''}
                              disabled={isUpdating}
                              onChange={(e) => {
                                const val = e.target.value;
                                handleUpdateContact(c, {
                                  project: val ? Number(val) : null,
                                });
                              }}
                            >
                              <option value="">— Sin proyecto —</option>
                              {projects.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.title}
                                </option>
                              ))}
                            </select>
                          ) : c.project_title ? (
                            <span className="badge rounded-pill bg-light text-dark border px-2 py-1">
                              {c.project_title}
                            </span>
                          ) : (
                            <span className="small text-muted">Sin asociar</span>
                          )}
                        </td>
                        <td className="px-3 small text-muted" style={{ maxWidth: '260px' }}>
                          <div
                            className="text-truncate"
                            title={c.message}
                            style={{ cursor: 'pointer' }}
                            onClick={() => setSelectedMessage(c)}
                          >
                            {c.message}
                          </div>
                        </td>
                        <td className="px-3 text-center" style={{ minWidth: '150px' }}>
                          {isAdminOrOwner ? (
                            <select
                              className="form-select form-select-sm rounded-pill px-3 fw-semibold"
                              style={{
                                fontSize: '0.76rem',
                                backgroundColor: statusMeta.bg,
                                color: statusMeta.color,
                                borderColor: `${statusMeta.color}44`,
                              }}
                              value={c.status || 'pending'}
                              disabled={isUpdating}
                              title={statusMeta.meaning}
                              onChange={(e) =>
                                handleUpdateContact(c, { status: e.target.value })
                              }
                            >
                              {CONTACT_STATUS_OPTIONS.map((opt) => (
                                <option
                                  key={opt.value}
                                  value={opt.value}
                                  style={{ background: '#fff', color: '#212529' }}
                                >
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span
                              className="badge rounded-pill px-2 py-1"
                              style={{
                                background: statusMeta.bg,
                                color: statusMeta.color,
                                fontSize: '0.7rem',
                                letterSpacing: '0.04em',
                              }}
                              title={statusMeta.meaning}
                            >
                              {statusMeta.label}
                            </span>
                          )}
                        </td>
                        <td className="px-3 text-end text-nowrap">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-dark rounded-pill px-3 me-1"
                            onClick={() => setSelectedMessage(c)}
                          >
                            Ver
                          </button>
                          {isAdminOrOwner && (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger rounded-pill px-2"
                              disabled={deletingId === c.id}
                              onClick={() => handleDelete(c)}
                              title="Eliminar solicitud"
                            >
                              {deletingId === c.id ? '...' : '✕'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Modal / Vista de Detalle de Mensaje */}
      {selectedMessage && (
        <div
          className="modal d-block"
          tabIndex="-1"
          style={{ background: 'rgba(15, 27, 42, 0.65)' }}
          onClick={() => setSelectedMessage(null)}
        >
          <div
            className="modal-dialog modal-dialog-centered"
            style={{ maxWidth: '580px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-content rounded-4 border-0 p-3 p-md-4">
              <div className="modal-header border-0 pb-0">
                <div>
                  <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
                    <span
                      className="badge rounded-pill px-3 py-1 fw-bold text-uppercase"
                      style={{ background: '#e9ecef', color: '#495057', fontSize: '0.68rem' }}
                    >
                      SOLICITUD #{selectedMessage.id}
                    </span>
                    {(() => {
                      const stMeta = getContactStatusMeta(selectedMessage.status || 'pending');
                      return (
                        <span
                          className="badge rounded-pill px-3 py-1 fw-semibold"
                          style={{
                            background: stMeta.bg,
                            color: stMeta.color,
                            fontSize: '0.7rem',
                          }}
                        >
                          {stMeta.label} — {stMeta.meaning}
                        </span>
                      );
                    })()}
                  </div>
                  <h3 className="h5 fw-bold mb-0" style={{ color: 'var(--color-ink)' }}>
                    Detalle de la Solicitud
                  </h3>
                </div>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Cerrar"
                  onClick={() => setSelectedMessage(null)}
                />
              </div>

              <div className="modal-body py-3">
                <div className="p-3 bg-light rounded-3 mb-3 small d-flex flex-column gap-1">
                  <div>
                    <strong>Fecha:</strong> {formatDate(selectedMessage.created_at)}
                  </div>
                  <div>
                    <strong>Estudio:</strong> {selectedMessage.profile_name || activeProfile?.name || `#${selectedMessage.profile}`}
                  </div>
                  <div>
                    <strong>Remitente:</strong> {selectedMessage.name} (
                    <a
                      href={buildContactReplyMailto(selectedMessage, activeProfile?.name)}
                      className="text-decoration-none"
                    >
                      {selectedMessage.email}
                    </a>
                    )
                  </div>
                  <div>
                    <strong>Proyecto asociado:</strong>{' '}
                    {selectedMessage.project_title || 'Sin proyecto asociado'}
                  </div>
                </div>

                {isAdminOrOwner && (
                  <div className="row g-3 mb-3">
                    <div className="col-12 col-sm-6">
                      <label className="form-label small fw-semibold mb-1">
                        Estado de la consulta
                      </label>
                      <select
                        className="form-select form-select-sm rounded-3"
                        value={selectedMessage.status || 'pending'}
                        disabled={updatingId === selectedMessage.id}
                        onChange={(e) =>
                          handleUpdateContact(selectedMessage, { status: e.target.value })
                        }
                      >
                        {CONTACT_STATUS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label} ({opt.meaning})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-12 col-sm-6">
                      <label className="form-label small fw-semibold mb-1">
                        Asociar a un proyecto
                      </label>
                      <select
                        className="form-select form-select-sm rounded-3"
                        value={selectedMessage.project ?? ''}
                        disabled={updatingId === selectedMessage.id}
                        onChange={(e) => {
                          const val = e.target.value;
                          handleUpdateContact(selectedMessage, {
                            project: val ? Number(val) : null,
                          });
                        }}
                      >
                        <option value="">— Sin proyecto asociado —</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                <div className="small fw-semibold text-muted mb-1 text-uppercase" style={{ letterSpacing: '0.05em' }}>
                  Contenido del Encargo / Mensaje:
                </div>
                <div
                  className="p-3 rounded-3"
                  style={{
                    background: '#f8f9fa',
                    border: '1px solid rgba(15, 27, 42, 0.08)',
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'inherit',
                    fontSize: '0.88rem',
                    lineHeight: 1.6,
                    maxHeight: '260px',
                    overflowY: 'auto',
                  }}
                >
                  {selectedMessage.message}
                </div>
              </div>

              <div className="modal-footer border-0 pt-0 justify-content-between">
                <a
                  href={buildContactReplyMailto(selectedMessage, activeProfile?.name)}
                  className="btn btn-outline-dark btn-sm rounded-pill px-3 fw-semibold"
                >
                  Responder por Email
                </a>
                <button
                  type="button"
                  className="btn btn-dark rounded-pill px-4 fw-semibold"
                  onClick={() => setSelectedMessage(null)}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
