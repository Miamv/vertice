import { useEffect, useState, useMemo } from 'react';
import WhatsAppButton from './WhatsAppButton';
import ContactForm from './ContactForm';
import { getProfiles } from '../services/api';

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

export default function ContactSection({
  title = 'Contanos tu proyecto',
  profile = null,
  profileId,
}) {
  const [fetchedProfile, setFetchedProfile] = useState(null);

  useEffect(() => {
    // Si `profile` o `profileId` ya fueron provistos por la vista padre,
    // evitamos realizar una segunda petición redundante a /api/profiles/.
    if (profile !== null || profileId !== undefined) return;
    let cancelled = false;
    getProfiles()
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : (res.data?.results ?? []);
        if (!cancelled && list.length > 0) setFetchedProfile(list[0]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [profile, profileId]);

  const activeProfile = profile || fetchedProfile;

  const resolvedProfileId = useMemo(
    () => (profileId !== undefined ? profileId : activeProfile?.id ?? null),
    [profileId, activeProfile]
  );

  const phone = activeProfile?.phone?.trim() || '';
  const email = activeProfile?.contact_email?.trim() || '';
  const location = activeProfile?.location?.trim() || '';
  const instagramInfo = resolveInstagramInfo(activeProfile?.instagram);
  const studioName = activeProfile?.name?.trim() || '';
  const hasContactMeta = Boolean(phone || email || location || instagramInfo);

  return (
    <section id="contacto" className="vertice-contact">
      <div className="container">
        <h2 className="vertice-contact__title">{title}</h2>
        <div className="vertice-contact__box">
          <div className="vertice-contact__left">
            <div>
              <p className="vertice-contact__eyebrow">
                {studioName ? `Contacto directo con ${studioName}` : 'Conversá con nosotros'}
              </p>
              <WhatsAppButton phone={phone} studioName={studioName} />
            </div>

            {hasContactMeta ? (
              <div className="vertice-contact__meta">
                {email && (
                  <a href={`mailto:${email}`} className="vertice-contact__meta-item">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                    </svg>
                    <span>{email}</span>
                  </a>
                )}
                {phone && (
                  <a href={`tel:${phone}`} className="vertice-contact__meta-item">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                    </svg>
                    <span>{phone}</span>
                  </a>
                )}
                {location && (
                  <span className="vertice-contact__meta-item">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    <span>{location}</span>
                  </span>
                )}
                {instagramInfo && (
                  <a
                    href={instagramInfo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="vertice-contact__meta-item"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
                      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
                    </svg>
                    <span>{instagramInfo.label}</span>
                  </a>
                )}
              </div>
            ) : (
              <p className="vertice-contact__fallback mb-0">
                Completá el formulario para enviar tu consulta directamente al equipo del estudio.
              </p>
            )}
          </div>
          <div className="vertice-contact__divider" aria-hidden="true" />
          <div className="vertice-contact__right">
            <ContactForm profileId={resolvedProfileId} />
          </div>
        </div>
      </div>
    </section>
  );
}
