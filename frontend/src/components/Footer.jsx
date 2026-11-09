import { Link, useLocation } from 'react-router-dom';
import useScrollTo from '../hooks/useScrollTo';
import studio from '../config/studio';

function resolveInstagramInfo(raw) {
  if (!raw || !raw.trim()) return null;
  const trimmed = raw.trim();
  const urlMatch = trimmed.match(/instagram\.com\/([^/?#]+)/i);
  const handle = (urlMatch ? urlMatch[1] : trimmed)
    .replace(/^@+/, '')
    .replace(/\/+$/, '')
    .trim();
  if (!handle) return null;
  return {
    label: `@${handle}`,
    url: /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://www.instagram.com/${encodeURIComponent(handle)}/`,
  };
}

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
  const studioLocation = activeProfile?.location?.trim() || '';
  const instagramInfo = resolveInstagramInfo(activeProfile?.instagram);
  const specialty = activeProfile?.specialty?.trim() || '';
  const whatsappDigits = phone.replace(/[^\d]/g, '');

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
              onClick={(e) => handleSectionClick(e, 'inicio')}
              aria-label={`${brandName} inicio`}
            >
              <span className="vertice-navbar__brand-dot" aria-hidden="true" />
              <span>{brandName}</span>
            </Link>
            {specialty && (
              <p className="text-muted small mt-2 mb-0">{specialty}</p>
            )}
            {studioLocation && (
              <p className="text-muted small mt-1 mb-0">{studioLocation}</p>
            )}
          </div>

          <div>
            <p className="vertice-footer__heading">Navegación</p>
            <ul className="vertice-footer__list">
              <li>
                <a
                  href={basePath}
                  onClick={(e) => handleSectionClick(e, 'inicio')}
                >
                  Home
                </a>
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
              {email && (
                <li>
                  <span className="vertice-footer__icon" aria-hidden="true">✉</span>
                  <a href={`mailto:${email}`}>{email}</a>
                </li>
              )}
              {phone && (
                <li>
                  <span className="vertice-footer__icon" aria-hidden="true">✆</span>
                  <a href={`tel:${phone}`}>{phone}</a>
                </li>
              )}
              {studioLocation && (
                <li>
                  <span className="vertice-footer__icon" aria-hidden="true">⌖</span>
                  <span className="small" style={{ color: 'var(--color-ink)' }}>{studioLocation}</span>
                </li>
              )}
              {!phone && !email && !studioLocation && (
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
            <p className="vertice-footer__heading">Redes Sociales</p>
            <div className="vertice-footer__social mb-2">
              {instagramInfo && (
                <a
                  href={instagramInfo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="vertice-footer__social-btn"
                  aria-label={`Instagram de ${brandName} (${instagramInfo.label})`}
                  title={`Instagram: ${instagramInfo.label}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
                    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
                  </svg>
                </a>
              )}
              {whatsappDigits && (
                <a
                  href={`https://wa.me/${whatsappDigits}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="vertice-footer__social-btn"
                  aria-label={`WhatsApp de ${brandName}`}
                  title={`WhatsApp: ${phone}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                  </svg>
                </a>
              )}
              {email && (
                <a
                  href={`mailto:${email}`}
                  className="vertice-footer__social-btn"
                  aria-label={`Enviar correo a ${brandName}`}
                  title={`Email: ${email}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                </a>
              )}
            </div>
            <ul className="vertice-footer__list">
              {instagramInfo && (
                <li>
                  <a
                    href={instagramInfo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {instagramInfo.label}
                  </a>
                </li>
              )}
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
