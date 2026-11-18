// PDF "nativo" de Illustrator: el mismo PDF de siempre (lo que ven Acrobat,
// el navegador, el RIP), más ADENTRO una copia del documento en el formato
// propio de Illustrator (.ai en texto, comprimido con Zstandard), que es lo
// que guarda Illustrator al marcar "Conservar capacidades de edición".
// Illustrator abre esa copia en vez de importar el PDF: documento RGB, una
// mesa de trabajo con nombre por página, trazados limpios -- sin el cuadro
// "Opciones de importación de PDF" ni las máscaras que deja la importación.
//
// La copia no se arma aparte: se TRADUCE el PDF ya generado, página por
// página, leyendo sus operaciones con pdf.js (trazados, colores, degradados,
// imágenes, letras como contornos, recortes). Así lo que abre Illustrator
// es exactamente lo que dibujó exportarPdf.js, incluido el arte en PDF de
// los diseños y logos.
//
// El formato salió de documentos guardados por Illustrator 2026 (31.0):
// cabecera de comentarios, datos del documento (mesas de trabajo) y una
// capa con los objetos. Ver pruebas/prueba-illustrator.js.

import zlib from 'node:zlib';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PDFDocument, PDFName, PDFNumber, PDFString } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const OPS = pdfjs.OPS;
const DATOS_DOCUMENTO = readFileSync(new URL('./datosDocumento.txt', import.meta.url), 'latin1');
const SEPARACION_MESAS_PT = 40;
const ANCHO_MAXIMO_FILA_PT = 14000; // el lienzo de Illustrator mide 16383 pt
const BLOQUE = 65536;

/** Devuelve el PDF con el documento de Illustrator adentro. */
export async function conDocumentoIllustrator(bytesPdf, { nombresDeMesas = [], titulo = 'UNIFLOW' } = {}) {
  const partes = await documentoAiDePdf(bytesPdf, { nombresDeMesas, titulo });
  return incrustarDocumentoAi(bytesPdf, partes);
}

// El documento .ai va en PARTES: líneas de texto (cada una termina en salto
// de línea) y los píxeles de las imágenes tal cual (Buffer, sin salto). Así
// una imagen de sublimación grande no se copia entera varias veces: se
// comprime a medida que se escribe.
export function textoDePartes(partes) {
  return partes.map((p) => (typeof p === 'string' ? p + '\n' : p.toString('latin1'))).join('');
}

async function comprimirPartes(partes) {
  const z = zlib.createZstdCompress();
  const trozos = [];
  z.on('data', (c) => trozos.push(c));
  const fin = new Promise((resolver, fallar) => { z.on('end', resolver); z.on('error', fallar); });
  const escribir = (b) => (z.write(b) ? null : new Promise((r) => z.once('drain', r)));
  let pendiente = [];
  const vaciar = async () => {
    if (!pendiente.length) return;
    const b = Buffer.from(pendiente.join(''), 'latin1');
    pendiente = [];
    await escribir(b);
  };
  for (const p of partes) {
    if (typeof p === 'string') {
      pendiente.push(p, '\n');
      if (pendiente.length > 4000) await vaciar();
    } else {
      await vaciar();
      await escribir(p);
    }
  }
  await vaciar();
  z.end();
  await fin;
  return Buffer.concat(trozos);
}

// ---------------------------------------------------------------------------
// Incrustar: PieceInfo /Illustrator /Private en cada página, como Illustrator.

export async function incrustarDocumentoAi(bytesPdf, partes) {
  const doc = await PDFDocument.load(bytesPdf, { updateMetadata: false });
  const ctx = doc.context;
  // Los metadatos: la cabecera de comentarios, sin comprimir.
  const fin = partes.indexOf('%%EndComments');
  const metadatos = Buffer.from(partes.slice(0, fin + 1).join('\n') + '\n', 'latin1');
  const comprimido = Buffer.concat([Buffer.from('%AI24_ZStandard_Data'), await comprimirPartes(partes)]);
  const privado = ctx.obj({});
  privado.set(PDFName.of('AIMetaData'), ctx.register(ctx.stream(metadatos)));
  let bloques = 0;
  for (let i = 0; i < comprimido.length; i += BLOQUE) {
    bloques++;
    privado.set(PDFName.of('AIPDFPrivateData' + bloques), ctx.register(ctx.stream(comprimido.subarray(i, i + BLOQUE))));
  }
  for (const [k, v] of [['ContainerVersion', 12], ['CreatorVersion', 31], ['NumBlock', bloques], ['RoundtripStreamType', 2], ['RoundtripVersion', 31]]) {
    privado.set(PDFName.of(k), PDFNumber.of(v));
  }
  // Illustrator solo confía en su copia si la página no se tocó después:
  // la fecha de la página y la de sus datos tienen que ser la misma.
  const fecha = PDFString.of(fechaPdf(new Date()));
  const illustrator = ctx.register(ctx.obj({ LastModified: fecha, Private: ctx.register(privado) }));
  for (const pagina of doc.getPages()) {
    pagina.node.set(PDFName.of('PieceInfo'), ctx.obj({ Illustrator: illustrator }));
    pagina.node.set(PDFName.of('LastModified'), fecha);
  }
  return doc.save({ useObjectStreams: false });
}

