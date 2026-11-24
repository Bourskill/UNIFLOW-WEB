// Dónde va el arte (la imagen del Diseño) sobre su pieza: escala, alineación
// y corrimiento que el usuario elige en Diseño para cuadrarlo con el molde.
// ESPEJO de programa/frontend/src/utilidades/colocarArte.js: el lienzo, la
// vista previa del nesting y el PDF tienen que poner la imagen en el MISMO
// lugar. Si se cambia uno, se cambia el otro (lo comprueba la prueba).
//
// Todo en cm, con el origen arriba a la izquierda del rectángulo de la pieza
// (mismas coordenadas que zonas, textos y contorno).

export const AJUSTE_ARTE_INICIAL = Object.freeze({
  base: 'cubrir', // 'cubrir': llena la pieza (puede recortar) · 'encajar': entra entera
  escala: 100, // % sobre la base
  alineacionH: 'centro', // 'izquierda' | 'centro' | 'derecha'
  alineacionV: 'centro', // 'arriba' | 'centro' | 'abajo'
  dxCm: 0,
  dyCm: 0,
  calce: [], // puntos de calce (ver abajo)
});

const numero = (v, porDefecto) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : porDefecto);

// ---- puntos de calce ---------------------------------------------------------
// Para que el diseño siga de una pieza a la otra en la costura (el "calce"),
// el usuario marca puntos SOBRE EL ARTE y engancha cada uno a un punto del
// molde (un piquete, un extremo, un vértice -- igual que un ancla de zona).
// En cada talla el arte se ubica para que sus puntos caigan sobre esos puntos
// del molde: con uno, la posición queda fija (la escala sigue siendo la del
// ajuste); con dos o más, también la escala sale sola (sin deformar ni girar).
//
// Cada punto: { id, u, v, destino } -- u/v: dónde está en el arte, en fracción
// de su ancho y su alto (0..1, desde arriba a la izquierda); destino: el punto
// del molde, con la misma forma que un ancla ({ x: {ref, modo, valor}, y: {…} }),
// o null mientras no se enganchó.
function normalizarCalce(lista) {
  if (!Array.isArray(lista)) return [];
  return lista
    .filter((p) => p && Number.isFinite(Number(p.u)) && Number.isFinite(Number(p.v)))
    .slice(0, 6)
    .map((p, i) => ({
      id: String(p.id || 'c' + (i + 1)),
      u: Number(p.u),
      v: Number(p.v),
      destino: p.destino && p.destino.x?.ref && p.destino.y?.ref ? p.destino : null,
    }));
}

/** Id del ancla con la que se resuelve el destino de un punto de calce. */
export function idAnclaDeCalce(clave, punto) {
  return 'calce·' + clave + '·' + punto.id;
}

/**
 * Los destinos enganchados de una pieza, como anclas del motor de anclaje
 * (motor/anclaje/resolver.js) -- así se resuelven en cada talla igual que las
 * anclas de las zonas.
 */
export function anclasDeCalce(clave, ajuste) {
  return normalizarCalce(ajuste?.calce)
    .filter((p) => p.destino)
    .map((p) => ({ id: idAnclaDeCalce(clave, p), nombre: 'Calce ' + p.id, pieza: clave, x: p.destino.x, y: p.destino.y }));
}

/**
 * El ajuste con sus puntos de calce resueltos para UNA talla: calceCm =
 * [{u, v, x, y}] (x/y en cm de la pieza). anclasResueltas: { id -> {x, y} }.
 * Los puntos que no se pudieron resolver en esa talla se dejan afuera.
 */
export function conCalceResuelto(clave, ajuste, anclasResueltas) {
  if (!ajuste) return ajuste;
  const calceCm = normalizarCalce(ajuste.calce)
    .filter((p) => p.destino)
    .map((p) => ({ p, r: anclasResueltas?.[idAnclaDeCalce(clave, p)] }))
    .filter(({ r }) => r && Number.isFinite(r.x) && Number.isFinite(r.y))
    .map(({ p, r }) => ({ u: p.u, v: p.v, x: r.x, y: r.y }));
  return { ...ajuste, calceCm };
}

export function normalizarAjusteArte(ajuste) {
  const a = ajuste || {};
  return {
    base: a.base === 'encajar' ? 'encajar' : 'cubrir',
    escala: Math.min(Math.max(numero(a.escala, 100), 1), 1000),
    alineacionH: ['izquierda', 'derecha'].includes(a.alineacionH) ? a.alineacionH : 'centro',
    alineacionV: ['arriba', 'abajo'].includes(a.alineacionV) ? a.alineacionV : 'centro',
    dxCm: numero(a.dxCm, 0),
    dyCm: numero(a.dyCm, 0),
    calce: normalizarCalce(a.calce),
  };
}

/**
 * @returns {{x:number, y:number, ancho:number, alto:number}} rectángulo de la imagen en cm
 */
export function colocarArte({ anchoCm, altoCm, anchoImagen, altoImagen, ajuste }) {
  const a = normalizarAjusteArte(ajuste);
  const proporcion = anchoImagen > 0 && altoImagen > 0 ? anchoImagen / altoImagen : anchoCm / altoCm;
  // Base: la imagen sin deformar, cubriendo o encajando en la pieza.
  const masAnchaQueLaPieza = proporcion > anchoCm / altoCm;
  let ancho, alto;
  if (masAnchaQueLaPieza === (a.base === 'cubrir')) { alto = altoCm; ancho = alto * proporcion; }
  else { ancho = anchoCm; alto = ancho / proporcion; }
  ancho *= a.escala / 100;
  alto *= a.escala / 100;

  // Con puntos de calce resueltos, ellos mandan (la alineación y el
  // corrimiento no se usan).
  const calce = Array.isArray(ajuste?.calceCm) ? ajuste.calceCm : [];
  if (calce.length > 0) {
    // Cada punto del arte, en "anchos de imagen": (u, v / proporción).
    const ps = calce.map((c) => [c.u, c.v / proporcion]);
    const ts = calce.map((c) => [c.x, c.y]);
    const media = (l) => [l.reduce((s, q) => s + q[0], 0) / l.length, l.reduce((s, q) => s + q[1], 0) / l.length];
    const pm = media(ps), tm = media(ts);
    if (calce.length > 1) {
      // Escala uniforme por mínimos cuadrados (exacta con dos puntos alineados).
      let num = 0, den = 0;
      ps.forEach((q, i) => {
        const dx = q[0] - pm[0], dy = q[1] - pm[1];
        num += dx * (ts[i][0] - tm[0]) + dy * (ts[i][1] - tm[1]);
        den += dx * dx + dy * dy;
      });
      if (den > 1e-9 && num / den > 1e-3) { ancho = num / den; alto = ancho / proporcion; }
    }
    return { x: tm[0] - ancho * pm[0], y: tm[1] - ancho * pm[1], ancho, alto };
  }

  const x = a.alineacionH === 'izquierda' ? 0 : a.alineacionH === 'derecha' ? anchoCm - ancho : (anchoCm - ancho) / 2;
  const y = a.alineacionV === 'arriba' ? 0 : a.alineacionV === 'abajo' ? altoCm - alto : (altoCm - alto) / 2;
  return { x: x + a.dxCm, y: y + a.dyCm, ancho, alto };
}
