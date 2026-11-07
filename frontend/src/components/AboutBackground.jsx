/**
 * Componente de fondo panorámico personalizable por estudio para la sección institucional ("Nosotros").
 *
 * - Si el estudio cargó una imagen (`imageUrl`), la aplica como fondo de pantalla completa
 *   con `background-size: cover` y `background-position: center`, acompañada por una
 *   superposición oscura sutil que garantiza el contraste del texto centrado.
 * - Si el estudio no tiene imagen cargada (o falla la carga), mantiene limpio el fondo base
 *   de la sección sin agregar ilustraciones ni imágenes de relleno.
 */
export default function AboutBackground({ imageUrl, onImageError }) {
  if (!imageUrl) {
    return null;
  }

  return (
    <div className="vertice-about__backdrop" aria-hidden="true">
      <div
        className="vertice-about__backdrop-img"
        style={{ backgroundImage: `url("${imageUrl}")` }}
      />
      <img
        src={imageUrl}
        alt=""
        className="vertice-about__backdrop-probe"
        onError={onImageError}
      />
      <div className="vertice-about__backdrop-overlay" />
    </div>
  );
}
