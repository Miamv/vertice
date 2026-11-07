import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export default function useScrollTo() {
  const location = useLocation();
  const navigate = useNavigate();

  const scrollTo = useCallback(
    (id, basePath = '/') => {
      const normalizedCurrent = location.pathname.replace(/\/+$/, '') || '/';
      const normalizedTarget = basePath.replace(/\/+$/, '') || '/';

      if (!id || id === 'inicio') {
        if (normalizedCurrent === normalizedTarget) {
          if (location.hash) {
            navigate(normalizedTarget, { replace: true });
          }
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
        navigate(normalizedTarget);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      const element = document.getElementById(id);
      if (normalizedCurrent === normalizedTarget && element) {
        if (location.hash) {
          navigate(normalizedTarget, { replace: true });
        }
        element.scrollIntoView({ behavior: 'smooth' });
        return;
      }

      navigate(normalizedTarget, { state: { scrollToSection: id } });
    },
    [location.pathname, location.hash, navigate]
  );

  return scrollTo;
}
