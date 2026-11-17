// Genera el PDF final de una corrida de nesting. Cuando la pieza trae
// imagenDataUrl (el arte del Diseño -- pese al nombre, hoy es casi siempre
// una URL de Supabase Storage, no un data: URL; ver almacen.js) se dibuja
// como fondo real; cuando trae textos (nombre/número ya calibrados por
// resolverPedido.js) se escriben encima. Sin ninguno de los dos, cae al
// rectángulo con etiqueta de antes (útil para el nesting "rápido" sin
// personalización, ej. corte láser).

import {
  PDFDocument, rgb, degrees, StandardFonts,
  pushGraphicsState, popGraphicsState, moveTo, lineTo, closePath, clip, endPath, fill,
  beginText, endText, setFontAndSize, setFillingColor, showText,
  setCharacterSpacing, setCharacterSqueeze, rotateAndSkewTextRadiansAndTranslate,
  setStrokingColor, setLineWidth, setLineJoin, LineJoinStyle, setTextRenderingMode, TextRenderingMode,
} from 'pdf-lib';
import ClipperLib from 'clipper-lib';
import fontkit from '@pdf-lib/fontkit';
import { bytesDeFuente, obtenerMedidor, urlDeStoragePermitida, leerConTope } from './medidorFuentes.js';
import { ajustarTexto } from './ajusteTexto.js';
import { colocarArte } from './colocarArte.js';
import { fondoActivo, ejeDegradado, colorEn } from './fondoPieza.js';

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
      embebida = await pdf.embedFont(await bytesDeFuente(url));
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
    if (!fuenteBaseEmbebida) fuenteBaseEmbebida = await pdf.embedFont(await bytesDeFuente(null));
    return fuenteBaseEmbebida;
  }

  const anchoPt = resultadoNesting.anchoLienzoCm * CM_A_PUNTOS;
  const altoPt = resultadoNesting.altoLienzoCm * CM_A_PUNTOS;
  const pagina = pdf.addPage([anchoPt, altoPt]);

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
      pagina.pushOperators(
        pushGraphicsState(),
        moveTo(forma[0].x, forma[0].y),
        ...forma.slice(1).map((p) => lineTo(p.x, p.y)),
        closePath(),
        clip(),
        endPath()
      );
      pagina.pushOperators(...operadoresDeFondo(fondo, pieza.anchoCm, pieza.altoCm, aPt));
      pagina.pushOperators(popGraphicsState());
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

    if (!fondo && !pieza.imagenDataUrl && (!pieza.textos || pieza.textos.length === 0) && (!pieza.imagenes || pieza.imagenes.length === 0)) {
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
// Pinta el fondo sobre todo el rectángulo de la pieza (el recorte a su forma
// ya está puesto). El degradado va en franjas finas de color perpendiculares
// a su eje: una por cada escalón de color (hasta 256), así no se nota el
// paso de una a otra -- vectorial puro, sin depender de imágenes.
export function operadoresDeFondo(fondo, anchoCm, altoCm, aPt) {
  const cuadro = (pts, [r, g, b]) => [
    setFillingColor(rgb(r / 255, g / 255, b / 255)),
    moveTo(pts[0].x, pts[0].y),
    ...pts.slice(1).map((p) => lineTo(p.x, p.y)),
    closePath(),
    fill(),
  ];
  if (fondo.tipo === 'solido') {
    return cuadro([aPt(0, 0), aPt(anchoCm, 0), aPt(anchoCm, altoCm), aPt(0, altoCm)], colorEn(fondo, 0));
  }
  const eje = ejeDegradado({ anchoCm, altoCm, anguloGrados: fondo.anguloGrados });
  const largo = Math.hypot(eje.x2 - eje.x1, eje.y2 - eje.y1) || 1;
  const d = { x: (eje.x2 - eje.x1) / largo, y: (eje.y2 - eje.y1) / largo };
  const n = { x: -d.y, y: d.x };
  const ancho = Math.hypot(anchoCm, altoCm); // de sobra para cubrir la pieza de costado a costado
  const a = colorEn(fondo, 0), b = colorEn(fondo, 1);
  const franjas = Math.min(256, Math.max(1, ...a.map((v, i) => Math.abs(b[i] - v))));
  const ops = [];
  for (let i = 0; i < franjas; i++) {
    // Cada franja se estira un poco sobre la siguiente: sin hilos sin pintar entre ellas.
    const t0 = i === 0 ? -0.01 : i / franjas;
    const t1 = i === franjas - 1 ? 1.01 : (i + 1.5) / franjas;
    const p = (t, s) => aPt(eje.x1 + d.x * t * largo + n.x * s, eje.y1 + d.y * t * largo + n.y * s);
    ops.push(...cuadro([p(t0, -ancho), p(t1, -ancho), p(t1, ancho), p(t0, ancho)], colorEn(fondo, franjas === 1 ? 0 : i / (franjas - 1))));
  }
  return ops;
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

async function incrustarImagen(pdf, urlODataUrl) {
  const { contentType, bytes } = await bajarArchivo(urlODataUrl);
  return embeberImagen(pdf, contentType, bytes);
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

function hexARgb(hex) {
  const limpio = (hex || '#000000').replace('#', '');
  return {
    r: parseInt(limpio.substring(0, 2), 16) / 255,
    g: parseInt(limpio.substring(2, 4), 16) / 255,
    b: parseInt(limpio.substring(4, 6), 16) / 255,
  };
}