function fechaPdf(d) {
  const dos = (n) => String(n).padStart(2, '0');
  return 'D:' + d.getUTCFullYear() + dos(d.getUTCMonth() + 1) + dos(d.getUTCDate()) + dos(d.getUTCHours()) + dos(d.getUTCMinutes()) + dos(d.getUTCSeconds()) + "Z00'00'";
}

// ---------------------------------------------------------------------------
// Traducir el PDF a texto .ai

export async function documentoAiDePdf(bytesPdf, { nombresDeMesas = [], titulo = 'UNIFLOW' } = {}) {
  const lector = await pdfjs.getDocument({
    data: new Uint8Array(bytesPdf), disableFontFace: true, fontExtraProperties: true,
    useSystemFonts: false, isEvalSupported: false, verbosity: 0,
  }).promise;
  const paginas = [];
  for (let n = 1; n <= lector.numPages; n++) {
    const pagina = await lector.getPage(n);
    const [x0, y0, x1, y1] = pagina.view;
    paginas.push({ pagina, ancho: x1 - x0, alto: y1 - y0, origen: [x0, y0] });
  }
  const mesas = acomodarMesas(paginas);
  // Coordenadas del lienzo de Illustrator (Y hacia abajo), con el centro
  // de la primera mesa en el centro del lienzo: ahí vive la matriz de los degradados.
  const m1 = mesas[0];
  const degradados = new Degradados({ kx: 8191 - (m1.izq + m1.der) / 2, ky: 8191 + (m1.abajo + m1.arriba) / 2 });
  const arte = [];
  for (let i = 0; i < paginas.length; i++) {
    const p = paginas[i], m = mesas[i];
    const ops = await p.pagina.getOperatorList();
    // Las imágenes llegan decodificadas aparte (pdf.js): se esperan antes.
    const imagenes = new Map();
    for (let k = 0; k < ops.fnArray.length; k++) {
      const f = ops.fnArray[k], args = ops.argsArray[k];
      let id = null;
      if (f === OPS.paintImageXObject) id = args[0];
      else if ((f === OPS.setFillColorN || f === OPS.setStrokeColorN) && args[0] === 'Shading') id = args[1];
      if (!id) continue;
      if (!imagenes.has(id)) imagenes.set(id, await esperarObjeto(p.pagina, id));
    }
    const base = [1, 0, 0, 1, m.izq - p.origen[0], m.abajo - p.origen[1]];
    const nodos = traducirPagina(ops, p.pagina, base, degradados, imagenes);
    arte.push('u');
    for (const nodo of nodos) arte.push(nodo);
    arte.push('U');
    imagenes.clear();
    p.pagina.cleanup();
  }
  await lector.destroy();
  return armarTexto({ mesas, nombres: nombresDeMesas, arte, degradados, titulo });
}

// Las mesas en filas, de izquierda a derecha y de arriba hacia abajo, como
// las deja "Reorganizar mesas de trabajo"; coordenadas de Illustrator (Y
// hacia arriba, la primera mesa con su esquina inferior izquierda en 0,0).
function acomodarMesas(paginas) {
  const mesas = [];
  let x = 0, techo = 0, altoFila = 0;
  for (const p of paginas) {
    if (x > 0 && x + p.ancho > ANCHO_MAXIMO_FILA_PT) {
      techo -= altoFila + SEPARACION_MESAS_PT;
      x = 0;
      altoFila = 0;
    }
    const arriba = techo === 0 && mesas.length === 0 ? p.alto : techo;
    mesas.push({ izq: x, arriba, der: x + p.ancho, abajo: arriba - p.alto });
    if (mesas.length === 1) techo = p.alto;
    altoFila = Math.max(altoFila, p.alto);
    x += p.ancho + SEPARACION_MESAS_PT;
  }
  return mesas;
}

// ---------------------------------------------------------------------------
// Operaciones de pdf.js → objetos .ai

const IDENTIDAD = [1, 0, 0, 1, 0, 0];
const multiplicar = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const aplicar = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const escalaDe = (m) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;

function estadoInicial(base) {
  return {
    ctm: base, basePagina: base, relleno: { rgb: [0, 0, 0] }, trazo: { rgb: [0, 0, 0] }, opacidadRelleno: 1, opacidadTrazo: 1,
    grosor: 1, extremo: 0, union: 0, inglete: 10, guiones: [[], 0],
    fuente: null, cuerpo: 12, espaciadoLetra: 0, espaciadoPalabra: 0, escalaH: 1, interlineado: 0, subida: 0, modoTexto: 0,
    contenedores: 0,
  };
}

