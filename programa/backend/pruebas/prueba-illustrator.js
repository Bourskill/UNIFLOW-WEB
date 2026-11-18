"use strict";

// ============================================================
// El PDF de las mesas lleva ADENTRO el documento de Illustrator
// (motor/illustrator/documentoAi.js), para que Illustrator lo abra como suyo:
// RGB, una mesa con nombre por página, trazados limpios. Acá se revisa lo
// que Illustrator necesita encontrar; que Illustrator lo abra bien se probó
// a mano contra Illustrator 2026 (31.0).

import zlib from 'node:zlib';
import { PDFDocument, PDFName } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { armarMesas } from '../src/motor/mesas.js';
import { generarPdfPaginas } from '../src/motor/exportarPdf.js';
import { conDocumentoIllustrator, documentoAiDePdf, textoDePartes } from '../src/motor/illustrator/documentoAi.js';
import { ajustarTextosDePiezas } from '../src/motor/ajusteTexto.js';
import { obtenerMedidor, bytesDeFuente } from '../src/motor/medidorFuentes.js';
import fontkit from '@pdf-lib/fontkit';

// Un color como lo escribe Illustrator: C M Y K R G B, de 0 a 1.
function colorAiDe(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const k = 1 - Math.max(r, g, b);
  const red = (v) => String(Math.round(v * 10000) / 10000);
  return [(1 - r - k) / (1 - k), (1 - g - k) / (1 - k), (1 - b - k) / (1 - k), k, r, g, b].map(red).join(' ');
}

let fallos = 0, pasadas = 0;
function comprobar(desc, cond, detalle) {
  if (cond) { pasadas++; console.log('  ✓ ' + desc); }
  else { fallos++; console.log('  ✗ ' + desc + (detalle ? '\n      ' + detalle : '')); }
}

