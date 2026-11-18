"use strict";

// ============================================================
// Exportar una producción por tallas (motor/mesas.js): UNA mesa por talla
// con la prenda completa, del tamaño justo + 1 cm de margen, como el script
// PROCESAR MOLDES. Cada mesa es una página del PDF.

import { PDFDocument } from 'pdf-lib';
import { armarMesas, MARGEN_MESA_CM } from '../src/motor/mesas.js';
import { generarPdfPaginas } from '../src/motor/exportarPdf.js';
import { resolverPiezasDePedido } from '../src/motor/resolverPedido.js';

let fallos = 0, pasadas = 0;
function comprobar(desc, cond, detalle) {
  if (cond) { pasadas++; console.log('  ✓ ' + desc); }
  else { fallos++; console.log('  ✗ ' + desc + (detalle ? '\n      ' + detalle : '')); }
}
const CM = 28.3465;
const cerca = (a, b, tol = 0.05) => Math.abs(a - b) <= tol;

// Prenda: delantero, espalda y manga en par, en S y M (la M un poco más grande).
const pieza = (id, nombre, w, h) => ({
  id, nombre, angulosPermitidos: [0, 180], tela: null,
  dimensionesPorTalla: { S: { anchoCm: w, altoCm: h }, M: { anchoCm: w + 2, altoCm: h + 2 } },
  geometriaPorTalla: Object.fromEntries([['S', 0], ['M', 2]].map(([t, d]) => [t, {
    poligonoMm: [[0, 0], [(w + d) * 10, 0], [(w + d) * 10, (h + d) * 10], [0, (h + d) * 10]],
    boundingBoxMm: { anchoMm: (w + d) * 10, altoMm: (h + d) * 10 },
  }])),
});
const piezas = [pieza('p1', 'DEL', 50, 70), pieza('p2', 'ESP', 50, 72), pieza('p3', 'MANGA', 30, 50)];
const grupo = { id: 'g1', nombre: 'CAMISETA', piezas: [
  { piezaId: 'p1', rol: 'Delantero' }, { piezaId: 'p2', rol: 'Espalda' }, { piezaId: 'p3', rol: 'Mangas', par: true },
] };
const producto = { id: 'pr1', nombre: 'Titular', grupoIds: ['g1'], disenoId: null, anclaje: { anclas: [], zonas: [] }, bordeContraste: null };
const pedido = { lineas: ['S', 'M'].map((talla, i) => ({ id: 'l' + i, productoId: 'pr1', talla })) };
const resueltas = resolverPiezasDePedido({ pedido, productos: [producto], grupos: [grupo], piezas, disenos: [], fuentes: [] });

console.log('\n--- Una mesa por talla, con la prenda completa ---');
const mesas = armarMesas(resueltas);
{
  comprobar('dos tallas → dos mesas', mesas.length === 2 && mesas[0].talla === 'S' && mesas[1].talla === 'M', mesas.map((m) => m.talla).join());
  comprobar('cada mesa lleva sus 4 piezas (la manga ×2)', mesas.every((m) => m.piezas.length === 4));
  comprobar('y solo de su talla', mesas[0].piezas.every((p) => p.talla === 'S') && mesas[1].piezas.every((p) => p.talla === 'M'));
  const s = mesas[0];
  // Fila 1: DEL 50 + ESP 50 + MANGA 30, separadas 1 cm, con 1 cm de margen: 1+50+1+50+1+30+1 = 134.
  // Fila 2: el otro lado de la manga. Alto: 1 + 72 + 1 + 50 + 1 = 125.
  comprobar('ancho justo + margen (134 cm)', cerca(s.anchoLienzoCm, 134), s.anchoLienzoCm);
  comprobar('alto justo + margen (125 cm)', cerca(s.altoLienzoCm, 125), s.altoLienzoCm);
  comprobar('la primera pieza a 1 cm del borde', s.piezas[0].posicion.x === MARGEN_MESA_CM && s.piezas[0].posicion.y === MARGEN_MESA_CM);
  comprobar('el otro lado de la manga empieza la segunda fila', cerca(s.piezas[3].posicion.y, 74) && s.piezas[3].posicion.x === 1);
  const seSolapan = s.piezas.some((a, i) => s.piezas.some((b, j) => i < j &&
    a.posicion.x < b.posicion.x + b.anchoCm && b.posicion.x < a.posicion.x + a.anchoCm &&
    a.posicion.y < b.posicion.y + b.altoCm && b.posicion.y < a.posicion.y + a.altoCm));
  comprobar('ninguna pieza pisa a otra', !seSolapan);
  comprobar('todas adentro de la mesa', s.piezas.every((p) => p.posicion.x + p.anchoCm <= s.anchoLienzoCm && p.posicion.y + p.altoCm <= s.altoLienzoCm));
}

console.log('\n--- El PDF: una página por mesa, de su tamaño ---');
{
  const doc = await PDFDocument.load(await generarPdfPaginas(mesas));
  comprobar('dos páginas', doc.getPageCount() === 2);
  const [a, b] = doc.getPages().map((p) => p.getSize());
  comprobar('cada página mide lo que su mesa', cerca(a.width / CM, mesas[0].anchoLienzoCm) && cerca(b.height / CM, mesas[1].altoLienzoCm),
    JSON.stringify([a.width / CM, b.height / CM]));
}

console.log('\n' + pasadas + ' pasadas, ' + fallos + ' fallos');
process.exit(fallos ? 1 : 0);
