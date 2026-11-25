// Contornos de color de un texto: uno o varios, uno por fuera del otro, como
// los "trazos" apilados de Illustrator. El primero va pegado a la letra; cada
// uno siguiente rodea al anterior con su propio grosor.
// ESPEJO de programa/frontend/src/utilidades/contornosTexto.js: el lienzo y el
// PDF tienen que dibujar los mismos anillos.
//
// Una zona guarda `contornos: [{colorHex, grosorCm}]`. Las zonas de antes
// guardaban uno solo (`contorno: {activo, colorHex, grosorCm}`) y se siguen
// leyendo igual.
//
// Con `contornosEnlazados` ("escalar con la letra"), cada contorno se mide en
// `pct`: % del alto de la letra (la banda de mayúsculas, o de cifras). Así un
// número grande lleva un contorno proporcional y uno chico, uno fino. El
// grosor en cm sale recién al ajustar el texto (contornosResueltos).

export const CONTORNOS_MAX = 5;
export const CONTORNO_ANILLO_MAX_CM = 3;

/** Los contornos de una zona (cruda), del pegado a la letra al de más afuera. */
export function contornosDeZona(zona) {
  const lista = Array.isArray(zona?.contornos) ? zona.contornos : zona?.contorno?.activo ? [zona.contorno] : [];
  const enlazados = zona?.contornosEnlazados === true;
  return normalizarContornos(lista.map((c) => (enlazados ? { colorHex: c?.colorHex, pct: c?.pct } : { colorHex: c?.colorHex, grosorCm: c?.grosorCm })));
}

/** Los contornos de un texto ya resuelto (también los de generaciones viejas, con `contorno`). */
export function contornosDeTexto(texto) {
  if (Array.isArray(texto?.contornos)) return normalizarContornos(texto.contornos);
  return texto?.contorno ? normalizarContornos([texto.contorno]) : [];
}

export const CONTORNO_PCT_MAX = 30;

function normalizarContornos(lista) {
  return lista
    .map((c) => {
      const colorHex = (typeof c?.colorHex === 'string' && c.colorHex) || '#000000';
      const pct = Number(c?.pct);
      // En % del alto de la letra (enlazado): el grosor en cm todavía no se sabe.
      if (c?.pct !== undefined && c?.pct !== null && Number.isFinite(pct) && pct > 0) {
        const r = { colorHex, pct: Math.min(pct, CONTORNO_PCT_MAX) };
        const g = Number(c?.grosorCm);
        if (Number.isFinite(g) && g > 0) r.grosorCm = Math.min(g, CONTORNO_ANILLO_MAX_CM);
        return r;
      }
      return { colorHex, grosorCm: Math.min(Number(c?.grosorCm), CONTORNO_ANILLO_MAX_CM) };
    })
    .filter((c) => c.pct > 0 || (Number.isFinite(c.grosorCm) && c.grosorCm > 0))
    .slice(0, CONTORNOS_MAX);
}

/** Cuánto de los contornos va en % de la letra (fracción: 0.1 = 10%). */
export function fraccionDeLaLetra(contornos) {
  return contornos.reduce((s, c) => s + (c.pct > 0 && !(c.grosorCm > 0) ? c.pct / 100 : 0), 0);
}

/** Los contornos con su grosor en cm, ya sabiendo el alto de la letra. */
export function contornosResueltos(contornos, altoLetraCm) {
  return contornos.map((c) => (c.pct > 0 && !(c.grosorCm > 0)
    ? { colorHex: c.colorHex, pct: c.pct, grosorCm: Math.min(Math.max(0, (c.pct / 100) * (altoLetraCm || 0)), CONTORNO_ANILLO_MAX_CM) }
    : c));
}

/** Cuánto ocupan todos juntos por fuera de la letra. */
export function grosorTotal(contornos) {
  return contornos.reduce((s, c) => s + (c.grosorCm > 0 ? c.grosorCm : 0), 0);
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
    alcance -= contornos[i].grosorCm > 0 ? contornos[i].grosorCm : 0;
  }
  return pasadas;
}