function traducirPagina(lista, pagina, base, degradados, imagenes) {
  const raiz = [];
  const pilaContenedores = [raiz]; // raíz + recortes abiertos
  const hijos = () => pilaContenedores[pilaContenedores.length - 1];
  // Sin "...": un arte en PDF complejo puede traer cientos de miles de líneas.
  const meter = (lineas) => { const h = hijos(); for (const x of lineas) h.push(x); };
  let e = estadoInicial(base);
  const pila = [];
  let recortePendiente = null;
  let texto = null; // { tm, tlm }

  const cerrarRecortesHasta = (n) => {
    while (pilaContenedores.length - 1 > n) {
      const c = pilaContenedores.pop();
      meter(grupoDeRecorte(c));
    }
  };

  for (let i = 0; i < lista.fnArray.length; i++) {
    const fn = lista.fnArray[i];
    const a = lista.argsArray[i];
    switch (fn) {
      case OPS.save: pila.push({ ...e, contenedores: pilaContenedores.length - 1 }); break;
      case OPS.restore: {
        const anterior = pila.pop();
        if (anterior) {
          cerrarRecortesHasta(anterior.contenedores);
          e = anterior;
        }
        break;
      }
      case OPS.transform: e.ctm = multiplicar(e.ctm, a); break;
      case OPS.paintFormXObjectBegin:
        // Un PDF incrustado (arte, logo): su matriz, SIN recortar a su caja
        // -- el recorte de la caja es justamente la máscara que no se quiere.
        pila.push({ ...e, contenedores: pilaContenedores.length - 1 });
        if (Array.isArray(a[0]) || ArrayBuffer.isView(a[0])) e.ctm = multiplicar(e.ctm, Array.from(a[0]));
        break;
      case OPS.paintFormXObjectEnd: {
        const anterior = pila.pop();
        if (anterior) { cerrarRecortesHasta(anterior.contenedores); e = anterior; }
        break;
      }
      case OPS.setLineWidth: e.grosor = a[0]; break;
      case OPS.setLineCap: e.extremo = a[0]; break;
      case OPS.setLineJoin: e.union = a[0]; break;
      case OPS.setMiterLimit: e.inglete = a[0]; break;
      case OPS.setDash: e.guiones = [Array.from(a[0] || []), a[1] || 0]; break;
      case OPS.setGState:
        for (const [k, v] of a[0] || []) {
          if (k === 'ca') e.opacidadRelleno = v;
          else if (k === 'CA') e.opacidadTrazo = v;
          else if (k === 'LW') e.grosor = v;
          else if (k === 'LC') e.extremo = v;
          else if (k === 'LJ') e.union = v;
          else if (k === 'ML') e.inglete = v;
          else if (k === 'D') e.guiones = [Array.from(v[0] || []), v[1] || 0];
          else if (k === 'Font') { e.fuente = v[0]; e.cuerpo = v[1]; }
        }
        break;
      case OPS.setFillRGBColor: e.relleno = { rgb: hexARgb(a[0]) }; break;
      case OPS.setStrokeRGBColor: e.trazo = { rgb: hexARgb(a[0]) }; break;
      case OPS.setFillGray: e.relleno = { rgb: [a[0], a[0], a[0]] }; break;
      case OPS.setStrokeGray: e.trazo = { rgb: [a[0], a[0], a[0]] }; break;
      case OPS.setFillCMYKColor: e.relleno = { rgb: cmykARgb(a) }; break;
      case OPS.setStrokeCMYKColor: e.trazo = { rgb: cmykARgb(a) }; break;
      case OPS.setFillColorN: e.relleno = colorDePatron(a, e, imagenes) || e.relleno; break;
      case OPS.setStrokeColorN: e.trazo = colorDePatron(a, e, imagenes) || e.trazo; break;
      case OPS.setFillTransparent: e.opacidadRelleno = 0; break;
      case OPS.setStrokeTransparent: e.opacidadTrazo = 0; break;
      case OPS.clip: recortePendiente = 'nonzero'; break;
      case OPS.eoClip: recortePendiente = 'evenodd'; break;
      case OPS.constructPath: {
        const [pintura, datos] = a;
        const subcaminos = caminoDesde(datos?.[0], e.ctm);
        if (pintura !== OPS.endPath) {
          const obj = objetoCamino(subcaminos, pintura, e, degradados);
          if (obj) meter(obj);
        }
        if (recortePendiente) {
          const c = [];
          c.recorte = subcaminos;
          c.regla = recortePendiente;
          pilaContenedores.push(c);
          recortePendiente = null;
        }
        break;
      }
      case OPS.paintImageXObject:
      case OPS.paintInlineImageXObject: {
        const img = fn === OPS.paintImageXObject ? imagenes.get(a[0]) : a[0];
        if (img) meter(raster(img, e.ctm, null));
        break;
      }
      case OPS.paintImageMaskXObject: {
        const img = a[0];
        if (img?.data) meter(raster(img, e.ctm, e.relleno.rgb || [0, 0, 0]));
        break;
      }
      // --- texto: cada letra como su contorno ---
      case OPS.beginText: texto = { tm: IDENTIDAD, tlm: IDENTIDAD }; break;
      case OPS.endText: texto = null; break;
      case OPS.setFont: e.fuente = a[0]; e.cuerpo = a[1]; break;
      case OPS.setCharSpacing: e.espaciadoLetra = a[0]; break;
      case OPS.setWordSpacing: e.espaciadoPalabra = a[0]; break;
      case OPS.setHScale: e.escalaH = a[0] / 100; break;
      case OPS.setLeading: e.interlineado = a[0]; break;
      case OPS.setTextRise: e.subida = a[0]; break;
      case OPS.setTextRenderingMode: e.modoTexto = a[0]; break;
      case OPS.setTextMatrix: if (texto) { texto.tm = texto.tlm = Array.from(a[0]); } break;
      case OPS.moveText: if (texto) { texto.tm = texto.tlm = multiplicar(texto.tlm, [1, 0, 0, 1, a[0], a[1]]); } break;
      case OPS.setLeadingMoveText: if (texto) { e.interlineado = -a[1]; texto.tm = texto.tlm = multiplicar(texto.tlm, [1, 0, 0, 1, a[0], a[1]]); } break;
      case OPS.nextLine: if (texto) { texto.tm = texto.tlm = multiplicar(texto.tlm, [1, 0, 0, 1, 0, -e.interlineado]); } break;
      case OPS.showText:
      case OPS.showSpacedText:
        if (texto) meter(letras(a[0], e, texto, pagina, degradados));
        break;
      default: break;
    }
  }
  cerrarRecortesHasta(0);
  return raiz;
}

