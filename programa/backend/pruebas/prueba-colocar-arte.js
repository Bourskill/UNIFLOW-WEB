"use strict";

// ============================================================
// Pruebas del ajuste del arte (colocarArte.js): escala, alineación y
// corrimiento de la imagen del Diseño sobre su pieza. Más una vuelta por
// exportarPdf.js leyendo el PDF con pdfjs para confirmar dónde quedó la
// imagen, y que la copia del frontend sea idéntica (el lienzo tiene que
// mostrar exactamente lo que sale en el PDF).

import { readFileSync } from 'node:fs';
import { colocarArte, normalizarAjusteArte } from '../src/motor/colocarArte.js';
import { generarPdfNesting } from '../src/motor/exportarPdf.js';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

let fallos = 0, pasadas = 0;
function comprobar(desc, cond, detalle) {
  if (cond) { pasadas++; console.log('  ✓ ' + desc); }
  else { fallos++; console.log('  ✗ ' + desc + (detalle ? '\n      ' + detalle : '')); }
}
const cerca = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const igual = (r, x, y, ancho, alto, tol) => cerca(r.x, x, tol) && cerca(r.y, y, tol) && cerca(r.ancho, ancho, tol) && cerca(r.alto, alto, tol);

console.log('\n--- Base: cubrir o encajar, sin deformar ---');
{
  // Pieza 20×10, imagen cuadrada.
  const pieza = { anchoCm: 20, altoCm: 10, anchoImagen: 500, altoImagen: 500 };
  const cubrir = colocarArte({ ...pieza, ajuste: null });
  comprobar('sin ajuste: cubre la pieza centrada (20×20, sobresale 5 cm arriba y abajo)', igual(cubrir, 0, -5, 20, 20), JSON.stringify(cubrir));
  const encajar = colocarArte({ ...pieza, ajuste: { base: 'encajar' } });
  comprobar('encajar: entra entera (10×10, centrada)', igual(encajar, 5, 0, 10, 10), JSON.stringify(encajar));
  const misma = colocarArte({ anchoCm: 20, altoCm: 10, anchoImagen: 2000, altoImagen: 1000, ajuste: null });
  comprobar('imagen con la proporción de la pieza: la llena justo', igual(misma, 0, 0, 20, 10), JSON.stringify(misma));
}

console.log('\n--- Escala, alineación y corrimiento ---');
{
  const pieza = { anchoCm: 20, altoCm: 10, anchoImagen: 100, altoImagen: 100 };
  const r = colocarArte({ ...pieza, ajuste: { escala: 50, alineacionH: 'izquierda', alineacionV: 'arriba', dxCm: 1 } });
  comprobar('50 %, arriba a la izquierda, corrida 1 cm', igual(r, 1, 0, 10, 10), JSON.stringify(r));
  const d = colocarArte({ ...pieza, ajuste: { base: 'encajar', alineacionH: 'derecha', alineacionV: 'abajo', dyCm: -2 } });
  comprobar('abajo a la derecha, subida 2 cm', igual(d, 10, -2, 10, 10), JSON.stringify(d));
  const n = normalizarAjusteArte({ escala: 'x', alineacionH: 'cualquiera', dxCm: '1.5', base: 'otra' });
  comprobar('valores raros vuelven a lo seguro', n.escala === 100 && n.alineacionH === 'centro' && n.dxCm === 1.5 && n.base === 'cubrir', JSON.stringify(n));
  comprobar('la escala tiene tope (1 % a 1000 %)', normalizarAjusteArte({ escala: 0 }).escala === 1 && normalizarAjusteArte({ escala: 5000 }).escala === 1000);
}

console.log('\n--- La copia del frontend es la misma ---');
{
  const cuerpo = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8').split('\nexport const AJUSTE_ARTE_INICIAL')[1];
  const back = cuerpo('../src/motor/colocarArte.js');
  const front = cuerpo('../../frontend/src/utilidades/colocarArte.js');
  comprobar('mismo código en backend y frontend', back && back === front);
}

console.log('\n--- PDF: la imagen va donde dice el ajuste ---');
{
  // PNG 1×1 (cuadrado).
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const CM = 28.3465;
  async function rectDeImagen(ajusteArte) {
    const bytes = await generarPdfNesting({
      anchoLienzoCm: 60, altoLienzoCm: 80,
      piezas: [{ piezaId: 'X', talla: 'm', posicion: { x: 0, y: 0 }, anchoCm: 20, altoCm: 10, imagenDataUrl: png, ajusteArte, textos: [], imagenes: [] }],
    });
    const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false }).promise;
    const ops = await (await doc.getPage(1)).getOperatorList();
    // pdf-lib arma la matriz con varios "cm" seguidos (trasladar, escalar):
    // se acumulan, respetando q/Q, hasta pintar la imagen.
    const por = (m, n) => [
      n[0] * m[0] + n[1] * m[2], n[0] * m[1] + n[1] * m[3],
      n[2] * m[0] + n[3] * m[2], n[2] * m[1] + n[3] * m[3],
      n[4] * m[0] + n[5] * m[2] + m[4], n[4] * m[1] + n[5] * m[3] + m[5],
    ];
    let actual = [1, 0, 0, 1, 0, 0];
    const pila = [];
    for (let i = 0; i < ops.fnArray.length; i++) {
      const f = ops.fnArray[i];
      if (f === pdfjs.OPS.save) pila.push(actual);
      else if (f === pdfjs.OPS.restore) actual = pila.pop() || [1, 0, 0, 1, 0, 0];
      else if (f === pdfjs.OPS.transform) actual = por(actual, ops.argsArray[i]);
      else if (f === pdfjs.OPS.paintImageXObject) return actual;
    }
    return null;
  }
  const sinAjuste = await rectDeImagen(null);
  comprobar('sin ajuste: se estira a la pieza como siempre', sinAjuste && cerca(sinAjuste[0], 20 * CM, 0.01) && cerca(sinAjuste[3], 10 * CM, 0.01), JSON.stringify(sinAjuste));
  const conAjuste = await rectDeImagen({ escala: 50, alineacionH: 'izquierda', alineacionV: 'arriba', dxCm: 1 });
  // 10×10 cm, a 1 cm del borde izquierdo y pegada arriba: en el PDF (Y desde abajo) arranca en 80-10 = 70 cm.
  comprobar('con ajuste: 10×10 cm, a 1 cm de la izquierda, pegada arriba',
    conAjuste && cerca(conAjuste[0], 10 * CM, 0.01) && cerca(conAjuste[3], 10 * CM, 0.01) && cerca(conAjuste[4], 1 * CM, 0.01) && cerca(conAjuste[5], 70 * CM, 0.01),
    JSON.stringify(conAjuste));
}

console.log('\n' + pasadas + ' pasadas, ' + fallos + ' fallos');
process.exit(fallos ? 1 : 0);
