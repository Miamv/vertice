import { useState, useEffect, useCallback } from 'react';
import {
  getProfileBySlug,
  getProfiles,
  getProjects,
  getAbout,
  getTeam,
} from '../services/api';

function toList(data) {
  if (Array.isArray(data)) return data;
  return data?.results ?? [];
}

function errorMessage(reason, fallback) {
  return reason?.response?.data?.detail || reason?.message || fallback;
}

/**
 * Hook que centraliza la resolución del estudio activo (por `slug` o estudio principal/propio)
 * y la carga aislada de todos sus recursos públicos (`projects`, `about`, `team`).
 *
 * Reglas de visibilidad multiestudio:
 * - Visitante anónimo o VIEWER: solo ve el estudio correspondiente al link que abrió (`/estudios/:slug` o el principal en `/`). Nunca recibe ni ve el listado de otros estudios.
 * - OWNER o COLLABORATOR: solo puede ver el perfil del estudio al que está asociado.
 * - ADMIN: tiene permiso global para ver y alternar entre todos los estudios de la plataforma.
 */
export default function useStudioPortfolio(slug, user) {
  const isAdmin = user?.role === 'admin';
  const isStudioMember = user?.role === 'owner' || user?.role === 'collaborator';
  const roleKey = user ? `${user.id || user.username}:${user.role}` : 'anon';

  const [state, setState] = useState({
    loading: true,
    notFound: false,
    profile: null,
    ownStudio: null,
    availableStudios: [],
    projects: [],
    aboutData: null,
    teamMembers: [],
    profileError: null,
    projectsError: null,
    aboutError: null,
    teamError: null,
    resolvedKey: null,
  });

  const [reloadKey, setReloadKey] = useState(0);
  const currentKey = `${slug || '__root__'}:${roleKey}:${reloadKey}`;

  if (state.resolvedKey !== currentKey && !state.loading) {
    setState((prev) => ({
      ...prev,
      loading: true,
      notFound: false,
      profileError: null,
      projectsError: null,
      aboutError: null,
      teamError: null,
    }));
  }

  useEffect(() => {
    let cancelled = false;

    async function fetchStudioResources(resolvedProfile, studiosList = []) {
      const studioParams = { profile_slug: resolvedProfile.slug };

      const [projectsRes, aboutRes, teamRes] = await Promise.allSettled([
        getProjects(studioParams),
        getAbout(studioParams),
        getTeam(studioParams),
      ]);

      if (cancelled) return;

      const nextProjects =
        projectsRes.status === 'fulfilled' ? toList(projectsRes.value.data) : [];
      const nextProjectsError =
        projectsRes.status === 'rejected'
          ? errorMessage(projectsRes.reason, 'Error al cargar proyectos del estudio.')
          : null;

      const nextAboutList =
        aboutRes.status === 'fulfilled' ? toList(aboutRes.value.data) : [];
      const nextAboutData = nextAboutList[0] || null;
      const nextAboutError =
        aboutRes.status === 'rejected'
          ? errorMessage(aboutRes.reason, 'Error al cargar la sección institucional.')
          : null;

      const nextTeam =
        teamRes.status === 'fulfilled' ? toList(teamRes.value.data) : [];
      const nextTeamError =
        teamRes.status === 'rejected'
          ? errorMessage(teamRes.reason, 'Error al cargar el equipo del estudio.')
          : null;

      setState({
        loading: false,
        notFound: false,
        profile: resolvedProfile,
        ownStudio: isStudioMember ? resolvedProfile : null,
        availableStudios: isAdmin ? studiosList : [],
        projects: nextProjects,
        aboutData: nextAboutData,
        teamMembers: nextTeam,
        profileError: null,
        projectsError: nextProjectsError,
        aboutError: nextAboutError,
        teamError: nextTeamError,
        resolvedKey: currentKey,
      });
    }

    async function load() {
      // Caso 1: Ruta explícita /estudios/:slug
      if (slug) {
        // Solo ADMIN consulta la lista completa de estudios; un visitante/viewer solo pide el estudio de su link
        const promises = [getProfileBySlug(slug)];
        if (isAdmin) {
          promises.push(getProfiles());
        } else if (isStudioMember) {
          promises.push(getProfiles({ mine: 1 }));
        }

        const [profileRes, listRes] = await Promise.allSettled(promises);

        if (cancelled) return;

        const studiosList =
          listRes && listRes.status === 'fulfilled' ? toList(listRes.value.data) : [];

        if (profileRes.status === 'rejected') {
          const status = profileRes.reason?.response?.status;
          const is404 = status === 404;

          setState({
            loading: false,
            notFound: is404,
            profile: null,
            ownStudio: isStudioMember ? studiosList[0] || null : null,
            availableStudios: isAdmin ? studiosList : [],
            projects: [],
            aboutData: null,
            teamMembers: [],
            profileError: is404
              ? null
              : errorMessage(
                  profileRes.reason,
                  'No se pudo cargar la información del estudio.'
                ),
            projectsError: null,
            aboutError: null,
            teamError: null,
            resolvedKey: currentKey,
          });
          return;
        }

        const resolvedProfile = profileRes.value.data;
        await fetchStudioResources(resolvedProfile, studiosList);
        return;
      }

      // Caso 2: Ruta raíz /
      // - Para OWNER/COLLABORATOR el backend devuelve únicamente su estudio asociado.
      // - Para VIEWER/anónimo el backend devuelve únicamente el estudio principal (1 perfil).
      // - Para ADMIN el backend devuelve todos los estudios y carga el primero por defecto.
      try {
        const listRes = await getProfiles(isStudioMember ? { mine: 1 } : undefined);
        if (cancelled) return;

        const studiosList = toList(listRes.data);
        const primaryProfile = studiosList[0] || null;

        if (!primaryProfile) {
          setState({
            loading: false,
            notFound: false,
            profile: null,
            ownStudio: null,
            availableStudios: [],
            projects: [],
            aboutData: null,
            teamMembers: [],
            profileError: null,
            projectsError: null,
            aboutError: null,
            teamError: null,
            resolvedKey: currentKey,
          });
          return;
        }

        await fetchStudioResources(primaryProfile, studiosList);
      } catch (err) {
        if (cancelled) return;
        setState({
          loading: false,
          notFound: false,
          profile: null,
          ownStudio: null,
          availableStudios: [],
          projects: [],
          aboutData: null,
          teamMembers: [],
          profileError: errorMessage(err, 'No se pudo conectar con el servidor.'),
          projectsError: null,
          aboutError: null,
          teamError: null,
          resolvedKey: currentKey,
        });
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [slug, isAdmin, isStudioMember, reloadKey, currentKey]);

  const reload = useCallback(() => {
    setReloadKey((k) => k + 1);
  }, []);

  return {
    ...state,
    reload,
  };
}