function esperarObjeto(pagina, id) {
  const almacen = id.startsWith('g_') ? pagina.commonObjs : pagina.objs;
  return new Promise((resolver) => {
    const tope = setTimeout(() => resolver(null), 30000);
    almacen.get(id, (obj) => { clearTimeout(tope); resolver(obj); });
  });
}

function objetoDe(pagina, id) {
  try {
    return pagina.objs.get(id);
  } catch {
    try { return pagina.commonObjs.get(id); } catch { return null; }
  }
}

// Datos de camino de pdf.js (DrawOPS, en espacio de usuario) → subcaminos en
// coordenadas de la mesa: [{ puntos: [[op, ...coords]], cerrado }].
function caminoDesde(datos, ctm) {
  const subcaminos = [];
  if (!datos) return subcaminos;
  let actual = null;
  let ultimo = [0, 0];
  const p = (x, y) => aplicar(ctm, x, y);
  for (let j = 0; j < datos.length;) {
    const op = datos[j++];
    if (op === 0) {
      actual = { seg: [['m', ...p(datos[j], datos[j + 1])]], cerrado: false };
      ultimo = [datos[j], datos[j + 1]];
      subcaminos.push(actual);
      j += 2;
    } else if (op === 1) {
      if (!actual) { actual = { seg: [['m', ...p(ultimo[0], ultimo[1])]], cerrado: false }; subcaminos.push(actual); }
      actual.seg.push(['L', ...p(datos[j], datos[j + 1])]);
      ultimo = [datos[j], datos[j + 1]];
      j += 2;
    } else if (op === 2) {
      actual?.seg.push(['C', ...p(datos[j], datos[j + 1]), ...p(datos[j + 2], datos[j + 3]), ...p(datos[j + 4], datos[j + 5])]);
      ultimo = [datos[j + 4], datos[j + 5]];
      j += 6;
    } else if (op === 3) {
      // Cuadrática → cúbica.
      const [cx, cy, x, y] = [datos[j], datos[j + 1], datos[j + 2], datos[j + 3]];
      const c1 = [ultimo[0] + (2 / 3) * (cx - ultimo[0]), ultimo[1] + (2 / 3) * (cy - ultimo[1])];
      const c2 = [x + (2 / 3) * (cx - x), y + (2 / 3) * (cy - y)];
      actual?.seg.push(['C', ...p(c1[0], c1[1]), ...p(c2[0], c2[1]), ...p(x, y)]);
      ultimo = [x, y];
      j += 4;
    } else if (op === 4) {
      if (actual) actual.cerrado = true;
    } else {
      break;
    }
  }
  return subcaminos.filter((s) => s.seg.length > 1);
}

function textoDeCamino(sub, pintura, cerrar = false) {
  const l = [];
  const primero = sub.seg[0], ultimo = sub.seg[sub.seg.length - 1];
  const fin = ultimo[0] === 'C' ? [ultimo[5], ultimo[6]] : [ultimo[1], ultimo[2]];
  const seg = cerrar && (Math.abs(fin[0] - primero[1]) > 1e-4 || Math.abs(fin[1] - primero[2]) > 1e-4)
    ? [...sub.seg, ['L', primero[1], primero[2]]] : sub.seg;
  sub = { ...sub, seg };
  for (const s of sub.seg) {
    if (s[0] === 'm') l.push(n(s[1]) + ' ' + n(s[2]) + ' m');
    else if (s[0] === 'L') l.push(n(s[1]) + ' ' + n(s[2]) + ' L');
    else l.push(s.slice(1).map(n).join(' ') + ' C');
  }
  l.push(pintura);
  return l;
}

const PINTURAS = {
  [OPS.fill]: { relleno: true, regla: 'nonzero' }, [OPS.eoFill]: { relleno: true, regla: 'evenodd' },
  [OPS.stroke]: { trazo: true }, [OPS.closeStroke]: { trazo: true, cerrar: true },
  [OPS.fillStroke]: { relleno: true, trazo: true, regla: 'nonzero' }, [OPS.eoFillStroke]: { relleno: true, trazo: true, regla: 'evenodd' },
  [OPS.closeFillStroke]: { relleno: true, trazo: true, regla: 'nonzero', cerrar: true },
  [OPS.closeEOFillStroke]: { relleno: true, trazo: true, regla: 'evenodd', cerrar: true },
};

