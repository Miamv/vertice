import { useState } from 'react';
import { resolveMediaUrl } from '../services/api';
import AboutBackground from './AboutBackground';

export default function About({ data, profile, error, hasTeam = false }) {
  const [failedUrl, setFailedUrl] = useState(null);

  const rawTitle = data?.title?.trim() || '';
  const rawDescription = data?.description?.trim() || profile?.description?.trim() || '';
  const imageUrl = resolveMediaUrl(data?.image);
  const activeImageUrl = imageUrl && failedUrl !== imageUrl ? imageUrl : null;
  const hasContent = Boolean(rawTitle || rawDescription || activeImageUrl);

  // Ocultar la sección opcional si el estudio no tiene contenido institucional ni ocurrió un error
  if (!hasContent && !error) {
    return null;
  }

  return (
    <section
      id={hasTeam ? 'manifiesto' : 'nosotros'}
      className={`vertice-about ${activeImageUrl ? 'vertice-about--has-image' : ''}`}
    >
      <AboutBackground
        imageUrl={activeImageUrl}
        onImageError={() => {
          if (imageUrl) setFailedUrl(imageUrl);
        }}
      />

      <div className="container vertice-about__container">
        <div className="vertice-about__content">
          <h2 className="vertice-about__title">
            {rawTitle || 'Sobre el estudio'}
          </h2>
          {hasContent && rawDescription ? (
            <p className="vertice-about__body" style={{ whiteSpace: 'pre-line' }}>
              {rawDescription}
            </p>
          ) : (
            error && (
              <p className="vertice-about__body vertice-about__body--error">
                No se pudo cargar la información institucional. {error}
              </p>
            )
          )}
        </div>
      </div>
    </section>
  );
}
