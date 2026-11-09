import { useEffect, useRef, useState } from 'react';
import ImageFullscreen from './ImageFullscreen';

const SWIPE_THRESHOLD = 42;

export default function ProjectCanvasGallery({ images, title, hint, onSwipeUp }) {
  const [index, setIndex] = useState(0);
  const [fallbackFs, setFallbackFs] = useState(false);
  const [isFs, setIsFs] = useState(false);
  const rootRef = useRef(null);
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const mouseStartX = useRef(null);
  const mouseStartY = useRef(null);

  const count = images.length;
  const active = images[index] ?? images[0];

  useEffect(() => {
    function onFsChange() {
      setIsFs(Boolean(document.fullscreenElement));
    }
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  function prev() {
    setIndex((i) => (i > 0 ? i - 1 : count - 1));
  }

  function next() {
    setIndex((i) => (i < count - 1 ? i + 1 : 0));
  }

  function handleTouchStart(e) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }

  function handleTouchEnd(e) {
    if (touchStartX.current == null || touchStartY.current == null) return;
    const deltaX = touchStartX.current - e.changedTouches[0].clientX;
    const deltaY = touchStartY.current - e.changedTouches[0].clientY;
    touchStartX.current = null;
    touchStartY.current = null;

    // Si el movimiento vertical hacia arriba es predominante, abrir Info
    if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) >= SWIPE_THRESHOLD) {
      if (deltaY > 0 && onSwipeUp) {
        onSwipeUp();
      }
      return;
    }

    if (Math.abs(deltaX) < SWIPE_THRESHOLD || count < 2) return;
    if (deltaX > 0) next();
    else prev();
  }

  function handleMouseDown(e) {
    mouseStartX.current = e.clientX;
    mouseStartY.current = e.clientY;
  }

  function handleMouseUp(e) {
    if (mouseStartX.current == null || mouseStartY.current == null) return;
    const deltaX = mouseStartX.current - e.clientX;
    const deltaY = mouseStartY.current - e.clientY;
    mouseStartX.current = null;
    mouseStartY.current = null;

    if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) >= SWIPE_THRESHOLD) {
      if (deltaY > 0 && onSwipeUp) {
        onSwipeUp();
      }
      return;
    }

    if (Math.abs(deltaX) < SWIPE_THRESHOLD || count < 2) return;
    if (deltaX > 0) next();
    else prev();
  }

  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
      return;
    }
    const el = rootRef.current;
    if (el?.requestFullscreen) {
      try {
        await el.requestFullscreen();
        return;
      } catch {
        /* fallback below */
      }
    }
    setFallbackFs(true);
  }

  return (
    <div
      ref={rootRef}
      className="pv-canvasgal"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      <div
        className="pv-canvasgal__track"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {images.map((src, i) => (
          <div className="pv-canvasgal__slide" key={`${i}-${src.slice(-24)}`} aria-hidden={i !== index}>
            <img src={src} alt={i === index ? title : ''} draggable={false} />
          </div>
        ))}
      </div>
      <span className="pv-canvas__scrim" aria-hidden="true" />

      {count > 1 && (
        <div className="pv-canvasgal__arrows">
          <button type="button" className="pv-circle-btn pv-canvasgal__arrow" onClick={prev} aria-label="Imagen anterior">
            ‹
          </button>
          <button type="button" className="pv-circle-btn pv-canvasgal__arrow" onClick={next} aria-label="Imagen siguiente">
            ›
          </button>
        </div>
      )}

      {hint && <span className="pv-canvas__hint" aria-hidden="true">{hint}</span>}

      {count > 1 && (
        <div className="pv-canvasgal__dots" aria-hidden="true">
          {images.map((src, i) => (
            <span key={`${i}-${src.slice(-24)}`} className={`pv-canvasgal__dot ${i === index ? 'is-active' : ''}`} />
          ))}
          <span className="pv-canvasgal__count">{index + 1} / {count}</span>
        </div>
      )}

      <button
        type="button"
        className="pv-circle-btn pv-canvas__fs"
        onClick={toggleFullscreen}
        aria-label={isFs ? 'Salir de pantalla completa' : 'Ver en pantalla completa'}
      >
        {isFs ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 4 H4 V9 M15 4 H20 V9 M9 20 H4 V15 M15 20 H20 V15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 9 V4 H9 M15 4 H20 V9 M20 15 V20 H15 M9 20 H4 V15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      <ImageFullscreen src={fallbackFs ? active : null} onClose={() => setFallbackFs(false)} />
    </div>
  );
}