function objetoCamino(subcaminos, pintura, e, degradados, { regla: reglaForzada } = {}) {
  const tipo = PINTURAS[pintura];
  if (!tipo || subcaminos.length === 0) return null;
  const rellena = tipo.relleno && e.opacidadRelleno > 0;
  const traza = tipo.trazo && e.opacidadTrazo > 0;
  if (!rellena && !traza) return null;
  const regla = reglaForzada || tipo.regla || 'nonzero';
  const atributos = atributosDe(e, { rellena, traza, regla });
  const degradado = rellena && e.relleno.degradado ? degradados.usar(e.relleno.degradado) : null;
  const l = [];
  const compuesto = subcaminos.length > 1;
  if (compuesto) l.push('*u');
  l.push(...atributos);
  subcaminos.forEach((sub) => {
    // Relleno: todo subcamino se cierra. Trazo: cerrado solo si lo pidió.
    const cerrado = rellena || sub.cerrado || tipo.cerrar;
    const letra = rellena && traza ? 'b' : rellena ? 'f' : 's';
    const op = cerrado ? letra : letra.toUpperCase();
    if (degradado) {
      l.push(...textoDeCamino(sub, '', cerrado).slice(0, -1));
      l.push(...degradado.aplicar(e.relleno.degradado, cajaDe(subcaminos)), op, '0 BB');
    } else {
      l.push(...textoDeCamino(sub, op, cerrado));
    }
  });
  if (compuesto) l.push('*U');
  return l;
}

function atributosDe(e, { rellena, traza, regla }) {
  const l = ['0 O'];
  if (rellena && e.relleno.rgb) l.push(colorAi(e.relleno.rgb) + ' Xa');
  l.push('0 R');
  if (traza && e.trazo.rgb) l.push(colorAi(e.trazo.rgb) + ' XA');
  const opacidad = Math.min(rellena ? e.opacidadRelleno : 1, traza ? e.opacidadTrazo : 1);
  l.push('0 ' + n(opacidad) + ' 0 0 0 Xy');
  const grosor = e.grosor * escalaDe(e.ctm);
  const [guiones, fase] = e.guiones;
  l.push(e.extremo + ' J ' + e.union + ' j ' + n(grosor || 0.01) + ' w ' + n(e.inglete) + ' M [' + guiones.map((g) => n(g * escalaDe(e.ctm))).join(' ') + ']' + n(fase) + ' d');
  l.push((regla === 'evenodd' ? 1 : 0) + ' XR');
  return l;
}

// Recorte (máscara): q, lo recortado, el trazado de recorte y Q -- como lo
// escribe Illustrator para un grupo con máscara de recorte.
function grupoDeRecorte(c) {
  if (c.length === 0) return [];
  const l = ['q'].concat(c);
  const subs = c.recorte;
  if (subs.length > 1) l.push('*u');
  for (const sub of subs) l.push(...textoDeCamino(sub, 'h', true).concat(['W', 'n']));
  if (subs.length > 1) l.push('*U');
  l.push('Q');
  return l;
}

// --- imágenes ---
function raster(img, ctm, colorMascara) {
  const w = img.width, h = img.height;
  if (!w || !h || !img.data) return [];
  const rgb = Buffer.alloc(w * h * 3);
  let alfa = null;
  const d = img.data;
  const pixeles = w * h;
  if (colorMascara) {
    // Máscara de imagen (1 bit): el color de relleno, con transparencia.
    alfa = Buffer.alloc(pixeles);
    const [r, g, b] = colorMascara.map((v) => Math.round(v * 255));
    const porFila = (w + 7) >> 3;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const bit = (d[y * porFila + (x >> 3)] >> (7 - (x & 7))) & 1;
      rgb[i * 3] = r; rgb[i * 3 + 1] = g; rgb[i * 3 + 2] = b;
      alfa[i] = bit ? 0 : 255;
    }
  } else if (img.kind === 3 || d.length === pixeles * 4) {
    let conAlfa = false;
    for (let i = 0; i < pixeles; i++) if (d[i * 4 + 3] !== 255) { conAlfa = true; break; }
    if (conAlfa) alfa = Buffer.alloc(pixeles);
    for (let i = 0; i < pixeles; i++) {
      rgb[i * 3] = d[i * 4]; rgb[i * 3 + 1] = d[i * 4 + 1]; rgb[i * 3 + 2] = d[i * 4 + 2];
      if (alfa) alfa[i] = d[i * 4 + 3];
    }
  } else if (img.kind === 2 || d.length === pixeles * 3) {
    Buffer.from(d.buffer, d.byteOffset, pixeles * 3).copy(rgb);
  } else if (img.kind === 1) {
    const porFila = (w + 7) >> 3;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = ((d[y * porFila + (x >> 3)] >> (7 - (x & 7))) & 1) ? 255 : 0;
      const i = (y * w + x) * 3;
      rgb[i] = rgb[i + 1] = rgb[i + 2] = v;
    }
  } else {
    return [];
  }
  // Píxel (px,py), fila 0 arriba → mesa: la matriz de Illustrator.
  const [A, B, C, D, E, F] = ctm;
  const m = [A / w, -B / w, -C / h, D / h, C + E, D + F];
  const matriz = '[ ' + m.map(n).join(' ') + ' ]';
  // Como Illustrator: los píxeles RGB y después, aparte, la transparencia
  // (ya sin premultiplicar). Van como Buffer: se escriben tal cual.
  return [
    '%AI5_File:', '%AI5_BeginRaster', '() 1 XG', '/DeviceRGB XN',
    matriz + ' ' + w + ' ' + h + ' 0 Xh',
    matriz + ' 0 0 ' + w + ' ' + h + ' ' + w + ' ' + h + ' 8 3 ' + (alfa ? '1 17' : '0 1') + ' 1 0 4 4 0 0',
    '%%BeginData: ' + (w * h * 3 + 4),
    'XI', rgb, ...(alfa ? [alfa] : []), '%%EndData',
    'XH',
    '%AI5_EndRaster',
    'N',
  ];
}

