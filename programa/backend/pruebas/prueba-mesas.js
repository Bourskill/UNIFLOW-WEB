"use strict";

// ============================================================
// Exportar una producción (motor/mesas.js) como el script PROCESAR MOLDES:
// UNA mesa por pieza (Molde_1, Molde_2...), del tamaño justo + 1 cm de
// margen, con su contorno láser (1 mm afuera) y sus piquetes sueltos.
// Cada mesa es una página del PDF.

import { PDFDocument } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { armarMesas, MARGEN_MESA_CM, CONTORNO_LASER_POR_DEFECTO } from '../src/motor/mesas.js';
import { generarPdfPaginas } from '../src/motor/exportarPdf.js';
import { resolverPiezasDePedido } from '../src/motor/resolverPedido.js';

let fallos = 0, pasadas = 0;
function comprobar(desc, cond, detalle) {
  if (cond) { pasadas++; console.log('  ✓ ' + desc); }
  else { fallos++; console.log('  ✗ ' + desc + (detalle ? '\n      ' + detalle : '')); }
}
const CM = 28.3465;
const cerca = (a, b, tol = 0.05) => Math.abs(a - b) <= tol;

// Prenda: delantero (con un piquete suelto), espalda y manga en par, en S y M.
const pieza = (id, nombre, w, h, piquetes = []) => ({
  id, nombre, angulosPermitidos: [0, 180], tela: null,
  dimensionesPorTalla: { S: { anchoCm: w, altoCm: h }, M: { anchoCm: w + 2, altoCm: h + 2 } },
  geometriaPorTalla: Object.fromEntries([['S', 0], ['M', 2]].map(([t, d]) => [t, {
    poligonoMm: [[0, 0], [(w + d) * 10, 0], [(w + d) * 10, (h + d) * 10], [0, (h + d) * 10]],
    boundingBoxMm: { anchoMm: (w + d) * 10, altoMm: (h + d) * 10 },
    piquetesMm: piquetes,
  }])),
});
const piezas = [
  pieza('p1', 'DEL', 50, 70, [{ xMm: 250, yMm: 5, anchoMm: 4, altoMm: 10 }]),
  pieza('p2', 'ESP', 50, 72), pieza('p3', 'MANGA', 30, 50),
];
const grupo = { id: 'g1', nombre: 'CAMISETA', piezas: [
  { piezaId: 'p1', rol: 'Delantero' }, { piezaId: 'p2', rol: 'Espalda' }, { piezaId: 'p3', rol: 'Mangas', par: true },
] };
const producto = { id: 'pr1', nombre: 'Titular', grupoIds: ['g1'], disenoId: null, anclaje: { anclas: [], zonas: [] }, bordeContraste: null };
const resolver = (tallas, prod = producto) => resolverPiezasDePedido({
  pedido: { lineas: tallas.map((talla, i) => ({ id: 'l' + i, productoId: prod.id, talla })) },
  productos: [prod], grupos: [grupo], piezas, disenos: [], fuentes: [],
});

console.log('\n--- Una mesa por pieza, talla por talla ---');
const mesas = armarMesas(resolver(['S', 'M']));
{
  comprobar('2 tallas × 4 piezas (la manga ×2) = 8 mesas', mesas.length === 8, mesas.length);
  comprobar('primero todas las de S, después las de M', mesas.map((m) => m.talla).join() === 'S,S,S,S,M,M,M,M');
  comprobar('numeradas por talla, como Molde_1, Molde_2...', mesas[0].nombre === '01 - Delantero' && mesas[3].nombre === '04 - Mangas (otro lado)' && mesas[4].nombre === '01 - Delantero',
    mesas.map((m) => m.nombre).join(' | '));
  comprobar('cada mesa lleva una sola pieza', mesas.every((m) => m.piezas.length === 1));
  comprobar('mide la pieza + 1 cm por lado (delantero S: 52 × 72)', cerca(mesas[0].anchoLienzoCm, 52) && cerca(mesas[0].altoLienzoCm, 72),
    mesas[0].anchoLienzoCm + 'x' + mesas[0].altoLienzoCm);
  comprobar('la pieza a 1 cm del borde', mesas[0].piezas[0].posicion.x === MARGEN_MESA_CM && mesas[0].piezas[0].posicion.y === MARGEN_MESA_CM);
  comprobar('sin contorno propio: el del script (1 mm afuera, 0,1 cm)', mesas[0].piezas[0].bordeContraste === CONTORNO_LASER_POR_DEFECTO);
  const propio = { activo: true, colorHex: '#ff0000', grosorCm: 0.05, desplazamientoCm: 0.2 };
  const conPropio = armarMesas(resolver(['S'], { ...producto, bordeContraste: propio }));
  comprobar('con contorno propio activado: se respeta', conPropio[0].piezas[0].bordeContraste === propio);
}

console.log('\n--- El PDF: una página por mesa, contorno cerrado y piquetes ---');
{
  const bytes = await generarPdfPaginas(mesas);
  const doc = await PDFDocument.load(bytes);
  comprobar('8 páginas', doc.getPageCount() === 8);
  const t = doc.getPages()[0].getSize();
  comprobar('cada página mide lo que su mesa', cerca(t.width / CM, 52) && cerca(t.height / CM, 72), JSON.stringify([t.width / CM, t.height / CM]));

  const lector = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false }).promise;
  const ops = await (await lector.getPage(1)).getOperatorList();
  const trazos = ops.fnArray.filter((f) => f === pdfjs.OPS.stroke || f === pdfjs.OPS.closeStroke).length;
  const caminos = ops.fnArray.filter((f) => f === pdfjs.OPS.constructPath).length;
  comprobar('el contorno es UN trazado (no segmentos sueltos) + el piquete', caminos === 2, 'paths ' + caminos + ', strokes ' + trazos);
  // Sin piquetes, la espalda solo tiene el contorno.
  const opsEsp = await (await lector.getPage(2)).getOperatorList();
  const caminosEsp = opsEsp.fnArray.filter((f) => f === pdfjs.OPS.constructPath).length;
  comprobar('la pieza sin piquetes lleva un trazado menos', caminosEsp === caminos - 1, caminosEsp + ' vs ' + caminos);
  comprobar('no se dibuja el rectángulo de la caja', caminosEsp === 1, caminosEsp);
}

console.log('\n' + pasadas + ' pasadas, ' + fallos + ' fallos');
process.exit(fallos ? 1 : 0);
