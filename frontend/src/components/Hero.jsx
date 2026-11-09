import { useMemo, useState } from 'react';
import studio from '../config/studio';
import { resolveMediaUrl } from '../services/api';
import useScrollTo from '../hooks/useScrollTo';

export default function Hero({ profile }) {
  const [failedUrl, setFailedUrl] = useState(null);
  const scrollTo = useScrollTo();
  const avatarUrl = useMemo(() => resolveMediaUrl(profile?.avatar), [profile?.avatar]);
  const heroImage = avatarUrl && failedUrl !== avatarUrl ? avatarUrl : studio.heroImage;
  const studioTitle = profile?.name?.trim() || studio.platformName || 'Vértice';
  const basePath = profile?.slug ? `/estudios/${profile.slug}` : '/';

  function handleExploreClick(e) {
    e.preventDefault();
    scrollTo('proyectos', basePath);
  }

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
        <div className="vertice-hero__eyebrow">
          <span className="vertice-hero__eyebrow-dot" aria-hidden="true" />
          <span className="vertice-hero__eyebrow-text">{studioTitle}</span>
        </div>

        <div className="vertice-hero__lockup">
          <div className="vertice-hero__titles">
            <h1 className="vertice-hero__title">
              <span className="vertice-hero__title-sans">Arquitectura que habita</span>
              <span className="vertice-hero__title-serif">el espacio con intención.</span>
            </h1>
          </div>
        </div>

        <a href="#proyectos" className="vertice-hero__cta" onClick={handleExploreClick}>
          <span>Explorar proyectos</span>
          <span className="vertice-hero__cta-arrow" aria-hidden="true">↓</span>
        </a>
      </div>
    </section>
  );
}
