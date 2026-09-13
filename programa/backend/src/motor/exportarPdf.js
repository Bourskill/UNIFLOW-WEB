// Genera el PDF final de una corrida de nesting. Cuando la pieza trae
// imagenDataUrl (el arte del Diseño -- pese al nombre, hoy es casi siempre
// una URL de Supabase Storage, no un data: URL; ver almacen.js) se dibuja
// como fondo real; cuando trae textos (nombre/número ya calibrados por
// resolverPedido.js) se escriben encima. Sin ninguno de los dos, cae al
// rectángulo con etiqueta de antes (útil para el nesting "rápido" sin
// personalización, ej. corte láser).

import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib';

const CM_A_PUNTOS = 28.3465;

// Mismo RATIO_BRAZO que host.jsx (colocarLogoEnZonaCruz, programa/panel/
// jsx/host.jsx) -- una zona de logo "en cruz" no es un cuadrado único: es
// una cruz de dos brazos (uno para logos anchos, otro para altos) que se
// cruzan en el cuadrado central de lado "lado". 4cm×2.5cm = 1.6 es la
// proporción real que ya traía el usuario de otro proyecto, no un número
// inventado -- ver el comentario grande junto a esa función.
const RATIO_BRAZO = 4 / 2.5;

// pdf-lib rota una imagen/texto alrededor de su punto (x,y) -- el que se le
// pasa a drawImage/drawText es la esquina, no el centro. Para que un logo
// (que sí se coloca por su CENTRO, ver abajo) rote sin desplazarse de su
// sitio, hay que despejar qué esquina, rotada, deja el centro exactamente
// donde tiene que quedar.
function anclaParaRotarDesdeCentro(cxPt, cyPt, wPt, hPt, grados) {
  const rad = (grados * Math.PI) / 180;
  const dx = wPt / 2, dy = hPt / 2;
  const rdx = dx * Math.cos(rad) - dy * Math.sin(rad);
  const rdy = dx * Math.sin(rad) + dy * Math.cos(rad);
  return { x: cxPt - rdx, y: cyPt - rdy };
}

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
      const imagen = await incrustarImagen(pdf, pieza.imagenDataUrl);
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
      const anclaX = xPt + texto.xCm * CM_A_PUNTOS;
      const anclaY = yPt + altoRectPt - texto.yCm * CM_A_PUNTOS - tamanoPt;
      pagina.drawText(texto.texto, {
        x: anclaX,
        y: anclaY,
        size: tamanoPt,
        font: fuenteTexto,
        color: rgb(color.r, color.g, color.b),
        // Rotar en el mismo sitio donde ya se ancla el texto (su esquina):
        // gira, pero no se corre -- coherente con que nunca estuvo
        // centrado dentro de su zona (se ancla a la izquierda).
        ...(texto.rotacionGrados ? { rotate: degrees(texto.rotacionGrados) } : {}),
      });
    }

    for (const imagen of pieza.imagenes || []) {
      let embebida;
      try {
        embebida = await incrustarImagen(pdf, imagen.url);
      } catch {
        continue; // un logo que no se pudo bajar no debe tumbar todo el PDF
      }

      // Mismo cálculo que colocarLogoEnZonaCruz()/colocarLogoEnZonaSimple()
      // de host.jsx: "contain" (nunca recortar), sin deformar. Con cruz, el
      // logo puede exceder el cuadrado central "lado" por UN solo eje (el
      // brazo, RATIO_BRAZO veces más largo) -- se prueba el encaje contra
      // los dos brazos y se usa el que da más tamaño.
      const ladoPt = imagen.ladoCm * CM_A_PUNTOS;
      const anchoPt2 = imagen.anchoCm * CM_A_PUNTOS;
      const altoPt2 = imagen.altoCm * CM_A_PUNTOS;
      let escala;
      if (imagen.cruz) {
        const brazoPt = ladoPt * RATIO_BRAZO;
        const escalaVertical = Math.min(ladoPt / embebida.width, brazoPt / embebida.height);
        const escalaHorizontal = Math.min(brazoPt / embebida.width, ladoPt / embebida.height);
        escala = Math.max(escalaVertical, escalaHorizontal);
      } else {
        escala = Math.min(anchoPt2 / embebida.width, altoPt2 / embebida.height);
      }
      const wPt = embebida.width * escala;
      const hPt = embebida.height * escala;

      const cxPt = xPt + imagen.cxCm * CM_A_PUNTOS;
      const cyPt = yPt + altoRectPt - imagen.cyCm * CM_A_PUNTOS;
      const grados = imagen.rotacionGrados || 0;
      const ancla = grados
        ? anclaParaRotarDesdeCentro(cxPt, cyPt, wPt, hPt, grados)
        : { x: cxPt - wPt / 2, y: cyPt - hPt / 2 };

      pagina.drawImage(embebida, {
        x: ancla.x,
        y: ancla.y,
        width: wPt,
        height: hPt,
        ...(grados ? { rotate: degrees(grados) } : {}),
      });
    }

    if (!pieza.imagenDataUrl && (!pieza.textos || pieza.textos.length === 0) && (!pieza.imagenes || pieza.imagenes.length === 0)) {
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

// Acepta tanto un data: URL (compatibilidad con lo que se haya guardado
// antes de mover las imágenes a Storage) como una URL http(s) real -- en
// ese caso hace falta bajarla, ya no viene embebida en el propio campo.
async function incrustarImagen(pdf, urlODataUrl) {
  let contentType;
  let bytes;
  if (urlODataUrl.startsWith('data:')) {
    const separador = urlODataUrl.indexOf(',');
    contentType = urlODataUrl.slice(5, separador);
    bytes = Buffer.from(urlODataUrl.slice(separador + 1), 'base64');
  } else {
    const respuesta = await fetch(urlODataUrl);
    if (!respuesta.ok) throw new Error('No se pudo bajar la imagen del diseño (' + respuesta.status + ')');
    contentType = respuesta.headers.get('content-type') || '';
    bytes = Buffer.from(await respuesta.arrayBuffer());
  }
  return contentType.includes('png') ? pdf.embedPng(bytes) : pdf.embedJpg(bytes);
}

function hexARgb(hex) {
  const limpio = (hex || '#000000').replace('#', '');
  return {
    r: parseInt(limpio.substring(0, 2), 16) / 255,
    g: parseInt(limpio.substring(2, 4), 16) / 255,
    b: parseInt(limpio.substring(4, 6), 16) / 255,
  };
}
