"use strict";

// ============================================================
// Pruebas del fondo de color de las piezas (fondoPieza.js): sólido o
// degradado, igual para todas las piezas del diseño, debajo del arte. Más una
// vuelta por exportarPdf.js leyendo los colores que quedan en el PDF.

import { readFileSync } from 'node:fs';
import { normalizarFondo, fondoActivo, fondoDePieza, ejeDegradado, colorEn } from '../src/motor/fondoPieza.js';
import { generarPdfNesting } from '../src/motor/exportarPdf.js';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDocument, PDFName } from 'pdf-lib';

let fallos = 0, pasadas = 0;
function comprobar(desc, cond, detalle) {
  if (cond) { pasadas++; console.log('  ✓ ' + desc); }
  else { fallos++; console.log('  ✗ ' + desc + (detalle ? '\n      ' + detalle : '')); }
}
const cerca = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

console.log('\n--- Datos del fondo ---');
{
  comprobar('sin fondo guardado: ninguno', fondoActivo(null) === null && fondoActivo({ tipo: 'raro' }) === null);
  const f = normalizarFondo({ tipo: 'degradado', color1: '#FF0000', color2: 'azul', anguloGrados: -90 });
  comprobar('colores en minúscula, uno inválido vuelve al de siempre, ángulo entre 0 y 359',
    f.color1 === '#ff0000' && f.color2 === '#000000' && f.anguloGrados === 270, JSON.stringify(f));
  comprobar('color en la mitad del degradado', colorEn({ color1: '#000000', color2: '#ffffff' }, 0.5).join() === '128,128,128');
}

console.log('\n--- Fondo propio de una pieza ---');
{
  const diseno = {
    fondo: { tipo: 'solido', color1: '#111111' },
    fondoPorPieza: { Manga: { tipo: 'degradado', color1: '#ff0000', color2: '#0000ff' }, Cuello: { tipo: 'ninguno' } },
  };
  comprobar('sin fondo propio: usa el general', fondoDePieza(diseno, 'Delantero')?.color1 === '#111111');
  comprobar('con fondo propio: usa el suyo', fondoDePieza(diseno, 'Manga')?.tipo === 'degradado');
  comprobar('con "sin fondo" propio: esa pieza queda sin fondo aunque haya general', fondoDePieza(diseno, 'Cuello') === null);
  comprobar('sin general: solo las que tienen el suyo', fondoDePieza({ fondoPorPieza: diseno.fondoPorPieza }, 'Delantero') === null);
}

console.log('\n--- Eje del degradado (llega justo a los bordes de la pieza) ---');
{
  const h = ejeDegradado({ anchoCm: 40, altoCm: 20, anguloGrados: 0 });
  comprobar('0°: de borde izquierdo a borde derecho, por el medio', cerca(h.x1, 0) && cerca(h.x2, 40) && cerca(h.y1, 10) && cerca(h.y2, 10), JSON.stringify(h));
  const v = ejeDegradado({ anchoCm: 40, altoCm: 20, anguloGrados: 90 });
  comprobar('90°: de arriba hacia abajo', cerca(v.y1, 0) && cerca(v.y2, 20) && cerca(v.x1, 20), JSON.stringify(v));
  const d = ejeDegradado({ anchoCm: 10, altoCm: 10, anguloGrados: 45 });
  comprobar('45° en un cuadrado: de esquina a esquina', cerca(d.x1, 0) && cerca(d.y1, 0) && cerca(d.x2, 10) && cerca(d.y2, 10), JSON.stringify(d));
}

console.log('\n--- La copia del frontend es la misma ---');
{
  const cuerpo = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8').replace(/\r\n/g, '\n').split('\nconst HEX')[1];
  const back = cuerpo('../src/motor/fondoPieza.js');
  comprobar('mismo código en backend y frontend', back && back === cuerpo('../../frontend/src/utilidades/fondoPieza.js'));
}

console.log('\n--- PDF: el fondo se pinta en la pieza ---');
{
  const pdfDe = (fondo) => generarPdfNesting({
    anchoLienzoCm: 60, altoLienzoCm: 80,
    piezas: [{ piezaId: 'X', talla: 'm', posicion: { x: 0, y: 0 }, anchoCm: 20, altoCm: 10, imagenDataUrl: null, fondo, textos: [], imagenes: [] }],
  });
  async function coloresDeRelleno(fondo) {
    const bytes = await pdfDe(fondo);
    const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false }).promise;
    const ops = await (await doc.getPage(1)).getOperatorList();
    const colores = [];
    for (let i = 0; i < ops.fnArray.length; i++) {
      if (ops.fnArray[i] !== pdfjs.OPS.setFillRGBColor) continue;
      const a = ops.argsArray[i];
      colores.push(typeof a[0] === 'string' ? a[0].toLowerCase() : '#' + a.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, '0')).join(''));
    }
    return colores;
  }
  const solido = await coloresDeRelleno({ tipo: 'solido', color1: '#12ab34' });
  comprobar('sólido: se pinta con ese color', solido.includes('#12ab34'), JSON.stringify(solido));
  const sinEtiqueta = solido.length === 1;
  comprobar('con fondo, ya no lleva la etiqueta de pieza vacía', sinEtiqueta, JSON.stringify(solido));
  const fondoDegradado = { tipo: 'degradado', color1: '#000000', color2: '#ff0000', anguloGrados: 0 };
  const degradado = await coloresDeRelleno(fondoDegradado);
  comprobar('degradado: sin franjas de color sueltas', degradado.length === 0, JSON.stringify(degradado));
  const doc = await PDFDocument.load(await pdfDe(fondoDegradado));
  const pagina = doc.getPages()[0].node;
  const patrones = pagina.Resources().lookup(PDFName.of('Pattern'));
  const sombreado = patrones && doc.context.lookup(doc.context.lookup(patrones.get(patrones.keys()[0])).get(PDFName.of('Shading')));
  const funcion = sombreado && doc.context.lookup(sombreado.get(PDFName.of('Function')));
  comprobar('degradado: UN degradado lineal real (axial, RGB), de negro a rojo',
    patrones?.keys().length === 1 && String(sombreado.get(PDFName.of('ShadingType'))) === '2' &&
      String(sombreado.get(PDFName.of('ColorSpace'))) === '/DeviceRGB' &&
      String(funcion.get(PDFName.of('C0'))) === '[ 0 0 0 ]' && String(funcion.get(PDFName.of('C1'))) === '[ 1 0 0 ]',
    patrones && String(funcion?.get(PDFName.of('C0'))) + ' ' + String(funcion?.get(PDFName.of('C1'))));
  // De borde a borde de la pieza (20 cm a 0°, por el medio).
  const coords = sombreado.get(PDFName.of('Coords')).asArray().map((n) => n.asNumber() / 28.3465);
  comprobar('el degradado va de borde a borde de la pieza', cerca(coords[0], 0, 1e-3) && cerca(coords[2], 20, 1e-3), JSON.stringify(coords));
  comprobar('la página se declara RGB (Illustrator la abre en RGB, no CMYK)',
    String(doc.context.lookup(pagina.get(PDFName.of('Group'))).get(PDFName.of('CS'))) === '/DeviceRGB');
  const ops = await (await (await pdfjs.getDocument({ data: new Uint8Array(await pdfDe(fondoDegradado)), useSystemFonts: false }).promise).getPage(1)).getOperatorList();
  comprobar('el fondo no usa máscara de recorte', !ops.fnArray.includes(pdfjs.OPS.clip));
}

console.log('\n' + pasadas + ' pasadas, ' + fallos + ' fallos');
process.exit(fallos ? 1 : 0);
