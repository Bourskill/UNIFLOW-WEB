// El arte ORIGINAL de Illustrator que viene adentro del PDF de un diseño o
// logo (si se guardó con "Conservar capacidades de edición"): sus objetos tal
// cual, con sus efectos vivos (desenfoque gaussiano, sombras...), en vez de
// lo que Illustrator dejó en el PDF (los efectos ya convertidos en imagen,
// que no se ven igual).
//
// documentoAi.js los pega en la mesa en el lugar del arte, movidos y
// escalados con la misma matriz que el PDF -- y con los efectos escalados
// junto (como "Escalar trazos y efectos" de Illustrator).
//
// Solo se usa si el arte trae cosas que sabemos mover: trazados, grupos,
// trazados compuestos, máscaras de recorte e imágenes. Con textos vivos,
// degradados, símbolos u objetos de plugins, se cae a la traducción del PDF
// de siempre (nunca se pierde el arte).

import zlib from 'node:zlib';
import { PDFDocument, PDFName, PDFDict } from 'pdf-lib';

/** El texto .ai (latin1) adentro de un PDF de Illustrator, o null. */
export async function leerDocumentoAi(bytesPdf) {
  try {
    const doc = await PDFDocument.load(bytesPdf, { ignoreEncryption: true, updateMetadata: false });
    const pagina = doc.getPages()[0]?.node;
    const info = pagina && doc.context.lookup(pagina.get(PDFName.of('PieceInfo')));
    const ill = info instanceof PDFDict ? doc.context.lookup(info.get(PDFName.of('Illustrator'))) : null;
    const privado = ill instanceof PDFDict ? doc.context.lookup(ill.get(PDFName.of('Private'))) : null;
    if (!(privado instanceof PDFDict)) return null;
    // La página no se tocó después de guardarla en Illustrator: si no, su
    // copia ya no corresponde a lo que se ve.
    const fechaPagina = pagina.get(PDFName.of('LastModified'));
    const fechaDatos = ill.get(PDFName.of('LastModified'));
    if (fechaPagina && fechaDatos && String(fechaPagina) !== String(fechaDatos)) return null;
    const trozos = [];
    for (let i = 1; ; i++) {
      const s = privado.get(PDFName.of('AIPDFPrivateData' + i)) || privado.get(PDFName.of('AIPrivateData' + i));
      if (!s) break;
      trozos.push(Buffer.from(doc.context.lookup(s).getContents()));
    }
    if (!trozos.length) return null;
    const datos = Buffer.concat(trozos);
    const cabeza = datos.subarray(0, 24).toString('latin1');
    let ai;
    if (cabeza.startsWith('%AI24_ZStandard_Data')) ai = zlib.zstdDecompressSync(datos.subarray(20));
    else if (cabeza.startsWith('%AI12_CompressedData')) ai = zlib.inflateSync(datos.subarray(20));
    else ai = datos;
    const texto = ai.toString('latin1');
    return texto.startsWith('%!PS-Adobe') ? texto : null;
  } catch {
    return null;
  }
}

// Lo que todavía no sabemos mover de lugar: con alguno de estos, no se usa
// el arte nativo.
const NO_SOPORTADO = [
  /^\/AI11Text :/, // texto vivo (vive en el documento de texto, aparte)
  / Bg$/, / Xm$/, / Bc$/, / Bm$/, // degradados
  /^%AI8_BeginPluginObject/, // objetos de plugins (formas vivas, fusiones...)
  /SymbolInstance|^%AI14_/, // símbolos
  /\/RealPoint|\/RealMatrix/, // geometría guardada en diccionarios
  / XP$/, // archivos vinculados
];

/**
 * El arte de las capas visibles de un documento .ai, listo para moverlo:
 * { lineas, cajaMesa: {x0,y0,x1,y1} de la mesa exportada, estilos: Map(nombre → líneas) }.
 * null si trae algo que no sabemos mover.
 */
