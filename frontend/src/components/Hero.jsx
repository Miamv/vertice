import { useMemo, useState } from 'react';
import studio from '../config/studio';
import { resolveMediaUrl } from '../services/api';

export default function Hero({ profile }) {
  const [failedUrl, setFailedUrl] = useState(null);
  const avatarUrl = useMemo(() => resolveMediaUrl(profile?.avatar), [profile?.avatar]);
  const heroImage = avatarUrl && failedUrl !== avatarUrl ? avatarUrl : studio.heroImage;
  const studioTitle = profile?.name || studio.platformName || 'VÉRTICE';
  const specialty = profile?.specialty?.trim() || '';

  return (
    <section id="inicio" className="vertice-hero">
      <div className="vertice-hero__media" aria-hidden="true">
        <img
          src={heroImage}
          alt=""
          onError={() => {
            if (heroImage === avatarUrl) setFailedUrl(avatarUrl);
          }}
        />
        <span className="vertice-hero__wash" />
      </div>

      <div className="vertice-hero__inner container">
        <div className="vertice-hero__lockup">
          <div className="vertice-hero__titles">
            <h1 className="vertice-hero__title">{studioTitle.toUpperCase()}</h1>
            {specialty && (
              <p className="vertice-hero__subtitle mb-0 mt-2">
                {specialty}
              </p>
            )}
          </div>
        </div>

        <a href="#proyectos" className="vertice-hero__cta">
          Explorar proyectos
        </a>
      </div>
    </section>
  );
}