// --- letras ---
function letras(glifos, e, texto, pagina, degradados) {
  const fuente = e.fuente ? objetoDe(pagina, e.fuente) : null;
  if (!fuente) return [];
  const mf = fuente.fontMatrix || [0.001, 0, 0, 0.001, 0, 0];
  const modo = e.modoTexto;
  const salida = [];
  const subcaminos = [];
  for (const g of glifos) {
    if (typeof g === 'number') {
      texto.tm = multiplicar(texto.tm, [1, 0, 0, 1, (-g / 1000) * e.cuerpo * e.escalaH, 0]);
      continue;
    }
    const matrizLetra = multiplicar(multiplicar(e.ctm, texto.tm), [e.cuerpo * e.escalaH, 0, 0, e.cuerpo, 0, e.subida]);
    if (modo !== 3 && g.fontChar !== undefined && !g.isSpace) {
      let cmds = null;
      try { cmds = pagina.commonObjs.get(fuente.loadedName + '_path_' + g.fontChar); } catch { cmds = null; }
      if (cmds?.path) subcaminos.push(...caminoDesde(cmds.path, matrizLetra));
    }
    const avance = (g.width || 0) * mf[0] * e.cuerpo + e.espaciadoLetra + (g.isSpace ? e.espaciadoPalabra : 0);
    texto.tm = multiplicar(texto.tm, [1, 0, 0, 1, avance * e.escalaH, 0]);
  }
  if (subcaminos.length) {
    const pintura = modo === 1 ? OPS.stroke : modo === 2 ? OPS.fillStroke : OPS.fill;
    // El grosor del contorno del texto está en el espacio del texto.
    const obj = objetoCamino(subcaminos, pintura, e, degradados, { regla: 'nonzero' });
    if (obj) salida.push(...obj);
  }
  return salida;
}

// --- colores y degradados ---
function hexARgb(hex) {
  if (typeof hex !== 'string') return [0, 0, 0];
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}
function cmykARgb([c, m, y, k]) {
  return [(1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k)];
}
function colorAi([r, g, b]) {
  const k = 1 - Math.max(r, g, b);
  const c = k >= 1 ? 0 : (1 - r - k) / (1 - k), m = k >= 1 ? 0 : (1 - g - k) / (1 - k), y = k >= 1 ? 0 : (1 - b - k) / (1 - k);
  return [c, m, y, k, r, g, b].map(n).join(' ');
}

// Un relleno de patrón: solo los degradados (sombreado axial/radial). pdf.js
// da ["Shading", id del patrón, matriz del patrón]; el patrón en sí
// (["RadialAxial", tipo, caja, paradas, p0, p1, r0, r1]) llega aparte.
function colorDePatron(args, e, objetos) {
  if (args[0] !== 'Shading') return null;
  const ir = objetos.get(args[1]);
  if (!Array.isArray(ir) || ir[0] !== 'RadialAxial') return null;
  const [, tipo, , paradas, p0, p1, r0, r1] = ir;
  const m = matrizDePatron(e, args[2]);
  const colores = paradas.map(([t, hex]) => [t, hexARgb(hex)]);
  return {
    rgb: colores[0]?.[1] || [0, 0, 0],
    degradado: { radial: tipo === 'radial', paradas: colores, p0: aplicar(m, p0[0], p0[1]), p1: aplicar(m, p1[0], p1[1]), r0, r1 },
  };
}
// El patrón vive en el espacio de la página (no el del CTM actual); en la
// mesa, ese espacio está corrido como toda la página.
function matrizDePatron(e, matriz) {
  const base = e.basePagina || [1, 0, 0, 1, 0, 0];
  return matriz ? multiplicar(base, Array.from(matriz)) : base;
}

