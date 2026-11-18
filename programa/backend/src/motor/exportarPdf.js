// Genera el PDF final de una corrida de nesting. Cuando la pieza trae
// imagenDataUrl (el arte del Diseño -- pese al nombre, hoy es casi siempre
// una URL de Supabase Storage, no un data: URL; ver almacen.js) se dibuja
// como fondo real; cuando trae textos (nombre/número ya calibrados por
// resolverPedido.js) se escriben encima. Sin ninguno de los dos, cae al
// rectángulo con etiqueta de antes (útil para el nesting "rápido" sin
// personalización, ej. corte láser).

import {
  PDFDocument, PDFName, PDFOperator, rgb, degrees, StandardFonts,
  pushGraphicsState, popGraphicsState, moveTo, lineTo, appendBezierCurve, closePath, clip, endPath, fill,
  beginText, endText, setFontAndSize, setFillingColor, showText,
  setCharacterSpacing, setCharacterSqueeze, rotateAndSkewTextRadiansAndTranslate,
  setStrokingColor, setLineWidth, setLineJoin, LineJoinStyle, setTextRenderingMode, TextRenderingMode, stroke,
} from 'pdf-lib';
import ClipperLib from 'clipper-lib';
import fontkit from '@pdf-lib/fontkit';
import { bytesDeFuente, obtenerMedidor, urlDeStoragePermitida, leerConTope } from './medidorFuentes.js';
import { ajustarTexto } from './ajusteTexto.js';
import { colocarArte } from './colocarArte.js';
import { fondoActivo, ejeDegradado, colorEn } from './fondoPieza.js';
import { medidasDeCapsula, caminoDeCapsula, COLOR_CAPSULA } from './capsulaTalla.js';

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

// El PDF de un nesting: una sola página (el lienzo) con todas las piezas.
export async function generarPdfNesting(resultadoNesting) {
  return generarPdfPaginas([resultadoNesting]);
}

