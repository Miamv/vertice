import { useRef } from 'react';

const SWIPE_THRESHOLD = 42;

export default function ProjectLocation({ project, onSwipeUp }) {
  const startY = useRef(null);

  function handleTouchStart(e) {
    startY.current = e.touches[0].clientY;
  }

  function handleTouchEnd(e) {
    if (startY.current == null) return;
    const delta = startY.current - e.changedTouches[0].clientY;
    startY.current = null;
    if (delta > SWIPE_THRESHOLD && onSwipeUp) {
      onSwipeUp();
    }
  }

  return (
    <div
      className="pv-location"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="pv-location__card">
        <span className="pv-location__pin" aria-hidden="true">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
            <path d="M12 21 C7.5 15.5 5 12.3 5 9.3 C5 5.5 8.1 3 12 3 C15.9 3 19 5.5 19 9.3 C19 12.3 16.5 15.5 12 21 Z" stroke="currentColor" strokeWidth="1.6" />
            <circle cx="12" cy="9.3" r="2.2" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </span>
        <h3 className="pv-location__title">{project.titulo}</h3>
        <p className="pv-location__text">{project.ubicacionTexto}</p>
        <a
          className="pv-location__btn"
          href={project.googleEarthUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Ver ubicación
        </a>
      </div>
    </div>
  );
}
