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
import { randomUUID, randomBytes } from 'node:crypto';
import { PDFDocument, PDFName, PDFNumber, PDFString } from 'pdf-lib';
import { moverArte, escalarEstilo } from './arteNativo.js';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const OPS = pdfjs.OPS;
const DATOS_DOCUMENTO = readFileSync(new URL('./datosDocumento.txt', import.meta.url), 'latin1');
const SEPARACION_MESAS_PT = 40;
const ANCHO_MAXIMO_FILA_PT = 15000; // el lienzo de Illustrator mide 16383 pt
const LIENZO_CENTRO = 8191.5;
const BLOQUE = 65536;

/** Devuelve el PDF con el documento de Illustrator adentro. */
export async function conDocumentoIllustrator(bytesPdf, { nombresDeMesas = [], titulo = 'UNIFLOW', artesNativos = null } = {}) {
  const partes = await documentoAiDePdf(bytesPdf, { nombresDeMesas, titulo, artesNativos });
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

export async function documentoAiDePdf(bytesPdf, { nombresDeMesas = [], titulo = 'UNIFLOW', artesNativos = null } = {}) {
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
  // Coordenadas del lienzo de Illustrator (Y hacia abajo, 0 a 16383): el
  // CENTRO DEL CONJUNTO de mesas en el centro del lienzo, así ninguna mesa
  // queda afuera del área donde se puede dibujar.
  const caja = { izq: Math.min(...mesas.map((m) => m.izq)), der: Math.max(...mesas.map((m) => m.der)), abajo: Math.min(...mesas.map((m) => m.abajo)), arriba: Math.max(...mesas.map((m) => m.arriba)) };
  const lienzo = { kx: LIENZO_CENTRO - (caja.izq + caja.der) / 2, ky: LIENZO_CENTRO + (caja.abajo + caja.arriba) / 2 };
  const degradados = new Degradados(lienzo);
  const textos = new TextosEditables(lienzo);
  const estilosNativos = new EstilosNativos();
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
    const nativos = artesNativos ? { cola: [...(artesNativos[i] || [])], estilo: (nativo, nombre, escala) => estilosNativos.nombre(nativo, nombre, escala) } : null;
    const nodos = traducirPagina(ops, p.pagina, base, degradados, imagenes, textos, nativos);
    arte.push('u');
    for (const nodo of nodos) arte.push(nodo);
    arte.push('U');
    imagenes.clear();
    p.pagina.cleanup();
  }
  await lector.destroy();
  return armarTexto({ mesas, nombres: nombresDeMesas, arte, degradados, textos, titulo, lienzo, estilosNativos });
}

