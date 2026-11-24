// Espejo horizontal de una pieza y claves del "otro lado" de una pieza en
// par, para dibujarlo en Diseño. ESPEJO de programa/backend/src/motor/
// espejoPieza.js (lo comprueba backend/pruebas/prueba-espejo.js): el lienzo
// tiene que mostrar el mismo contorno que después se corta.

// Pieza "en par" (GrupoPieza.par): la prenda lleva esta pieza y su espejo
// (manga izquierda y derecha) sin que exista una segunda pieza en la
// Biblioteca. El otro lado es VIRTUAL: misma pieza, geometría reflejada al
// vuelo, con esta clave (la del rol + el sufijo). Ver dominio/resolverGrupo.js.
export const SUFIJO_LADO = '@espejo';
export const claveDelOtroLado = (clave) => clave + SUFIJO_LADO;
export const esOtroLado = (clave) => typeof clave === 'string' && clave.endsWith(SUFIJO_LADO);

function espejarX(x, minX, maxX) {
  return minX + maxX - x;
}

/** Una talla (geometriaPorTalla[talla]) espejada. No toca el original. */
export function espejarGeometria(geo) {
  if (!geo?.poligonoMm?.length) return geo;
  const xs = geo.poligonoMm.map((p) => p[0]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  return {
    ...geo,
    poligonoMm: geo.poligonoMm.map(([x, y]) => [espejarX(x, minX, maxX), y]).reverse(),
    ...(geo.piquetesMm ? { piquetesMm: geo.piquetesMm.map((p) => ({ ...p, xMm: espejarX(p.xMm, minX, maxX), ...(p.puntosMm ? { puntosMm: p.puntosMm.map(([x, y]) => [espejarX(x, minX, maxX), y]) } : {}) })) } : {}),
    ...(geo.salientesMm ? { salientesMm: geo.salientesMm.map((s) => ({ ...s, xMm: espejarX(s.xMm, minX, maxX) })) } : {}),
  };
}

/** Todas las tallas espejadas. */
export function espejarGeometriaPorTalla(geometriaPorTalla) {
  return Object.fromEntries(Object.entries(geometriaPorTalla || {}).map(([talla, geo]) => [talla, espejarGeometria(geo)]));
}