// Una imagen PNG chiquita con transparencia, hecha acá (2×1: opaca y medio transparente).
function png2x1() {
  const crc = (b) => {
    let c; const t = [];
    for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    c = 0xffffffff; for (const x of b) c = t[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0;
  };
  const trozo = (tipo, d) => {
    const l = Buffer.alloc(4); l.writeUInt32BE(d.length);
    const td = Buffer.concat([Buffer.from(tipo), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([l, td, c]);
  };
  const cab = Buffer.alloc(13); cab.writeUInt32BE(2, 0); cab.writeUInt32BE(1, 4); cab[8] = 8; cab[9] = 6;
  const filas = Buffer.from([0, 255, 0, 0, 255, 0, 0, 255, 128]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), trozo('IHDR', cab), trozo('IDAT', zlib.deflateSync(filas)), trozo('IEND', Buffer.alloc(0))]);
}

const cuadro = (w, h) => [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
// Un molde con forma (una esquina cortada): ahí el diseño sí se recorta.
const conForma = (w, h) => [{ x: 0, y: 0 }, { x: w - 10, y: 0 }, { x: w, y: 10 }, { x: w, y: h }, { x: 0, y: h }];
const piezas = [
  { piezaId: 'Delantero', talla: 'M', anchoCm: 50, altoCm: 70, contornoCm: conForma(50, 70), piquetesCm: [{ x: 25, y: 0, ancho_cm: 0, alto_cm: 1 }],
    fondo: { tipo: 'solido', color1: '#6d1d1d' }, imagenDataUrl: 'data:image/png;base64,' + png2x1().toString('base64'), textos: [], imagenes: [] },
  { piezaId: 'Puño', talla: 'M', anchoCm: 30, altoCm: 6, contornoCm: cuadro(30, 6), piquetesCm: [],
    fondo: { tipo: 'degradado', color1: '#ffe100', color2: '#1d2a6b', anguloGrados: 90 }, textos: [], imagenes: [] },
];
const mesas = armarMesas(piezas);
const base = await generarPdfPaginas(mesas);
const nombres = mesas.map((m) => m.nombre);
const bytes = await conDocumentoIllustrator(base, { nombresDeMesas: nombres, titulo: 'Titular M' });

console.log('\n--- Lo que busca Illustrator en el PDF ---');
const doc = await PDFDocument.load(bytes, { updateMetadata: false });
const paginas = doc.getPages();
const info = paginas.map((p) => doc.context.lookup(p.node.get(PDFName.of('PieceInfo'))));
comprobar('cada página lleva sus datos de Illustrator', info.every((i) => i && i.get(PDFName.of('Illustrator'))));
const ill = doc.context.lookup(info[0].get(PDFName.of('Illustrator')));
comprobar('la fecha de la página coincide con la de los datos (si no, Illustrator los ignora)',
  paginas.every((p) => String(p.node.get(PDFName.of('LastModified'))) === String(ill.get(PDFName.of('LastModified')))));
const privado = doc.context.lookup(ill.get(PDFName.of('Private')));
const bloques = Number(String(privado.get(PDFName.of('NumBlock'))));
let comprimido = Buffer.alloc(0);
for (let i = 1; i <= bloques; i++) comprimido = Buffer.concat([comprimido, Buffer.from(doc.context.lookup(privado.get(PDFName.of('AIPDFPrivateData' + i))).getContents())]);
comprobar('el documento va comprimido como lo guarda Illustrator 2026 (Zstandard)', comprimido.subarray(0, 20).toString('latin1') === '%AI24_ZStandard_Data');
const ai = zlib.zstdDecompressSync(comprimido.subarray(20)).toString('latin1');
comprobar('es un documento .ai', ai.startsWith('%!PS-Adobe-3.0') && ai.includes('%AI5_FileFormat 14.0') && ai.trimEnd().endsWith('%%EOF'));
comprobar('documento RGB', ai.includes('%AI9_ColorModel: 1'));
const mesasAi = [...ai.matchAll(/%_\(([^)]*)\) \/UnicodeString \(Name\) ,/g)].map((m) => Buffer.from(m[1], 'latin1').toString('utf8'));
comprobar('una mesa de trabajo por página, con su nombre (acentos incluidos)', mesasAi.join('|') === nombres.join('|'), mesasAi.join('|'));
comprobar('cuenta de mesas', ai.includes('%_2 /Int (LastArtboardID) ,'));
const meta = Buffer.from(doc.context.lookup(privado.get(PDFName.of('AIMetaData'))).getContents()).toString('latin1');
comprobar('los metadatos son la cabecera del documento', ai.startsWith(meta) && meta.trimEnd().endsWith('%%EndComments'));

console.log('\n--- Los objetos ---');
comprobar('fondo sólido: el color en RGB', ai.includes(' 0.4275 0.1137 0.1137 Xa'));
comprobar('degradado: definido y aplicado como degradado de Illustrator', /%AI5_BeginGradient: \(Degradado UNIFLOW 1\)/.test(ai) && /\n1 \(Degradado UNIFLOW 1\) 0 0 0 1 .* 1 Bg\n/.test(ai));
const raster = ai.match(/\[ [^\]]+ \] 2 1 0 Xh\n\[ [^\]]+ \] 0 0 2 1 2 1 8 3 1 17 1 0 4 4 0 0\n%%BeginData: 10\nXI\n([\s\S]{8})%%EndData/);
comprobar('la imagen va incrustada con su transparencia aparte', raster && raster[1] === '\xff\x00\x00\x00\x00\xff\xff\x80', raster ? JSON.stringify(raster[1]) : 'sin imagen');
comprobar('la imagen va recortada a la forma de la pieza (una sola máscara)', (ai.match(/\nq\n/g) || []).length === 1 && /\nh\nW\nn\nQ\n/.test(ai));
comprobar('los trazados cerrados repiten el primer punto (así los cierra Illustrator)', /\n28\.3465 2012\.6014 m\n[\s\S]*?\n28\.3465 2012\.6014 L\nf\n/.test(ai));
comprobar('cada mesa es un grupo', (ai.match(/\nu\n/g) || []).length === 2 && (ai.match(/\nU\n/g) || []).length === 2);

console.log('\n--- Máscaras: solo las que recortan ---');
{
  // El mismo diseño sobre un molde rectangular del tamaño de la imagen: el
  // recorte no corta nada, así que no va.
  const rect = armarMesas([{ ...piezas[0], contornoCm: cuadro(50, 70) }]);
  const t = textoDePartes(await documentoAiDePdf(await generarPdfPaginas(rect)));
  const capa = t.slice(t.indexOf('%AI5_BeginLayer'));
  comprobar('un recorte que no corta nada no se escribe', !/\nq\n/.test(capa) && /\nXI\n/.test(capa));
}

