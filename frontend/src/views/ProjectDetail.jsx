import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ProjectTopBar from '../components/ProjectTopBar';
import ProjectDock from '../components/ProjectDock';
import ProjectPlansNav from '../components/ProjectPlansNav';
import ProjectCanvasGallery from '../components/ProjectCanvasGallery';
import ProjectSheet from '../components/ProjectSheet';
import ProjectLocation from '../components/ProjectLocation';
import LoadingSpinner from '../components/LoadingSpinner';
import { getProject, getMedia, resolveMediaUrl } from '../services/api';
import { PLAN_KEYS, generatePlanoPlaceholder, normalizePlanType } from '../config/plans';
import studio from '../config/studio';

export default function ProjectDetail() {
  const { slug, id } = useParams();
  const navigate = useNavigate();

  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [is404, setIs404] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [mode, setMode] = useState('renders');
  const [lastVisualMode, setLastVisualMode] = useState('renders');
  const [plano, setPlano] = useState(PLAN_KEYS[0]);
  const [sheet, setSheet] = useState('closed');

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadProjectData() {
      try {
        const queryParams = slug ? { profile_slug: slug } : undefined;
        const res = await getProject(id, queryParams);
        if (cancelled) return;

        const data = res.data;
        let list = Array.isArray(data.media) ? data.media : null;

        // Solo consultamos /media/?project=<id> si el detalle no incluyó el arreglo `media`
        if (list === null) {
          try {
            const mRes = await getMedia(id, queryParams);
            list = Array.isArray(mRes.data) ? mRes.data : (mRes.data?.results ?? []);
          } catch (mediaErr) {
            console.warn('No se pudo cargar multimedia adicional para el proyecto:', mediaErr);
            list = [];
          }
        }

        if (!cancelled) {
          setProject({ ...data, mediaList: list });
          setError(null);
          setIs404(false);
        }
      } catch (err) {
        if (!cancelled) {
          const status = err?.response?.status;
          setIs404(status === 404);
          setError(
            status === 404
              ? 'El proyecto que estás buscando no pertenece a este estudio, no existe o fue dado de baja.'
              : err?.response?.data?.detail ||
                err?.message ||
                'No se pudo conectar con el servidor para obtener los datos del proyecto.'
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadProjectData();

    return () => {
      cancelled = true;
    };
  }, [id, slug, reloadKey]);

  const resolvedSlug = slug || project?.profile_slug || null;
  const backPath = resolvedSlug ? `/estudios/${encodeURIComponent(resolvedSlug)}` : '/';

  const projectTitle = project?.title || project?.titulo || 'Proyecto';
  const projectCategory = project?.category || project?.categoria || 'Arquitectura';
  const projectSubtitle =
    project?.subtitulo ||
    (project?.profile_name
      ? `${project.profile_name} · ${String(projectCategory).toUpperCase()}`
      : String(projectCategory).toUpperCase());
  const projectDescription =
    project?.description || project?.memoriaDescriptiva || 'Sin descripción disponible.';

  const mediaList = useMemo(() => {
    return project?.mediaList || project?.media || [];
  }, [project]);

  // Renders y fotos generales (excluyendo planos técnicos explícitos)
  const renderFiles = useMemo(() => {
    return mediaList
      .filter((m) => !m.plan_type && (m.media_type === 'render' || m.media_type === 'image'))
      .map((m) => resolveMediaUrl(m.file || m.url))
      .filter(Boolean);
  }, [mediaList]);

  const renders = useMemo(() => {
    if (renderFiles.length > 0) return renderFiles;
    return [generatePlanoPlaceholder(projectTitle, 'Render preliminar')];
  }, [renderFiles, projectTitle]);

  // Mapeo dinámico de planos técnicos persistidos en la base de datos
  const planosMap = useMemo(() => {
    const map = {};
    for (const m of mediaList) {
      const rawType = m.plan_type || (m.media_type === 'image' && m.zone ? m.zone : null);
      const normalized = normalizePlanType(rawType);
      if (!normalized) continue;

      const url = resolveMediaUrl(m.file || m.url);
      if (!url) continue;

      if (!map[normalized]) {
        map[normalized] = [];
      }
      map[normalized].push(url);
    }
    return map;
  }, [mediaList]);

  // Pestañas de planos que realmente poseen archivos cargados para este proyecto
  const availablePlanKeys = useMemo(() => {
    return PLAN_KEYS.filter((key) => Array.isArray(planosMap[key]) && planosMap[key].length > 0);
  }, [planosMap]);

  const hasPlanos = availablePlanKeys.length > 0;

  // Si el plano activo no está entre las pestañas disponibles, seleccionar la primera disponible
  const currentPlano = useMemo(() => {
    if (!hasPlanos) return null;
    if (availablePlanKeys.includes(plano)) return plano;
    return availablePlanKeys[0];
  }, [availablePlanKeys, hasPlanos, plano]);

  const activeMode = mode === 'planos' && !hasPlanos ? 'renders' : mode;

  const galleryImages = useMemo(() => {
    if (activeMode === 'planos' && currentPlano && planosMap[currentPlano]?.length > 0) {
      return planosMap[currentPlano];
    }
    return renders;
  }, [activeMode, currentPlano, planosMap, renders]);

  const normalizedProject = useMemo(() => {
    if (!project) return null;
    const defaultLocation =
      project.location?.trim() ||
      project.ubicacionTexto ||
      project.profile_name ||
      studio.defaultLocation;
    const customEarthUrl = project.google_earth_url?.trim() || project.googleEarthUrl || '';
    return {
      ...project,
      titulo: projectTitle,
      categoria: projectCategory,
      subtitulo: projectSubtitle,
      memoriaDescriptiva: projectDescription,
      ubicacionTexto: defaultLocation,
      googleEarthUrl:
        customEarthUrl ||
        studio.buildGoogleEarthSearchUrl(`${projectTitle} ${defaultLocation}`),
      specs: project.specs || null,
    };
  }, [project, projectTitle, projectCategory, projectSubtitle, projectDescription]);

  const galleryKey = `${activeMode}:${currentPlano || plano}`;

  function selectDock(key) {
    if (key === 'planos' && !hasPlanos) {
      return;
    }
    if (key === 'info') {
      if (sheet === 'expanded') {
        collapseSheet();
        return;
      }
      setMode('info');
      setSheet('expanded');
      return;
    }
    setMode(key);
    setLastVisualMode(key);
    setSheet('closed');
  }

  function expandSheet() {
    setMode('info');
    setSheet('expanded');
  }

  function collapseSheet() {
    setSheet('closed');
    const fallbackMode = lastVisualMode === 'planos' && !hasPlanos ? 'renders' : (lastVisualMode || 'renders');
    setMode(fallbackMode);
  }

  function selectPlano(key) {
    if (!hasPlanos) return;
    setPlano(key);
    setMode('planos');
    setLastVisualMode('planos');
    setSheet('closed');
  }

  if (loading) {
    return (
      <div className="pv pv--loading">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !normalizedProject) {
    return (
      <div className="pv pv--error">
        <div className="pv-error-card">
          <span className="pv-error-badge">{is404 ? '404' : 'ERROR'}</span>
          <h2 className="pv-error-title">
            {is404 ? 'Proyecto no encontrado' : 'No se pudo cargar el proyecto'}
          </h2>
          <p className="pv-error-desc">
            {error || 'El proyecto solicitado no está disponible.'}
          </p>
          <div className="pv-error-actions">
            {!is404 && (
              <button
                type="button"
                className="pv-btn pv-btn--outline"
                onClick={() => {
                  setLoading(true);
                  setError(null);
                  setReloadKey((k) => k + 1);
                }}
              >
                Reintentar
              </button>
            )}
            <button
              type="button"
              className="pv-btn pv-btn--primary"
              onClick={() => navigate(backPath)}
            >
              {resolvedSlug ? 'Volver al estudio' : 'Volver a la Home'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const showLocation = activeMode === 'ubicacion';
  const sheetExpanded = sheet === 'expanded';

  return (
    <div className="pv">
      <div className="pv-canvas">
        {showLocation ? (
          <div className="pv-canvas__media pv-canvas__media--location">
            <img key="location-bg" src={renders[0]} alt="" aria-hidden="true" />
            <span className="pv-canvas__scrim" aria-hidden="true" />
          </div>
        ) : (
          <ProjectCanvasGallery
            key={galleryKey}
            images={galleryImages}
            title={normalizedProject.titulo}
            hint={activeMode === 'planos' ? 'Zoom / pan · deslizar' : 'Explorar · deslizar'}
            onSwipeUp={expandSheet}
          />
        )}

        <ProjectTopBar
          title={normalizedProject.titulo}
          category={normalizedProject.categoria}
          onBack={() => navigate(backPath)}
        />

        {showLocation && <ProjectLocation project={normalizedProject} onSwipeUp={expandSheet} />}
      </div>

      {!sheetExpanded && activeMode === 'planos' && hasPlanos && (
        <ProjectPlansNav
          active={currentPlano || plano}
          onSelect={selectPlano}
          availableKeys={availablePlanKeys}
        />
      )}

      {!sheetExpanded && (
        <ProjectDock mode={activeMode} onSelect={selectDock} hasPlanos={hasPlanos} />
      )}

      <ProjectSheet
        project={normalizedProject}
        state={sheet}
        onExpand={expandSheet}
        onCollapse={collapseSheet}
      />
    </div>
  );
}
