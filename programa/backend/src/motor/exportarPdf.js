// Genera el PDF final de una corrida de nesting. Cuando la pieza trae
// imagenDataUrl (el arte del Diseño) se dibuja como fondo real; cuando trae
// textos (nombre/número ya calibrados por resolverPedido.js) se escriben
// encima. Sin ninguno de los dos, cae al rectángulo con etiqueta de antes
// (útil para el nesting "rápido" sin personalización, ej. corte láser).

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const CM_A_PUNTOS = 28.3465;

export async function generarPdfNesting(resultadoNesting) {
  const pdf = await PDFDocument.create();
  const fuente = await pdf.embedFont(StandardFonts.Helvetica);
  const fuenteTexto = await pdf.embedFont(StandardFonts.HelveticaBold);

  const anchoPt = resultadoNesting.anchoLienzoCm * CM_A_PUNTOS;
  const altoPt = resultadoNesting.altoLienzoCm * CM_A_PUNTOS;
  const pagina = pdf.addPage([anchoPt, altoPt]);

  for (const pieza of resultadoNesting.piezas) {
    const xPt = pieza.posicion.x * CM_A_PUNTOS;
    // PDF mide Y desde abajo; el nesting mide Y desde arriba.
    const yPt = altoPt - (pieza.posicion.y + pieza.altoCm) * CM_A_PUNTOS;
    const anchoRectPt = pieza.anchoCm * CM_A_PUNTOS;
    const altoRectPt = pieza.altoCm * CM_A_PUNTOS;

    if (pieza.imagenDataUrl) {
      const imagen = await incrustarImagenDesdeDataUrl(pdf, pieza.imagenDataUrl);
      pagina.drawImage(imagen, { x: xPt, y: yPt, width: anchoRectPt, height: altoRectPt });
    }

    pagina.drawRectangle({
      x: xPt,
      y: yPt,
      width: anchoRectPt,
      height: altoRectPt,
      borderColor: rgb(0, 0, 0),
      borderWidth: 0.75,
    });

    for (const texto of pieza.textos || []) {
      const tamanoPt = Math.max(texto.altoCm, 0.3) * CM_A_PUNTOS;
      const color = hexARgb(texto.colorHex);
      // xCm/yCm del elemento se miden desde la esquina superior izquierda de
      // LA PIEZA (no del lienzo) — por eso se sitúan relativos a xPt/yPt.
      pagina.drawText(texto.texto, {
        x: xPt + texto.xCm * CM_A_PUNTOS,
        y: yPt + altoRectPt - texto.yCm * CM_A_PUNTOS - tamanoPt,
        size: tamanoPt,
        font: fuenteTexto,
        color: rgb(color.r, color.g, color.b),
      });
    }

    if (!pieza.imagenDataUrl && (!pieza.textos || pieza.textos.length === 0)) {
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
  }

  return pdf.save();
}

async function incrustarImagenDesdeDataUrl(pdf, dataUrl) {
  const separador = dataUrl.indexOf(',');
  const encabezado = dataUrl.slice(0, separador);
  const bytes = Buffer.from(dataUrl.slice(separador + 1), 'base64');
  return encabezado.includes('png') ? pdf.embedPng(bytes) : pdf.embedJpg(bytes);
}

function hexARgb(hex) {
  const limpio = (hex || '#000000').replace('#', '');
  return {
    r: parseInt(limpio.substring(0, 2), 16) / 255,
    g: parseInt(limpio.substring(2, 4), 16) / 255,
    b: parseInt(limpio.substring(4, 6), 16) / 255,
  };
}
