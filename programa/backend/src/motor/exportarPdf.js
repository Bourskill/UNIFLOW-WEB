// Genera el PDF final de una corrida de nesting. Un rectángulo por pieza por
// ahora (marcador de posición con su etiqueta) — el contorno real de cada
// pieza se conecta cuando exista un formato de moldería con geometría real
// (hoy el dominio solo guarda ancho/alto por talla, no el path de la pieza).

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const CM_A_PUNTOS = 28.3465;

/**
 * @param {ReturnType<typeof import('./nesting.js').anidarPiezas>} resultadoNesting
 */
export async function generarPdfNesting(resultadoNesting) {
  const pdf = await PDFDocument.create();
  const fuente = await pdf.embedFont(StandardFonts.Helvetica);

  const anchoPt = resultadoNesting.anchoLienzoCm * CM_A_PUNTOS;
  const altoPt = resultadoNesting.altoLienzoCm * CM_A_PUNTOS;
  const pagina = pdf.addPage([anchoPt, altoPt]);

  for (const pieza of resultadoNesting.piezas) {
    const xPt = pieza.posicion.x * CM_A_PUNTOS;
    // PDF mide Y desde abajo; el nesting mide Y desde arriba.
    const yPt = altoPt - (pieza.posicion.y + pieza.altoCm) * CM_A_PUNTOS;
    const anchoRectPt = pieza.anchoCm * CM_A_PUNTOS;
    const altoRectPt = pieza.altoCm * CM_A_PUNTOS;

    pagina.drawRectangle({
      x: xPt,
      y: yPt,
      width: anchoRectPt,
      height: altoRectPt,
      borderColor: rgb(0, 0, 0),
      borderWidth: 0.75,
    });

    const etiqueta = pieza.piezaId + ' · ' + pieza.talla +
      (pieza.rotacionGrados === 180 ? ' · 180°' : '');
    pagina.drawText(etiqueta, {
      x: xPt + 4,
      y: yPt + 4,
      size: 8,
      font: fuente,
      color: rgb(0, 0, 0),
    });
  }

  return pdf.save();
}
