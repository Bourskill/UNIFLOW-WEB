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