// Las mesas en filas, de izquierda a derecha y de arriba hacia abajo, como
// las deja "Reorganizar mesas de trabajo"; coordenadas de Illustrator (Y
// hacia arriba). Las filas se arman para que el conjunto quede más o menos
// cuadrado: así entra en el lienzo de Illustrator (16383 pt por lado), que
// es el límite donde se puede dibujar.
function acomodarMesas(paginas) {
  const ancho = (p) => p.ancho + SEPARACION_MESAS_PT;
  const area = paginas.reduce((t, p) => t + ancho(p) * (p.alto + SEPARACION_MESAS_PT), 0);
  const masAncha = Math.max(...paginas.map(ancho));
  const fila = Math.max(masAncha, Math.min(ANCHO_MAXIMO_FILA_PT, Math.sqrt(area) * 1.2));
  const mesas = [];
  let x = 0, techo = 0, altoFila = 0;
  for (const p of paginas) {
    if (x > 0 && x + p.ancho > fila) {
      techo -= altoFila + SEPARACION_MESAS_PT;
      x = 0;
      altoFila = 0;
    }
    mesas.push({ izq: x, arriba: techo, der: x + p.ancho, abajo: techo - p.alto });
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

function traducirPagina(lista, pagina, base, degradados, imagenes, textos, nativos) {
  const raiz = [];
  const pilaContenedores = [raiz]; // raíz + recortes abiertos
  const hijos = () => pilaContenedores[pilaContenedores.length - 1];
  // Sin "...": un arte en PDF complejo puede traer cientos de miles de líneas.
  // Cada lista de líneas puede traer su caja (lineas.caja): se va sumando a la
  // del contenedor, para saber después si un recorte corta algo de verdad.
  const meter = (lineas) => {
    const h = hijos();
    for (const x of lineas) h.push(x);
    if (lineas.caja) h.caja = unirCajas(h.caja, lineas.caja);
  };
  let e = estadoInicial(base);
  const pila = [];
  let recortePendiente = null;
  let texto = null; // { tm, tlm }

  const cerrarRecortesHasta = (n) => {
    while (pilaContenedores.length - 1 > n) {
      const c = pilaContenedores.pop();
      meter(grupoDeRecorte(c, pilaContenedores));
    }
  };

  let profundidadForm = 0; // PDFs incrustados abiertos
  let saltar = 0; // > 0: adentro de un arte reemplazado por su original
  for (let i = 0; i < lista.fnArray.length; i++) {
    const fn = lista.fnArray[i];
    const a = lista.argsArray[i];
    if (saltar > 0) {
      if (fn === OPS.paintFormXObjectBegin) saltar++;
      else if (fn === OPS.paintFormXObjectEnd) saltar--;
      if (saltar > 0) continue;
    }
    if (fn === OPS.paintFormXObjectBegin && profundidadForm === 0 && nativos?.cola.length) {
      // Un arte (diseño o logo) que trae su original de Illustrator: van sus
      // objetos tal cual, con efectos vivos, en vez de traducir el PDF.
      const nativo = nativos.cola.shift();
      if (nativo) {
        const ctm = Array.isArray(a[0]) || ArrayBuffer.isView(a[0]) ? multiplicar(e.ctm, Array.from(a[0])) : e.ctm;
        // Del .ai del diseño a su página PDF (la mesa de trabajo exportada) y de ahí a la mesa.
        const T = multiplicar(ctm, [1, 0, 0, 1, -nativo.cajaMesa.x0, -nativo.cajaMesa.y0]);
        const escala = escalaDe(T);
        const lineas = ['u', ...moverArte(nativo, T, (nombre) => nativos.estilo(nativo, nombre, escala)), 'U'];
        const c = nativo.cajaMesa;
        const esquinas = [[c.x0, c.y0], [c.x1, c.y0], [c.x1, c.y1], [c.x0, c.y1]].map(([x, y]) => aplicar(T, x, y));
        lineas.caja = { x0: Math.min(...esquinas.map((q) => q[0])), y0: Math.min(...esquinas.map((q) => q[1])), x1: Math.max(...esquinas.map((q) => q[0])), y1: Math.max(...esquinas.map((q) => q[1])) };
        meter(lineas);
        saltar = 1;
        continue;
      }
    }
    if (fn === OPS.paintFormXObjectBegin) profundidadForm++;
    else if (fn === OPS.paintFormXObjectEnd) profundidadForm = Math.max(0, profundidadForm - 1);
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
          c.cajaRecorte = cajaDe(subcaminos);
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
        if (texto) meter(letras(a[0], e, texto, pagina, degradados, textos));
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
  const caja = cajaDe(subcaminos);
  const margen = traza ? (e.grosor * escalaDe(e.ctm)) / 2 : 0;
  l.caja = { x0: caja.x0 - margen, y0: caja.y0 - margen, x1: caja.x1 + margen, y1: caja.y1 + margen };
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
// escribe Illustrator para un grupo con máscara de recorte. Solo si de
// verdad recorta: los PDF de logos y diseños traen recortes al borde de su
// página que no cortan nada, y cada uno sería una máscara de más.
function grupoDeRecorte(c, abiertos) {
  if (c.length === 0) return [];
  const sobra = () => {
    const l = c.slice();
    l.caja = c.caja;
    return l;
  };
  if (!c.caja) return sobra();
  // Lo que igual se ve: lo recortado, limitado por los recortes de afuera.
  let visible = c.caja;
  for (let k = abiertos.length - 1; k >= 1; k--) {
    if (abiertos[k].cajaRecorte) visible = intersecarCajas(visible, abiertos[k].cajaRecorte);
  }
  if (visible.x0 >= visible.x1 || visible.y0 >= visible.y1) return sobra();
  // Eso entra entero en este recorte: no recorta nada.
  if (cajaDentroDeRecorte(visible, c.recorte)) return sobra();
  // Un recorte rectangular que abarca a otro de afuera: el de afuera ya manda.
  if (esRectangulo(c.recorte)) {
    for (let k = abiertos.length - 1; k >= 1; k--) {
      const afuera = abiertos[k].cajaRecorte;
      if (afuera && cajaContiene(c.cajaRecorte, afuera)) return sobra();
    }
  }
  const l = ['q'].concat(c);
  const subs = c.recorte;
  if (subs.length > 1) l.push('*u');
  for (const sub of subs) l.push(...textoDeCamino(sub, 'h', true).concat(['W', 'n']));
  if (subs.length > 1) l.push('*U');
  l.push('Q');
  l.caja = intersecarCajas(c.caja, c.cajaRecorte);
  return l;
}

const TOLERANCIA = 0.5; // pt

function unirCajas(a, b) {
  if (!a) return b;
  if (!b) return a;
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
}
function intersecarCajas(a, b) {
  return { x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) };
}
function cajaContiene(grande, chica) {
  return grande.x0 <= chica.x0 + TOLERANCIA && grande.y0 <= chica.y0 + TOLERANCIA && grande.x1 >= chica.x1 - TOLERANCIA && grande.y1 >= chica.y1 - TOLERANCIA;
}
function puntosDe(sub) {
  return sub.seg.map((s) => (s[0] === 'C' ? [s[5], s[6]] : [s[1], s[2]]));
}
// Un solo subcamino recto de 4 lados alineados a los ejes.
function esRectangulo(subs) {
  if (subs.length !== 1 || subs[0].seg.some((s) => s[0] === 'C')) return false;
  const caja = cajaDe(subs);
  return puntosDe(subs[0]).every(([x, y]) =>
    (Math.abs(x - caja.x0) < TOLERANCIA || Math.abs(x - caja.x1) < TOLERANCIA) &&
    (Math.abs(y - caja.y0) < TOLERANCIA || Math.abs(y - caja.y1) < TOLERANCIA));
}
// ¿La caja entera cae adentro del recorte? Para un rectángulo, comparar
// cajas; para otra forma, las 4 esquinas adentro y ningún borde del recorte
// cruzando la caja.
function cajaDentroDeRecorte(caja, subs) {
  if (esRectangulo(subs)) return cajaContiene(cajaDe(subs), caja);
  if (subs.length !== 1) return false;
  const pol = puntosDe(subs[0]);
  if (subs[0].seg.some((s) => s[0] === 'C')) return false;
  const esquinas = [[caja.x0, caja.y0], [caja.x1, caja.y0], [caja.x1, caja.y1], [caja.x0, caja.y1]];
  if (!esquinas.every(([x, y]) => puntoEnPoligono(x, y, pol))) return false;
  return pol.every(([x, y]) => x <= caja.x0 || x >= caja.x1 || y <= caja.y0 || y >= caja.y1);
}
function puntoEnPoligono(x, y, pol) {
  let dentro = false;
  for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
    const [xi, yi] = pol[i], [xj, yj] = pol[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
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
  const esquinas = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => aplicar(ctm, u, v));
  const caja = { x0: Math.min(...esquinas.map((p) => p[0])), y0: Math.min(...esquinas.map((p) => p[1])), x1: Math.max(...esquinas.map((p) => p[0])), y1: Math.max(...esquinas.map((p) => p[1])) };
  const m = [A / w, -B / w, -C / h, D / h, C + E, D + F];
  const matriz = '[ ' + m.map(n).join(' ') + ' ]';
  // Como Illustrator: los píxeles RGB y después, aparte, la transparencia
  // (ya sin premultiplicar). Van como Buffer: se escriben tal cual.
  const lineas = [
    '%AI5_File:', '%AI5_BeginRaster', '() 1 XG', '/DeviceRGB XN',
    matriz + ' ' + w + ' ' + h + ' 0 Xh',
    matriz + ' 0 0 ' + w + ' ' + h + ' ' + w + ' ' + h + ' 8 3 ' + (alfa ? '1 17' : '0 1') + ' 1 0 4 4 0 0',
    '%%BeginData: ' + (w * h * 3 + 4),
    'XI', rgb, ...(alfa ? [alfa] : []), '%%EndData',
    'XH',
    '%AI5_EndRaster',
    'N',
  ];
  lineas.caja = caja;
  return lineas;
}

// --- letras ---
function letras(glifos, e, texto, pagina, degradados, textos) {
  const fuente = e.fuente ? objetoDe(pagina, e.fuente) : null;
  if (!fuente) return [];
  const mf = fuente.fontMatrix || [0.001, 0, 0, 0.001, 0, 0];
  const modo = e.modoTexto;
  // Texto EDITABLE de Illustrator, con su fuente por nombre: lo normal. Solo
  // si no se puede (fuente sin nombre, texto invisible o de recorte, color
  // de degradado) va como contornos.
  const editable = textoEditable(glifos, e, texto, fuente, mf, textos);
  if (editable) return editable;
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
    if (obj) { salida.push(...obj); salida.caja = obj.caja; }
  }
  return salida;
}

function nombreDeFuente(fuente) {
  // pdf.js puede dejar el prefijo de subconjunto ("ABCDEF+Nombre").
  const nombre = String(fuente.name || '').replace(/^[A-Z]{6}\+/, '');
  return /^[\x21-\x7e]+$/.test(nombre) && !/^(g_d|Helvetica|Times|Courier|Symbol|ZapfDingbats)/.test(nombre) ? nombre : null;
}

function textoEditable(glifos, e, texto, fuente, mf, textos) {
  const modo = e.modoTexto;
  if (![0, 1, 2].includes(modo)) return null;
  const nombre = nombreDeFuente(fuente);
  if (!nombre) return null;
  const rellena = modo !== 1, traza = modo !== 0;
  if ((rellena && !e.relleno.rgb) || (traza && !e.trazo.rgb) || (rellena && e.relleno.degradado)) return null;
  const inicio = multiplicar(e.ctm, texto.tm);
  let cadena = '';
  for (const g of glifos) {
    if (typeof g === 'number') {
      texto.tm = multiplicar(texto.tm, [1, 0, 0, 1, (-g / 1000) * e.cuerpo * e.escalaH, 0]);
      continue;
    }
    cadena += g.unicode || '';
    const avance = (g.width || 0) * mf[0] * e.cuerpo + e.espaciadoLetra + (g.isSpace ? e.espaciadoPalabra : 0);
    texto.tm = multiplicar(texto.tm, [1, 0, 0, 1, avance * e.escalaH, 0]);
  }
  if (!cadena.trim()) return [];
  // La matriz del texto (sin el tamaño): giro y posición de la línea de base.
  const escala = escalaDe(inicio);
  const m = [inicio[0] / escala, inicio[1] / escala, inicio[2] / escala, inicio[3] / escala, inicio[4], inicio[5]];
  const m2 = multiplicar(m, [1, 0, 0, 1, 0, e.subida]);
  const historia = textos.agregar({
    texto: cadena, fuente: nombre, tipoFuente: 1,
    tamano: e.cuerpo * escala, escalaH: e.escalaH, tracking: e.cuerpo ? (e.espaciadoLetra / e.cuerpo) * 1000 : 0,
    matriz: m2, relleno: rellena ? e.relleno.rgb : null,
    trazo: traza ? { rgb: e.trazo.rgb, grosor: e.grosor * escalaDe(e.ctm), union: e.union } : null,
  });
  // Caja aproximada: del inicio al fin de la línea, de la bajada a la altura del cuerpo.
  const fin = aplicar(multiplicar(e.ctm, texto.tm), 0, 0);
  const largo = Math.hypot(fin[0] - inicio[4], fin[1] - inicio[5]);
  const esquinas = [[0, -0.3], [largo / (e.cuerpo * escala || 1), -0.3], [largo / (e.cuerpo * escala || 1), 1], [0, 1]]
    .map(([u, v]) => aplicar(multiplicar(m2, [e.cuerpo * escala, 0, 0, e.cuerpo * escala, 0, 0]), u, v));
  const lineasTexto = [
    '/AI11Text :', '0 /FreeUndo ,', '0 /FrameIndex ,', historia + ' /StoryIndex ,', '2 /TextAntialiasing ,', ';', '',
    '0 ' + n(Math.min(rellena ? e.opacidadRelleno : 1, traza ? e.opacidadTrazo : 1)) + ' 0 0 0 Xy',
    '0 J 0 j 1 w 10 M []0 d', '0 XR', '0 0 Xd', '6 () XW',
  ];
  lineasTexto.caja = { x0: Math.min(...esquinas.map((p) => p[0])), y0: Math.min(...esquinas.map((p) => p[1])), x1: Math.max(...esquinas.map((p) => p[0])), y1: Math.max(...esquinas.map((p) => p[1])) };
  return lineasTexto;
}

// El "documento de texto" de Illustrator: todas las historias (cada texto),
// sus marcos y las fuentes, en el formato de su motor de texto (claves
// numéricas, cadenas UTF-16), sobre una plantilla guardada por Illustrator.
const PLANTILLA_TEXTO = readFileSync(new URL('./documentoTexto.bin', import.meta.url), 'latin1');
const FUENTES_BASE = [
  ['MyriadPro-Regular', 0, 'Version 2.106;PS 2.000;hotconv 1.0.70;makeotf.lib2.5.58329'],
  ['TimesNewRomanPSMT', 1, 'Version 7.12'],
  ['MyriadPro-Regular', 0, 'Version 2.106;PS 2.000;hotconv 1.0.70;makeotf.lib2.5.58329'],
  ['AdobeInvisFont', 0, 'Version 1.003;hotconv 1.1.0;makeotfexe 2.6.0', ' /4 [ 30801920 53739520 ]'],
];

function cadenaUtf16(s) {
  const b = Buffer.from('﻿' + s, 'utf16le').swap16();
  let r = '(';
  for (const byte of b) r += byte === 0x28 || byte === 0x29 || byte === 0x5c ? '\\' + String.fromCharCode(byte) : String.fromCharCode(byte);
  return r + ')';
}
function real(v) {
  const s = n(v);
  return s.includes('.') ? s : s + '.0';
}
// El color de un texto NO va en el documento de texto: ahí va solo el nombre
// de un estilo gráfico ("Anon ..."), y el color real está en ese estilo
// (sección de estilos gráficos del documento). Ver TextosEditables.estilos().
function pintura(rgb, estilos) {
  const clave = rgb.map((v) => v.toFixed(4)).join(',');
  let nombre = estilos.get(clave)?.nombre;
  if (!nombre) {
    nombre = 'Anon ' + randomBytes(8).toString('base64');
    estilos.set(clave, { nombre, rgb });
  }
  const [r, g, b] = rgb;
  return '<< /99 /CAITextPaint /5 ' + cadenaUtf16(nombre) + ' /0 << /0 1 /1 [ 1.0 ' + [r, g, b].map(real).join(' ') + ' ] >> >>';
}

class TextosEditables {
  constructor(lienzo) {
    this.lienzo = lienzo;
    this.historias = [];
    this.fuentes = FUENTES_BASE.map(([nombre]) => nombre);
    this.fuentesNuevas = [];
    this.estilosDeColor = new Map();
  }

  // Los estilos gráficos con los colores de los textos (después de documento()).
  estilos(extra = []) {
    if (!this.estilosDeColor.size && !extra.length) return [];
    const l = ['%AI5_Begin_NonPrinting', 'Np', '%AI9_BeginArtStyles'];
    for (const bloque of extra) l.push('/KnownStyle :', ...bloque);
    for (const { nombre, rgb } of this.estilosDeColor.values()) {
      l.push('/KnownStyle :', '(' + nombre + ') /Name ,', '/SimpleStyle :', '0 O', colorAi(rgb) + ' Xa', '0 R', colorAi(rgb) + ' XA',
        '0 1 0 0 0 Xy', '0 J 0 j 1 w 10 M []0 d\r0 XR', '0 1 Xd', '/Paint ;', ' /Def ;');
    }
    l.push('%AI9_EndArtStyles', '%AI5_End_NonPrinting--');
    return l;
  }

  indiceDeFuente(nombre, tipo) {
    const i = this.fuentes.indexOf(nombre, 1);
    if (i >= 0) return i;
    this.fuentes.push(nombre);
    this.fuentesNuevas.push([nombre, tipo]);
    return this.fuentes.length - 1;
  }

  agregar(t) {
    t.indiceFuente = this.indiceDeFuente(t.fuente, t.tipoFuente);
    this.historias.push(t);
    return this.historias.length - 1;
  }

  documento() {
    if (!this.historias.length) return [];
    const fuente = ([nombre, tipo, version, extra = '']) =>
      '<< /0 << /99 /CoolTypeFont /97 (' + randomUUID() + ') /0 << /0 ' + cadenaUtf16(nombre) + ' /2 ' + tipo + extra +
      (version ? ' /5 ' + cadenaUtf16(version) : '') + ' >> >> >>';
    const fuentes = [...FUENTES_BASE, ...this.fuentesNuevas].map(fuente).join(' ');
    const historias = this.historias.map((t, i) => {
      const largo = [...t.texto].length + 1;
      const a = ['/0 ' + t.indiceFuente, '/1 ' + real(t.tamano)];
      if (Math.abs(t.escalaH - 1) > 1e-4) a.push('/6 ' + real(t.escalaH));
      if (Math.abs(t.tracking) > 0.01) a.push('/8 ' + Math.round(t.tracking));
      a.push('/11 0'); // sin kerning automático: el ancho queda como lo midió la app
      if (t.relleno) a.push('/53 ' + pintura(t.relleno, this.estilosDeColor));
      if (t.trazo) a.push('/54 ' + pintura(t.trazo.rgb, this.estilosDeColor));
      a.push('/56 ' + (t.relleno ? 'true' : 'false'), '/57 ' + (t.trazo ? 'true' : 'false'));
      if (t.trazo) a.push('/62 ' + (t.trazo.union || 0), '/63 ' + real(t.trazo.grosor));
      a.push('/89 ' + real(t.tamano), '/92 0.0');
      return '<< /0 << /0 ' + cadenaUtf16(t.texto + '\r') +
        ' /6 << /0 [ << /0 << /0 << /97 (' + randomUUID() + ') /0 ' + cadenaUtf16('') + ' /5 0 /6 << ' + a.join(' ') + ' >> >> >> /1 ' + largo + ' >> ] >>' +
        ' /10 << /0 4 /2 true >> >> /1 << /4 << /0 7 /1 11 /2 0 /3 ' + cadenaUtf16('Illustrator') + ' >> /5 0 /0 [ << /0 ' + i + ' >> ]' +
        ' /1 << /0 [ << /0 << /1 1 >> /1 ' + largo + ' >> ] >> >> >>';
    }).join(' ');
    // Marcos: texto de punto, matriz en coordenadas del lienzo (Y hacia
    // abajo) alrededor del origen de regla.
    const { kx, ky } = this.lienzo;
    // El texto se arma en el origen de regla y la matriz (en coordenadas
    // absolutas del lienzo) lo lleva a su lugar: M(origen) = línea de base.
    const marcos = this.historias.map((t) => {
      const [a, b, c, d, x, y] = t.matriz;
      const [A, B, C, D] = [a, -b, -c, d];
      const ax = x + kx, ay = ky - y;
      const tx = ax - (A * kx + C * ky), ty = ay - (B * kx + D * ky);
      return '<< /0 << /97 (' + randomUUID() + ') /0 [ ' + real(kx) + ' ' + real(ky) + ' ] /2 << /2 [ ' +
        [A, B, C, D, tx, ty].map(real).join(' ') + ' ] >> >> >>';
    }).join(' ');
    const datos = PLANTILLA_TEXTO.replace('@@FUENTES@@', fuentes).replace('@@HISTORIAS@@', historias).replace('@@MARCOS@@', marcos);
    return [
      '%AI11_BeginTextDocument',
      '/AI11TextDocument : /ASCII85Decode ,',
      ...ascii85(Buffer.from(datos, 'latin1')).map((l) => '%' + l),
      real(kx) + ' ' + real(ky) + ' /RulerOrigin ,',
      ';',
      '%AI11_EndTextDocument',
    ];
  }
}

function ascii85(buf) {
  let s = '';
  for (let i = 0; i < buf.length; i += 4) {
    const trozo = buf.subarray(i, i + 4);
    const relleno = 4 - trozo.length;
    const v = ((trozo[0] << 24) | ((trozo[1] || 0) << 16) | ((trozo[2] || 0) << 8) | (trozo[3] || 0)) >>> 0;
    if (v === 0 && relleno === 0) { s += 'z'; continue; }
    let x = v;
    const d = new Array(5);
    for (let k = 4; k >= 0; k--) { d[k] = String.fromCharCode((x % 85) + 33); x = Math.floor(x / 85); }
    s += d.slice(0, 5 - relleno).join('');
  }
  s += '~>';
  return s.match(/.{1,100}/g);
}

// Los efectos vivos de los artes originales, uno por arte y escala: el
// mismo desenfoque en un diseño achicado a la mitad tiene la mitad de radio.
class EstilosNativos {
  constructor() { this.porClave = new Map(); }
  nombre(nativo, nombre, escala) {
    const lineas = nativo.estilos.get(nombre);
    if (!lineas) return nombre;
    if (Math.abs(escala - 1) < 1e-4) {
      if (!this.porClave.has(nombre)) this.porClave.set(nombre, { nombre, lineas });
      return nombre;
    }
    const clave = nombre + '@' + escala.toFixed(4);
    let def = this.porClave.get(clave);
    if (!def) {
      const nuevo = 'Anon ' + randomBytes(8).toString('base64');
      def = { nombre: nuevo, lineas: escalarEstilo(lineas, nuevo, escala) };
      this.porClave.set(clave, def);
    }
    return def.nombre;
  }
  bloques() { return [...this.porClave.values()].map((d) => d.lineas); }
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

// La caja REAL del trazado (la de las curvas, no la de sus puntos de
// control, que pueden quedar bien afuera): la misma que usa Illustrator.
function cajaDe(subcaminos) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const punto = (x, y) => {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x);
    y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  };
  for (const sub of subcaminos) {
    let px = 0, py = 0;
    for (const s of sub.seg) {
      if (s[0] !== 'C') {
        punto(s[1], s[2]);
        px = s[1]; py = s[2];
        continue;
      }
      const [, ax, ay, bx, by, cx, cy] = s;
      punto(cx, cy);
      for (const t of extremosCubica(px, ax, bx, cx)) punto(cubica(px, ax, bx, cx, t), cubica(py, ay, by, cy, t));
      for (const t of extremosCubica(py, ay, by, cy)) punto(cubica(px, ax, bx, cx, t), cubica(py, ay, by, cy, t));
      px = cx; py = cy;
    }
  }
  return { x0, y0, x1, y1 };
}
function cubica(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}
// Los t (entre 0 y 1) donde la curva da la vuelta en ese eje.
function extremosCubica(p0, p1, p2, p3) {
  const a = -p0 + 3 * p1 - 3 * p2 + p3, b = 2 * (p0 - 2 * p1 + p2), c = p1 - p0;
  const ts = [];
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) ts.push(-c / b);
  } else {
    const d = b * b - 4 * a * c;
    if (d >= 0) {
      const r = Math.sqrt(d);
      ts.push((-b + r) / (2 * a), (-b - r) / (2 * a));
    }
  }
  return ts.filter((t) => t > 0 && t < 1);
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

function armarTexto({ mesas, nombres, arte, degradados, textos, titulo, lienzo, estilosNativos }) {
  // Primero el documento de texto: ahí se juntan los colores de los estilos.
  const lineasTexto = textos.documento();
  const documentoDeTexto = { lineas: lineasTexto, estilos: textos.estilos(estilosNativos.bloques()) };
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
      '%_' + n(lienzo.kx + m.izq) + ' ' + n(lienzo.ky - m.arriba) + ' /RealPoint',
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
    ...cabecera, ...degradados.definiciones(), ...documentoDeTexto.estilos, datos, ...documentoDeTexto.lineas, '%%EndSetup',
    '%AI5_BeginLayer', '1 1 1 1 0 0 1 0 79 128 255 0 50 0 Lb', '(Capa 1) Ln', '0 A', '0 Xw',
  ];
  for (const a of arte) partes.push(a);
  partes.push('LB', '%AI5_EndLayer--', '%%PageTrailer', 'gsave annotatepage grestore showpage', '%%Trailer', '%%EOF');
  return partes;
}
