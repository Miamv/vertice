export const PLAN_KEYS = ['planimetria', 'planta', 'cortes', 'vistas', 'detalle'];

export const PLAN_LABELS = {
  planimetria: 'Planimetría',
  planta: 'Planta',
  plantas: 'Planta',
  corte: 'Cortes',
  cortes: 'Cortes',
  vista: 'Vistas',
  vistas: 'Vistas',
  detalle: 'Detalle',
  detalle_constructivo: 'Detalle',
};

export function normalizePlanType(type) {
  if (!type) return null;
  const t = String(type).trim().toLowerCase();
  if (t === 'corte' || t === 'cortes') return 'cortes';
  if (t === 'vista' || t === 'vistas') return 'vistas';
  if (t === 'planta' || t === 'plantas') return 'planta';
  if (t === 'planimetria' || t === 'planimetría') return 'planimetria';
  if (t === 'detalle' || t === 'detalle constructivo' || t === 'detalle_constructivo') return 'detalle';
  return t;
}

const placeholderCache = new Map();

export function generatePlanoPlaceholder(label, sub = 'Esc 1:50') {
  const cacheKey = `${label}::${sub}`;
  if (placeholderCache.has(cacheKey)) {
    return placeholderCache.get(cacheKey);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">`
    + `<rect width="1200" height="800" fill="#EDEAE2"/>`
    + `<rect x="40" y="40" width="1120" height="720" fill="none" stroke="#1D2B5C" stroke-width="2" opacity="0.85"/>`
    + `<rect x="60" y="60" width="1080" height="680" fill="none" stroke="#1D2B5C" stroke-width="1" opacity="0.3"/>`
    + `<g stroke="#1D2B5C" stroke-width="2" fill="none" opacity="0.9">`
    + `<rect x="220" y="240" width="420" height="300"/><rect x="660" y="240" width="320" height="300"/>`
    + `<line x1="220" y1="390" x2="640" y2="390"/><line x1="430" y1="240" x2="430" y2="540"/>`
    + `<circle cx="760" cy="390" r="60"/><line x1="660" y1="540" x2="980" y2="540"/></g>`
    + `<g font-family="monospace" fill="#1D2B5C"><text x="80" y="110" font-size="34" letter-spacing="6">${label}</text>`
    + `<text x="80" y="145" font-size="18" opacity="0.6">${sub}</text></g>`
    + `</svg>`;
  const dataUri = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  placeholderCache.set(cacheKey, dataUri);
  return dataUri;
}
