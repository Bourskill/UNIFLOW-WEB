// Fondo de color de las piezas de un Diseño: sólido o degradado, el mismo
// para TODAS las piezas, debajo del arte (así se puede subir un PNG con
// transparencia encima). El degradado se calcula sobre el rectángulo de
// cada pieza.
// ESPEJO de programa/backend/src/motor/fondoPieza.js: el lienzo, la vista
// previa y el PDF lo tienen que pintar igual (lo comprueba la prueba).
//
// Ángulo: 0° = de izquierda a derecha, 90° = de arriba hacia abajo (cm, Y
// hacia abajo, como el resto de las coordenadas de la pieza).

const HEX = /^#[0-9a-fA-F]{6}$/;

export function normalizarFondo(fondo) {
  const f = fondo || {};
  const tipo = ['solido', 'degradado'].includes(f.tipo) ? f.tipo : 'ninguno';
  const angulo = Number(f.anguloGrados);
  return {
    tipo,
    color1: HEX.test(f.color1) ? f.color1.toLowerCase() : '#ffffff',
    color2: HEX.test(f.color2) ? f.color2.toLowerCase() : '#000000',
    anguloGrados: Number.isFinite(angulo) ? ((angulo % 360) + 360) % 360 : 90,
  };
}

/** null si no hay fondo; si no, el fondo ya normalizado. */
export function fondoActivo(fondo) {
  const f = normalizarFondo(fondo);
  return f.tipo === 'ninguno' ? null : f;
}

/**
 * Los dos extremos del degradado sobre una pieza de anchoCm × altoCm: la
 * línea pasa por el centro y llega justo a las esquinas más lejanas (como el
 * linear-gradient de CSS), así color1 y color2 tocan los bordes de la pieza.
 */
export function ejeDegradado({ anchoCm, altoCm, anguloGrados }) {
  const rad = (anguloGrados * Math.PI) / 180;
  const dx = Math.cos(rad), dy = Math.sin(rad);
  const medio = (Math.abs(anchoCm * dx) + Math.abs(altoCm * dy)) / 2;
  const cx = anchoCm / 2, cy = altoCm / 2;
  return { x1: cx - dx * medio, y1: cy - dy * medio, x2: cx + dx * medio, y2: cy + dy * medio };
}

function canales(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

/** Color (r,g,b de 0 a 255) en la fracción t (0 = color1, 1 = color2). */
export function colorEn(fondo, t) {
  const a = canales(fondo.color1), b = canales(fondo.color2);
  const u = Math.min(Math.max(t, 0), 1);
  return a.map((v, i) => Math.round(v + (b[i] - v) * u));
}
