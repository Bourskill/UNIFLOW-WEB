// Espejo horizontal de una pieza: de una manga izquierda sale la derecha
// (y al revés) sin importar otro archivo. Se refleja TODO lo que tiene
// posición -- contorno, piquetes y salientes -- respecto del centro de su
// propio rectángulo, así la pieza espejada ocupa el mismo lugar y medidas.
//
// El contorno además se recorre al revés: reflejar invierte el sentido de
// giro (horario ↔ antihorario), y volver a invertir el orden lo deja con el
// mismo sentido que tenía, que es el que esperan el offset del borde y los
// salientes.

// Pieza "en par" (GrupoPieza.par): la prenda lleva esta pieza y su espejo
// (manga izquierda y derecha) sin que exista una segunda pieza en la
// Biblioteca. El otro lado es VIRTUAL: misma pieza, geometría reflejada al
// vuelo, con esta clave (la del rol + el sufijo). Ver dominio/resolverGrupo.js.
export const SUFIJO_LADO = '@espejo';
export const claveDelOtroLado = (clave) => clave + SUFIJO_LADO;
export const esOtroLado = (clave) => typeof clave === 'string' && clave.endsWith(SUFIJO_LADO);

import { mapearTrazado, invertirTrazado } from './trazado.js';

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
    ...(geo.trazadoMm ? { trazadoMm: invertirTrazado(mapearTrazado(geo.trazadoMm, ([x, y]) => [espejarX(x, minX, maxX), y])) } : {}),
    ...(geo.piquetesMm ? { piquetesMm: geo.piquetesMm.map((p) => ({ ...p, xMm: espejarX(p.xMm, minX, maxX) })) } : {}),
    ...(geo.salientesMm ? { salientesMm: geo.salientesMm.map((s) => ({ ...s, xMm: espejarX(s.xMm, minX, maxX) })) } : {}),
  };
}

/** Todas las tallas espejadas. */
export function espejarGeometriaPorTalla(geometriaPorTalla) {
  return Object.fromEntries(Object.entries(geometriaPorTalla || {}).map(([talla, geo]) => [talla, espejarGeometria(geo)]));
}

// Pares izquierda/derecha que se reconocen en el nombre, para proponer el
// nombre del espejo ("MANGA IZQ" → "MANGA DER"). Respeta mayúsculas.
const PARES = [
  ['izquierda', 'derecha'], ['izquierdo', 'derecho'], ['izq', 'der'], ['izda', 'dcha'],
];

function conMismaCaja(modelo, palabra) {
  if (modelo === modelo.toUpperCase()) return palabra.toUpperCase();
  if (modelo[0] === modelo[0].toUpperCase()) return palabra[0].toUpperCase() + palabra.slice(1);
  return palabra;
}

/** Nombre propuesto para el espejo de `nombre`. */
export function nombreDeEspejo(nombre) {
  const texto = String(nombre || '').trim();
  for (const [a, b] of PARES) {
    const patron = new RegExp('(^|[^a-záéíóúñ])(' + a + '|' + b + ')(?=$|[^a-záéíóúñ])', 'i');
    const m = texto.match(patron);
    if (m) {
      const encontrada = m[2];
      const otra = encontrada.toLowerCase() === a ? b : a;
      const inicio = m.index + m[1].length;
      return texto.slice(0, inicio) + conMismaCaja(encontrada, otra) + texto.slice(inicio + encontrada.length);
    }
  }
  return texto + ' (espejo)';
}