// Varias páginas en un mismo PDF -- cada una { anchoLienzoCm, altoLienzoCm,
// piezas (con posicion) } se dibuja igual que un nesting. Lo usan las mesas
// de una producción (motor/mesas.js): una página = una mesa de trabajo, que
// Illustrator abre como una mesa por página. Fuentes y arte se incrustan una
// sola vez para todo el documento.
export async function generarPdfPaginas(paginas) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fuente = await pdf.embedFont(StandardFonts.Helvetica);
  const fuenteTexto = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Fuente propia elegida para una zona puntual (pasada 34, catálogo de
  // tipografías) -- se embebe UNA sola vez por URL aunque la misma fuente se
  // use en muchas piezas/textos del mismo PDF (los bytes ya vienen en la
  // memoria compartida de medidorFuentes.js, la misma con la que se midió el
  // texto). Si falla, devuelve null: una fuente rota nunca puede tumbar la
  // generación real de un pedido.
  const cacheFuentes = new Map();
  // El arte del Diseño (imagen o PDF) se incrusta UNA vez por URL: el mismo
  // archivo se repite en cada talla/pieza del pedido y, sin esto, el PDF
  // final llevaba una copia por cada vez que aparece.
  const cacheArte = new Map();
  function arteDe(url) {
    if (!cacheArte.has(url)) cacheArte.set(url, incrustarArte(pdf, url));
    return cacheArte.get(url);
  }
  async function fuentePersonalizada(url) {
    if (!url) return null;
    if (cacheFuentes.has(url)) return cacheFuentes.get(url);
    let embebida = null;
    try {
      embebida = await incrustarFuente(pdf, await bytesDeFuente(url));
    } catch (error) {
      console.error('No se pudo usar la fuente personalizada (' + url + '): ' + error.message + ' -- se usa la de base.');
    }
    cacheFuentes.set(url, embebida);
    return embebida;
  }
  // La fuente de base de los textos AJUSTADOS (ver ajusteTexto.js): con
  // contornos reales, para poder medirla igual que se dibuja.
  let fuenteBaseEmbebida = null;
  async function fuenteBase() {
    if (!fuenteBaseEmbebida) fuenteBaseEmbebida = await incrustarFuente(pdf, await bytesDeFuente(null));
    return fuenteBaseEmbebida;
  }

  for (const resultadoNesting of paginas) {
    const anchoPt = resultadoNesting.anchoLienzoCm * CM_A_PUNTOS;
    const altoPt = resultadoNesting.altoLienzoCm * CM_A_PUNTOS;
    const pagina = pdf.addPage([anchoPt, altoPt]);
    // La página se declara RGB (grupo de transparencia en DeviceRGB, igual
    // que los PDF de Illustrator): sin esto Illustrator abre el archivo como
    // documento CMYK y convierte los colores -- y es para sublimación, RGB.
    pagina.node.set(PDFName.of('Group'), pdf.context.obj({ Type: 'Group', S: 'Transparency', CS: 'DeviceRGB', I: false, K: false }));

    for (const pieza of resultadoNesting.piezas) {
      const xPt = pieza.posicion.x * CM_A_PUNTOS;
      // PDF mide Y desde abajo; el nesting mide Y desde arriba.
      const yPt = altoPt - (pieza.posicion.y + pieza.altoCm) * CM_A_PUNTOS;
      const anchoRectPt = pieza.anchoCm * CM_A_PUNTOS;
      const altoRectPt = pieza.altoCm * CM_A_PUNTOS;

      // Fondo de color del Diseño (sólido o degradado), DEBAJO del arte y
      // recortado a la forma de la pieza. Ver fondoPieza.js.
      const fondo = fondoActivo(pieza.fondo);
      if (fondo) {
        const aPt = (x, y) => ({ x: xPt + x * CM_A_PUNTOS, y: yPt + altoRectPt - y * CM_A_PUNTOS });
        const forma = pieza.contornoCm?.length >= 3
          ? pieza.contornoCm.map((v) => aPt(v.x, v.y))
          : [aPt(0, 0), aPt(pieza.anchoCm, 0), aPt(pieza.anchoCm, pieza.altoCm), aPt(0, pieza.altoCm)];
        // La propia forma de la pieza rellena con el fondo -- sin máscara de
        // recorte: en Illustrator queda UN trazado con su color o su
        // degradado (editable), no un montón de franjas enmascaradas.
        pagina.pushOperators(
          pushGraphicsState(),
          ...operadoresDeRelleno(pdf, pagina, fondo, pieza.anchoCm, pieza.altoCm, aPt),
          moveTo(forma[0].x, forma[0].y),
          ...forma.slice(1).map((p) => lineTo(p.x, p.y)),
          closePath(),
          fill(),
          popGraphicsState()
        );
      }

      if (pieza.imagenDataUrl) {
        // Imagen (PNG/JPG) o PDF: el PDF entra VECTORIAL (página incrustada
        // como Form XObject, sin rasterizar), así los vectores del diseño
        // llegan intactos al archivo de producción.
        const arte = await arteDe(pieza.imagenDataUrl);
        const imagen = arte.objeto;
        // Recorte real a la forma de la pieza, no al rectángulo del bounding
        // box -- mismo contornoCm (mismas coordenadas cm que zonas/textos) que
        // ya usa el borde de contraste/láser un poco más abajo. Sin él (pieza
        // sin geometría real cargada todavía), se mantiene el estirado al
        // rectángulo de siempre -- nunca deja de dibujarse el diseño por
        // faltar el contorno.
        // Con ajuste del arte (Diseño), la imagen va sin deformar donde la
        // dejó el usuario -- mismo cálculo que el lienzo (colocarArte.js) -- y
        // lo que sobresale de la pieza se recorta. Sin ajuste, se estira al
        // rectángulo como siempre.
        let rectImagen = { x: xPt, y: yPt, width: anchoRectPt, height: altoRectPt };
        if (pieza.ajusteArte) {
          const r = colocarArte({
            anchoCm: pieza.anchoCm, altoCm: pieza.altoCm,
            anchoImagen: imagen.width, altoImagen: imagen.height, ajuste: pieza.ajusteArte,
          });
          rectImagen = {
            x: xPt + r.x * CM_A_PUNTOS,
            y: yPt + altoRectPt - (r.y + r.alto) * CM_A_PUNTOS,
            width: r.ancho * CM_A_PUNTOS,
            height: r.alto * CM_A_PUNTOS,
          };
        }
        const puntos = pieza.contornoCm?.length >= 3
          ? pieza.contornoCm.map((v) => ({ x: xPt + v.x * CM_A_PUNTOS, y: yPt + altoRectPt - v.y * CM_A_PUNTOS }))
          : pieza.ajusteArte
            ? [{ x: xPt, y: yPt }, { x: xPt + anchoRectPt, y: yPt }, { x: xPt + anchoRectPt, y: yPt + altoRectPt }, { x: xPt, y: yPt + altoRectPt }]
            : null;
        if (puntos) {
          pagina.pushOperators(
            pushGraphicsState(),
            moveTo(puntos[0].x, puntos[0].y),
            ...puntos.slice(1).map((p) => lineTo(p.x, p.y)),
            closePath(),
            clip(),
            endPath()
          );
          dibujarArte(pagina, arte, rectImagen);
          pagina.pushOperators(popGraphicsState());
        } else {
          dibujarArte(pagina, arte, rectImagen);
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
        // UN trazado cerrado (no segmentos sueltos): en Illustrator queda
        // como un solo path de corte, listo para el láser.
        const aPt = (v) => ({ x: xPt + v.x * CM_A_PUNTOS, y: yPt + altoRectPt - v.y * CM_A_PUNTOS });
        const puntos = desplazado.map(aPt);
        pagina.pushOperators(
          pushGraphicsState(),
          setStrokingColor(rgb(color.r, color.g, color.b)),
          setLineWidth(grosorPt),
          setLineJoin(LineJoinStyle.Round),
          moveTo(puntos[0].x, puntos[0].y),
          ...puntos.slice(1).map((q) => lineTo(q.x, q.y)),
          closePath(),
          stroke(),
          popGraphicsState()
        );
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
        const color = hexARgb(texto.colorHex);

        // Un texto de forma nueva (lleva `modo`) cuyo ajuste quedó en null no
        // tiene nada que dibujar (vacío, o solo espacios): se omite. NO cae al
        // camino viejo de abajo, que con otra fuente podía tumbar todo el PDF.
        if (texto.modo !== undefined && !texto.ajuste) continue;

        // Texto ya ajustado a su zona (motor/ajusteTexto.js): cuerpo, tracking
        // y escala horizontal calculados con las medidas reales de la fuente.
        // Se dibuja por su línea de base, rotando alrededor del CENTRO de la
        // zona (no de la esquina del texto).
        if (texto.ajuste) {
          let a = texto.ajuste;
          let fontElegida = await fuentePersonalizada(texto.fuenteUrl);
          if (!fontElegida) {
            fontElegida = await fuenteBase();
            if (texto.fuenteUrl) {
              // La fuente con la que se midió ya no está disponible (por ejemplo
              // una reposición con la fuente borrada de Storage): el ajuste
              // calculado para OTRA letra no sirve, se vuelve a ajustar con la
              // de base en vez de imprimir mal medido.
              const { medidor } = await obtenerMedidor(null);
              a = ajustarTexto({
                medidor, texto: texto.texto, anchoCm: texto.anchoCm, altoCm: texto.altoCm,
                // Con su modo real: un número sigue yendo a alto completo.
                modo: texto.modo === 'calibrado' ? 'calibrado' : 'llenar',
                espaciadoMil: texto.espaciadoMil || 0, contornoCm: texto.contorno?.grosorCm || 0,
                alineacion: texto.alineacion || 'centro',
              }) || a;
            }
          }
          const rad = ((texto.rotacionGrados || 0) * Math.PI) / 180;
          const cxPt = xPt + texto.cxCm * CM_A_PUNTOS;
          const cyPt = yPt + altoRectPt - texto.cyCm * CM_A_PUNTOS;
          // Origen del texto respecto del centro de la zona, con Y hacia arriba
          // (PDF) -- la Y del ajuste crece hacia abajo.
          const dx = a.dxCm * CM_A_PUNTOS;
          const dy = -a.dyCm * CM_A_PUNTOS;
          const x = cxPt + dx * Math.cos(rad) - dy * Math.sin(rad);
          const y = cyPt + dx * Math.sin(rad) + dy * Math.cos(rad);
          const tamanoPt = a.cuerpoCm * CM_A_PUNTOS;

          pagina.setFont(fontElegida);
          const textoCodificado = fontElegida.encodeText(a.texto ?? texto.texto);
          const operadoresDeTexto = () => [
            beginText(),
            setFontAndSize(pagina.fontKey, tamanoPt),
            setCharacterSpacing((a.trackingMil / 1000) * tamanoPt),
            setCharacterSqueeze(a.escalaH),
            rotateAndSkewTextRadiansAndTranslate(rad, 0, 0, x, y),
            showText(textoCodificado),
            endText(),
          ];

          // La talla: primero su cápsula blanca, centrada en la zona y girada
          // con ella (capsulaTalla.js).
          if (texto.capsula) {
            const fondoTalla = hexARgb(texto.capsula.colorHex || COLOR_CAPSULA);
            const aPagina = (u, v) => [
              cxPt + (u * Math.cos(rad) + v * Math.sin(rad)) * CM_A_PUNTOS,
              cyPt + (u * Math.sin(rad) - v * Math.cos(rad)) * CM_A_PUNTOS,
            ];
            const ops = [];
            for (const [op, ...c] of caminoDeCapsula(medidasDeCapsula(a, texto.capsula.margenCm))) {
              if (op === 'M') ops.push(moveTo(...aPagina(c[0], c[1])));
              else if (op === 'L') ops.push(lineTo(...aPagina(c[0], c[1])));
              else if (op === 'C') ops.push(appendBezierCurve(...aPagina(c[0], c[1]), ...aPagina(c[2], c[3]), ...aPagina(c[4], c[5])));
              else ops.push(closePath());
            }
            pagina.pushOperators(
              pushGraphicsState(),
              setFillingColor(rgb(fondoTalla.r, fondoTalla.g, fondoTalla.b)),
              ...ops,
              fill(),
              popGraphicsState()
            );
          }

          // Contorno de color (estilo de la zona): primero el trazo, con el
          // DOBLE del grosor elegido y esquinas redondeadas -- la mitad de
          // adentro queda tapada por el relleno de la pasada siguiente, así
          // que lo que se ve es exactamente "grosor" por FUERA de la letra.
          if (texto.contorno && texto.contorno.grosorCm > 0) {
            const borde = hexARgb(texto.contorno.colorHex);
            pagina.pushOperators(
              pushGraphicsState(),
              setStrokingColor(rgb(borde.r, borde.g, borde.b)),
              setLineWidth(2 * texto.contorno.grosorCm * CM_A_PUNTOS),
              setLineJoin(LineJoinStyle.Round),
              setTextRenderingMode(TextRenderingMode.Outline),
              ...operadoresDeTexto(),
              popGraphicsState()
            );
          }

          pagina.pushOperators(
            pushGraphicsState(),
            setFillingColor(rgb(color.r, color.g, color.b)),
            beginText(),
            setFontAndSize(pagina.fontKey, tamanoPt),
            setCharacterSpacing((a.trackingMil / 1000) * tamanoPt),
            setCharacterSqueeze(a.escalaH),
            rotateAndSkewTextRadiansAndTranslate(rad, 0, 0, x, y),
            showText(fontElegida.encodeText(a.texto ?? texto.texto)),
            endText(),
            popGraphicsState()
          );
          continue;
        }

        // Texto de una generación guardada ANTES del ajuste a la zona (sin
        // `ajuste`): se reproduce tal cual salió entonces -- una reposición
        // tiene que dar la misma pieza que se imprimió.
        const tamanoPt = Math.max(texto.altoCm, 0.3) * CM_A_PUNTOS;
        // xCm/yCm del elemento se miden desde la esquina superior izquierda de
        // LA PIEZA (no del lienzo) — por eso se sitúan relativos a xPt/yPt.
        const anclaX = xPt + texto.xCm * CM_A_PUNTOS;
        const anclaY = yPt + altoRectPt - texto.yCm * CM_A_PUNTOS - tamanoPt;
        const fontElegida = (await fuentePersonalizada(texto.fuenteUrl)) || fuenteTexto;
        pagina.drawText(texto.texto, {
          x: anclaX,
          y: anclaY,
          size: tamanoPt,
          font: fontElegida,
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
          // PNG/JPG o PDF (vectorial, como el arte del diseño), una vez por URL.
          embebida = await arteDe(imagen.url);
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
          const escalaVertical = Math.min(ladoPt / embebida.objeto.width, brazoPt / embebida.objeto.height);
          const escalaHorizontal = Math.min(brazoPt / embebida.objeto.width, ladoPt / embebida.objeto.height);
          escala = Math.max(escalaVertical, escalaHorizontal);
        } else {
          escala = Math.min(anchoPt2 / embebida.objeto.width, altoPt2 / embebida.objeto.height);
        }
        const wPt = embebida.objeto.width * escala;
        const hPt = embebida.objeto.height * escala;

        const cxPt = xPt + imagen.cxCm * CM_A_PUNTOS;
        const cyPt = yPt + altoRectPt - imagen.cyCm * CM_A_PUNTOS;
        const grados = imagen.rotacionGrados || 0;
        const ancla = grados
          ? anclaParaRotarDesdeCentro(cxPt, cyPt, wPt, hPt, grados)
          : { x: cxPt - wPt / 2, y: cyPt - hPt / 2 };

        dibujarArte(pagina, embebida, {
          x: ancla.x,
          y: ancla.y,
          width: wPt,
          height: hPt,
          ...(grados ? { rotate: degrees(grados) } : {}),
        });
      }

      // En las mesas: ENCIMA de todo, el molde mismo en contorno fino (con
      // sus piquetes pegados, que son parte del contorno) y los piquetes
      // sueltos como rayitas, en blanco o negro según lo que contraste con
      // el fondo -- como se arma a mano para ver dónde coser.
      if (pieza.marcarPiquetes && pieza.contornoCm?.length >= 3) {
        const aPt = (v) => ({ x: xPt + v.x * CM_A_PUNTOS, y: yPt + altoRectPt - v.y * CM_A_PUNTOS });
        const trazo = (puntos, cerrado, color) => [
          setStrokingColor(color),
          moveTo(puntos[0].x, puntos[0].y),
          ...puntos.slice(1).map((q) => lineTo(q.x, q.y)),
          ...(cerrado ? [closePath()] : []),
          stroke(),
        ];
        const ops = [pushGraphicsState(), setLineWidth(GROSOR_MARCAS_PT), setLineJoin(LineJoinStyle.Round)];
        ops.push(...trazo(pieza.contornoCm.map(aPt), true, colorDeContraste(fondo, pieza)));
        for (const q of pieza.piquetesCm || []) {
          const raya = rayaDePiquete(q, pieza.contornoCm);
          if (raya) ops.push(...trazo(raya.map(aPt), false, colorDeContraste(fondo, pieza, q)));
        }
        ops.push(popGraphicsState());
        pagina.pushOperators(...ops);
      }

      // En las mesas (marcarPiquetes) no: es la pieza que se corta, sin rótulos encima.
    if (!pieza.marcarPiquetes && !fondo && !pieza.imagenDataUrl && (!pieza.textos || pieza.textos.length === 0) && (!pieza.imagenes || pieza.imagenes.length === 0)) {
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

  }

  return pdf.save();
}

// Acepta tanto un data: URL (compatibilidad con lo que se haya guardado
// antes de mover las imágenes a Storage) como una URL http(s) real -- en
// ese caso hace falta bajarla, ya no viene embebida en el propio campo.
// El "color de relleno" del fondo, para rellenar después la forma de la
// pieza: sólido, o un degradado lineal REAL (sombreado axial RGB, como el
// que guarda Illustrator) -- un solo objeto editable, no franjas.
export function operadoresDeRelleno(pdf, pagina, fondo, anchoCm, altoCm, aPt) {
  if (fondo.tipo === 'solido') {
    const [r, g, b] = colorEn(fondo, 0);
    return [setFillingColor(rgb(r / 255, g / 255, b / 255))];
  }
  const eje = ejeDegradado({ anchoCm, altoCm, anguloGrados: fondo.anguloGrados });
  const p1 = aPt(eje.x1, eje.y1), p2 = aPt(eje.x2, eje.y2);
  const canal = (c) => colorEn(fondo, c).map((v) => v / 255);
  const ctx = pdf.context;
  const patron = ctx.register(ctx.obj({
    Type: 'Pattern', PatternType: 2,
    Shading: {
      ShadingType: 2, ColorSpace: 'DeviceRGB', Coords: [p1.x, p1.y, p2.x, p2.y], Extend: [true, true],
      Function: { FunctionType: 2, Domain: [0, 1], C0: canal(0), C1: canal(1), N: 1 },
    },
  }));
  const recursos = pagina.node.normalizedEntries().Resources;
  let patrones = recursos.lookup(PDFName.of('Pattern'));
  if (!patrones) {
    patrones = ctx.obj({});
    recursos.set(PDFName.of('Pattern'), patrones);
  }
  const nombre = 'Dg' + patrones.keys().length;
  patrones.set(PDFName.of(nombre), patron);
  return [PDFOperator.of('cs', [PDFName.of('Pattern')]), PDFOperator.of('scn', [PDFName.of(nombre)])];
}

// La fuente con su nombre REAL (el PostScript de la propia fuente): pdf-lib
// por defecto le agrega un número ("BeloidGothic-Regular-7572") y entonces
// Illustrator la pide como si fuera otra fuente, aunque esté instalada.
async function incrustarFuente(pdf, bytes) {
  let nombre;
  try {
    nombre = fontkit.create(bytes).postscriptName || undefined;
  } catch {
    nombre = undefined;
  }
  return pdf.embedFont(bytes, nombre ? { customName: nombre } : {});
}

function dibujarArte(pagina, arte, rect) {
  if (arte.tipo === 'pdf') pagina.drawPage(arte.objeto, rect);
  else pagina.drawImage(arte.objeto, rect);
}

// Arte del Diseño: imagen o PDF. Del PDF se usa la primera página, recortada
// a su CropBox (el área visible, la misma que muestra el lienzo con pdf.js).
async function incrustarArte(pdf, urlODataUrl) {
  const { contentType, bytes } = await bajarArchivo(urlODataUrl);
  const esPdf = contentType.includes('pdf') || Buffer.from(bytes.slice(0, 5)).toString('latin1') === '%PDF-';
  if (!esPdf) return { tipo: 'imagen', objeto: await embeberImagen(pdf, contentType, bytes) };
  const origen = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pagina = origen.getPage(0);
  const caja = pagina.getCropBox();
  const objeto = await pdf.embedPage(pagina, { left: caja.x, bottom: caja.y, right: caja.x + caja.width, top: caja.y + caja.height });
  return { tipo: 'pdf', objeto };
}

function embeberImagen(pdf, contentType, bytes) {
  return contentType.includes('png') ? pdf.embedPng(bytes) : pdf.embedJpg(bytes);
}

async function bajarArchivo(urlODataUrl) {
  let contentType;
  let bytes;
  if (urlODataUrl.startsWith('data:')) {
    const separador = urlODataUrl.indexOf(',');
    contentType = urlODataUrl.slice(5, separador);
    bytes = Buffer.from(urlODataUrl.slice(separador + 1), 'base64');
  } else {
    if (!urlDeStoragePermitida(urlODataUrl)) {
      throw new Error('URL de imagen del diseño no permitida (solo el Storage de este proyecto)');
    }
    const respuesta = await fetch(urlODataUrl, { redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!respuesta.ok) throw new Error('No se pudo bajar la imagen del diseño (' + respuesta.status + ')');
    contentType = respuesta.headers.get('content-type') || '';
    bytes = await leerConTope(respuesta, 60 * 1024 * 1024); // arte de sublimación en alta: más margen que una fuente
  }
  return { contentType, bytes };
}

// Grosor del molde en contorno y de los piquetes que van encima en las
// mesas: 0,3 mm, el mismo del archivo armado a mano.
const GROSOR_MARCAS_PT = 0.85;

/**
 * Blanco o negro, lo que más se vea sobre el fondo de la pieza en ese punto
 * (cm de la pieza; sin punto, el medio): fondo oscuro → blanco, claro →
 * negro. Sin fondo, la tela es blanca → negro.
 */
export function colorDeContraste(fondoCrudo, pieza, punto = null) {
  const fondo = fondoActivo(fondoCrudo);
  if (!fondo) return rgb(0, 0, 0);
  let t = 0.5;
  if (fondo.tipo === 'degradado' && punto) {
    const e = ejeDegradado({ anchoCm: pieza.anchoCm, altoCm: pieza.altoCm, anguloGrados: fondo.anguloGrados });
    const dx = e.x2 - e.x1, dy = e.y2 - e.y1;
    t = ((punto.x - e.x1) * dx + (punto.y - e.y1) * dy) / (dx * dx + dy * dy || 1);
  }
  const [r, g, b] = colorEn(fondo, fondo.tipo === 'solido' ? 0 : t).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminancia = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Mismo umbral que el contraste WCAG entre blanco y negro.
  return luminancia > 0.179 ? rgb(0, 0, 0) : rgb(1, 1, 1);
}

/**
 * La rayita de un piquete: de él se guarda solo su caja (centro, ancho,
 * alto), y una raya recta que la cruza es una de sus dos diagonales -- la
 * que va más de frente al borde del molde (un piquete corta el borde, no
 * lo acompaña). Devuelve los dos extremos, en cm de la pieza.
 */
export function rayaDePiquete(q, contorno) {
  const w = q.ancho_cm || 0, h = q.alto_cm || 0;
  const largo = Math.hypot(w, h);
  if (!(largo > 0)) return null;
  // Normal del borde más cercano al piquete.
  let mejor = Infinity, normal = { x: 0, y: 1 };
  for (let i = 0; i < contorno.length; i++) {
    const a = contorno[i], b = contorno[(i + 1) % contorno.length];
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    if (!l2) continue;
    const u = Math.min(Math.max(((q.x - a.x) * dx + (q.y - a.y) * dy) / l2, 0), 1);
    const d = Math.hypot(a.x + dx * u - q.x, a.y + dy * u - q.y);
    if (d < mejor) {
      mejor = d;
      const l = Math.sqrt(l2);
      normal = { x: -dy / l, y: dx / l };
    }
  }
  const diagonales = [{ x: w, y: h }, { x: w, y: -h }];
  const frente = (v) => Math.abs(v.x * normal.x + v.y * normal.y);
  const v = frente(diagonales[0]) >= frente(diagonales[1]) ? diagonales[0] : diagonales[1];
  return [{ x: q.x - v.x / 2, y: q.y - v.y / 2 }, { x: q.x + v.x / 2, y: q.y + v.y / 2 }];
}

function hexARgb(hex) {
  const limpio = (hex || '#000000').replace('#', '');
  return {
    r: parseInt(limpio.substring(0, 2), 16) / 255,
    g: parseInt(limpio.substring(2, 4), 16) / 255,
    b: parseInt(limpio.substring(4, 6), 16) / 255,
  };
}
