// Lo que comparten los importadores de SVG y DXF: una vez que cada formato
// entrega sus puntos ya en "unidades del archivo" (sin importar de dónde
// salieron), matchear el nombre contra una talla conocida y calcular
// bounding box en mm es exactamente el mismo cálculo.

import { TALLAS_ORDEN } from '../dominio/modelos.js';

const TALLAS_NORMALIZADAS = new Set(TALLAS_ORDEN.map((t) => t.toUpperCase()));

export function normalizarTalla(nombre) {
  const limpio = (nombre || '').trim().toUpperCase();
  return TALLAS_NORMALIZADAS.has(limpio) ? limpio : null;
}

export function anchoDePuntos(puntosUnidades) {
  const xs = puntosUnidades.map((p) => p[0]);
  return Math.max(...xs) - Math.min(...xs);
}

export function poligonoYBoundingBoxDePuntos(puntosUnidades, mmPorUnidad) {
  const puntosMm = puntosUnidades.map(([x, y]) => [x * mmPorUnidad, y * mmPorUnidad]);
  const xs = puntosMm.map((p) => p[0]);
  const ys = puntosMm.map((p) => p[1]);
  return {
    poligonoMm: puntosMm,
    boundingBoxMm: {
      anchoMm: Math.max(...xs) - Math.min(...xs),
      altoMm: Math.max(...ys) - Math.min(...ys),
    },
  };
}

// Dado el conjunto crudo de "candidatos" (una forma/capa por índice, cada uno
// con nombre y sus puntos en unidades del archivo), arma las asignaciones
// automáticas talla->índice por nombre exacto. Si dos candidatos matchean la
// misma talla, ninguno se asigna solo -- queda ambiguo para resolver a mano.
export function asignarTallasPorNombre(candidatos) {
  const asignacionesCrudas = candidatos.map((c) => ({
    indice: c.indice,
    nombreDetectado: c.nombre,
    tallaAsignada: normalizarTalla(c.nombre),
  }));
  const conteoPorTalla = {};
  for (const a of asignacionesCrudas) {
    if (a.tallaAsignada) conteoPorTalla[a.tallaAsignada] = (conteoPorTalla[a.tallaAsignada] || 0) + 1;
  }
  return asignacionesCrudas.map((a) =>
    a.tallaAsignada && conteoPorTalla[a.tallaAsignada] > 1 ? { ...a, tallaAsignada: null } : a
  );
}
