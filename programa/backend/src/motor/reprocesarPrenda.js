// Reprocesar una pieza que vino de un PDF de PRENDA completa (una capa por
// pieza, tallas anidadas adentro): el archivo no dice qué capa era esta
// pieza ni qué talla es cada contorno, pero es el MISMO archivo -- cada
// contorno vuelve exactamente en el mismo lugar. Cada talla guardada se
// reencuentra por su caja (posición y medidas) entre todos los contornos
// del archivo, prefiriendo la capa que se llama como la pieza.
//
// Sirve, sobre todo, para recuperar el trazado original (los nodos del
// molde, ver trazado.js) en piezas importadas antes de que se guardara.

const TOLERANCIA_MM = 1;

function cajaDe(poligonoMm) {
  const xs = poligonoMm.map((p) => p[0]);
  const ys = poligonoMm.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

function distancia(a, b) {
  return Math.max(Math.abs(a.x0 - b.x0), Math.abs(a.y0 - b.y0), Math.abs(a.x1 - b.x1), Math.abs(a.y1 - b.y1));
}

/**
 * @param {{piezas: {nombre: string, tallas: object[]}[]}} prenda  lo que devuelve analizarPrendaPdf
 * @param {{nombre: string, geometriaPorTalla: Record<string, object>}} pieza  la pieza guardada
 *   (si está espejada, igual sirve: el espejo deja la caja en el mismo lugar)
 * @returns {{ geometriasPorTalla: Record<string, object>, sinCoincidencia: string[] }}
 *   la geometría recién leída de cada talla encontrada (sin espejar)
 */
export function geometriasDePiezaEnPrenda(prenda, pieza) {
  const nombre = String(pieza.nombre || '').trim().toUpperCase();
  const candidatos = [];
  for (const capa of prenda.piezas || []) {
    const mismaCapa = String(capa.nombre || '').trim().toUpperCase() === nombre;
    for (const geo of capa.tallas || []) {
      if (geo?.poligonoMm?.length) candidatos.push({ geo, mismaCapa, caja: cajaDe(geo.poligonoMm) });
    }
  }

  const geometriasPorTalla = {};
  const sinCoincidencia = [];
  for (const [talla, guardada] of Object.entries(pieza.geometriaPorTalla || {})) {
    if (!guardada?.poligonoMm?.length) { sinCoincidencia.push(talla); continue; }
    const caja = cajaDe(guardada.poligonoMm);
    let mejor = null;
    for (const c of candidatos) {
      const d = distancia(caja, c.caja);
      if (d > TOLERANCIA_MM) continue;
      // La capa con el nombre de la pieza gana; después, la más cercana.
      if (!mejor || (c.mismaCapa && !mejor.mismaCapa) || (c.mismaCapa === mejor.mismaCapa && d < mejor.d)) mejor = { ...c, d };
    }
    if (mejor) geometriasPorTalla[talla] = mejor.geo;
    else sinCoincidencia.push(talla);
  }
  return { geometriasPorTalla, sinCoincidencia };
}
