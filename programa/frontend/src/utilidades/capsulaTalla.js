// La talla de la pieza, como se marca a mano en Illustrator: la letra en
// negro dentro de una cápsula blanca (efecto "Forma > Rectángulo redondeado"
// relativo, 1 mm por lado, esquinas redondas), que se lee sobre cualquier
// color. Con una sola letra queda casi un círculo; con XXL, una píldora.
//
// La zona de la talla es el tamaño máximo: la letra se ajusta a la zona
// menos el margen (resolverPedido.js) y la cápsula la envuelve con ese margen.
// ESPEJO de programa/backend/src/motor/capsulaTalla.js: el lienzo y el
// PDF tienen que dibujar la misma cápsula (lo comprueba la prueba).

export const MARGEN_CAPSULA_CM = 0.1;
export const COLOR_CAPSULA = '#ffffff';
export const COLOR_TALLA = '#000000';

// Lo que se escribe en la cápsula: la talla siempre en mayúscula y, en la
// línea femenina, con un guion al final (XS-, S-, M-…). genero sale de la zona
// (generoTalla: 'masculino' | 'femenino'; sin elegir, masculino).
export function textoDeTalla(talla, genero) {
  const t = String(talla ?? '').trim().toUpperCase();
  if (!t) return '';
  return genero === 'femenino' && !t.endsWith('-') ? t + '-' : t;
}

/**
 * Medidas de la cápsula para un texto ya ajustado (ajusteTexto.js): ancho =
 * tinta + margen, alto = banda de mayúsculas + margen (así S y XL quedan del
 * mismo alto), radio = la mitad del lado corto. Centrada en el centro de la zona.
 */
export function medidasDeCapsula(ajuste, margenCm = MARGEN_CAPSULA_CM) {
  const banda = ajuste.altoBandaCm ?? ajuste.tintaCm?.alto ?? 0;
  const tinta = ajuste.tintaCm?.ancho ?? 0;
  const alto = banda + 2 * margenCm;
  const radio = alto / 2;
  // Las puntas son medio círculo: para que las esquinas de la primera y la
  // última letra (XL, XXL...) queden adentro, la cápsula se alarga lo justo.
  const alcance = Math.sqrt(Math.max(radio * radio - (banda / 2) ** 2, 0));
  let ancho = Math.max(tinta + 2 * (radio - alcance), alto);
  // Una letra sola (o casi): un círculo, como la marca a mano.
  if (ancho < alto * 1.15) ancho = alto;
  return { anchoCm: ancho, altoCm: alto, radioCm: radio };
}

/**
 * El contorno de la cápsula como trazado (cm, centro en 0,0, Y hacia abajo):
 * cuatro tramos rectos y cuatro cuartos de círculo en curvas Bézier.
 */
export function caminoDeCapsula({ anchoCm, altoCm, radioCm }) {
  const k = 0.5522847498 * radioCm; // cuarto de círculo en Bézier
  const x0 = -anchoCm / 2, x1 = anchoCm / 2, y0 = -altoCm / 2, y1 = altoCm / 2, r = radioCm;
  return [
    ['M', x0 + r, y0],
    ['L', x1 - r, y0],
    ['C', x1 - r + k, y0, x1, y0 + r - k, x1, y0 + r],
    ['L', x1, y1 - r],
    ['C', x1, y1 - r + k, x1 - r + k, y1, x1 - r, y1],
    ['L', x0 + r, y1],
    ['C', x0 + r - k, y1, x0, y1 - r + k, x0, y1 - r],
    ['L', x0, y0 + r],
    ['C', x0, y0 + r - k, x0 + r - k, y0, x0 + r, y0],
    ['Z'],
  ];
}

// ---- la talla no se sale del molde ------------------------------------------
// La zona de la talla es su tamaño máximo; si cerca de un borde (o de una
// curva) esa caja se sale de la pieza, se achica desde su centro lo justo
// para quedar adentro. Con la caja adentro, la cápsula (que nunca es más
// grande que la caja) también. Si el centro mismo cae fuera de la pieza no se
// adivina nada: queda como está.

function dentroDelPoligono([x, y], poli) {
  let dentro = false;
  for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) {
    const [xi, yi] = poli[i], [xj, yj] = poli[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

// Puntos sobre el borde de la caja (girada como la zona: grados antihorarios).
function bordeDeCaja(cx, cy, ancho, alto, grados) {
  const a = ((grados || 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const puntos = [];
  const N = 8;
  for (let i = 0; i < N; i++) {
    const t = i / N - 0.5;
    for (const [dx, dy] of [[t * ancho, -alto / 2], [ancho / 2, t * alto], [-t * ancho, alto / 2], [-ancho / 2, -t * alto]]) {
      puntos.push([cx + dx * c + dy * s, cy - dx * s + dy * c]);
    }
  }
  return puntos;
}

function cajaAdentro(cx, cy, ancho, alto, grados, poli) {
  if (!bordeDeCaja(cx, cy, ancho, alto, grados).every((p) => dentroDelPoligono(p, poli))) return false;
  // Una punta del molde que se mete en la caja (molde cóncavo) también es salirse.
  const a = ((grados || 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return !poli.some(([x, y]) => {
    const dx = x - cx, dy = y - cy;
    const u = dx * c - dy * s, v = dx * s + dy * c;
    return Math.abs(u) < ancho / 2 - 1e-6 && Math.abs(v) < alto / 2 - 1e-6;
  });
}

/**
 * Cuánto achicar la caja de la talla (1 = nada) para que entre en el molde.
 * contorno: los vértices de la pieza en cm ([x, y] o {x, y}), mismas
 * coordenadas que la zona.
 */
export function escalaDentroDelMolde({ cx, cy, ancho, alto, rotacionGrados = 0 }, contorno) {
  if (!Array.isArray(contorno) || contorno.length < 3 || !(ancho > 0) || !(alto > 0)) return 1;
  const poli = contorno.map((p) => (Array.isArray(p) ? p : [p.x, p.y]));
  if (!dentroDelPoligono([cx, cy], poli)) return 1;
  if (cajaAdentro(cx, cy, ancho, alto, rotacionGrados, poli)) return 1;
  let adentro = 0, afuera = 1;
  for (let i = 0; i < 24; i++) {
    const medio = (adentro + afuera) / 2;
    if (cajaAdentro(cx, cy, ancho * medio, alto * medio, rotacionGrados, poli)) adentro = medio; else afuera = medio;
  }
  return Math.max(adentro, 0.05);
}
