import { resolveMediaUrl } from '../services/api';

function AvatarPlaceholder({ name }) {
  const initials = name
    ? name
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'VT';

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: 'linear-gradient(135deg, #1d2b5c 0%, #111b3e 100%)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: '1.25rem',
        letterSpacing: '0.05em',
      }}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
}

export default function Team({ members = [], error }) {
  const teamList = Array.isArray(members) ? members : [];
  const hasMembers = teamList.length > 0;

  // Ocultar la sección opcional cuando el estudio no tiene integrantes cargados ni error
  if (!hasMembers && !error) {
    return null;
  }

  return (
    <section id="nosotros" className="vertice-team">
      <span id="equipo" aria-hidden="true" />
      <div className="container">
        <h3 className="vertice-team__title">Nuestro equipo</h3>
        {!hasMembers ? (
          <p className="vertice-team__empty text-muted small">
            {`No se pudo cargar el equipo. ${error}`}
          </p>
        ) : (
          <div className="vertice-team__grid">
            {teamList.map((member) => {
              const avatar = resolveMediaUrl(member.avatar || member.photo);
              const name = member.full_name || member.fullName || member.name;
              const role = member.role || member.position || member.specialty || 'Equipo Técnico';

              return (
                <div key={member.id} className="vertice-team__member">
                  <div className="vertice-team__avatar">
                    {avatar ? (
                      <img
                        src={avatar}
                        alt={name}
                        loading="lazy"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <AvatarPlaceholder name={name} />
                    )}
                  </div>
                  <span className="vertice-team__name">{name}</span>
                  <span className="vertice-team__role">{role}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