export function arteNativoDe(texto) {
  const fin = texto.indexOf('%AI5_BeginLayer');
  if (fin < 0) return null;
  const marcas = texto.slice(0, fin).match(/%AI3_Cropmarks: (\S+) (\S+) (\S+) (\S+)/);
  if (!marcas) return null;
  const [x0, y0, x1, y1] = marcas.slice(1, 5).map(Number);
  const cajaMesa = { x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) };

  // Las capas: su contenido, salteando cabeceras; sub-capas como grupos.
  const lineas = [];
  let i = fin;
  const largo = texto.length;
  const leerLinea = () => {
    const j = texto.indexOf('\n', i);
    let l = texto.slice(i, j < 0 ? largo : j);
    i = j < 0 ? largo : j + 1;
    // Algunos .ai vienen con saltos de Windows (CR LF).
    if (l.endsWith('\r')) l = l.slice(0, -1);
    return l;
  };
  const capas = []; // { visible }
  let enCabecera = false;
  while (i < largo) {
    const inicioLinea = i;
    const l = leerLinea();
    if (l.startsWith('%%PageTrailer') || l.startsWith('%%Trailer')) break;
    if (l === '%AI5_BeginLayer') {
      // "Lb": visible, vista previa, ..., imprimible -- una capa oculta o que no se imprime no va.
      const lb = leerLinea().split(' ');
      const visible = lb[0] === '1' && lb[3] !== '0' && capas.every((c) => c.visible);
      capas.push({ visible });
      if (visible && capas.length > 1) lineas.push('u');
      enCabecera = true;
      continue;
    }
    if (l.startsWith('%AI5_EndLayer')) {
      const c = capas.pop();
      if (c?.visible && capas.length >= 1) lineas.push('U');
      continue;
    }
    if (!capas.length) continue;
    if (enCabecera) {
      // Cabecera de capa: nombre, "AE", su diccionario y "0 A"/"0 Xw".
      if (/ Ln$/.test(l) || /^\d+ AE$/.test(l) || l.startsWith('%_') || /^\d+ A$/.test(l) || /^\d+ Xw$/.test(l)) continue;
      enCabecera = false;
    }
    if (l === 'LB') continue;
    if (!capas[capas.length - 1].visible) {
      if (l.startsWith('%%BeginData:')) saltarDatos();
      continue;
    }
    if (NO_SOPORTADO.some((r) => r.test(l))) return null;
    if (l.startsWith('%%BeginData:')) {
      // Datos binarios de una imagen: tal cual, hasta %%EndData.
      const desde = i;
      const hasta = texto.indexOf('%%EndData', desde);
      if (hasta < 0) return null;
      lineas.push(l, { binario: Buffer.from(texto.slice(desde, hasta), 'latin1') });
      i = hasta;
      continue;
    }
    void inicioLinea;
    lineas.push(l);
  }
  function saltarDatos() {
    const hasta = texto.indexOf('%%EndData', i);
    i = hasta < 0 ? largo : hasta;
  }
  limpiarArte(lineas);

  // Los estilos gráficos (los efectos vivos) que usa el arte.
  const usados = new Set();
  for (const l of lineas) {
    if (typeof l !== 'string') continue;
    for (const m of l.matchAll(/\((Anon [^)]*)\) XW/g)) usados.add(m[1]);
  }
  const estilos = new Map();
  const a = texto.indexOf('%AI9_BeginArtStyles'), b = texto.indexOf('%AI9_EndArtStyles');
  if (usados.size && a >= 0 && b > a) {
    const bloques = texto.slice(a + '%AI9_BeginArtStyles'.length, b).replace(/\r\n/g, '\n').split('\n/KnownStyle :\n');
    for (const bloque of bloques) {
      const m = bloque.match(/^\(([^)]*)\) \/Name ,/);
      if (m && usados.has(m[1])) estilos.set(m[1], bloque.replace(/\n+$/, '').split('\n'));
    }
  }
  return { lineas, cajaMesa, estilos };
}

// Los parámetros de las formas vivas (rectángulos "vivos": centro, ancho...)
// no se mueven con el trazado: si Illustrator rehiciera la forma desde ellos,
// volvería a su lugar original. Sin ellos queda un trazado común, en su lugar.
//
// (La vista previa de los efectos vivos -- el efecto ya dibujado como imagen
// que Illustrator guarda junto a cada objeto -- se deja: sin ella Illustrator
// no dibuja el objeto. Al abrir puede verse vieja hasta que Illustrator
// recalcula el efecto, cosa que hace al tocarlo o moverlo, y al guardar o
// imprimir.)
function limpiarArte(lineas) {
  const salida = [];
  for (let k = 0; k < lineas.length; k++) {
    const l = lineas[k];
    if (l === '%_/ArtDictionary :') {
      let j = k;
      while (j < lineas.length && lineas[j] !== '%_;') j++;
      const bloque = lineas.slice(k, j + 1);
      if (j < lineas.length && bloque.some((x) => typeof x === 'string' && x.includes('ai::LiveShape'))) {
        k = lineas[j + 1] === '%_' ? j + 1 : j;
        continue;
      }
    }
    salida.push(l);
  }
  lineas.splice(0, lineas.length, ...salida);
}

