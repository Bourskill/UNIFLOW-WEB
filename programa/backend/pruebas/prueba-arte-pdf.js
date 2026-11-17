"use strict";

// ============================================================
// Arte del Diseño en PDF: tiene que llegar VECTORIAL al PDF de producción
// (página incrustada, no una imagen), en el mismo lugar que una imagen con
// la misma proporción, e incrustado una sola vez aunque se repita.

import { PDFDocument, rgb } from 'pdf-lib';
import { generarPdfNesting } from '../src/motor/exportarPdf.js';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

let fallos = 0, pasadas = 0;
function comprobar(desc, cond, detalle) {
  if (cond) { pasadas++; console.log('  ✓ ' + desc); }
  else { fallos++; console.log('  ✗ ' + desc + (detalle ? '\n      ' + detalle : '')); }
}
const cerca = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;
const CM = 28.3465;

// Un "diseño" vectorial: página de 200×100 pt con un rectángulo rojo.
const origen = await PDFDocument.create();
const hoja = origen.addPage([200, 100]);
hoja.drawRectangle({ x: 10, y: 10, width: 50, height: 30, color: rgb(1, 0, 0) });
const disenoPdf = 'data:application/pdf;base64,' + Buffer.from(await origen.save()).toString('base64');

async function generar(piezas) {
  const bytes = await generarPdfNesting({ anchoLienzoCm: 60, altoLienzoCm: 80, piezas });
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false }).promise;
  return { bytes, ops: await (await doc.getPage(1)).getOperatorList() };
}
const pieza = (extra) => ({ piezaId: 'X', talla: 'm', posicion: { x: 0, y: 0 }, anchoCm: 20, altoCm: 10, imagenDataUrl: disenoPdf, textos: [], imagenes: [], ...extra });

console.log('\n--- PDF como diseño: entra vectorial ---');
{
  const { ops } = await generar([pieza({ ajusteArte: { escala: 50, alineacionH: 'izquierda', alineacionV: 'arriba', dxCm: 1 } })]);
  const f = ops.fnArray;
  comprobar('no se rasteriza: no hay ninguna imagen en la página', !f.includes(pdfjs.OPS.paintImageXObject));
  comprobar('va como página incrustada (Form XObject)', f.includes(pdfjs.OPS.paintFormXObjectBegin));
  const rojo = ops.argsArray.some((a, i) => f[i] === pdfjs.OPS.setFillRGBColor && String(typeof a[0] === 'string' ? a[0] : a.join()).toLowerCase().match(/#ff0000|255,0,0/));
  comprobar('los vectores del diseño están (el rectángulo rojo)', rojo);

  // Dónde quedó: misma cuenta que una imagen 2:1 con ese ajuste (colocarArte):
  // cubrir 20×10 → 50 % = 10×5 cm, arriba a la izquierda, corrida 1 cm.
  const por = (m, n) => [
    n[0] * m[0] + n[1] * m[2], n[0] * m[1] + n[1] * m[3],
    n[2] * m[0] + n[3] * m[2], n[2] * m[1] + n[3] * m[3],
    n[4] * m[0] + n[5] * m[2] + m[4], n[4] * m[1] + n[5] * m[3] + m[5],
  ];
  let actual = [1, 0, 0, 1, 0, 0], matriz = null;
  const pila = [];
  for (let i = 0; i < f.length && !matriz; i++) {
    if (f[i] === pdfjs.OPS.save) pila.push(actual);
    else if (f[i] === pdfjs.OPS.restore) actual = pila.pop();
    else if (f[i] === pdfjs.OPS.transform) actual = por(actual, ops.argsArray[i]);
    else if (f[i] === pdfjs.OPS.paintFormXObjectBegin) matriz = por(actual, ops.argsArray[i][0] || [1, 0, 0, 1, 0, 0]);
  }
  // La página mide 200 pt de ancho y tiene que ocupar 10 cm.
  comprobar('ocupa 10 cm de ancho', matriz && cerca(matriz[0] * 200, 10 * CM), JSON.stringify(matriz));
  comprobar('a 1 cm de la izquierda y pegada arriba (Y desde abajo: 80 - 5 = 75 cm)',
    matriz && cerca(matriz[4], 1 * CM) && cerca(matriz[5], 75 * CM), JSON.stringify(matriz));
}

console.log('\n--- El mismo diseño en varias piezas se incrusta una sola vez ---');
{
  const una = (await generar([pieza()])).bytes.length;
  const cinco = (await generar([0, 1, 2, 3, 4].map((i) => pieza({ posicion: { x: 0, y: i * 12 } })))).bytes.length;
  comprobar('cinco piezas pesan casi lo mismo que una (no cinco copias)', cinco < una * 2, una + ' → ' + cinco + ' bytes');
}

console.log('\n' + pasadas + ' pasadas, ' + fallos + ' fallos');
process.exit(fallos ? 1 : 0);
