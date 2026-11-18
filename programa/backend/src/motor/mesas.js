// Mesas de trabajo de una producción: UNA mesa por talla, con la prenda
// completa (todas sus piezas, las en par ×2). Como el script "PROCESAR
// MOLDES" del panel de Illustrator: la mesa mide lo justo para lo que lleva
// más un margen de 1 cm alrededor, y las piezas van en filas de `columnas`,
// separadas `separacionCm`. Una página del PDF = una mesa.
//
// Las piezas llegan como las arma resolverPiezasDePedido (anchoCm/altoCm,
// talla, piezaId...) y salen con `posicion` dentro de su mesa, que es lo que
// dibuja exportarPdf.js.

export const MARGEN_MESA_CM = 1;

export function armarMesas(piezas, { margenCm = MARGEN_MESA_CM, separacionCm = 1, columnas = 3 } = {}) {
  const porTalla = new Map();
  for (const p of piezas) {
    if (!porTalla.has(p.talla)) porTalla.set(p.talla, []);
    porTalla.get(p.talla).push(p);
  }
  return [...porTalla.entries()].map(([talla, lista]) => mesaEnGrilla(talla, lista, { margenCm, separacionCm, columnas }));
}

function mesaEnGrilla(talla, lista, { margenCm, separacionCm, columnas }) {
  const colocadas = [];
  let y = margenCm;
  let anchoMax = 0;
  for (let i = 0; i < lista.length; i += columnas) {
    const fila = lista.slice(i, i + columnas);
    let x = margenCm;
    let altoFila = 0;
    for (const p of fila) {
      colocadas.push({ ...p, posicion: { x, y } });
      x += p.anchoCm + separacionCm;
      altoFila = Math.max(altoFila, p.altoCm);
    }
    anchoMax = Math.max(anchoMax, x - separacionCm);
    y += altoFila + separacionCm;
  }
  return {
    talla,
    anchoLienzoCm: redondear(anchoMax + margenCm),
    altoLienzoCm: redondear(y - separacionCm + margenCm),
    piezas: colocadas,
  };
}

function redondear(n) {
  return Math.round(n * 1000) / 1000;
}
