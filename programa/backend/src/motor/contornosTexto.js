// Contornos de color de un texto: uno o varios, uno por fuera del otro, como
// los "trazos" apilados de Illustrator. El primero va pegado a la letra; cada
// uno siguiente rodea al anterior con su propio grosor.
// ESPEJO de programa/frontend/src/utilidades/contornosTexto.js: el lienzo y el
// PDF tienen que dibujar los mismos anillos.
//
// Una zona guarda `contornos: [{colorHex, grosorCm}]`. Las zonas de antes
// guardaban uno solo (`contorno: {activo, colorHex, grosorCm}`) y se siguen
// leyendo igual.

export const CONTORNOS_MAX = 5;
export const CONTORNO_ANILLO_MAX_CM = 3;

/** Los contornos de una zona (cruda), del pegado a la letra al de más afuera. */
export function contornosDeZona(zona) {
  const lista = Array.isArray(zona?.contornos) ? zona.contornos : zona?.contorno?.activo ? [zona.contorno] : [];
  return normalizarContornos(lista);
}

/** Los contornos de un texto ya resuelto (también los de generaciones viejas, con `contorno`). */
export function contornosDeTexto(texto) {
  if (Array.isArray(texto?.contornos)) return normalizarContornos(texto.contornos);
  return texto?.contorno ? normalizarContornos([texto.contorno]) : [];
}

function normalizarContornos(lista) {
  return lista
    .map((c) => ({ colorHex: (typeof c?.colorHex === 'string' && c.colorHex) || '#000000', grosorCm: Math.min(Number(c?.grosorCm), CONTORNO_ANILLO_MAX_CM) }))
    .filter((c) => Number.isFinite(c.grosorCm) && c.grosorCm > 0)
    .slice(0, CONTORNOS_MAX);
}

/** Cuánto ocupan todos juntos por fuera de la letra. */
export function grosorTotal(contornos) {
  return contornos.reduce((s, c) => s + c.grosorCm, 0);
}

/**
 * Cómo se pintan: del de más afuera al pegado a la letra, cada uno como un
 * trazo centrado en el borde de la letra con el DOBLE de lo que llega hasta
 * su borde exterior (la mitad de adentro la tapan el siguiente y el relleno).
 */
export function pasadasDeContornos(contornos) {
  let alcance = grosorTotal(contornos);
  const pasadas = [];
  for (let i = contornos.length - 1; i >= 0; i--) {
    pasadas.push({ colorHex: contornos[i].colorHex, anchoTrazoCm: 2 * alcance });
    alcance -= contornos[i].grosorCm;
  }
  return pasadas;
}