class Degradados {
  constructor(lienzo) { this.lista = []; this.porClave = new Map(); this.lienzo = lienzo; }
  usar(dg) {
    const clave = (dg.radial ? 'r' : 'l') + dg.paradas.map(([t, c]) => t.toFixed(3) + ':' + c.map((v) => v.toFixed(3)).join(',')).join('|');
    let def = this.porClave.get(clave);
    if (!def) {
      def = { nombre: 'Degradado UNIFLOW ' + (this.lista.length + 1), radial: dg.radial, paradas: dg.paradas };
      this.porClave.set(clave, def);
      this.lista.push(def);
    }
    return {
      aplicar: (d, caja) => {
        const [x0, y0] = d.p0, [x1, y1] = d.p1;
        const dx = x1 - x0, dy = y1 - y0;
        const largo = Math.hypot(dx, dy) || 1;
        // Como lo guarda Illustrator: el degradado ocupa un cuadro que va de
        // p0 a p1 (eje u) y de sobra hacia los costados (eje v); antes y
        // después, dos tramos largos con el primer y el último color.
        const lejos = 100000 / largo;
        const vx = dy * 8, vy = -dx * 8;
        const ox = x0 - vx / 2, oy = y0 - vy / 2;
        const M = [dx, dy, vx, vy, ox, oy];
        return [
          'Bb',
          '1 (' + escapar(def.nombre) + ') 0 0 0 1 ' + matrizDeDegradado(this.lienzo, caja, d.p0, d.p1).map(n).join(' ') + ' 1 Bg',
          M.map(n).join(' ') + ' Xm',
          [dx * lejos, dy * lejos, vx, vy, ox - dx * lejos, oy - dy * lejos].map(n).join(' ') + ' Bc',
          M.map(n).join(' ') + ' Bm',
          [dx * lejos, dy * lejos, vx, vy, ox + dx, oy + dy].map(n).join(' ') + ' Bc',
        ];
      },
    };
  }
  definiciones() {
    const l = [];
    if (!this.lista.length) return l;
    l.push(this.lista.length + ' Bn');
    for (const def of this.lista) {
      const nombre = escapar(def.nombre);
      l.push('%AI5_BeginGradient: (' + nombre + ')');
      l.push('(' + nombre + ') ' + (def.radial ? 1 : 0) + ' ' + def.paradas.length + ' Bd');
      l.push('[');
      // La rampa: 256 muestras por canal (C, M, Y, K, R, G, B).
      const muestras = Array.from({ length: 256 }, (_, i) => colorEnParadas(def.paradas, i / 255));
      const canales = muestras.map((c) => colorAi(c).split(' ').map(Number));
      for (let k = 0; k < 7; k++) {
        const hex = canales.map((c) => Math.round(c[k] * 255).toString(16).padStart(2, '0').toUpperCase()).join('');
        l.push('<', ...hex.match(/.{1,80}/g), '>');
      }
      l.push('4 %_Br', '[');
      for (const [t, c] of [...def.paradas].reverse()) {
        const s = colorAi(c) + ' 2 1 6 50 ' + n(t * 100);
        l.push(s + ' %_BS', '%_' + s + ' Bs');
      }
      l.push('BD', '%AI5_EndGradient');
    }
    return l;
  }
}

function colorEnParadas(paradas, t) {
  if (t <= paradas[0][0]) return paradas[0][1];
  for (let i = 1; i < paradas.length; i++) {
    const [t1, c1] = paradas[i];
    const [t0, c0] = paradas[i - 1];
    if (t <= t1) {
      const u = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
      return c0.map((v, k) => v + (c1[k] - v) * u);
    }
  }
  return paradas[paradas.length - 1][1];
}

// Illustrator guarda el degradado como el que pone por defecto (de la mitad
// del borde izquierdo a la mitad del derecho de la caja del objeto) más una
// transformación, en coordenadas del lienzo (Y hacia abajo): la que lleva
// ese tramo a p0 → p1 (giro + escala + corrimiento).
function matrizDeDegradado({ kx, ky }, caja, p0, p1) {
  const lienzo = (x, y) => [x + kx, ky - y];
  const medio = (caja.y0 + caja.y1) / 2;
  const L = lienzo(caja.x0, medio), R = lienzo(caja.x1, medio);
  const P0 = lienzo(p0[0], p0[1]), P1 = lienzo(p1[0], p1[1]);
  const ax = R[0] - L[0], ay = R[1] - L[1], bx = P1[0] - P0[0], by = P1[1] - P0[1];
  const a2 = ax * ax + ay * ay || 1;
  const zr = (bx * ax + by * ay) / a2, zi = (by * ax - bx * ay) / a2;
  return [zr, zi, -zi, zr, P0[0] - (zr * L[0] - zi * L[1]), P0[1] - (zi * L[0] + zr * L[1])];
}

function cajaDe(subcaminos) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const sub of subcaminos) for (const s of sub.seg) {
    // Con los puntos de control alcanza: es la caja que usa Illustrator
    // salvo en curvas muy abiertas.
    for (let k = 1; k < s.length; k += 2) {
      x0 = Math.min(x0, s[k]); x1 = Math.max(x1, s[k]);
      y0 = Math.min(y0, s[k + 1]); y1 = Math.max(y1, s[k + 1]);
    }
  }
  return { x0, y0, x1, y1 };
}

// ---------------------------------------------------------------------------
// El texto completo del documento

function n(v) {
  if (!Number.isFinite(v)) return '0';
  const r = Math.round(v * 10000) / 10000;
  return String(Object.is(r, -0) ? 0 : r);
}
function escapar(s) {
  return String(s).replace(/[\\()]/g, (c) => '\\' + c).replace(/[\r\n]+/g, ' ');
}
function utf8(s) {
  return Buffer.from(String(s), 'utf8').toString('latin1');
}

