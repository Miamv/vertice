import { Link, useLocation } from 'react-router-dom';
import useScrollTo from '../hooks/useScrollTo';
import studio from '../config/studio';

export default function Footer({ studioContext }) {
  const scrollTo = useScrollTo();
  const location = useLocation();

  const slugMatch = location.pathname.match(/^\/estudios\/([^/]+)/);
  const urlSlug = slugMatch ? decodeURIComponent(slugMatch[1]) : null;

  const contextProfile = studioContext?.profile || null;
  const activeProfile =
    !urlSlug || contextProfile?.slug === urlSlug ? contextProfile : null;

  const brandName = activeProfile?.name || studio.platformName || 'Vértice';
  const resolvedSlug = urlSlug || activeProfile?.slug || null;
  const basePath = resolvedSlug ? `/estudios/${resolvedSlug}` : '/';

  const phone = activeProfile?.phone?.trim() || '';
  const email = activeProfile?.contact_email?.trim() || '';
  const specialty = activeProfile?.specialty?.trim() || '';

  function handleSectionClick(e, sectionId) {
    e.preventDefault();
    scrollTo(sectionId, basePath);
  }

  return (
    <footer className="vertice-footer">
      <div className="container">
        <div className="vertice-footer__grid">
          <div className="vertice-footer__brand">
            <p className="vertice-footer__heading">Estudio</p>
            <Link
              to={basePath}
              className="vertice-footer__brand-lockup"
              aria-label={`${brandName} inicio`}
            >
              <span className="vertice-navbar__brand-dot" aria-hidden="true" />
              <span>{brandName}</span>
            </Link>
            {specialty && (
              <p className="text-muted small mt-2 mb-0">{specialty}</p>
            )}
          </div>

          <div>
            <p className="vertice-footer__heading">Navegación</p>
            <ul className="vertice-footer__list">
              <li>
                <Link to={basePath}>Home</Link>
              </li>
              <li>
                <a
                  href={`${basePath}#proyectos`}
                  onClick={(e) => handleSectionClick(e, 'proyectos')}
                >
                  Proyectos
                </a>
              </li>
              {(!activeProfile || studioContext?.hasTeam || studioContext?.hasAbout) && (
                <li>
                  <a
                    href={`${basePath}#nosotros`}
                    onClick={(e) => handleSectionClick(e, 'nosotros')}
                  >
                    Nosotros
                  </a>
                </li>
              )}
              <li>
                <a
                  href={`${basePath}#contacto`}
                  onClick={(e) => handleSectionClick(e, 'contacto')}
                >
                  Contacto
                </a>
              </li>
            </ul>
          </div>

          <div>
            <p className="vertice-footer__heading">Contacto</p>
            <ul className="vertice-footer__list vertice-footer__list--contact">
              {phone && (
                <li>
                  <span className="vertice-footer__icon" aria-hidden="true">◷</span>
                  <a href={`tel:${phone}`}>{phone}</a>
                </li>
              )}
              {email && (
                <li>
                  <span className="vertice-footer__icon" aria-hidden="true">✉</span>
                  <a href={`mailto:${email}`}>{email}</a>
                </li>
              )}
              {!phone && !email && (
                <li>
                  <span className="vertice-footer__icon" aria-hidden="true">✉</span>
                  <a
                    href={`${basePath}#contacto`}
                    onClick={(e) => handleSectionClick(e, 'contacto')}
                  >
                    Enviar consulta online
                  </a>
                </li>
              )}
            </ul>
          </div>

          <div>
            <p className="vertice-footer__heading">Plataforma</p>
            <ul className="vertice-footer__list">
              <li>
                <span className="text-muted small">Arquitectura Multiestudio Vértice</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}