const PARES = { m: 1, l: 1, L: 1, c: 3, C: 3, v: 2, V: 2, y: 2, Y: 2 };
const n = (v) => {
  const r = Math.round(v * 10000) / 10000;
  return String(Object.is(r, -0) ? 0 : r);
};

/**
 * El arte movido con T (matriz [a b c d e f], de las coordenadas del .ai del
 * diseño a las de la mesa). `estiloDe(nombre)` da el nombre del estilo ya
 * escalado. Devuelve las líneas (strings, y Buffers para los datos de imagen).
 */
export function moverArte(nativo, T, estiloDe) {
  const [a, b, c, d, e, f] = T;
  const p = (x, y) => [a * x + c * y + e, b * x + d * y + f];
  const escala = Math.sqrt(Math.abs(a * d - b * c)) || 1;
  const salida = [];
  let enImagen = false;
  for (const l of nativo.lineas) {
    if (typeof l !== 'string') { salida.push(l.binario); continue; }
    if (l === '%AI5_BeginRaster') enImagen = true;
    if (l.startsWith('%%BeginData:')) enImagen = false;
    salida.push(l.split('\r').map((seg) => moverSegmento(seg, p, T, escala, enImagen, estiloDe)).join('\r'));
  }
  return salida;
}

function moverSegmento(seg, p, T, escala, enImagen, estiloDe) {
  // "%_" adelante: contenido para las versiones nuevas de Illustrator (los
  // objetos con efectos vivos van así). Se mueve igual, con el prefijo.
  if (seg.startsWith('%_')) return '%_' + moverSegmento(seg.slice(2), p, T, escala, enImagen, estiloDe);
  // Matriz de una imagen: [ a b c d tx ty ] (píxel → arte, Y de la imagen hacia abajo).
  if (enImagen) {
    const m = seg.match(/^\[ (\S+) (\S+) (\S+) (\S+) (\S+) (\S+) \](.*)$/);
    if (m) {
      const [ia, ib, ic, id, itx, ity] = m.slice(1, 7).map(Number);
      // Como afín estándar: x = ia·px + ic·py + itx ; y = -ib·px - id·py + ity.
      const [A, B, C, D, E, F] = T;
      const M = [ia, -ib, ic, -id, itx, ity];
      const R = [A * M[0] + C * M[1], B * M[0] + D * M[1], A * M[2] + C * M[3], B * M[2] + D * M[3], A * M[4] + C * M[5] + E, B * M[4] + D * M[5] + F];
      return '[ ' + [R[0], -R[1], R[2], -R[3], R[4], R[5]].map(n).join(' ') + ' ]' + m[7];
    }
  }
  const estilo = seg.match(/^(.*)\((Anon [^)]*)\) XW$/);
  if (estilo) return estilo[1] + '(' + estiloDe(estilo[2]) + ') XW';
  const t = seg.split(' ');
  // Grosor de trazo: se escala con el arte.
  for (let k = 1; k < t.length; k++) {
    if (t[k] === 'w' && isFinite(Number(t[k - 1])) && t[k - 1] !== '') t[k - 1] = n(Number(t[k - 1]) * escala);
  }
  const op = t[t.length - 1];
  const pares = PARES[op];
  if (pares && t.length >= pares * 2 + 1) {
    const desde = t.length - 1 - pares * 2;
    const nums = t.slice(desde, t.length - 1).map(Number);
    if (nums.every((v) => Number.isFinite(v))) {
      for (let k = 0; k < pares; k++) {
        const [x, y] = p(nums[k * 2], nums[k * 2 + 1]);
        t[desde + k * 2] = n(x);
        t[desde + k * 2 + 1] = n(y);
      }
    }
  }
  return t.join(' ');
}

/** Un estilo (efecto vivo) con sus medidas escaladas: radio del desenfoque, redondeos, trazos. */
export function escalarEstilo(lineas, nombreNuevo, escala) {
  return lineas.map((l, k) => {
    if (k === 0) return l.replace(/^\([^)]*\)/, '(' + nombreNuevo + ')');
    const m = l.match(/^(-?[\d.]+) \/Real \((blur|Radius|Horz|Vert|Distance|Width|Offset)\) ,$/);
    if (m) return n(Number(m[1]) * escala) + ' /Real (' + m[2] + ') ,';
    return l.split('\r').map((seg) => {
      const t = seg.split(' ');
      for (let i = 1; i < t.length; i++) if (t[i] === 'w' && isFinite(Number(t[i - 1])) && t[i - 1] !== '') t[i - 1] = n(Number(t[i - 1]) * escala);
      return t.join(' ');
    }).join('\r');
  });
}