function armarTexto({ mesas, nombres, arte, degradados, titulo }) {
  const izq = Math.min(...mesas.map((m) => m.izq)), der = Math.max(...mesas.map((m) => m.der));
  const abajo = Math.min(...mesas.map((m) => m.abajo)), arriba = Math.max(...mesas.map((m) => m.arriba));
  const m1 = mesas[0];
  const cx = (m1.izq + m1.der) / 2, cy = (m1.abajo + m1.arriba) / 2;
  const zoom = Math.min(1400 / Math.max(der - izq, 1), 900 / Math.max(arriba - abajo, 1), 1);
  const vista = n(izq - 20 / zoom) + ' ' + n(arriba + 20 / zoom) + ' ' + n(zoom);
  const ahora = new Date();
  const cabecera = [
    '%!PS-Adobe-3.0 ',
    '%%Creator: Adobe Illustrator(R) 24.0',
    '%%AI8_CreatorVersion: 31.0.0',
    '%%For: (UNIFLOW) ()',
    '%%Title: (' + utf8(escapar(titulo)) + ')',
    '%%CreationDate: ' + (ahora.getMonth() + 1) + '/' + ahora.getDate() + '/' + ahora.getFullYear() + ' ' + ahora.getHours() + ':' + String(ahora.getMinutes()).padStart(2, '0'),
    '%%Canvassize: 16383',
    '%%BoundingBox: ' + [izq, abajo, der, arriba].map((v) => Math.round(v)).join(' '),
    '%%HiResBoundingBox: ' + [izq, abajo, der, arriba].map(n).join(' '),
    '%%DocumentProcessColors: Cyan Magenta Yellow Black',
    '%AI5_FileFormat 14.0',
    '%AI12_BuildNumber: 84',
    '%AI3_ColorUsage: Color',
    '%AI7_ImageSettings: 0',
    '%%RGBProcessColor: 0 0 0 ([Registro])',
    '%AI3_Cropmarks: ' + [m1.izq, m1.abajo, m1.der, m1.arriba].map(n).join(' '),
    '%AI3_TemplateBox: ' + [cx + 0.5, cy - 0.5, cx + 0.5, cy - 0.5].map(n).join(' '),
    '%AI3_TileBox: ' + [cx - 306, cy - 396, cx + 306, cy + 396].map(n).join(' '),
    '%AI3_DocumentPreview: None',
    '%AI5_ArtSize: 14400 14400',
    '%AI5_RulerUnits: 4',
    '%AI24_LargeCanvasScale: 1',
    '%AI9_ColorModel: 1',
    '%AI5_ArtFlags: 0 0 0 1 0 0 1 0 0',
    '%AI5_TargetResolution: 800',
    '%AI5_NumLayers: 1',
    '%AI17_Begin_Content_if_version_gt:24 4',
    '%AI10_OpenToVie: ' + vista + ' 0 0 0 1576 982 18 0 0 46 92 0 0 0 1 1 0 1 1 0 1',
    '%AI17_Alternate_Content',
    '%AI9_OpenToView: ' + vista + ' 1576 982 18 0 0 46 92 0 0 0 1 1 0 1 1 0 1',
    '%AI17_End_Versioned_Content',
    '%AI5_OpenViewLayers: 7',
    '%AI17_Begin_Content_if_version_gt:24 4',
    '%AI17_Alternate_Content',
    '%AI17_End_Versioned_Content',
    '%%PageOrigin:' + n(cx - 306) + ' ' + n(cy - 396),
    '%AI7_GridSettings: 72 8 72 8 0 0 0.800000011920929 0.800000011920929 0.800000011920929 0.899999976158142 0.899999976158142 0.899999976158142',
    '%AI9_Flatten: 1',
    '%AI12_CMSettings: 00.MC',
    '%%EndComments',
    '%%BeginProlog',
    '%%EndProlog',
    '%%BeginSetup',
  ];
  // Mesas de trabajo: el "origen de regla" de cada una, con el centro de la
  // primera en el centro del lienzo (así lo guarda Illustrator).
  const mesasTxt = ['%_/Array :'];
  mesas.forEach((m, i) => {
    const nombre = nombres[i] || 'Mesa de trabajo ' + (i + 1);
    mesasTxt.push(
      '%_/Dictionary :',
      '%_1 /Real (PAR) ,',
      '%_(' + utf8(escapar(nombre)) + ') /UnicodeString (Name) ,',
      '%_' + n(m.der) + ' ' + n(m.abajo) + ' /RealPointRelToROrigin',
      '%_ (PositionPoint2) ,',
      '%_0 /Bool (IsArtboardLocked) ,',
      '%_0 /Int (DisplayMark) ,',
      '%_(' + randomUUID() + ') /String (ArtboardUUID) ,',
      '%_' + (i === 0 ? 1 : 0) + ' /Bool (IsArtboardSelected) ,',
      '%_' + n(8191 - cx + m.izq) + ' ' + n(8191 + cy - m.arriba) + ' /RealPoint',
      '%_ (RulerOrigin) ,',
      '%_/FillStyle : 0 1 0 0 0 Xy',
      '%_0 J 0 j 1 w 10 M []0 d\r%_0 XR',
      '%_0 0 Xd',
      '%_/Def ; ',
      '%_ (EachArtboardColor) ,',
      '%_0 /Bool (IsArtboardDefaultName) ,',
      '%_' + n(m.izq) + ' ' + n(m.arriba) + ' /RealPointRelToROrigin',
      '%_ (PositionPoint1) ,',
      '%_; ,',
    );
  });
  mesasTxt.push('%_; (ArtboardArray) ,');
  const datos = DATOS_DOCUMENTO.replace('@@MESAS@@', mesasTxt.join('\n')).replace('@@ULTIMA@@', String(mesas.length));
  const partes = [
    ...cabecera, ...degradados.definiciones(), datos, '%%EndSetup',
    '%AI5_BeginLayer', '1 1 1 1 0 0 1 0 79 128 255 0 50 0 Lb', '(Capa 1) Ln', '0 A', '0 Xw',
  ];
  for (const a of arte) partes.push(a);
  partes.push('LB', '%AI5_EndLayer--', '%%PageTrailer', 'gsave annotatepage grestore showpage', '%%Trailer', '%%EOF');
  return partes;
}
