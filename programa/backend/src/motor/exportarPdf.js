// Genera el PDF final de una corrida de nesting. Cuando la pieza trae
// imagenDataUrl (el arte del Diseño -- pese al nombre, hoy es casi siempre
// una URL de Supabase Storage, no un data: URL; ver almacen.js) se dibuja
// como fondo real; cuando trae textos (nombre/número ya calibrados por
// resolverPedido.js) se escriben encima. Sin ninguno de los dos, cae al
// rectángulo con etiqueta de antes (útil para el nesting "rápido" sin
// personalización, ej. corte láser).

import {
  PDFDocument, rgb, degrees, StandardFonts,
  pushGraphicsState, popGraphicsState, moveTo, lineTo, closePath, clip, endPath,
} from 'pdf-lib';
import ClipperLib from 'clipper-lib';

const CM_A_PUNTOS = 28.3465;

// A propósito YA NO es el mismo valor que host.jsx (colocarLogoEnZonaCruz,
// programa/panel/jsx/host.jsx sigue en 4/2.5) -- una zona de logo "en cruz"
// no es un cuadrado único: es una cruz de dos brazos (uno para logos
// anchos, otro para altos) que se cruzan en el cuadrado central de lado
// "lado". Reducido a pedido a 4cm×2cm = 2 (el cuadrado central baja de
// 2.5cm a 2cm de lado, el brazo se mantiene en 4cm) -- ver el comentario
// grande junto a esa función.
const RATIO_BRAZO = 4 / 2;

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

// Empuja un polígono cerrado hacia AFUERA una distancia fija -- el
// "desplazamiento" real del contorno para láser (compensa el grosor del
// corte; ver claude/CLAUDE.md sobre PROCESAR MOLDES.jsx y su offset de
// 1mm).
//
// LA VERSIÓN ANTERIOR (miter por vértice + bisel) era, en el fondo, un
// stroke-linejoin -- resuelve el ángulo de UN vértice a la vez, pero un
// piquete pegado angosto es un problema de TOPOLOGÍA DEL CONTORNO ENTERO:
// al empujar las dos paredes de una muesca angosta hacia afuera, esas dos
// paredes se cruzan entre sí más allá del vértice (un "bowtie" local) --
// nada de lo que se haga vértice por vértice puede detectar ni deshacer un
// cruce que ocurre ENTRE vértices no adyacentes. El usuario lo notó de
// inmediato contra piezas reales: "se deforma mucho, no es fiel al molde".
//
// Eso es exactamente lo que hace Illustrator (y cualquier motor de corte
// real): construye, por cada arista, una franja paralela a distancia
// `delta`, y calcula la UNIÓN BOOLEANA de todas las franjas -- ahí es
// donde los cruces se resuelven de verdad, con aritmética de intersección
// real, no una fórmula por vértice. clipper-lib (puerto JS puro del
// Clipper 6 de Angus Johnson) hace exactamente eso: ClipperOffset.Execute()
// llama a DoOffset() y DESPUÉS a un Clipper.Execute(ctUnion, ...) real
// sobre el resultado (ver node_modules/clipper-lib/clipper.js, función
// ClipperOffset.prototype.Execute) -- confirmado leyendo el código fuente
// instalado, no solo la documentación, antes de confiar en él.
//
// Probado a mano contra el piquete tipo aguja de nuestras propias pruebas
// (prueba-offset-contorno.js): con jtMiter, un desplazamiento de 0.1cm da
// una caja EXACTAMENTE 0.1cm más grande por lado que el original (sin
// picos, sin deformación), y uno de 3cm directamente "traga" la muesca
// angosta (correcto: una muesca de 4mm no puede sobrevivir un
// desplazamiento de 3cm hacia afuera de sus dos paredes) -- exactamente el
// comportamiento de un offset de polígono real, no una aproximación.
//
// Clipper trabaja con COORDENADAS ENTERAS escaladas (no admite floats) --
// 10000 = 1 unidad Clipper por cada 0.0001cm (1 micrón), de sobra para
// piezas de varios metros sin acercarse al límite seguro de enteros de JS.
const ESCALA_CLIPPER = 10000;

