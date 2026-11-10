import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import {
  getProfiles,
  updateStudioProfile,
  getProjects,
  deleteProject,
  resolveMediaUrl,
  getTeam,
  createTeamMember,
  updateTeamMember,
  deleteTeamMember,
  getAbout,
  createAbout,
  updateAbout,
  getContacts,
  updateContact,
  deleteContact,
} from '../services/api';
import { useAuth } from '../context/AuthContext';
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

function formatCategory(cat) {
  if (!cat) return 'General';
  const labels = {
    architecture: 'Arquitectura',
    design: 'Diseño',
    interior_design: 'Diseño Interior',
    photography: 'Fotografía',
    render: 'Render',
    other: 'Otro',
  };
  return labels[cat.toLowerCase()] || cat.replace(/_/g, ' ');
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

function toList(data) {
  if (Array.isArray(data)) return data;
  return data?.results ?? [];
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const outletContext = useOutletContext();
  const contextProfile = outletContext?.studioContext?.profile || null;
  const setStudioContext = outletContext?.setStudioContext;
  const selectActiveStudio = outletContext?.selectActiveStudio;

  const role = (user?.role || '').toLowerCase();
  const isAdmin = role === 'admin';
  const isAdminOrOwner = role === 'admin' || role === 'owner';

  // Estado de perfiles autorizados y estudio seleccionado
  const [authorizedProfiles, setAuthorizedProfiles] = useState([]);
  const [selectedProfileId, setSelectedProfileId] = useState(null);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [errorProfiles, setErrorProfiles] = useState(null);

  const [activeTab, setActiveTab] = useState('projects'); // 'projects' | 'team' | 'about' | 'contacts'

  // Proyectos State
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [errorProjects, setErrorProjects] = useState(null);
  const [filterQuery, setFilterQuery] = useState('');
  const [deletingId, setDeletingId] = useState(null);

  // Equipo State
  const [team, setTeam] = useState([]);
  const [loadingTeam, setLoadingTeam] = useState(true);
  const [editingMember, setEditingMember] = useState(null);
  const [memberForm, setMemberForm] = useState({ full_name: '', role: '', order: 0 });
  const [memberAvatarFile, setMemberAvatarFile] = useState(null);
  const [savingMember, setSavingMember] = useState(false);
  const [showMemberForm, setShowMemberForm] = useState(false);

  // Nosotros (About) e Información de Contacto State
  const [aboutRecord, setAboutRecord] = useState(null);
  const [aboutForm, setAboutForm] = useState({ title: '', description: '' });
  const [studioContactForm, setStudioContactForm] = useState({
    contact_email: '',
    phone: '',
    location: '',
    instagram: '',
  });
  const [aboutImageFile, setAboutImageFile] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const avatarPreviewUrlRef = useRef(null);
  const [loadingAbout, setLoadingAbout] = useState(true);
  const [savingAbout, setSavingAbout] = useState(false);

  // Consultas (Contacts) State
  const [contacts, setContacts] = useState([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [deletingContactId, setDeletingContactId] = useState(null);
  const [updatingContactId, setUpdatingContactId] = useState(null);
  const [selectedContact, setSelectedContact] = useState(null);
  const [contactStatusFilter, setContactStatusFilter] = useState('all');
  const [contactDateFrom, setContactDateFrom] = useState('');
  const [contactDateTo, setContactDateTo] = useState('');
  const [contactSearchQuery, setContactSearchQuery] = useState('');

  // Feedback State
  const [feedback, setFeedback] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(
    () => () => {
      if (avatarPreviewUrlRef.current) URL.revokeObjectURL(avatarPreviewUrlRef.current);
    },
    []
  );

  // Cargar perfiles autorizados del usuario autenticado
  useEffect(() => {
    let cancelled = false;

    async function fetchAuthorizedProfiles() {
      setLoadingProfiles(true);
      setErrorProfiles(null);
      try {
        const res = await getProfiles(isAdmin ? undefined : { mine: 1 });
        if (cancelled) return;

        const list = toList(res.data);
        setAuthorizedProfiles(list);

        if (list.length === 0) {
          setSelectedProfileId(null);
          setProjects([]);
          setTeam([]);
          setContacts([]);
          setAboutRecord(null);
          return;
        }

        // Preseleccionar el perfil del contexto únicamente si pertenece a los perfiles autorizados
        const preferredId = contextProfile?.id ? Number(contextProfile.id) : null;
        const matched =
          (preferredId && list.find((p) => Number(p.id) === preferredId)) || list[0];

        setLoadingProjects(true);
        setLoadingTeam(true);
        setLoadingAbout(true);
        setLoadingContacts(true);
        setSelectedProfileId(Number(matched.id));
        setStudioContactForm({
          contact_email: matched.contact_email || '',
          phone: matched.phone || '',
          location: matched.location || '',
          instagram: matched.instagram || '',
        });
        if (selectActiveStudio) {
          selectActiveStudio(matched);
        }
      } catch (err) {
        if (!cancelled) {
          setErrorProfiles(
            err?.response?.data?.detail ||
              err?.message ||
              'No se pudieron obtener los estudios autorizados.'
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingProfiles(false);
        }
      }
    }

    fetchAuthorizedProfiles();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.username, user?.role, isAdmin]);

  const activeProfile = useMemo(() => {
    if (!selectedProfileId) return null;
    return (
      authorizedProfiles.find((p) => Number(p.id) === Number(selectedProfileId)) || null
    );
  }, [authorizedProfiles, selectedProfileId]);
  const avatarPreviewUrl =
    avatarPreview?.profileId === Number(activeProfile?.id)
      ? avatarPreview.url
      : resolveMediaUrl(activeProfile?.avatar);

  function clearAvatarPreview() {
    if (avatarPreviewUrlRef.current) {
      URL.revokeObjectURL(avatarPreviewUrlRef.current);
      avatarPreviewUrlRef.current = null;
    }
    setAvatarPreview(null);
  }

  function handleSelectStudioChange(e) {
    const nextId = Number(e.target.value);
    if (!nextId || nextId === selectedProfileId) return;

    // Limpiar inmediatamente los datos del estudio anterior antes de cargar el nuevo
    setProjects([]);
    setTeam([]);
    setContacts([]);
    setAboutRecord(null);
    setAboutForm({ title: '', description: '' });
    setAboutImageFile(null);
    setAvatarFile(null);
    clearAvatarPreview();
    setLoadingProjects(true);
    setLoadingTeam(true);
    setLoadingAbout(true);
    setLoadingContacts(true);
    setErrorProjects(null);
    setFeedback(null);
    setFilterQuery('');
    setShowMemberForm(false);
    setEditingMember(null);
    setSelectedContact(null);
    setContactStatusFilter('all');
    setContactDateFrom('');
    setContactDateTo('');
    setContactSearchQuery('');

    setSelectedProfileId(nextId);
    const targetObj = authorizedProfiles.find((p) => Number(p.id) === nextId);
    setStudioContactForm({
      contact_email: targetObj?.contact_email || '',
      phone: targetObj?.phone || '',
      location: targetObj?.location || '',
      instagram: targetObj?.instagram || '',
    });
    if (targetObj && selectActiveStudio) {
      selectActiveStudio(targetObj);
    }
  }

  // Cargar recursos aislados del estudio seleccionado (`selectedProfileId`)
  useEffect(() => {
    if (!selectedProfileId) return;
    let cancelled = false;

    async function loadStudioDashboardData() {
      setLoadingProjects(true);
      setLoadingTeam(true);
      setLoadingAbout(true);
      setLoadingContacts(true);

      const query = { profile: selectedProfileId };

      const [projRes, teamRes, aboutRes, contactsRes] = await Promise.allSettled([
        getProjects(query),
        getTeam(query),
        getAbout(query),
        getContacts(query),
      ]);

      if (cancelled) return;

      // 1. Proyectos
      if (projRes.status === 'fulfilled') {
        setProjects(toList(projRes.value.data));
        setErrorProjects(null);
      } else {
        setProjects([]);
        setErrorProjects(
          projRes.reason?.response?.data?.detail ||
            projRes.reason?.message ||
            'No se pudieron cargar los proyectos del estudio.'
        );
      }
      setLoadingProjects(false);

      // 2. Equipo
      if (teamRes.status === 'fulfilled') {
        setTeam(toList(teamRes.value.data));
      } else {
        setTeam([]);
      }
      setLoadingTeam(false);

      // 3. Sección Nosotros
      if (aboutRes.status === 'fulfilled') {
        const list = toList(aboutRes.value.data);
        const first = list[0] || null;
        setAboutRecord(first);
        setAboutForm({
          title: first?.title || '',
          description: first?.description || '',
        });
      } else {
        setAboutRecord(null);
        setAboutForm({ title: '', description: '' });
      }
      setLoadingAbout(false);

      // 4. Consultas
      if (contactsRes.status === 'fulfilled') {
        setContacts(toList(contactsRes.value.data));
      } else {
        setContacts([]);
      }
      setLoadingContacts(false);
    }

    loadStudioDashboardData();

    return () => {
      cancelled = true;
    };
  }, [selectedProfileId, reloadKey]);

  // Mantener sincronizados los indicadores `hasAbout` y `hasTeam` del estudio activo en el Layout
  useEffect(() => {
    if (!setStudioContext || !activeProfile || loadingTeam || loadingAbout) return;
    const hasAbout = Boolean(
      aboutRecord?.title?.trim() ||
        aboutRecord?.description?.trim() ||
        aboutRecord?.image ||
        activeProfile?.description?.trim()
    );
    const hasTeam = Array.isArray(team) && team.length > 0;
    setStudioContext((prev) => ({
      ...prev,
      profile: activeProfile,
      hasAbout,
      hasTeam,
    }));
  }, [setStudioContext, activeProfile, aboutRecord, team, loadingTeam, loadingAbout]);

  // Eliminar Proyecto
  async function handleDeleteProject(project) {
    if (!selectedProfileId) return;
    const confirmed = window.confirm(
      `¿Estás seguro de que deseás eliminar el proyecto "${project.title}"? Esta acción no se puede deshacer.`
    );
    if (!confirmed) return;

    setDeletingId(project.id);
    setFeedback(null);
    try {
      await deleteProject(project.id);
      setProjects((prev) => prev.filter((p) => p.id !== project.id));
      setFeedback({
        type: 'success',
        message: `El proyecto "${project.title}" fue eliminado exitosamente.`,
      });
    } catch (err) {
      setFeedback({
        type: 'danger',
        message:
          err?.response?.data?.detail ||
          err?.message ||
          'No se pudo eliminar el proyecto. Verificá tus permisos.',
      });
    } finally {
      setDeletingId(null);
    }
  }

  // Guardar Miembro de Equipo (Crear o Editar asociado a `selectedProfileId`)
  async function handleSaveMember(e) {
    e.preventDefault();
    if (!selectedProfileId) return;
    if (!memberForm.full_name.trim()) {
      setFeedback({ type: 'warning', message: 'El nombre del integrante es obligatorio.' });
      return;
    }
    setSavingMember(true);
    setFeedback(null);

    try {
      const data = new FormData();
      data.append('profile', selectedProfileId);
      data.append('full_name', memberForm.full_name.trim());
      data.append('role', memberForm.role || '');
      data.append('order', memberForm.order || 0);
      if (memberAvatarFile) {
        data.append('avatar', memberAvatarFile);
      }

      if (editingMember) {
        const res = await updateTeamMember(editingMember.id, data);
        setTeam((prev) => prev.map((m) => (m.id === editingMember.id ? res.data : m)));
        setFeedback({ type: 'success', message: 'Integrante de equipo actualizado con éxito.' });
      } else {
        const res = await createTeamMember(data);
        setTeam((prev) => [...prev, res.data].sort((a, b) => a.order - b.order));
        setFeedback({ type: 'success', message: 'Integrante agregado exitosamente.' });
      }

      setMemberForm({ full_name: '', role: '', order: 0 });
      setMemberAvatarFile(null);
      setEditingMember(null);
      setShowMemberForm(false);
    } catch (err) {
      setFeedback({
        type: 'danger',
        message: err?.response?.data?.detail || 'Error al guardar el integrante.',
      });
    } finally {
      setSavingMember(false);
    }
  }

  // Eliminar Miembro de Equipo
  async function handleDeleteMember(member) {
    if (!selectedProfileId) return;
    const confirmed = window.confirm(`¿Eliminar a ${member.full_name} del equipo?`);
    if (!confirmed) return;

    setFeedback(null);
    try {
      await deleteTeamMember(member.id);
      setTeam((prev) => prev.filter((m) => m.id !== member.id));
      setFeedback({ type: 'success', message: 'Integrante eliminado exitosamente.' });
    } catch {
      setFeedback({ type: 'danger', message: 'Error al eliminar el integrante.' });
    }
  }

  function handleStartEditMember(member) {
    setEditingMember(member);
    setMemberForm({
      full_name: member.full_name || '',
      role: member.role || '',
      order: member.order || 0,
    });
    setMemberAvatarFile(null);
    setShowMemberForm(true);
    window.scrollTo({ top: 300, behavior: 'smooth' });
  }

  function handleCancelMemberForm() {
    setEditingMember(null);
    setMemberForm({ full_name: '', role: '', order: 0 });
    setMemberAvatarFile(null);
    setShowMemberForm(false);
  }

  // Guardar Sección Nosotros e Información de Contacto (About + ProfessionalProfile asociados a `selectedProfileId`)
  async function handleSaveAbout(e) {
    e.preventDefault();
    if (!selectedProfileId) return;
    setSavingAbout(true);
    setFeedback(null);

    try {
      // 1. Actualizar datos de contacto y redes del estudio (ProfessionalProfile)
      const profileFields = {
        contact_email: (studioContactForm.contact_email || '').trim(),
        phone: (studioContactForm.phone || '').trim(),
        location: (studioContactForm.location || '').trim(),
        instagram: (studioContactForm.instagram || '').trim(),
      };
      let profilePayload = profileFields;
      if (avatarFile) {
        profilePayload = new FormData();
        Object.entries(profileFields).forEach(([field, value]) => {
          profilePayload.append(field, value);
        });
        profilePayload.append('avatar', avatarFile);
      }
      const profileRes = await updateStudioProfile(selectedProfileId, profilePayload);
      const updatedProfile = profileRes.data;

      setAuthorizedProfiles((prev) =>
        prev.map((p) => (Number(p.id) === Number(selectedProfileId) ? updatedProfile : p))
      );
      if (selectActiveStudio) {
        selectActiveStudio(updatedProfile);
      }
      setAvatarFile(null);
      clearAvatarPreview();

      // 2. Guardar o actualizar bloque institucional (StudioAbout) si fue completado o ya existe
      const hasAboutInput = Boolean(
        aboutRecord?.id ||
          aboutForm.title.trim() ||
          aboutForm.description.trim() ||
          aboutImageFile
      );

      if (hasAboutInput) {
        const data = new FormData();
        data.append('profile', selectedProfileId);
        data.append('title', aboutForm.title);
        data.append('description', aboutForm.description);
        if (aboutImageFile) {
          data.append('image', aboutImageFile);
        }

        if (aboutRecord && aboutRecord.id) {
          const res = await updateAbout(aboutRecord.id, data);
          setAboutRecord(res.data);
        } else {
          const res = await createAbout(data);
          setAboutRecord(res.data);
        }
        setAboutImageFile(null);
      }

      setFeedback({
        type: 'success',
        message: 'Perfil e información institucional y de contacto actualizados correctamente.',
      });
    } catch (err) {
      const errData = err?.response?.data;
      const specificMsg =
        errData?.contact_email?.[0] ||
        errData?.phone?.[0] ||
        errData?.location?.[0] ||
        errData?.instagram?.[0] ||
        errData?.avatar?.[0] ||
        errData?.detail;
      setFeedback({
        type: 'danger',
        message: specificMsg || 'Error al guardar la información del estudio.',
      });
    } finally {
      setSavingAbout(false);
    }
  }

  // Actualizar estado o proyecto asociado de una Consulta
  async function handleUpdateContact(contact, updates) {
    if (!selectedProfileId || !isAdminOrOwner) return;
    setUpdatingContactId(contact.id);
    setFeedback(null);
    try {
      const res = await updateContact(contact.id, updates);
      const updated = res.data;
      setContacts((prev) => prev.map((c) => (c.id === contact.id ? updated : c)));
      setSelectedContact((prev) => (prev && prev.id === contact.id ? updated : prev));
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
          'No se pudo actualizar la consulta.',
      });
    } finally {
      setUpdatingContactId(null);
    }
  }

  // Eliminar Consulta del estudio
  async function handleDeleteContact(contact) {
    if (!selectedProfileId) return;
    const confirmed = window.confirm(
      `¿Deseás eliminar la consulta de ${contact.name}? Esta acción no se puede deshacer.`
    );
    if (!confirmed) return;

    setDeletingContactId(contact.id);
    setFeedback(null);
    try {
      await deleteContact(contact.id);
      setContacts((prev) => prev.filter((c) => c.id !== contact.id));
      if (selectedContact?.id === contact.id) {
        setSelectedContact(null);
      }
      setFeedback({
        type: 'success',
        message: 'La consulta fue eliminada correctamente.',
      });
    } catch (err) {
      setFeedback({
        type: 'danger',
        message: err?.response?.data?.detail || 'No se pudo eliminar la consulta.',
      });
    } finally {
      setDeletingContactId(null);
    }
  }

  // Conteo de consultas por estado
  const contactStatusCounts = useMemo(() => {
    const counts = {
      all: contacts.length,
      pending: 0,
      in_review: 0,
      responded: 0,
      closed: 0,
    };
    contacts.forEach((c) => {
      const st = c.status || 'pending';
      if (counts[st] !== undefined) {
        counts[st] += 1;
      }
    });
    return counts;
  }, [contacts]);

  // Filtro de consultas por estado, rango de fechas y texto (insensible a tildes/acentos)
  const filteredContacts = useMemo(() => {
    const normalize = (val) =>
      String(val || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();

    const q = normalize(contactSearchQuery);

    return contacts.filter((c) => {
      const statusVal = c.status || 'pending';
      if (contactStatusFilter !== 'all' && statusVal !== contactStatusFilter) {
        return false;
      }

      if (contactDateFrom || contactDateTo) {
        const itemDate = toLocalDateInputValue(c.created_at);
        if (contactDateFrom && itemDate && itemDate < contactDateFrom) {
          return false;
        }
        if (contactDateTo && itemDate && itemDate > contactDateTo) {
          return false;
        }
      }

      if (!q) return true;
      const statusMeta = getContactStatusMeta(statusVal);
      return (
        normalize(c.name).includes(q) ||
        normalize(c.email).includes(q) ||
        normalize(c.message).includes(q) ||
        normalize(c.project_title).includes(q) ||
        normalize(statusMeta.label).includes(q)
      );
    });
  }, [contacts, contactStatusFilter, contactDateFrom, contactDateTo, contactSearchQuery]);

  // Filtro de proyectos (insensible a tildes/acentos y mayúsculas)
  const filteredProjects = useMemo(() => {
    const normalize = (val) =>
      String(val || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();

    const sorted = [...projects].sort((a, b) => (Number(a.order) || 1) - (Number(b.order) || 1));
    const q = normalize(filterQuery);
    if (!q) return sorted;
    return sorted.filter(
      (p) =>
        normalize(p.title).includes(q) ||
        normalize(p.category).includes(q) ||
        normalize(formatCategory(p.category)).includes(q) ||
        normalize(p.description).includes(q) ||
        normalize(p.location).includes(q)
    );
  }, [projects, filterQuery]);

  if (loadingProfiles) {
    return (
      <div className="container py-5 text-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (errorProfiles) {
    return (
      <div className="container py-5 my-4 text-center">
        <div
          className="mx-auto p-4 p-md-5 rounded-4 border"
          style={{ maxWidth: '580px', background: '#fff' }}
        >
          <h1 className="h5 fw-bold text-danger mb-2">Error al cargar estudios autorizados</h1>
          <p className="text-muted small mb-3">{errorProfiles}</p>
          <button
            type="button"
            className="btn btn-dark rounded-pill px-4"
            onClick={() => setReloadKey((k) => k + 1)}
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (authorizedProfiles.length === 0 || !activeProfile) {
    return (
      <div className="container py-5 my-4 text-center">
        <div
          className="mx-auto p-4 p-md-5 rounded-4 border"
          style={{
            maxWidth: '580px',
            background: '#fff',
            borderColor: 'rgba(15, 27, 42, 0.12)',
          }}
        >
          <span className="badge bg-secondary rounded-pill px-3 py-1 mb-3 text-uppercase">
            Sin Estudio Asignado
          </span>
          <h1 className="h4 fw-bold mb-2">No tenés estudios autorizados para administrar</h1>
          <p className="text-muted small mb-4">
            Tu usuario (<strong>{user?.username}</strong>) no se encuentra asociado actualmente a ningún perfil de estudio activo. Solicitá al administrador de la plataforma que te asigne un estudio para habilitar las herramientas de gestión.
          </p>
          <Link to="/" className="btn btn-outline-dark rounded-pill px-4">
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-4 py-md-5">
      {/* Barra de Estudio Activo / Selector de Estudio */}
      <div
        className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 p-3 p-md-4 mb-4 rounded-4"
        style={{
          background: '#fff',
          border: '1px solid rgba(15, 27, 42, 0.1)',
          boxShadow: 'var(--shadow-sm, 0 4px 14px rgba(15, 23, 42, 0.04))',
        }}
      >
        <div className="d-flex align-items-center gap-3">
          <div
            className="rounded-circle d-flex align-items-center justify-content-center fw-bold text-white flex-shrink-0"
            style={{
              width: '46px',
              height: '46px',
              background: 'var(--color-ink, #0f172a)',
              fontSize: '0.95rem',
              letterSpacing: '0.05em',
            }}
          >
            {(activeProfile.name || 'VT').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="d-flex align-items-center gap-2 flex-wrap">
              <span className="text-uppercase fw-bold text-muted" style={{ fontSize: '0.7rem', letterSpacing: '0.08em' }}>
                Estudio Activo
              </span>
              <span className="badge bg-light text-dark border rounded-pill" style={{ fontSize: '0.7rem' }}>
                /estudios/{activeProfile.slug}
              </span>
            </div>
            <h2 className="h5 fw-bold mb-0" style={{ color: 'var(--color-ink)' }}>
              {activeProfile.name}
            </h2>
          </div>
        </div>

        <div className="d-flex align-items-center gap-2 flex-wrap">
          {authorizedProfiles.length > 1 && (
            <div className="d-flex align-items-center gap-2">
              <label
                htmlFor="dashboardStudioSelector"
                className="small fw-semibold text-muted text-nowrap mb-0"
              >
                Cambiar estudio:
              </label>
              <select
                id="dashboardStudioSelector"
                className="form-select form-select-sm rounded-pill px-3 py-2 fw-semibold"
                style={{
                  minWidth: '210px',
                  borderColor: 'rgba(15, 23, 42, 0.22)',
                  color: 'var(--color-ink)',
                }}
                value={selectedProfileId}
                onChange={handleSelectStudioChange}
                aria-label="Seleccionar estudio activo"
              >
                {authorizedProfiles.map((prof) => (
                  <option key={prof.id} value={prof.id}>
                    {prof.name} ({prof.slug})
                  </option>
                ))}
              </select>
            </div>
          )}

          <Link
            to={`/estudios/${activeProfile.slug}`}
            className="btn btn-outline-dark btn-sm rounded-pill px-3 py-2 fw-semibold"
          >
            Ver Portfolio Público →
          </Link>
        </div>
      </div>

      {/* Header General */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-4 pb-3 border-bottom">
        <div>
          <span className="badge bg-dark rounded-pill px-3 py-1 mb-2 text-uppercase letter-spacing-1">
            Panel de Administración · {activeProfile.name}
          </span>
          <h1 className="h3 fw-bold mb-1" style={{ color: 'var(--color-ink)' }}>
            Gestión Integral — {activeProfile.name}
          </h1>
          <p className="text-muted small mb-0">
            {isAdminOrOwner
              ? `Mostrando exclusivamente proyectos, equipo, contenido institucional y consultas de ${activeProfile.name}.`
              : `Colaborador técnico en ${activeProfile.name}: podés editar proyectos y gestionar renders y planos técnicos.`}
          </p>
        </div>

        <div className="d-flex align-items-center gap-2 flex-wrap">
          {activeTab === 'projects' && isAdminOrOwner && (
            <Link
              to="/admin/proyectos/nuevo"
              className="btn btn-dark rounded-pill px-4 py-2 fw-semibold d-inline-flex align-items-center gap-2"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Nuevo Proyecto
            </Link>
          )}

          {activeTab === 'team' && isAdminOrOwner && !showMemberForm && (
            <button
              type="button"
              className="btn btn-dark rounded-pill px-4 py-2 fw-semibold d-inline-flex align-items-center gap-2"
              onClick={() => {
                const nextOrder =
                  team.length > 0
                    ? Math.max(...team.map((m) => Number(m.order) || 0)) + 1
                    : 1;
                setEditingMember(null);
                setMemberForm({ full_name: '', role: '', order: nextOrder });
                setMemberAvatarFile(null);
                setShowMemberForm(true);
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Nuevo Integrante
            </button>
          )}
        </div>
      </div>

      {/* Tabs de Navegación */}
      <ul className="nav nav-pills mb-4 gap-2 border-bottom pb-3">
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link rounded-pill px-4 py-2 fw-semibold ${activeTab === 'projects' ? 'active bg-dark text-white' : 'text-dark'}`}
            onClick={() => setActiveTab('projects')}
          >
            Proyectos ({loadingProjects ? '…' : projects.length})
          </button>
        </li>
        {isAdminOrOwner && (
          <>
            <li className="nav-item">
              <button
                type="button"
                className={`nav-link rounded-pill px-4 py-2 fw-semibold ${activeTab === 'team' ? 'active bg-dark text-white' : 'text-dark'}`}
                onClick={() => setActiveTab('team')}
              >
                Nuestro Equipo ({loadingTeam ? '…' : team.length})
              </button>
            </li>
            <li className="nav-item">
              <button
                type="button"
                className={`nav-link rounded-pill px-4 py-2 fw-semibold ${activeTab === 'about' ? 'active bg-dark text-white' : 'text-dark'}`}
                onClick={() => setActiveTab('about')}
              >
                Nosotros
              </button>
            </li>
          </>
        )}
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link rounded-pill px-4 py-2 fw-semibold ${activeTab === 'contacts' ? 'active bg-dark text-white' : 'text-dark'}`}
            onClick={() => setActiveTab('contacts')}
          >
            Consultas ({loadingContacts ? '…' : contacts.length})
          </button>
        </li>
      </ul>

      {/* Alertas y Feedback */}
      {feedback && (
        <div
          className={`alert alert-${feedback.type} alert-dismissible fade show rounded-4 mb-4`}
          role="alert"
        >
          {feedback.message}
          <button
            type="button"
            className="btn-close"
            onClick={() => setFeedback(null)}
            aria-label="Cerrar"
          />
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 1: PROYECTOS */}
      {/* ============================================================== */}
      {activeTab === 'projects' && (
        <>
          {loadingProjects ? (
            <div className="text-center py-5">
              <LoadingSpinner />
            </div>
          ) : errorProjects ? (
            <div className="alert alert-danger rounded-4 text-center py-4">
              <p className="mb-3 fw-medium">{errorProjects}</p>
              <button
                type="button"
                className="btn btn-outline-danger rounded-pill px-4"
                onClick={() => {
                  setLoadingProjects(true);
                  setErrorProjects(null);
                  setReloadKey((k) => k + 1);
                }}
              >
                Reintentar
              </button>
            </div>
          ) : projects.length === 0 ? (
            <div
              className="text-center py-5 px-3 rounded-4"
              style={{ background: '#fff', border: '1px dashed rgba(15,27,42,0.18)' }}
            >
              <div className="mb-3 text-muted">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                </svg>
              </div>
              <h2 className="h5 fw-bold mb-2">No hay proyectos registrados en {activeProfile.name}</h2>
              <p className="text-muted small mb-4" style={{ maxWidth: '420px', margin: '0 auto' }}>
                Aún no se han cargado proyectos para este estudio.
              </p>
              {isAdminOrOwner && (
                <Link
                  to="/admin/proyectos/nuevo"
                  className="btn btn-dark rounded-pill px-4 py-2 fw-semibold"
                >
                  Crear primer proyecto
                </Link>
              )}
            </div>
          ) : (
            <>
              <div className="d-flex justify-content-between align-items-center mb-3 gap-3 flex-wrap">
                <div className="position-relative" style={{ maxWidth: '320px', width: '100%' }}>
                  <input
                    type="text"
                    className="form-control rounded-pill ps-4 py-2"
                    placeholder="Filtrar por título o categoría..."
                    value={filterQuery}
                    onChange={(e) => setFilterQuery(e.target.value)}
                    style={{ fontSize: '0.85rem' }}
                  />
                  {filterQuery && (
                    <button
                      type="button"
                      className="btn btn-sm btn-link position-absolute end-0 top-50 translate-middle-y text-muted pe-3 text-decoration-none"
                      onClick={() => setFilterQuery('')}
                    >
                      ✕
                    </button>
                  )}
                </div>
                <span className="text-muted small">
                  Estudio <strong>{activeProfile.name}</strong>: <strong>{filteredProjects.length}</strong> de {projects.length} proyectos
                </span>
              </div>

              <div
                className="table-responsive rounded-4 shadow-sm"
                style={{ background: '#fff', border: '1px solid rgba(15,27,42,0.08)' }}
              >
                <table className="table table-hover align-middle mb-0">
                  <thead className="table-light">
                    <tr style={{ fontSize: '0.8rem', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                      <th scope="col" style={{ width: '80px', paddingLeft: '1.25rem' }}>Portada</th>
                      <th scope="col">Título</th>
                      <th scope="col">Categoría</th>
                      <th scope="col" style={{ width: '90px' }}>Orden</th>
                      <th scope="col" className="d-none d-md-table-cell">Descripción</th>
                      <th scope="col" className="text-end" style={{ paddingRight: '1.25rem' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProjects.map((project) => {
                      const cover = resolveMediaUrl(project.cover_image || project.coverImage);
                      const isDeleting = deletingId === project.id;
                      const detailUrl = `/estudios/${encodeURIComponent(activeProfile.slug)}/proyecto/${project.id}`;

                      return (
                        <tr key={project.id}>
                          <td style={{ paddingLeft: '1.25rem' }}>
                            {cover ? (
                              <img
                                src={cover}
                                alt=""
                                className="rounded-3"
                                style={{ width: '56px', height: '42px', objectFit: 'cover' }}
                              />
                            ) : (
                              <div
                                className="rounded-3 d-flex align-items-center justify-content-center text-muted"
                                style={{ width: '56px', height: '42px', background: '#f1f3f5', fontSize: '0.7rem' }}
                              >
                                Sin foto
                              </div>
                            )}
                          </td>
                          <td>
                            <span className="fw-semibold text-dark d-block">
                              {project.title}
                            </span>
                            <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                              ID: #{project.id}
                            </span>
                          </td>
                          <td>
                            <span className="badge rounded-pill bg-light text-dark border px-2 py-1" style={{ fontSize: '0.75rem' }}>
                              {formatCategory(project.category)}
                            </span>
                          </td>
                          <td>
                            <span className="badge rounded-pill bg-light text-dark border px-2 py-1">
                              #{project.order ?? 1}
                            </span>
                          </td>
                          <td className="d-none d-md-table-cell text-muted small" style={{ maxWidth: '300px' }}>
                            <span className="text-truncate d-block">
                              {project.description || '—'}
                            </span>
                          </td>
                          <td className="text-end" style={{ paddingRight: '1.25rem' }}>
                            <div className="btn-group btn-group-sm">
                              <Link
                                to={detailUrl}
                                className="btn btn-outline-secondary rounded-start-pill px-3"
                                title="Ver en pantalla inmersiva"
                              >
                                Ver
                              </Link>
                              <Link
                                to={`/admin/proyectos/${project.id}/editar`}
                                className={`btn btn-outline-dark px-3 ${!isAdminOrOwner ? 'rounded-end-pill' : ''}`}
                                title="Editar proyecto y archivos"
                              >
                                Editar
                              </Link>
                              {isAdminOrOwner && (
                                <button
                                  type="button"
                                  className="btn btn-outline-danger rounded-end-pill px-3"
                                  onClick={() => handleDeleteProject(project)}
                                  disabled={isDeleting}
                                  title="Eliminar proyecto"
                                >
                                  {isDeleting ? '...' : 'Eliminar'}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* ============================================================== */}
      {/* TAB 2: NUESTRO EQUIPO */}
      {/* ============================================================== */}
      {activeTab === 'team' && isAdminOrOwner && (
        <div>
          {showMemberForm && (
            <div className="card border-0 shadow-sm rounded-4 mb-4 p-4" style={{ background: '#fff' }}>
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h2 className="h5 fw-bold mb-0">
                  {editingMember
                    ? `Editar Integrante: ${editingMember.full_name}`
                    : `Nuevo Integrante — ${activeProfile.name}`}
                </h2>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary rounded-pill px-3"
                  onClick={handleCancelMemberForm}
                >
                  Cancelar
                </button>
              </div>

              <form onSubmit={handleSaveMember}>
                <div className="row g-3">
                  <div className="col-12 col-md-6">
                    <label className="form-label small fw-semibold">Nombre y Apellido *</label>
                    <input
                      type="text"
                      className="form-control rounded-3"
                      placeholder="Ej. Arq. Sofía Bianchi"
                      value={memberForm.full_name}
                      onChange={(e) => setMemberForm({ ...memberForm, full_name: e.target.value })}
                      required
                    />
                  </div>

                  <div className="col-12 col-md-4">
                    <label className="form-label small fw-semibold">Cargo / Especialidad *</label>
                    <input
                      type="text"
                      className="form-control rounded-3"
                      placeholder="Ej. Dirección de Obra & BIM"
                      value={memberForm.role}
                      onChange={(e) => setMemberForm({ ...memberForm, role: e.target.value })}
                    />
                  </div>

                  <div className="col-12 col-md-2">
                    <label className="form-label small fw-semibold">Orden Visual</label>
                    <input
                      type="number"
                      min="1"
                      className="form-control rounded-3"
                      value={memberForm.order}
                      onChange={(e) => setMemberForm({ ...memberForm, order: parseInt(e.target.value, 10) || 1 })}
                    />
                    <div className="form-text" style={{ fontSize: '0.7rem' }}>
                      1 = 1°, 2 = 2°...
                    </div>
                  </div>

                  <div className="col-12">
                    <label className="form-label small fw-semibold">Foto de Perfil (Avatar)</label>
                    <input
                      type="file"
                      accept="image/*"
                      className="form-control rounded-3"
                      onChange={(e) => setMemberAvatarFile(e.target.files[0] || null)}
                    />
                    {editingMember && editingMember.avatar && !memberAvatarFile && (
                      <div className="mt-2 d-flex align-items-center gap-2">
                        <img
                          src={resolveMediaUrl(editingMember.avatar)}
                          alt=""
                          className="rounded-circle"
                          style={{ width: '40px', height: '40px', objectFit: 'cover' }}
                        />
                        <span className="small text-muted">Foto actual en uso</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="d-flex justify-content-end gap-2 mt-4">
                  <button
                    type="button"
                    className="btn btn-outline-secondary rounded-pill px-4"
                    onClick={handleCancelMemberForm}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="btn btn-dark rounded-pill px-4"
                    disabled={savingMember}
                  >
                    {savingMember ? 'Guardando...' : editingMember ? 'Guardar Cambios' : 'Crear Integrante'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {loadingTeam ? (
            <div className="text-center py-5">
              <LoadingSpinner />
            </div>
          ) : team.length === 0 ? (
            <div
              className="text-center py-5 px-3 rounded-4"
              style={{ background: '#fff', border: '1px dashed rgba(15,27,42,0.18)' }}
            >
              <h2 className="h5 fw-bold mb-2">No hay integrantes registrados en {activeProfile.name}</h2>
              <p className="text-muted small mb-4" style={{ maxWidth: '420px', margin: '0 auto' }}>
                Configura los miembros que se presentarán en la sección &ldquo;Equipo&rdquo; del portfolio de {activeProfile.name}.
              </p>
              <button
                type="button"
                className="btn btn-dark rounded-pill px-4 py-2 fw-semibold"
                onClick={() => {
                  setEditingMember(null);
                  setMemberForm({ full_name: '', role: '', order: 1 });
                  setMemberAvatarFile(null);
                  setShowMemberForm(true);
                }}
              >
                Cargar primer integrante
              </button>
            </div>
          ) : (
            <div
              className="table-responsive rounded-4 shadow-sm"
              style={{ background: '#fff', border: '1px solid rgba(15,27,42,0.08)' }}
            >
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr style={{ fontSize: '0.8rem', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    <th scope="col" style={{ width: '70px', paddingLeft: '1.25rem' }}>Foto</th>
                    <th scope="col">Nombre y Apellido</th>
                    <th scope="col">Cargo / Rol</th>
                    <th scope="col" style={{ width: '90px' }}>Orden</th>
                    <th scope="col" className="text-end" style={{ paddingRight: '1.25rem' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {team.map((member) => {
                    const avatarUrl = resolveMediaUrl(member.avatar);
                    const initials =
                      (member.full_name || '')
                        .split(' ')
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((p) => p[0]?.toUpperCase())
                        .join('') || 'EQ';

                    return (
                      <tr key={member.id}>
                        <td style={{ paddingLeft: '1.25rem' }}>
                          {avatarUrl ? (
                            <img
                              src={avatarUrl}
                              alt={member.full_name}
                              className="rounded-circle"
                              style={{ width: '42px', height: '42px', objectFit: 'cover' }}
                            />
                          ) : (
                            <div
                              className="rounded-circle d-flex align-items-center justify-content-center text-muted fw-bold"
                              style={{ width: '42px', height: '42px', background: '#e9ecef', fontSize: '0.8rem' }}
                            >
                              {initials}
                            </div>
                          )}
                        </td>
                        <td>
                          <span className="fw-semibold text-dark d-block">
                            {member.full_name}
                          </span>
                        </td>
                        <td>
                          <span className="text-muted small">
                            {member.role || '—'}
                          </span>
                        </td>
                        <td>
                          <span className="badge rounded-pill bg-light text-dark border px-2 py-1">
                            #{member.order}
                          </span>
                        </td>
                        <td className="text-end" style={{ paddingRight: '1.25rem' }}>
                          <div className="btn-group btn-group-sm">
                            <button
                              type="button"
                              className="btn btn-outline-dark rounded-start-pill px-3"
                              onClick={() => handleStartEditMember(member)}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline-danger rounded-end-pill px-3"
                              onClick={() => handleDeleteMember(member)}
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 3: SECCIÓN NOSOTROS E INFORMACIÓN DE CONTACTO */}
      {/* ============================================================== */}
      {activeTab === 'about' && isAdminOrOwner && (
        <div>
          {loadingAbout ? (
            <div className="text-center py-5">
              <LoadingSpinner />
            </div>
          ) : (
            <form onSubmit={handleSaveAbout} className="d-flex flex-column gap-4">
              <div
                className="card border-0 shadow-sm rounded-4 p-4"
                style={{ background: '#fff', border: '1px solid rgba(15, 27, 42, 0.08)' }}
              >
                <div className="mb-3">
                  <h2 className="h5 fw-bold mb-1">Imagen principal — {activeProfile.name}</h2>
                  <p className="text-muted small mb-0">
                    Esta imagen identifica al estudio en el Hero de su portada pública.
                  </p>
                </div>
                <div className="d-flex flex-column flex-sm-row align-items-sm-center gap-3">
                  {avatarPreviewUrl ? (
                    <img
                      src={avatarPreviewUrl}
                      alt={`Avatar de ${activeProfile.name}`}
                      className="rounded-3 border"
                      style={{ width: '144px', height: '104px', objectFit: 'cover' }}
                      onError={() =>
                        setAvatarPreview({ profileId: Number(activeProfile.id), url: null })
                      }
                    />
                  ) : (
                    <div
                      className="rounded-3 border d-flex align-items-center justify-content-center text-muted small"
                      style={{ width: '144px', height: '104px', background: '#f8f9fa' }}
                    >
                      Sin avatar cargado
                    </div>
                  )}
                  <div className="flex-grow-1">
                    <label htmlFor="studioAvatar" className="form-label small fw-semibold">
                      Seleccionar imagen
                    </label>
                    <input
                      id="studioAvatar"
                      type="file"
                      accept="image/*"
                      className="form-control rounded-3"
                      onChange={(event) => {
                        const file = event.target.files?.[0] || null;
                        if (file && !file.type.startsWith('image/')) {
                          setFeedback({ type: 'danger', message: 'El avatar debe ser un archivo de imagen.' });
                          setAvatarFile(null);
                          clearAvatarPreview();
                          event.target.value = '';
                          return;
                        }
                        if (file && file.size > 10 * 1024 * 1024) {
                          setFeedback({ type: 'danger', message: 'La imagen no puede superar los 10 MiB.' });
                          setAvatarFile(null);
                          clearAvatarPreview();
                          event.target.value = '';
                          return;
                        }
                        setFeedback(null);
                        setAvatarFile(file);
                        clearAvatarPreview();
                        if (file) {
                          const previewUrl = URL.createObjectURL(file);
                          avatarPreviewUrlRef.current = previewUrl;
                          setAvatarPreview({ profileId: Number(selectedProfileId), url: previewUrl });
                        }
                      }}
                    />
                    <small className="text-muted d-block mt-1">
                      Podés reemplazar la imagen actual. Tamaño máximo: 10 MiB.
                    </small>
                  </div>
                </div>
              </div>

              {/* Tarjeta 1: Información Institucional (Sección Nosotros) */}
              <div
                className="card border-0 shadow-sm rounded-4 p-4"
                style={{ background: '#fff', border: '1px solid rgba(15, 27, 42, 0.08)' }}
              >
                <div className="mb-4">
                  <h2 className="h5 fw-bold mb-1">
                    Información Institucional — {activeProfile.name}
                  </h2>
                  <p className="text-muted small mb-0">
                    Modifica el título, el manifiesto y la imagen panorámica de fondo que se muestran en la sección &ldquo;Nosotros&rdquo; de {activeProfile.name}.
                  </p>
                </div>

                <div className="row g-4">
                  <div className="col-12">
                    <label className="form-label small fw-semibold">Título Principal</label>
                    <input
                      type="text"
                      className="form-control rounded-3"
                      placeholder="Ej. DISEÑAMOS EL ESPACIO QUE TRANSFORMA TU VIDA"
                      value={aboutForm.title}
                      onChange={(e) => setAboutForm({ ...aboutForm, title: e.target.value })}
                    />
                  </div>

                  <div className="col-12">
                    <label className="form-label small fw-semibold">Cuerpo / Manifiesto del Estudio</label>
                    <textarea
                      rows={5}
                      className="form-control rounded-3"
                      placeholder="Describe la visión, metodología y trayectoria del estudio..."
                      value={aboutForm.description}
                      onChange={(e) => setAboutForm({ ...aboutForm, description: e.target.value })}
                    />
                  </div>

                  <div className="col-12 col-md-6">
                    <label className="form-label small fw-semibold">Imagen de Fondo de la Sección (Panorámica)</label>
                    <input
                      type="file"
                      accept="image/*"
                      className="form-control rounded-3"
                      onChange={(e) => setAboutImageFile(e.target.files[0] || null)}
                    />
                    <small className="text-muted d-block mt-1">
                      Formatos recomendados: JPG, PNG o WebP horizontal. Si no tiene imagen, se mantiene el fondo institucional del estudio.
                    </small>
                  </div>

                  {aboutRecord && aboutRecord.image && (
                    <div className="col-12 col-md-6">
                      <label className="form-label small fw-semibold d-block">Imagen de Fondo Actual</label>
                      <div
                        className="rounded-3 p-2 border d-inline-block"
                        style={{ background: '#f8f9fa', maxWidth: '240px' }}
                      >
                        <img
                          src={resolveMediaUrl(aboutRecord.image)}
                          alt="Fondo institucional actual"
                          className="img-fluid rounded"
                          style={{ maxHeight: '160px', objectFit: 'cover' }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Tarjeta 2: Información de Contacto y Redes Sociales */}
              <div
                className="card border-0 shadow-sm rounded-4 p-4"
                style={{ background: '#fff', border: '1px solid rgba(15, 27, 42, 0.08)' }}
              >
                <div className="mb-4">
                  <h2 className="h5 fw-bold mb-1">Información de Contacto y Redes</h2>
                  <p className="text-muted small mb-0">
                    Cómo pueden comunicarse los clientes e interesados con tu estudio. Se verá reflejado en la tarjeta de contacto y en el pie de página de la Home.
                  </p>
                </div>

                <div className="d-flex flex-column gap-3">
                  <div>
                    <label className="form-label small fw-semibold d-inline-flex align-items-center gap-2 mb-1">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="2" y="4" width="20" height="16" rx="2" />
                        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                      </svg>
                      <span>Email de contacto</span>
                    </label>
                    <input
                      type="email"
                      className="form-control rounded-3"
                      placeholder="contacto@vertice.com"
                      value={studioContactForm.contact_email}
                      onChange={(e) =>
                        setStudioContactForm({
                          ...studioContactForm,
                          contact_email: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div>
                    <label className="form-label small fw-semibold d-inline-flex align-items-center gap-2 mb-1">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                      </svg>
                      <span>Teléfono</span>
                    </label>
                    <input
                      type="text"
                      className="form-control rounded-3"
                      placeholder="+54 9 261 555-1234"
                      value={studioContactForm.phone}
                      onChange={(e) =>
                        setStudioContactForm({ ...studioContactForm, phone: e.target.value })
                      }
                    />
                  </div>

                  <div>
                    <label className="form-label small fw-semibold d-inline-flex align-items-center gap-2 mb-1">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
                        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                        <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
                      </svg>
                      <span>Instagram</span>
                    </label>
                    <input
                      type="text"
                      className="form-control rounded-3"
                      placeholder="@vertice.estudio"
                      value={studioContactForm.instagram}
                      onChange={(e) =>
                        setStudioContactForm({
                          ...studioContactForm,
                          instagram: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              {/* Tarjeta 3: Ubicación del Estudio */}
              <div
                className="card border-0 shadow-sm rounded-4 p-4"
                style={{ background: '#fff', border: '1px solid rgba(15, 27, 42, 0.08)' }}
              >
                <div className="mb-3 d-flex align-items-center gap-2">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  <div>
                    <h2 className="h5 fw-bold mb-0">Ubicación</h2>
                    <p className="text-muted small mb-0">Ubicación principal de tu estudio</p>
                  </div>
                </div>

                <div>
                  <label className="form-label small fw-semibold mb-1">
                    Ciudad / Provincia / País
                  </label>
                  <input
                    type="text"
                    className="form-control rounded-3"
                    placeholder="Mendoza, Argentina"
                    value={studioContactForm.location}
                    onChange={(e) =>
                      setStudioContactForm({ ...studioContactForm, location: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="d-flex justify-content-end pt-2">
                <button
                  type="submit"
                  className="btn btn-dark rounded-pill px-4 py-2 fw-semibold"
                  disabled={savingAbout}
                >
                  {savingAbout ? 'Guardando cambios...' : 'Guardar Información Institucional y de Contacto'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 4: CONSULTAS DEL ESTUDIO */}
      {/* ============================================================== */}
      {activeTab === 'contacts' && (
        <div>
          {loadingContacts ? (
            <div className="text-center py-5">
              <LoadingSpinner />
            </div>
          ) : contacts.length === 0 ? (
            <div
              className="text-center py-5 px-3 rounded-4"
              style={{ background: '#fff', border: '1px dashed rgba(15,27,42,0.18)' }}
            >
              <h2 className="h5 fw-bold mb-2">No hay consultas registradas en {activeProfile.name}</h2>
              <p className="text-muted small mb-0" style={{ maxWidth: '420px', margin: '0 auto' }}>
                Las consultas y solicitudes de presupuesto enviadas a {activeProfile.name} aparecerán aquí.
              </p>
            </div>
          ) : (
            <>
              {/* Píldoras de resumen por Estado */}
              <div className="d-flex flex-wrap gap-2 mb-3">
                <button
                  type="button"
                  className={`btn btn-sm rounded-pill px-3 py-1 fw-semibold ${
                    contactStatusFilter === 'all' ? 'btn-dark' : 'btn-outline-secondary'
                  }`}
                  onClick={() => setContactStatusFilter('all')}
                >
                  Todas ({contactStatusCounts.all})
                </button>
                {CONTACT_STATUS_OPTIONS.map((opt) => {
                  const isActive = contactStatusFilter === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      className="btn btn-sm rounded-pill px-3 py-1 fw-semibold"
                      style={{
                        background: isActive ? opt.color : opt.bg,
                        color: isActive ? '#fff' : opt.color,
                        border: `1px solid ${opt.color}33`,
                      }}
                      title={opt.meaning}
                      onClick={() =>
                        setContactStatusFilter(isActive ? 'all' : opt.value)
                      }
                    >
                      {opt.label} ({contactStatusCounts[opt.value] || 0})
                    </button>
                  );
                })}
              </div>

              {/* Barra de filtros por búsqueda, estado y rango de fechas */}
              <div
                className="p-3 rounded-4 mb-3 shadow-sm"
                style={{ background: '#fff', border: '1px solid rgba(15, 27, 42, 0.08)' }}
              >
                <div className="row g-2 align-items-end">
                  <div className="col-12 col-md-4">
                    <label className="form-label small fw-semibold text-muted mb-1">
                      Buscar consulta
                    </label>
                    <input
                      type="text"
                      className="form-control form-control-sm rounded-pill px-3"
                      placeholder="Remitente, email, proyecto o mensaje..."
                      value={contactSearchQuery}
                      onChange={(e) => setContactSearchQuery(e.target.value)}
                    />
                  </div>
                  <div className="col-12 col-sm-4 col-md-3">
                    <label className="form-label small fw-semibold text-muted mb-1">
                      Estado
                    </label>
                    <select
                      className="form-select form-select-sm rounded-pill px-3"
                      value={contactStatusFilter}
                      onChange={(e) => setContactStatusFilter(e.target.value)}
                      aria-label="Filtrar por estado de consulta"
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
                      value={contactDateFrom}
                      onChange={(e) => setContactDateFrom(e.target.value)}
                      aria-label="Fecha desde"
                    />
                  </div>
                  <div className="col-6 col-sm-4 col-md-2">
                    <label className="form-label small fw-semibold text-muted mb-1">
                      Hasta fecha
                    </label>
                    <input
                      type="date"
                      className="form-control form-control-sm rounded-pill px-3"
                      value={contactDateTo}
                      onChange={(e) => setContactDateTo(e.target.value)}
                      aria-label="Fecha hasta"
                    />
                  </div>
                  <div className="col-12 col-md-1 d-flex justify-content-end">
                    {(contactStatusFilter !== 'all' ||
                      contactDateFrom ||
                      contactDateTo ||
                      contactSearchQuery) && (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary rounded-pill px-3 w-100"
                        title="Limpiar filtros"
                        onClick={() => {
                          setContactStatusFilter('all');
                          setContactDateFrom('');
                          setContactDateTo('');
                          setContactSearchQuery('');
                        }}
                      >
                        Limpiar
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {filteredContacts.length === 0 ? (
                <div
                  className="text-center py-4 px-3 rounded-4 text-muted"
                  style={{ background: '#fff', border: '1px solid rgba(15, 27, 42, 0.08)' }}
                >
                  No hay consultas que coincidan con los filtros seleccionados.
                </div>
              ) : (
                <div
                  className="table-responsive rounded-4 shadow-sm"
                  style={{ background: '#fff', border: '1px solid rgba(15, 27, 42, 0.08)' }}
                >
                  <table className="table table-hover align-middle mb-0">
                    <thead className="table-light">
                      <tr style={{ fontSize: '0.8rem', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                        <th scope="col" className="py-3 px-3">Fecha</th>
                        <th scope="col" className="py-3 px-3">Remitente</th>
                        <th scope="col" className="py-3 px-3">Proyecto asociado</th>
                        <th scope="col" className="py-3 px-3">Estado</th>
                        <th scope="col" className="py-3 px-3">Mensaje</th>
                        <th scope="col" className="py-3 px-3 text-end">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredContacts.map((c) => {
                        const statusMeta = getContactStatusMeta(c.status || 'pending');
                        const isUpdating = updatingContactId === c.id;
                        return (
                          <tr key={c.id}>
                            <td className="px-3 small text-muted text-nowrap">
                              {formatDate(c.created_at)}
                            </td>
                            <td className="px-3">
                              <div className="fw-semibold small">{c.name}</div>
                              <div className="small text-muted">{c.email}</div>
                            </td>
                            <td className="px-3" style={{ minWidth: '185px' }}>
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
                                  aria-label={`Proyecto asociado para consulta de ${c.name}`}
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
                            <td className="px-3" style={{ minWidth: '155px' }}>
                              {isAdminOrOwner ? (
                                <select
                                  className="form-select form-select-sm rounded-pill px-3 fw-semibold"
                                  style={{
                                    fontSize: '0.78rem',
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
                                  aria-label={`Estado de consulta de ${c.name}`}
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
                                  className="badge rounded-pill px-3 py-1 fw-semibold"
                                  style={{
                                    background: statusMeta.bg,
                                    color: statusMeta.color,
                                    fontSize: '0.72rem',
                                  }}
                                  title={statusMeta.meaning}
                                >
                                  {statusMeta.label}
                                </span>
                              )}
                            </td>
                            <td className="px-3 small text-muted" style={{ maxWidth: '280px' }}>
                              <div
                                className="text-truncate"
                                style={{ cursor: 'pointer' }}
                                onClick={() => setSelectedContact(c)}
                                title={c.message}
                              >
                                {c.message}
                              </div>
                            </td>
                            <td className="px-3 text-end text-nowrap">
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-dark rounded-pill px-3 me-1"
                                onClick={() => setSelectedContact(c)}
                              >
                                Ver
                              </button>
                              {isAdminOrOwner && (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-danger rounded-pill px-2"
                                  disabled={deletingContactId === c.id}
                                  onClick={() => handleDeleteContact(c)}
                                  title="Eliminar consulta"
                                >
                                  {deletingContactId === c.id ? '...' : '✕'}
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

          {selectedContact && (
            <div
              className="modal d-block"
              tabIndex="-1"
              style={{ background: 'rgba(15, 27, 42, 0.65)' }}
              onClick={() => setSelectedContact(null)}
            >
              <div
                className="modal-dialog modal-dialog-centered"
                style={{ maxWidth: '600px' }}
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
                          CONSULTA #{selectedContact.id} · {activeProfile.name}
                        </span>
                        {(() => {
                          const stMeta = getContactStatusMeta(selectedContact.status || 'pending');
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
                      <h3 className="h5 fw-bold mb-0">Detalle y Gestión de Consulta</h3>
                    </div>
                    <button
                      type="button"
                      className="btn-close"
                      aria-label="Cerrar"
                      onClick={() => setSelectedContact(null)}
                    />
                  </div>
                  <div className="modal-body py-3">
                    <div className="p-3 bg-light rounded-3 mb-3 small d-flex flex-column gap-1">
                      <div>
                        <strong>Fecha:</strong> {formatDate(selectedContact.created_at)}
                      </div>
                      <div>
                        <strong>Estudio:</strong> {activeProfile.name}
                      </div>
                      <div>
                        <strong>Remitente:</strong> {selectedContact.name} (
                        <a
                          href={buildContactReplyMailto(selectedContact, activeProfile.name)}
                          className="text-decoration-none"
                        >
                          {selectedContact.email}
                        </a>
                        )
                      </div>
                      <div>
                        <strong>Proyecto asociado:</strong>{' '}
                        {selectedContact.project_title || 'Sin proyecto asociado'}
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
                            value={selectedContact.status || 'pending'}
                            disabled={updatingContactId === selectedContact.id}
                            onChange={(e) =>
                              handleUpdateContact(selectedContact, { status: e.target.value })
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
                            value={selectedContact.project ?? ''}
                            disabled={updatingContactId === selectedContact.id}
                            onChange={(e) => {
                              const val = e.target.value;
                              handleUpdateContact(selectedContact, {
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
                      Mensaje del Interesado:
                    </div>
                    <div
                      className="p-3 rounded-3"
                      style={{
                        background: '#f8f9fa',
                        border: '1px solid rgba(15, 27, 42, 0.08)',
                        whiteSpace: 'pre-wrap',
                        fontSize: '0.88rem',
                        lineHeight: 1.6,
                        maxHeight: '240px',
                        overflowY: 'auto',
                      }}
                    >
                      {selectedContact.message}
                    </div>
                  </div>
                  <div className="modal-footer border-0 pt-0 justify-content-between">
                    <a
                      href={buildContactReplyMailto(selectedContact, activeProfile.name)}
                      className="btn btn-outline-dark btn-sm rounded-pill px-3 fw-semibold"
                    >
                      Responder por Email
                    </a>
                    <button
                      type="button"
                      className="btn btn-dark rounded-pill px-4 fw-semibold"
                      onClick={() => setSelectedContact(null)}
                    >
                      Cerrar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
