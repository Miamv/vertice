import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { resolveMediaUrl } from '../services/api';
import ProjectCard from './ProjectCard';

const CATEGORY_LABELS = {
  ARCHITECTURE: 'Arquitectura',
  DESIGN: 'Diseño',
  INTERIOR_DESIGN: 'Diseño Interior',
  PHOTOGRAPHY: 'Fotografía',
  RENDER: 'Render',
  OTHER: 'Otro',
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

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

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

function ChevronIcon({ dir = 'left' }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={dir === 'left' ? 'M15 18 L9 12 L15 6' : 'M9 18 L15 12 L9 6'}
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function ProjectSlider({
  projects,
  covers,
  error,
  mediaError,
  onRetry,
  studioSlug,
  studioName,
}) {
  const safeProjects = useMemo(() => {
    if (!Array.isArray(projects)) return [];
    return [...projects].sort((a, b) => {
      const orderA = Number(a?.order) || 1;
      const orderB = Number(b?.order) || 1;
      return orderA - orderB;
    });
  }, [projects]);

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [navDirection, setNavDirection] = useState('next');
  const [brokenBackdrops, setBrokenBackdrops] = useState({});
  const touchStartRef = useRef({ x: 0, y: 0, active: false });

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const filteredProjects = useMemo(() => {
    const query = normalizeSearchText(debouncedSearch);
    if (!query) return safeProjects;

    return safeProjects.filter((project) => {
      const categoryLabel = formatProjectCategory(project.category);
      return (
        normalizeSearchText(project.title).includes(query) ||
        normalizeSearchText(project.description).includes(query) ||
        normalizeSearchText(project.category).includes(query) ||
        normalizeSearchText(categoryLabel).includes(query) ||
        normalizeSearchText(project.location).includes(query)
      );
    });
  }, [safeProjects, debouncedSearch]);

  // Reinicia el índice al cambiar de estudio o de filtro de búsqueda
  const filterScopeKey = `${studioSlug || '__root__'}:${normalizeSearchText(debouncedSearch)}:${filteredProjects.length}`;
  const [prevScopeKey, setPrevScopeKey] = useState(filterScopeKey);
  if (prevScopeKey !== filterScopeKey) {
    setPrevScopeKey(filterScopeKey);
    setActiveIndex(0);
    setNavDirection('next');
  }

  const hasProjects = safeProjects.length > 0;
  const total = filteredProjects.length;
  const safeActiveIndex = total > 0 ? ((activeIndex % total) + total) % total : 0;
  const activeProject = total > 0 ? filteredProjects[safeActiveIndex] : null;

  const secondaryQueue = useMemo(() => {
    if (total <= 1) return [];
    const items = [];
    for (let offset = 1; offset < total; offset += 1) {
      const targetIndex = (safeActiveIndex + offset) % total;
      items.push({
        project: filteredProjects[targetIndex],
        targetIndex,
      });
    }
    return items;
  }, [filteredProjects, safeActiveIndex, total]);

  function handlePrev() {
    if (total <= 1) return;
    setNavDirection('prev');
    setActiveIndex((prev) => (((prev - 1) % total) + total) % total);
  }

  function handleNext() {
    if (total <= 1) return;
    setNavDirection('next');
    setActiveIndex((prev) => (prev + 1) % total);
  }

  function handleSelectProject(targetIndex) {
    if (targetIndex === safeActiveIndex || total <= 1) return;
    setNavDirection('next');
    setActiveIndex(targetIndex);
  }

  function handleKeyDown(e) {
    if (total <= 1) return;
    const tag = e.target?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      handlePrev();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      handleNext();
    }
  }

  function handleTouchStart(e) {
    if (total <= 1 || !e.touches || e.touches.length !== 1) return;
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      active: true,
    };
  }

  function handleTouchEnd(e) {
    if (!touchStartRef.current.active || total <= 1 || !e.changedTouches?.length) {
      return;
    }
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    touchStartRef.current.active = false;

    // Solo dispara swipe horizontal cuando el gesto es claramente horizontal,
    // preservando intacto el desplazamiento vertical de la página.
    if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.35) {
      if (dx < 0) {
        handleNext();
      } else {
        handlePrev();
      }
    }
  }

  function markBackdropBroken(url) {
    if (!url) return;
    setBrokenBackdrops((prev) => (prev[url] ? prev : { ...prev, [url]: true }));
  }

  // Estado vacío o de error cuando el estudio no posee proyectos publicados
  if (!hasProjects) {
    return (
      <section
        id="proyectos"
        className="vertice-slider vertice-slider--empty"
        aria-label="Proyectos del estudio"
      >
        <div className="container">
          <div className="vertice-slider__empty-card">
            <span className="vertice-slider__kicker-pill">
              Portfolio · {studioName || 'Estudio'}
            </span>
            {error ? (
              <>
                <h2 className="vertice-slider__empty-title">
                  No se pudieron cargar los proyectos
                </h2>
                <p className="vertice-slider__empty-desc">{error}</p>
                {onRetry && (
                  <button
                    type="button"
                    className="vertice-projects__action-btn"
                    onClick={onRetry}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <polyline points="23 4 23 10 17 10" />
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                    </svg>
                    Reintentar conexión
                  </button>
                )}
              </>
            ) : (
              <>
                <h2 className="vertice-slider__empty-title">
                  Aún no hay proyectos publicados en este estudio
                </h2>
                <p className="vertice-slider__empty-desc">
                  Cuando el estudio publique obras en su portfolio, podrás explorarlas aquí.
                </p>
              </>
            )}
          </div>
        </div>
      </section>
    );
  }

  const activeCategory = formatProjectCategory(activeProject?.category);
  const activeLocation = activeProject?.location?.trim() || '';
  const activeKicker =
    [activeCategory, activeLocation].filter(Boolean).join(' · ') ||
    studioName ||
    'Obra destacada';
  const activeDescription = activeProject?.description?.trim() || '';
  const activeDetailPath = activeProject
    ? buildProjectDetailPath(activeProject, studioSlug)
    : '/';

  const progressRatio = total > 0 ? ((safeActiveIndex + 1) / total) * 100 : 100;

  return (
    <section
      id="proyectos"
      className="vertice-slider"
      aria-roledescription="carousel"
      aria-label={`Proyectos de ${studioName || 'el estudio'}`}
      onKeyDown={handleKeyDown}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Capas de fondo inmersivo (crossfade suave entre proyectos reales) */}
      <div className="vertice-slider__backdrops" aria-hidden="true">
        {filteredProjects.length > 0 ? (
          filteredProjects.map((project, index) => {
            const isActive = index === safeActiveIndex;
            const coverUrl = getProjectCoverUrl(project, covers?.[project.id]);
            const showImage = Boolean(coverUrl && !brokenBackdrops[coverUrl]);

            return (
              <div
                key={project.id}
                className={`vertice-slider__backdrop ${isActive ? 'is-active' : ''}`}
              >
                {showImage ? (
                  <img
                    src={coverUrl}
                    alt=""
                    loading={isActive ? 'eager' : 'lazy'}
                    decoding="async"
                    onError={() => markBackdropBroken(coverUrl)}
                  />
                ) : (
                  <div className="vertice-slider__backdrop-fallback" />
                )}
              </div>
            );
          })
        ) : (
          <div className="vertice-slider__backdrop is-active">
            <div className="vertice-slider__backdrop-fallback" />
          </div>
        )}
        <div className="vertice-slider__backdrop-overlay" />
      </div>

      {/* Contenido superpuesto del Slider */}
      <div className="container vertice-slider__shell">
        {/* Barra superior de sección y buscador integrado */}
        <div className="vertice-slider__topbar">
          <div className="vertice-slider__section-tag">
            <span className="vertice-slider__section-dot" aria-hidden="true" />
            <span>Proyectos · {studioName || 'Portfolio'}</span>
          </div>

          <div className="vertice-slider__search">
            <span className="vertice-slider__search-icon" aria-hidden="true">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              type="text"
              className="vertice-slider__search-input"
              placeholder="Buscar proyectos por título, categoría o ubicación..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Buscar proyectos"
            />
            {searchTerm && (
              <button
                type="button"
                className="vertice-slider__search-clear"
                onClick={() => setSearchTerm('')}
                aria-label="Limpiar búsqueda"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Estado sin coincidencias de búsqueda */}
        {filteredProjects.length === 0 ? (
          <div className="vertice-slider__no-results">
            <p className="vertice-slider__no-results-title">
              No se encontraron proyectos para &ldquo;{searchTerm}&rdquo;
            </p>
            <p className="vertice-slider__no-results-desc">
              Probá con otro término o restablecé el filtro para explorar todas las obras del estudio.
            </p>
            <button
              type="button"
              className="vertice-slider__reset-btn"
              onClick={() => setSearchTerm('')}
            >
              Limpiar búsqueda
            </button>
          </div>
        ) : (
          <div className="vertice-slider__grid">
            {/* Sector izquierdo: información del proyecto activo */}
            <div
              key={`${activeProject.id}-${safeActiveIndex}`}
              className="vertice-slider__info"
              aria-live="polite"
            >
              <div className="vertice-slider__kicker-row">
                <span className="vertice-slider__kicker-rule" aria-hidden="true" />
                <span className="vertice-slider__kicker-text">{activeKicker}</span>
              </div>

              <h2 className="vertice-slider__title">{activeProject.title}</h2>

              {activeDescription && (
                <p className="vertice-slider__desc">{activeDescription}</p>
              )}

              {activeLocation && (
                <div className="vertice-slider__chips">
                  <span className="vertice-slider__chip">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    {activeLocation}
                  </span>
                </div>
              )}

              <div className="vertice-slider__actions">
                <Link
                  to={activeDetailPath}
                  className="vertice-slider__cta-badge"
                  aria-hidden="true"
                  tabIndex={-1}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="7" y1="17" x2="17" y2="7" />
                    <polyline points="7 7 17 7 17 17" />
                  </svg>
                </Link>
                <Link to={activeDetailPath} className="vertice-slider__cta-btn">
                  Ver proyecto
                </Link>
              </div>
            </div>

            {/* Sector derecho / centro-derecha: tarjetas flotantes y controles */}
            <div className="vertice-slider__right">
              {secondaryQueue.length > 0 && (
                <div className="vertice-slider__cards-viewport">
                  <div
                    key={`track-${safeActiveIndex}-${navDirection}`}
                    className={`vertice-slider__cards-track is-${navDirection}`}
                  >
                    {secondaryQueue.map(({ project, targetIndex }) => (
                      <div key={project.id} className="vertice-slider__card-slot">
                        <ProjectCard
                          project={project}
                          coverUrl={covers?.[project.id]}
                          studioSlug={studioSlug}
                          variant="slider"
                          orderIndex={targetIndex}
                          onSelect={() => handleSelectProject(targetIndex)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {total > 1 && (
                <div className="vertice-slider__controls">
                  <div className="vertice-slider__arrows">
                    <button
                      type="button"
                      className="vertice-slider__arrow-btn"
                      onClick={handlePrev}
                      aria-label="Proyecto anterior"
                    >
                      <ChevronIcon dir="left" />
                    </button>
                    <button
                      type="button"
                      className="vertice-slider__arrow-btn"
                      onClick={handleNext}
                      aria-label="Proyecto siguiente"
                    >
                      <ChevronIcon dir="right" />
                    </button>
                  </div>

                  <div className="vertice-slider__progress" aria-hidden="true">
                    <span
                      className="vertice-slider__progress-bar"
                      style={{ width: `${progressRatio}%` }}
                    />
                  </div>

                  <div
                    className="vertice-slider__counter"
                    aria-label={`Proyecto ${safeActiveIndex + 1} de ${total}`}
                  >
                    <span className="vertice-slider__counter-current">
                      {String(safeActiveIndex + 1).padStart(2, '0')}
                    </span>
                    <span className="vertice-slider__counter-sep"> / </span>
                    <span className="vertice-slider__counter-total">
                      {String(total).padStart(2, '0')}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {mediaError && (
          <p className="vertice-slider__media-note">
            No se pudieron cargar algunas imágenes de portada. {mediaError}
          </p>
        )}
      </div>
    </section>
  );
}
