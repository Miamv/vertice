import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

const DRAG_THRESHOLD = 40;

function dormLabel(n) {
  return `${n} dorm`;
}

function banosLabel(n) {
  return `${n} ${n === 1 ? 'baño' : 'baños'}`;
}

function useDrag(onSwipeUp, onSwipeDown) {
  const startY = useRef(null);

  function handlePointerDown(e) {
    startY.current = e.clientY;
  }

  function handlePointerUp(e) {
    if (startY.current == null) return;
    const delta = startY.current - e.clientY;
    startY.current = null;
    if (delta > DRAG_THRESHOLD) onSwipeUp?.();
    else if (delta < -DRAG_THRESHOLD) onSwipeDown?.();
  }

  return { handlePointerDown, handlePointerUp };
}

export default function ProjectSheet({ project, state, onCollapse }) {
  const expandedDrag = useDrag(() => {}, onCollapse);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && state === 'expanded') {
        onCollapse?.();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state, onCollapse]);

  if (state !== 'expanded' || !project) {
    return null;
  }

  const title = project.titulo || project.title || 'Proyecto';
  const subtitle = project.subtitulo || project.category || 'Proyecto del estudio';
  const description = project.memoriaDescriptiva || project.description || '';
  const specs = project.specs;

  const quoteParams = new URLSearchParams();
  if (project.profile_slug) {
    quoteParams.set('studio', project.profile_slug);
  }
  if (project.id) {
    quoteParams.set('project', String(project.id));
  }
  const quoteUrl = `/solicitud?${quoteParams.toString()}`;

  return (
    <>
      <div
        className="pv-sheet-backdrop"
        onClick={onCollapse}
        aria-hidden="true"
      />
      <div
        className="pv-sheet is-expanded"
        role="dialog"
        aria-modal="true"
        aria-label={`Información de ${title}`}
      >
        <div
          className="pv-sheet__grab"
          onPointerDown={expandedDrag.handlePointerDown}
          onPointerUp={expandedDrag.handlePointerUp}
          aria-label="Arrastrar hacia abajo para cerrar"
        >
          <span className="pv-sheet__handle pv-sheet__handle--grip" aria-hidden="true" />
        </div>

        <div className="pv-sheet__scroll">
          <h2 className="pv-sheet__title">{title}</h2>
          {subtitle && <p className="pv-sheet__subtitle">{subtitle}</p>}
          {description && <p className="pv-sheet__body">{description}</p>}
          {project.id && (
            <div className="mt-3">
              <Link
                to={quoteUrl}
                className="btn btn-sm btn-outline-light rounded-pill px-3 py-1"
              >
                Solicitar presupuesto por esta obra →
              </Link>
            </div>
          )}
        </div>

        {specs && (
          <div className="pv-sheet__specs">
            {specs.superficie && <span>{specs.superficie}</span>}
            {specs.superficie && specs.dormitorios != null && <span aria-hidden="true">·</span>}
            {specs.dormitorios != null && <span>{dormLabel(specs.dormitorios)}</span>}
            {specs.dormitorios != null && specs.banos != null && <span aria-hidden="true">·</span>}
            {specs.banos != null && <span>{banosLabel(specs.banos)}</span>}
            {specs.estado && (
              <>
                <span aria-hidden="true">·</span>
                <span>{specs.estado}</span>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
