import { useEffect, useState, useMemo } from 'react';
import WhatsAppButton from './WhatsAppButton';
import ContactForm from './ContactForm';
import { getProfiles } from '../services/api';

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
  const studioName = activeProfile?.name?.trim() || '';

  return (
    <section id="contacto" className="vertice-contact">
      <div className="container">
        <h2 className="vertice-contact__title">{title}</h2>
        <div className="vertice-contact__box">
          <div className="vertice-contact__left">
            <p className="vertice-contact__eyebrow">
              {studioName ? `Contacto directo con ${studioName}` : 'Conversá con nosotros'}
            </p>
            <WhatsAppButton phone={phone} studioName={studioName} />
            {(phone || email) ? (
              <div className="vertice-contact__meta">
                {phone && <a href={`tel:${phone}`}>{phone}</a>}
                {email && <a href={`mailto:${email}`}>{email}</a>}
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