console.log('\n--- Texto editable, con la fuente por su nombre real ---');
{
  const conTexto = await ajustarTextosDePiezas([{
    ...piezas[1], fondo: { tipo: 'solido', color1: '#ffffff' }, anchoCm: 40, altoCm: 20, contornoCm: cuadro(40, 20),
    textos: [{ modo: 'llenar', texto: 'Pérez (10)', anchoCm: 30, altoCm: 5, cxCm: 20, cyCm: 10, colorHex: '#123456', rotacionGrados: 0, alineacion: 'centro', espaciadoMil: 0, contorno: { grosorCm: 0.2, colorHex: '#ff0000' } }],
  }], obtenerMedidor);
  const pdfTexto = await generarPdfPaginas(armarMesas(conTexto));
  const docTexto = await PDFDocument.load(pdfTexto);
  const nombresFuentes = [];
  docTexto.context.enumerateIndirectObjects().forEach(([, o]) => {
    const tipo = o.get?.(PDFName.of('Type'));
    if (String(tipo) === '/Font' && o.get(PDFName.of('BaseFont'))) nombresFuentes.push(String(o.get(PDFName.of('BaseFont'))));
  });
  const real = '/' + fontkit.create(await bytesDeFuente(null)).postscriptName;
  comprobar('la fuente va con su nombre PostScript real, sin el número que agrega pdf-lib', nombresFuentes.includes(real), nombresFuentes.join(' '));
  const t = textoDePartes(await documentoAiDePdf(pdfTexto));
  const capa = t.slice(t.indexOf('%AI5_BeginLayer'));
  comprobar('el texto va como texto de Illustrator (contorno detrás + relleno), no como trazados', (capa.match(/\/AI11Text :/g) || []).length === 2);
  comprobar('va el documento de texto de Illustrator', t.includes('%AI11_BeginTextDocument') && t.includes(' /RulerOrigin ,'));
  comprobar('sus colores, como estilos con nombre', (t.match(/\/KnownStyle :\n\(Anon [A-Za-z0-9+/=]+\) \/Name ,\n\/SimpleStyle :/g) || []).length === 2 &&
    t.includes(colorAiDe('#123456') + ' Xa') && t.includes(colorAiDe('#ff0000') + ' Xa'));
}

console.log('\n--- El PDF sigue siendo el mismo para todo lo demás ---');
const lector = await pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
comprobar('mismas páginas', lector.numPages === 2);
const [ops1, ops2] = await Promise.all([1, 2].map(async (n) => (await (await pdfjs.getDocument({ data: new Uint8Array(n === 1 ? base : bytes), verbosity: 0 }).promise).getPage(1)).getOperatorList()));
comprobar('mismo dibujo', ops1.fnArray.join() === ops2.fnArray.join());

console.log('\n--- Muchas mesas: en filas, sin salirse del lienzo ---');
{
  const muchas = armarMesas(Array.from({ length: 12 }, (_, i) => ({ ...piezas[1], piezaId: 'P' + i, fondo: null, imagenDataUrl: null, anchoCm: 80, altoCm: 90, contornoCm: cuadro(80, 90) })));
  const texto = textoDePartes(await documentoAiDePdf(await generarPdfPaginas(muchas)));
  const puntos = [...texto.matchAll(/%_(-?[\d.]+) (-?[\d.]+) \/RealPointRelToROrigin/g)].map((m) => [Number(m[1]), Number(m[2])]);
  const xs = puntos.map((p) => p[0]), ys = puntos.map((p) => p[1]);
  comprobar('todas entran en el lienzo de Illustrator (16383 pt)', Math.max(...xs) - Math.min(...xs) < 16000 && Math.max(...ys) - Math.min(...ys) < 16000,
    (Math.max(...xs) - Math.min(...xs)) + ' × ' + (Math.max(...ys) - Math.min(...ys)));
  comprobar('más de una fila', new Set(ys.filter((_, i) => i % 2 === 1)).size > 1);
}

console.log('\n' + pasadas + ' pasadas, ' + fallos + ' fallos');
process.exit(fallos ? 1 : 0);
