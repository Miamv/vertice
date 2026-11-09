import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const isPublicAuthEndpoint =
    config.url?.includes('/auth/login/') ||
    config.url?.includes('/auth/register/') ||
    config.url?.includes('/auth/refresh/');

  if (!isPublicAuthEndpoint) {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

function clearSession() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('auth_user');
  try {
    sessionStorage.removeItem('vertice_active_studio_slug');
  } catch {
    // Ignore storage errors
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('auth:logout'));
  }
}

// Single-flight: varias peticiones 401 simultáneas comparten la MISMA promesa de
// refresh, así no se disparan refresh concurrentes (y un fallo dispara un único logout).
let refreshPromise = null;

function refreshAccessToken() {
  if (!refreshPromise) {
    const storedRefresh = localStorage.getItem('refresh_token');

    if (!storedRefresh) {
      clearSession();
      return Promise.reject(new Error('No hay refresh token disponible.'));
    }

    // No hay recursión: /auth/refresh/ está excluido del reintento en el interceptor.
    refreshPromise = refreshToken(storedRefresh)
      .then((res) => {
        const newAccessToken = res.data.access;
        localStorage.setItem('access_token', newAccessToken);
        return newAccessToken;
      })
      .catch((refreshErr) => {
        clearSession();
        return Promise.reject(refreshErr);
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Si recibimos 401 y no es login ni refresh, intentamos refrescar el token
    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/login/') &&
      !originalRequest.url?.includes('/auth/register/') &&
      !originalRequest.url?.includes('/auth/refresh/')
    ) {
      originalRequest._retry = true;

      // Si el refresh falla, la promesa rechaza y el error original se descarta:
      // clearSession() ya emitió auth:logout para resincronizar el contexto.
      const newAccessToken = await refreshAccessToken();
      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
      return api(originalRequest);
    }

    return Promise.reject(error);
  }
);

export function getProjects(params) {
  return params ? api.get('/projects/', { params }) : api.get('/projects/');
}

export function getProject(id, params) {
  return params ? api.get(`/projects/${id}/`, { params }) : api.get(`/projects/${id}/`);
}

export function createProject(data) {
  return api.post('/projects/', data);
}

export function updateProject(id, data) {
  return api.patch(`/projects/${id}/`, data);
}

export function deleteProject(id) {
  return api.delete(`/projects/${id}/`);
}

export function getApiOrigin() {
  return API_BASE_URL.replace(/\/api\/?$/, '');
}

export function resolveMediaUrl(url) {
  if (!url) return null;
  if (/^(https?:\/\/|data:|blob:)/i.test(url)) return url;
  const origin = getApiOrigin();
  const path = url.startsWith('/') ? url : `/${url}`;
  return `${origin}${path}`;
}

export function getMedia(projectId, extraParams) {
  const params = {
    ...(extraParams || {}),
    ...(projectId !== undefined && projectId !== null ? { project: projectId } : {}),
  };
  return Object.keys(params).length > 0 ? api.get('/media/', { params }) : api.get('/media/');
}

export function createMedia(data) {
  if (data instanceof FormData) {
    return api.post('/media/', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  }
  return api.post('/media/', data);
}

export function updateMedia(id, data) {
  if (data instanceof FormData) {
    return api.patch(`/media/${id}/`, data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  }
  return api.patch(`/media/${id}/`, data);
}

export function deleteMedia(id) {
  return api.delete(`/media/${id}/`);
}

export function getProfiles(params) {
  return params ? api.get('/profiles/', { params }) : api.get('/profiles/');
}

export function getProfileBySlug(slug) {
  return api.get(`/profiles/by-slug/${encodeURIComponent(slug)}/`);
}

export function updateStudioProfile(idOrSlug, data) {
  return api.patch(`/profiles/${encodeURIComponent(idOrSlug)}/`, data);
}

export function getAbout(params) {
  return params ? api.get('/about/', { params }) : api.get('/about/');
}

export function createAbout(data) {
  if (data instanceof FormData) {
    return api.post('/about/', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  }
  return api.post('/about/', data);
}

export function updateAbout(id, data) {
  if (data instanceof FormData) {
    return api.patch(`/about/${id}/`, data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  }
  return api.patch(`/about/${id}/`, data);
}

export function getTeam(params) {
  return params ? api.get('/team/', { params }) : api.get('/team/');
}

export function createTeamMember(data) {
  if (data instanceof FormData) {
    return api.post('/team/', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  }
  return api.post('/team/', data);
}

export function updateTeamMember(id, data) {
  if (data instanceof FormData) {
    return api.patch(`/team/${id}/`, data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  }
  return api.patch(`/team/${id}/`, data);
}

export function deleteTeamMember(id) {
  return api.delete(`/team/${id}/`);
}

export function getContacts(params) {
  return params ? api.get('/contacts/', { params }) : api.get('/contacts/');
}

export function sendContact(data) {
  return api.post('/contacts/', data);
}

export function updateContact(id, data) {
  return api.patch(`/contacts/${id}/`, data);
}

export function deleteContact(id) {
  return api.delete(`/contacts/${id}/`);
}

export function login(credentials) {
  return api.post('/auth/login/', credentials);
}

export function register(data) {
  return api.post('/auth/register/', data);
}

export function getProfile() {
  return api.get('/auth/profile/');
}

export function updateProfile(data) {
  return api.patch('/auth/profile/', data);
}

export function refreshToken(refresh) {
  return api.post('/auth/refresh/', { refresh });
}

export function logout(refresh) {
  return api.post('/auth/logout/', { refresh });
}

export default api;
