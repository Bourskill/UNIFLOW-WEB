// Escalado de zonas de personalización por talla.
//
// Invariante heredado de la versión Illustrator (pagado con un bug real de
// nombres acentuados vs. sin acentuar): el tamaño de una zona SIEMPRE se
// calcula contra una referencia fija declarada en el diseño, nunca contra la
// caja de tinta real del contenido que se va a escribir. Medir el contenido
// real hace que "PEÑA" y "PENA" salgan de alto distinto solo por la tilde.

import { compararTallas } from '../dominio/modelos.js';

/**
 * @param {import('../dominio/modelos.js').Zona} zona
 * @param {string} talla
 * @param {Record<string, {anchoCm:number, altoCm:number}>} dimensionesPiezaPorTalla
 * @returns {{ anchoCm: number, altoCm: number }}
 */
export function calibrarZona(zona, talla, dimensionesPiezaPorTalla) {
  if (zona.modoEscalado === 'porRangos') {
    return calibrarPorRangos(zona, talla);
  }
  return calibrarProporcional(zona, talla, dimensionesPiezaPorTalla);
}

function calibrarPorRangos(zona, talla) {
  const rango = (zona.rangos ?? []).find(
    (r) => compararTallas(talla, r.desdeTalla) >= 0 && compararTallas(talla, r.hastaTalla) <= 0
  );
  if (!rango) {
    throw new Error(
      'La zona "' + zona.id + '" no tiene rango definido para la talla ' + talla + '. ' +
      'No se asume un valor por defecto: una zona sin rango es una talla sin validar.'
    );
  }
  return { anchoCm: rango.anchoCm, altoCm: rango.altoCm };
}

function calibrarProporcional(zona, talla, dimensionesPiezaPorTalla) {
  const dimensionTalla = dimensionesPiezaPorTalla[talla];
  if (!dimensionTalla) {
    throw new Error('No hay dimensión de pieza para la talla ' + talla + '.');
  }
  const alturaReferencia = zona.referenciaProporcional?.altoCm;
  if (!alturaReferencia) {
    throw new Error('La zona "' + zona.id + '" no tiene referenciaProporcional.altoCm.');
  }
  const factor = dimensionTalla.altoCm / alturaReferencia;
  return {
    anchoCm: round2(zona.referenciaProporcional.altoCm * factor),
    altoCm: round2(alturaReferencia * factor),
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
