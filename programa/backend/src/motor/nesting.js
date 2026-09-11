// Empaquetado de piezas en un lienzo continuo.
//
// Reinterpretado desde cero (no heredado de UNIFLOW/Illustrator, donde una
// mesa = un artboard). Conceptos tomados de una plataforma competidora real
// observada en producción (ver claude/README.md):
//   - piezas de distintas prendas y tallas se mezclan libremente en un mismo
//     lienzo, no una mesa fija por pieza.
//   - la rotación de una pieza está limitada a 0° o 180° (un "flip", nunca un
//     ángulo libre) — evita que un patrón asimétrico quede irreconocible.
//   - el alto del lienzo se recorta al contenido real, no a un tamaño fijo.
//
// El algoritmo en sí (shelf packing con opción de flip) es una primera versión
// deliberadamente simple. NO está pensado como el empaquetado final — está
// pensado para que el resto del sistema (calibración, trazabilidad por pieza,
// reposición) tenga algo real contra qué integrarse. Reemplazar el heurístico
// interno más adelante no debería requerir tocar quien lo llama.

/**
 * @typedef {Object} PiezaParaAnidar
 * @property {string} id                 identifica la pieza dentro de esta corrida de nesting
 * @property {string} piezaId            id de la Pieza en la moldería
 * @property {string} lineaPedidoId
 * @property {string} talla
 * @property {number} anchoCm
 * @property {number} altoCm
 * @property {boolean} rotable
 */

/**
 * @param {PiezaParaAnidar[]} piezas
 * @param {{ anchoLienzoCm: number, separacionCm?: number }} opciones
 */
export function anidarPiezas(piezas, opciones) {
  const separacion = opciones.separacionCm ?? 0.5;
  const anchoLienzo = opciones.anchoLienzoCm;

  // Piezas más altas primero: reduce el desperdicio vertical del shelf packing.
  const ordenadas = [...piezas].sort((a, b) => b.altoCm - a.altoCm);

  const resultados = [];
  let y = separacion;
  let alturaFilaActual = 0;
  let x = separacion;

  for (const pieza of ordenadas) {
    const orientaciones = pieza.rotable
      ? [
          { rotacionGrados: 0, anchoCm: pieza.anchoCm, altoCm: pieza.altoCm },
          { rotacionGrados: 180, anchoCm: pieza.anchoCm, altoCm: pieza.altoCm },
        ]
      : [{ rotacionGrados: 0, anchoCm: pieza.anchoCm, altoCm: pieza.altoCm }];
    // Con solo 0°/180° el bounding box no cambia (a diferencia de una rotación
    // de 90°), así que la orientación no afecta dónde entra la pieza — pero se
    // registra igual, porque SÍ afecta cómo se debe imprimir/cortar.
    const orientacion = orientaciones[0];

    if (x + orientacion.anchoCm + separacion > anchoLienzo) {
      x = separacion;
      y += alturaFilaActual + separacion;
      alturaFilaActual = 0;
    }

    resultados.push({
      id: pieza.id,
      piezaId: pieza.piezaId,
      lineaPedidoId: pieza.lineaPedidoId,
      talla: pieza.talla,
      rotacionGrados: orientacion.rotacionGrados,
      posicion: { x, y },
      anchoCm: orientacion.anchoCm,
      altoCm: orientacion.altoCm,
    });

    x += orientacion.anchoCm + separacion;
    alturaFilaActual = Math.max(alturaFilaActual, orientacion.altoCm);
  }

  const altoLienzo = round2(y + alturaFilaActual + separacion);
  const areaUtil = resultados.reduce((acc, p) => acc + p.anchoCm * p.altoCm, 0);
  const areaLienzo = anchoLienzo * altoLienzo;

  return {
    anchoLienzoCm: anchoLienzo,
    altoLienzoCm: altoLienzo,
    piezas: resultados,
    utilizacion: areaLienzo > 0 ? round2((areaUtil / areaLienzo) * 100) : 0,
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
