import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import useScrollTo from '../hooks/useScrollTo';
import studio from '../config/studio';
import { useAuth } from '../context/AuthContext';

export default function Navbar({ studioContext }) {
  const scrollTo = useScrollTo();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const lastScrollYRef = useRef(0);
  const menuRef = useRef(null);
  const location = useLocation();

  const isPortfolioHome =
    location.pathname === '/' || /^\/estudios\/[^/]+\/?$/.test(location.pathname);

  useEffect(() => {
    let ticking = false;
    lastScrollYRef.current = Math.max(window.scrollY || 0, 0);

    function updateNavbarOnScroll() {
      const currentY = Math.max(window.scrollY || 0, 0);
      const prevY = lastScrollYRef.current;
      const delta = currentY - prevY;

      const nextScrolled = currentY > 24;
      setIsScrolled((prev) => (prev === nextScrolled ? prev : nextScrolled));

      if (currentY <= 16) {
        setIsHidden(false);
        lastScrollYRef.current = currentY;
      } else if (delta > 6 && currentY > 64) {
        setIsHidden(true);
        setMenuOpen(false);
        lastScrollYRef.current = currentY;
      } else if (delta < -6) {
        setIsHidden(false);
        lastScrollYRef.current = currentY;
      }

      ticking = false;
    }

    function handleScroll() {
      if (!ticking) {
        window.requestAnimationFrame(updateNavbarOnScroll);
        ticking = true;
      }
    }

    updateNavbarOnScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const roleLabel = user?.role ?? '';
  const canAccessPanel =
    user?.role === 'admin' || user?.role === 'owner' || user?.role === 'collaborator';

  const slugMatch = location.pathname.match(/^\/estudios\/([^/]+)/);
  const urlSlug = slugMatch ? decodeURIComponent(slugMatch[1]) : null;

  const contextProfile = studioContext?.profile || null;
  const activeProfile =
    !urlSlug || contextProfile?.slug === urlSlug ? contextProfile : null;

  const brandName = activeProfile?.name || studio.platformName || 'Vértice';
  const resolvedSlug = urlSlug || activeProfile?.slug || null;
  const basePath = resolvedSlug ? `/estudios/${resolvedSlug}` : '/';

  const navLinks = [
    { label: 'Home', sectionId: 'inicio', href: basePath, show: true },
    {
      label: 'Proyectos',
      sectionId: 'proyectos',
      href: `${basePath}#proyectos`,
      show: true,
    },
    {
      label: 'Nosotros',
      sectionId: 'nosotros',
      href: `${basePath}#nosotros`,
      show: !activeProfile || Boolean(studioContext?.hasTeam || studioContext?.hasAbout),
    },
    {
      label: 'Contacto',
      sectionId: 'contacto',
      href: `${basePath}#contacto`,
      show: true,
    },
  ].filter((item) => item.show);

  // Cierra el menú al cambiar de usuario o de ruta (actualización en fase de
  // render, sin efectos en cascada).
  const [prevMenuKey, setPrevMenuKey] = useState({
    path: location.pathname,
    user,
  });
  if (prevMenuKey.path !== location.pathname || prevMenuKey.user !== user) {
    setPrevMenuKey({ path: location.pathname, user });
    setMenuOpen(false);
    setIsHidden(false);
  }

  useEffect(() => {
    if (!menuOpen) return;

    function handlePointerDown(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }

    function handleKey(e) {
      if (e.key === 'Escape') setMenuOpen(false);
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menuOpen]);

  function handleAnchorClick(e, sectionId) {
    if (sectionId) {
      e.preventDefault();
      scrollTo(sectionId, basePath);
    }
  }

  function handleLogout() {
    logout();
    setMenuOpen(false);
  }

  return (
    <header
      className={`vertice-navbar ${isPortfolioHome ? 'vertice-navbar--home' : ''} ${
        isScrolled ? 'is-scrolled' : ''
      } ${isHidden ? 'is-hidden' : ''}`}
    >
      <nav className="navbar navbar-expand-lg vertice-navbar__nav">
        <div className="container vertice-navbar__container">
          <Link
            className="vertice-navbar__brand"
            to={basePath}
            onClick={(e) => handleAnchorClick(e, 'inicio')}
            aria-label={`${brandName} — inicio`}
          >
            <span className="vertice-navbar__brand-dot" aria-hidden="true" />
            <span className="vertice-navbar__brand-name">{brandName}</span>
          </Link>

          <button
            className="navbar-toggler vertice-navbar__toggler"
            type="button"
            data-bs-toggle="collapse"
            data-bs-target="#navbarContent"
            aria-controls="navbarContent"
            aria-expanded="false"
            aria-label="Abrir navegación"
          >
            <span className="navbar-toggler-icon" />
          </button>

          <div className="collapse navbar-collapse" id="navbarContent">
            <ul className="navbar-nav ms-auto align-items-lg-center vertice-navbar__links">
              {navLinks.map((link) => (
                <li className="nav-item" key={link.label}>
                  {link.sectionId ? (
                    <a
                      className="nav-link vertice-navbar__link"
                      href={link.href}
                      onClick={(e) => handleAnchorClick(e, link.sectionId)}
                    >
                      {link.label}
                    </a>
                  ) : (
                    <Link className="nav-link vertice-navbar__link" to={link.href}>
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}

              {canAccessPanel && (
                <li className="nav-item ms-lg-2 my-1 my-lg-0">
                  <Link to="/admin" className="vertice-navbar__admin-pill">
                    Admin
                  </Link>
                </li>
              )}

              {user ? (
                <li
                  className="nav-item d-flex align-items-center ms-lg-2 my-2 my-lg-0 vertice-userbox"
                  ref={menuRef}
                >
                  <button
                    type="button"
                    className="vertice-userbox__trigger"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    aria-label={`Cuenta de usuario (${roleLabel})`}
                    title="Cuenta de usuario"
                    onClick={() => setMenuOpen((v) => !v)}
                  >
                    <span className="vertice-navbar__user" aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="8" r="4.2" stroke="currentColor" strokeWidth="1.7" />
                        <path d="M5 20 C6.8 15.2 17.2 15.2 19 20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                      </svg>
                    </span>
                    <span className="vertice-userbox__role">{roleLabel}</span>
                  </button>
                  {menuOpen && (
                    <div className="vertice-userbox__menu" role="menu">
                      <div className="vertice-userbox__meta">
                        <div className="vertice-userbox__name text-capitalize">{user.username}</div>
                        {user.email && <div className="vertice-userbox__mail">{user.email}</div>}
                      </div>
                      <div className="vertice-userbox__divider" aria-hidden="true" />
                      <Link
                        to="/perfil"
                        className="vertice-userbox__item"
                        role="menuitem"
                        onClick={() => setMenuOpen(false)}
                      >
                        Mi Perfil
                      </Link>
                      <Link
                        to="/solicitudes"
                        className="vertice-userbox__item"
                        role="menuitem"
                        onClick={() => setMenuOpen(false)}
                      >
                        Mis Solicitudes
                      </Link>
                      {canAccessPanel && (
                        <>
                          <div className="vertice-userbox__divider" aria-hidden="true" />
                          <Link
                            to="/admin"
                            className="vertice-userbox__item"
                            role="menuitem"
                            onClick={() => setMenuOpen(false)}
                          >
                            Panel de Administración
                          </Link>
                        </>
                      )}
                      <div className="vertice-userbox__divider" aria-hidden="true" />
                      <button
                        type="button"
                        className="vertice-userbox__item text-danger"
                        role="menuitem"
                        onClick={handleLogout}
                      >
                        Cerrar sesión
                      </button>
                    </div>
                  )}
                </li>
              ) : (
                <li className="nav-item ms-lg-3 my-2 my-lg-0 vertice-userbox" ref={menuRef}>
                  <button
                    type="button"
                    className="vertice-navbar__user vertice-userbox__btn"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    aria-label="Acceso a la plataforma"
                    title="Acceso a la plataforma"
                    onClick={() => setMenuOpen((v) => !v)}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle cx="12" cy="8" r="4.2" stroke="currentColor" strokeWidth="1.6" />
                      <path d="M5 20 C6.8 15.2 17.2 15.2 19 20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  </button>
                  {menuOpen && (
                    <div className="vertice-userbox__menu" role="menu">
                      <Link
                        className="vertice-userbox__item"
                        role="menuitem"
                        to="/login"
                        onClick={() => setMenuOpen(false)}
                      >
                        Iniciar sesión
                      </Link>
                      <Link
                        className="vertice-userbox__item"
                        role="menuitem"
                        to="/registro"
                        onClick={() => setMenuOpen(false)}
                      >
                        Crear cuenta
                      </Link>
                      <div className="vertice-userbox__divider" aria-hidden="true" />
                      <div className="vertice-userbox__hint">Nuevas cuentas acceden como Viewer</div>
                    </div>
                  )}
                </li>
              )}
            </ul>
          </div>
        </div>
      </nav>
      <div className="vertice-navbar__rule container" aria-hidden="true" />
    </header>
  );
}
