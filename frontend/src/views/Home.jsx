import { useEffect, useMemo } from 'react';
import { Link, useLocation, useOutletContext, useParams } from 'react-router-dom';
import Hero from '../components/Hero';
import About from '../components/About';
import Team from '../components/Team';
import BrandsCarousel from '../components/BrandsCarousel';
import ProjectSlider from '../components/ProjectSlider';
import ContactSection from '../components/ContactSection';
import LoadingSpinner from '../components/LoadingSpinner';
import { useAuth } from '../context/AuthContext';
import useStudioPortfolio from '../hooks/useStudioPortfolio';

export default function Home() {
  const { slug } = useParams();
  const location = useLocation();
  const outletContext = useOutletContext();
  const setStudioContext = outletContext?.setStudioContext;
  const { user } = useAuth();

  const isAdmin = user?.role === 'admin';
  const isStudioMember = user?.role === 'owner' || user?.role === 'collaborator';

  const {
    loading,
    notFound,
    profile,
    ownStudio,
    availableStudios,
    projects,
    brands,
    aboutData,
    teamMembers,
    profileError,
    projectsError,
    brandsError,
    aboutError,
    teamError,
    reload,
  } = useStudioPortfolio(slug, user);

  const hasAbout = useMemo(() => {
    return Boolean(
      aboutData?.title?.trim() ||
        aboutData?.description?.trim() ||
        aboutData?.image ||
        profile?.description?.trim() ||
        aboutError
    );
  }, [aboutData, profile, aboutError]);

  const hasTeam = useMemo(() => {
    return (Array.isArray(teamMembers) && teamMembers.length > 0) || Boolean(teamError);
  }, [teamMembers, teamError]);

  // Sincroniza el estudio activo con el Layout (Navbar y Footer)
  useEffect(() => {
    if (!setStudioContext) return;
    setStudioContext({
      profile,
      hasAbout,
      hasTeam,
      availableStudios: isAdmin ? availableStudios : [],
    });
  }, [setStudioContext, profile, hasAbout, hasTeam, isAdmin, availableStudios]);

  // Actualiza el título del documento según el estudio activo
  useEffect(() => {
    if (profile?.name) {
      document.title = `${profile.name} — Vértice`;
    } else if (notFound) {
      document.title = 'Estudio no disponible — Vértice';
    } else {
      document.title = 'Vértice';
    }
  }, [profile, notFound]);

  // Desplazamiento suave si la URL incluye un hash (#nosotros, #proyectos, #contacto, etc.)
  useEffect(() => {
    if (loading || !location.hash) return;
    const targetId = location.hash.replace(/^#/, '');
    if (!targetId) return;
    const timer = setTimeout(() => {
      const el = document.getElementById(targetId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    }, 80);
    return () => clearTimeout(timer);
  }, [loading, location.hash, profile?.slug]);

  // Efecto de aparición progresiva al desplazarse hacia abajo por las secciones de la Home
  useEffect(() => {
    if (loading || !profile) return;
    const elements = document.querySelectorAll('[data-scroll-reveal]');
    if (!elements.length) return;

    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      elements.forEach((el) => el.classList.add('is-revealed'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -48px 0px' }
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [loading, profile, projects.length, brands.length, teamMembers.length]);

  if (loading) return <LoadingSpinner />;

  if (notFound) {
    return (
      <section className="py-5 my-5">
        <div className="container py-4">
          <div
            className="mx-auto text-center p-4 p-md-5 rounded-4 border"
            style={{
              maxWidth: '640px',
              backgroundColor: 'var(--color-surface, #fff)',
              borderColor: 'rgba(15, 23, 42, 0.12)',
            }}
          >
            <span
              className="badge rounded-pill text-uppercase mb-3 px-3 py-2"
              style={{
                backgroundColor: 'rgba(15, 23, 42, 0.08)',
                color: 'var(--color-ink, #0f172a)',
                letterSpacing: '0.08em',
              }}
            >
              404 · Estudio no disponible
            </span>

            {isStudioMember && ownStudio ? (
              <>
                <h1 className="h3 fw-bold mb-3">Acceso restringido a tu estudio</h1>
                <p className="text-muted mb-4">
                  Como <strong>{user?.role}</strong>, únicamente tenés acceso al perfil del estudio al que estás asociado (<strong>{ownStudio.name}</strong>).
                </p>
                <Link
                  to={`/estudios/${ownStudio.slug}`}
                  className="vertice-btn vertice-btn--dark text-decoration-none"
                >
                  Ir a mi estudio ({ownStudio.name})
                </Link>
              </>
            ) : (
              <>
                <h1 className="h3 fw-bold mb-3">Estudio no encontrado</h1>
                <p className="text-muted mb-4">
                  El portfolio solicitado (<code>/estudios/{slug}</code>) no existe o no se encuentra disponible.
                </p>

                {isAdmin && availableStudios.length > 0 && (
                  <div className="mb-4">
                    <p className="small text-uppercase fw-semibold text-muted mb-2">
                      Estudios registrados (Vista Admin)
                    </p>
                    <div className="d-flex flex-wrap justify-content-center gap-2">
                      {availableStudios.map((st) => (
                        <Link
                          key={st.id}
                          to={`/estudios/${st.slug}`}
                          className="btn btn-outline-dark btn-sm rounded-pill px-3"
                        >
                          {st.name}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                <Link to="/" className="vertice-btn vertice-btn--dark text-decoration-none">
                  Volver al inicio
                </Link>
              </>
            )}
          </div>
        </div>
      </section>
    );
  }

  if (profileError) {
    return (
      <section className="py-5 my-5">
        <div className="container py-4">
          <div className="vertice-projects__empty mx-auto" style={{ maxWidth: '620px' }}>
            <p className="vertice-projects__empty-title">No se pudo cargar el estudio.</p>
            <p className="vertice-projects__empty-desc">{profileError}</p>
            <button type="button" className="vertice-projects__action-btn" onClick={reload}>
              Reintentar conexión
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (!profile) {
    return (
      <section className="py-5 my-5">
        <div className="container py-4">
          <div className="vertice-projects__empty mx-auto" style={{ maxWidth: '620px' }}>
            <p className="vertice-projects__empty-title">
              {isStudioMember
                ? 'Tu usuario aún no tiene un estudio asignado.'
                : 'Aún no hay estudios publicados.'}
            </p>
            <p className="vertice-projects__empty-desc">
              {isStudioMember
                ? 'Solicitá al administrador de la plataforma que asocie tu cuenta al perfil de tu estudio.'
                : 'Cuando el estudio publique su información en la plataforma, su portfolio estará disponible aquí.'}
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
      <Hero profile={profile} />
      <div className="vertice-reveal" data-scroll-reveal>
        <About data={aboutData} profile={profile} error={aboutError} hasTeam={hasTeam} />
      </div>
      <div className="vertice-reveal" data-scroll-reveal>
        <ProjectSlider
          projects={projects}
          error={projectsError}
          onRetry={reload}
          studioSlug={profile.slug}
          studioName={profile.name}
        />
      </div>
      <div className="vertice-reveal" data-scroll-reveal>
        <BrandsCarousel brands={brands} error={brandsError} />
      </div>
      <div className="vertice-reveal" data-scroll-reveal>
        <Team members={teamMembers} error={teamError} />
      </div>
      <div className="vertice-reveal" data-scroll-reveal>
        <ContactSection
          title="Contanos tu proyecto"
          profile={profile}
          profileId={profile.id}
        />
      </div>
    </>
  );
}
