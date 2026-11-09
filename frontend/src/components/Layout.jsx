import { useState, useEffect, useMemo, useCallback } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import Footer from './Footer';
import { useAuth } from '../context/AuthContext';
import { getProfiles } from '../services/api';

const ACTIVE_STUDIO_STORAGE_KEY = 'vertice_active_studio_slug';

function toList(data) {
  if (Array.isArray(data)) return data;
  return data?.results ?? [];
}

export default function Layout() {
  const { user } = useAuth();
  const location = useLocation();

  const [studioContext, setStudioContextState] = useState({
    profile: null,
    hasAbout: false,
    hasTeam: false,
    availableStudios: [],
    initializingStudio: true,
  });

  const setStudioContext = useCallback((updater) => {
    setStudioContextState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
      if (next.profile?.slug) {
        try {
          sessionStorage.setItem(ACTIVE_STUDIO_STORAGE_KEY, next.profile.slug);
        } catch {
          // Ignore storage errors
        }
      }
      return { ...next, initializingStudio: false };
    });
  }, []);

  const selectActiveStudio = useCallback((nextProfile) => {
    if (!nextProfile) return;
    try {
      if (nextProfile.slug) {
        sessionStorage.setItem(ACTIVE_STUDIO_STORAGE_KEY, nextProfile.slug);
      }
    } catch {
      // Ignore storage errors
    }
    setStudioContextState((prev) => ({
      ...prev,
      profile: nextProfile,
      initializingStudio: false,
    }));
  }, []);

  // Cuando el usuario navega directamente a vistas privadas (/solicitudes, /perfil, /solicitud)
  // sin haber pasado antes por Home, resolvemos el estudio activo acorde a su rol y sesión.
  // En /admin, AdminDashboard resuelve los perfiles autorizados y sincroniza mediante selectActiveStudio.
  const isPortfolioHome =
    location.pathname === '/' || /^\/estudios\/[^/]+\/?$/.test(location.pathname);
  const isAdminDashboardRoute = location.pathname === '/admin';

  useEffect(() => {
    if (isPortfolioHome || isAdminDashboardRoute) return;

    let cancelled = false;
    const role = (user?.role || '').toLowerCase();
    const isAdmin = role === 'admin';
    const isStudioMember = role === 'owner' || role === 'collaborator';

    async function ensureStudioContext() {
      try {
        const res = await getProfiles(isStudioMember ? { mine: 1 } : undefined);
        if (cancelled) return;

        const list = toList(res.data);
        let savedSlug = null;
        try {
          savedSlug = sessionStorage.getItem(ACTIVE_STUDIO_STORAGE_KEY);
        } catch {
          savedSlug = null;
        }

        setStudioContextState((prev) => {
          const currentSlug = prev.profile?.slug || savedSlug;
          const matched =
            (currentSlug && list.find((s) => s.slug === currentSlug)) ||
            list[0] ||
            null;

          if (matched?.slug) {
            try {
              sessionStorage.setItem(ACTIVE_STUDIO_STORAGE_KEY, matched.slug);
            } catch {
              // Ignore
            }
          }

          return {
            ...prev,
            profile: matched,
            availableStudios: isAdmin ? list : [],
            initializingStudio: false,
          };
        });
      } catch {
        if (!cancelled) {
          setStudioContextState((prev) => ({ ...prev, initializingStudio: false }));
        }
      }
    }

    ensureStudioContext();

    return () => {
      cancelled = true;
    };
  }, [isPortfolioHome, isAdminDashboardRoute, user?.id, user?.role]);

  const outletValue = useMemo(
    () => ({ studioContext, setStudioContext, selectActiveStudio }),
    [studioContext, setStudioContext, selectActiveStudio]
  );

  return (
    <div className="d-flex flex-column min-vh-100">
      <Navbar studioContext={studioContext} />
      <main className={`flex-grow-1 ${!isPortfolioHome ? 'vertice-main--offset' : ''}`}>
        <Outlet context={outletValue} />
      </main>
      <Footer studioContext={studioContext} />
    </div>
  );
}
