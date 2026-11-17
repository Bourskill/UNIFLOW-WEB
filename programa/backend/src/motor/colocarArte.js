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
});

const numero = (v, porDefecto) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : porDefecto);

export function normalizarAjusteArte(ajuste) {
  const a = ajuste || {};
  return {
    base: a.base === 'encajar' ? 'encajar' : 'cubrir',
    escala: Math.min(Math.max(numero(a.escala, 100), 1), 1000),
    alineacionH: ['izquierda', 'derecha'].includes(a.alineacionH) ? a.alineacionH : 'centro',
    alineacionV: ['arriba', 'abajo'].includes(a.alineacionV) ? a.alineacionV : 'centro',
    dxCm: numero(a.dxCm, 0),
    dyCm: numero(a.dyCm, 0),
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
  const x = a.alineacionH === 'izquierda' ? 0 : a.alineacionH === 'derecha' ? anchoCm - ancho : (anchoCm - ancho) / 2;
  const y = a.alineacionV === 'arriba' ? 0 : a.alineacionV === 'abajo' ? altoCm - alto : (altoCm - alto) / 2;
  return { x: x + a.dxCm, y: y + a.dyCm, ancho, alto };
}