function areaDePath(path) {
  let area = 0;
  for (let i = 0; i < path.length; i++) {
    const a = path[i], b = path[(i + 1) % path.length];
    area += a.X * b.Y - b.X * a.Y;
  }
  return Math.abs(area) / 2;
}

export function offsetPoligono(vertices, distancia) {
  if (vertices.length < 3 || !distancia) return vertices;
  const path = vertices.map((v) => ({ X: Math.round(v.x * ESCALA_CLIPPER), Y: Math.round(v.y * ESCALA_CLIPPER) }));

  const co = new ClipperLib.ClipperOffset();
  co.AddPath(path, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);
  const solucion = new ClipperLib.Paths();
  co.Execute(solucion, distancia * ESCALA_CLIPPER);
  if (!solucion.length) return vertices; // no debería pasar empujando hacia afuera, pero nunca devolver nada roto

  // Un desplazamiento normal da UN solo contorno; si diera más de uno (caso
  // extremo, no visto en la práctica), nos quedamos con el más grande --
  // mismo criterio que ya usa el proyecto para elegir "el contorno real"
  // entre varios candidatos (geometriaComun.js·contornoYPiquetesDeTrazos,
  // por ÁREA).
  let elegido = solucion[0];
  if (solucion.length > 1) {
    let mejorArea = areaDePath(elegido);
    for (const candidato of solucion.slice(1)) {
      const area = areaDePath(candidato);
      if (area > mejorArea) { mejorArea = area; elegido = candidato; }
    }
  }
  return elegido.map((p) => ({ x: p.X / ESCALA_CLIPPER, y: p.Y / ESCALA_CLIPPER }));
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
      // Recorte real a la forma de la pieza, no al rectángulo del bounding
      // box -- mismo contornoCm (mismas coordenadas cm que zonas/textos) que
      // ya usa el borde de contraste/láser un poco más abajo. Sin él (pieza
      // sin geometría real cargada todavía), se mantiene el estirado al
      // rectángulo de siempre -- nunca deja de dibujarse el diseño por
      // faltar el contorno.
      if (pieza.contornoCm?.length >= 3) {
        const puntos = pieza.contornoCm.map((v) => ({
          x: xPt + v.x * CM_A_PUNTOS,
          y: yPt + altoRectPt - v.y * CM_A_PUNTOS,
        }));
        pagina.pushOperators(
          pushGraphicsState(),
          moveTo(puntos[0].x, puntos[0].y),
          ...puntos.slice(1).map((p) => lineTo(p.x, p.y)),
          closePath(),
          clip(),
          endPath()
        );
        pagina.drawImage(imagen, { x: xPt, y: yPt, width: anchoRectPt, height: altoRectPt });
        pagina.pushOperators(popGraphicsState());
      } else {
        pagina.drawImage(imagen, { x: xPt, y: yPt, width: anchoRectPt, height: altoRectPt });
      }
    }

    // Con contorno para láser configurado, ESE es el corte real -- dibujar
    // además el rectángulo del bounding box pondría una segunda línea de
    // corte falsa en el archivo. Sin él, se mantiene el rectángulo de
    // siempre (referencia visual del nesting, nunca fue un corte real).
    if (pieza.bordeContraste?.activo && pieza.contornoCm?.length >= 3) {
      const desplazado = offsetPoligono(pieza.contornoCm, pieza.bordeContraste.desplazamientoCm || 0);
      const color = hexARgb(pieza.bordeContraste.colorHex);
      const grosorPt = Math.max(pieza.bordeContraste.grosorCm || 0.03, 0.01) * CM_A_PUNTOS;
      const n = desplazado.length;
      for (let i = 0; i < n; i++) {
        const a = desplazado[i], b = desplazado[(i + 1) % n];
        pagina.drawLine({
          start: { x: xPt + a.x * CM_A_PUNTOS, y: yPt + altoRectPt - a.y * CM_A_PUNTOS },
          end: { x: xPt + b.x * CM_A_PUNTOS, y: yPt + altoRectPt - b.y * CM_A_PUNTOS },
          thickness: grosorPt,
          color: rgb(color.r, color.g, color.b),
        });
      }
    } else {
      pagina.drawRectangle({
        x: xPt,
        y: yPt,
        width: anchoRectPt,
        height: altoRectPt,
        borderColor: rgb(0, 0, 0),
        borderWidth: 0.75,
      });
    }

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
