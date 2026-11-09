import { useState } from 'react';
import { Link } from 'react-router-dom';
import { resolveMediaUrl } from '../services/api';

const CATEGORY_LABELS = {
  RESIDENCIAL: 'Residencial',
  COMERCIAL: 'Comercial',
  OFICINAS: 'Oficinas',
  INDUSTRIAL: 'Industrial',
  REMODELACION: 'Remodelación',
  PAISAJISMO: 'Paisajismo',
  INTERIORISMO: 'Interiorismo',
  URBANISMO: 'Urbanismo',
  OTRO: 'Arquitectura',
};

function formatProjectCategory(category) {
  if (!category) return '';
  const raw = String(category).trim();
  const upper = raw.toUpperCase();
  if (CATEGORY_LABELS[upper]) return CATEGORY_LABELS[upper];
  return raw.replace(/_/g, ' ');
}

function getProjectCoverUrl(project, externalCoverUrl = null) {
  if (!project) return null;

  const directCandidate =
    externalCoverUrl ||
    project.cover_image ||
    project.coverImage ||
    project.image ||
    null;

  if (directCandidate) {
    return resolveMediaUrl(directCandidate);
  }

  if (Array.isArray(project.media) && project.media.length > 0) {
    const preferredRenderOrImage =
      project.media.find(
        (m) =>
          (m.media_type === 'image' || m.media_type === 'render') &&
          !m.plan_type &&
          m.file
      ) ||
      project.media.find(
        (m) =>
          (m.media_type === 'image' || m.media_type === 'render') && m.file
      ) ||
      project.media.find((m) => m.file && m.media_type !== 'video');

    if (preferredRenderOrImage?.file) {
      return resolveMediaUrl(preferredRenderOrImage.file);
    }
  }

  return null;
}

function buildProjectDetailPath(project, studioSlug) {
  if (!project?.id) return '/';
  const resolvedSlug = studioSlug || project.profile_slug || null;
  return resolvedSlug
    ? `/estudios/${encodeURIComponent(resolvedSlug)}/proyecto/${project.id}`
    : `/proyecto/${project.id}`;
}

export default function ProjectCard({
  project,
  coverUrl,
  studioSlug,
  variant = 'default',
  isSelected = false,
  orderIndex,
  onSelect,
}) {
  const [brokenUrl, setBrokenUrl] = useState(null);
  const coverImage = getProjectCoverUrl(project, coverUrl);
  const showCover = Boolean(coverImage && brokenUrl !== coverImage);

  const title = project?.title?.trim() || 'Proyecto';
  const category = formatProjectCategory(project?.category);
  const location = project?.location?.trim() || '';
  const subtitle = [category, location].filter(Boolean).join(' · ') || 'Obra del estudio';
  const detailPath = buildProjectDetailPath(project, studioSlug);

  if (variant === 'slider') {
    return (
      <article
        className={`vertice-slider-card ${isSelected ? 'is-selected' : ''}`}
        onClick={onSelect}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && onSelect) {
            e.preventDefault();
            onSelect();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={`Seleccionar proyecto ${title}`}
      >
        <div className="vertice-slider-card__media">
          {showCover ? (
            <img
              src={coverImage}
              alt={title}
              loading="lazy"
              decoding="async"
              onError={() => setBrokenUrl(coverImage)}
            />
          ) : (
            <div className="vertice-slider-card__fallback" aria-hidden="true">
              <span className="vertice-slider-card__fallback-code">
                {typeof orderIndex === 'number'
                  ? String(orderIndex + 1).padStart(2, '0')
                  : 'ARQ'}
              </span>
            </div>
          )}
          <div className="vertice-slider-card__shade" aria-hidden="true" />
        </div>

        <div className="vertice-slider-card__content">
          <span className="vertice-slider-card__dash" aria-hidden="true" />
          <p className="vertice-slider-card__meta">{subtitle}</p>
          <h3 className="vertice-slider-card__title">{title}</h3>
        </div>
      </article>
    );
  }

  return (
    <article className="vertice-project-card">
      <div className="vertice-project-card__media">
        {showCover ? (
          <img
            src={coverImage}
            alt={title}
            loading="lazy"
            decoding="async"
            onError={() => setBrokenUrl(coverImage)}
          />
        ) : (
          <div className="vertice-project-card__media-fallback">
            <span>{title}</span>
          </div>
        )}
      </div>
      <div className="vertice-project-card__body">
        <p className="vertice-project-card__kicker">{subtitle}</p>
        <h3 className="vertice-project-card__title">{title}</h3>
        {project?.description && (
          <p className="vertice-project-card__desc">
            {project.description.slice(0, 92)}
            {project.description.length > 92 ? '…' : ''}
          </p>
        )}
        <Link to={detailPath} className="vertice-project-card__cta">
          Ver proyecto
        </Link>
      </div>
    </article>
  );
}
