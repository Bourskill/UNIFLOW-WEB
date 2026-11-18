"use strict";

// ============================================================
// Zona "talla" (capsulaTalla.js): la talla de cada prenda en negro, dentro
// de un círculo / cápsula blanca, como se marca a mano en Illustrator.

import { readFileSync } from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { medidasDeCapsula, MARGEN_CAPSULA_CM } from '../src/motor/capsulaTalla.js';
import { resolverPiezasDePedido } from '../src/motor/resolverPedido.js';
import { ajustarTextosDePiezas } from '../src/motor/ajusteTexto.js';
import { obtenerMedidor } from '../src/motor/medidorFuentes.js';
import { armarMesas } from '../src/motor/mesas.js';
import { generarPdfPaginas } from '../src/motor/exportarPdf.js';

let fallos = 0, pasadas = 0;
function comprobar(desc, cond, detalle) {
  if (cond) { pasadas++; console.log('  ✓ ' + desc); }
  else { fallos++; console.log('  ✗ ' + desc + (detalle ? '\n      ' + detalle : '')); }
}
const cerca = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

console.log('\n--- La cápsula ---');
{
  const s = medidasDeCapsula({ tintaCm: { ancho: 0.7, alto: 0.82 }, altoBandaCm: 0.8 });
  comprobar('una letra sola: un círculo (1 mm de margen)', cerca(s.anchoCm, 1.0) && cerca(s.altoCm, 1.0) && cerca(s.radioCm, 0.5), JSON.stringify(s));
  const xxl = medidasDeCapsula({ tintaCm: { ancho: 2.2, alto: 0.8 }, altoBandaCm: 0.8 });
  // Las esquinas de la primera y la última letra quedan adentro de las puntas redondas.
  const centroPunta = xxl.anchoCm / 2 - xxl.radioCm;
  const esquina = Math.hypot(2.2 / 2 - centroPunta, 0.8 / 2);
  comprobar('XXL: una cápsula más larga, del mismo alto', xxl.anchoCm > 2.2 + 2 * MARGEN_CAPSULA_CM && cerca(xxl.altoCm, 1.0), JSON.stringify(xxl));
  comprobar('las esquinas de las letras no se salen de las puntas', esquina <= xxl.radioCm + 1e-9, esquina + ' vs ' + xxl.radioCm);
  const cuerpo = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8').replace(/\r\n/g, '\n').split('\nexport const MARGEN_CAPSULA_CM')[1];
  comprobar('mismo código en backend y frontend', cuerpo('../src/motor/capsulaTalla.js') === cuerpo('../../frontend/src/utilidades/capsulaTalla.js'));
}

console.log('\n--- La zona en el pedido ---');
const pieza = {
  id: 'p1', nombre: 'MANGA', angulosPermitidos: [0, 180], tela: null,
  dimensionesPorTalla: { S: { anchoCm: 30, altoCm: 20 }, XXL: { anchoCm: 34, altoCm: 22 } },
  geometriaPorTalla: Object.fromEntries(['S', 'XXL'].map((t) => [t, {
    poligonoMm: [[0, 0], [300, 0], [300, 200], [0, 200]], boundingBoxMm: { anchoMm: 300, altoMm: 200 }, piquetesMm: [],
  }])),
};
const grupo = { id: 'g1', nombre: 'CAMISETA', piezas: [{ piezaId: 'p1', rol: 'Manga' }] };
const zona = {
  id: 'TALLA', pieza: 'Manga', anclaX: 'A1', anclaY: 'A1', tipo: 'texto', campoPedido: 'talla', colorHex: '#000000',
  ancho: { modo: 'fijo', valor: 3 }, alto: { modo: 'fijo', valor: 1 }, origen: 'centro', modoCruce: 'esquina',
  offset: { x: { modo: 'fijo', valor: 0 }, y: { modo: 'fijo', valor: 0 } }, rotacion: 0, alineacion: 'izquierda',
};
const ancla = { id: 'A1', nombre: 'A1', pieza: 'Manga', x: { ref: { tipo: 'contorno', parte: 'supIzq' }, modo: 'fijo', valor: 5 }, y: { ref: { tipo: 'contorno', parte: 'supIzq' }, modo: 'fijo', valor: 5 } };
const producto = { id: 'pr1', nombre: 'Titular', grupoIds: ['g1'], disenoId: null, anclaje: { anclas: [ancla], zonas: [zona] } };
const piezas = resolverPiezasDePedido({
  pedido: { lineas: ['S', 'XXL'].map((talla, i) => ({ id: 'l' + i, productoId: 'pr1', talla, nombre: '', numero: '' })) },
  productos: [producto], grupos: [grupo], piezas: [pieza], disenos: [], fuentes: [],
});
const textos = piezas.map((p) => p.textos[0]);
comprobar('la zona lleva la talla de cada prenda', textos.map((t) => t?.texto).join() === 'S,XXL', textos.map((t) => t?.texto).join());
comprobar('con su cápsula blanca', textos.every((t) => t.capsula?.colorHex === '#ffffff' && t.capsula.margenCm === MARGEN_CAPSULA_CM));
comprobar('la letra se ajusta a la zona menos el margen', cerca(textos[0].anchoCm, 3 - 0.2) && cerca(textos[0].altoCm, 1 - 0.2), textos[0].anchoCm + ' x ' + textos[0].altoCm);
comprobar('calibrada (mismo alto en todas las tallas) y siempre centrada', textos.every((t) => t.modo === 'calibrado' && t.alineacion === 'centro'));

console.log('\n--- En el PDF ---');
{
  const ajustadas = await ajustarTextosDePiezas(piezas, obtenerMedidor);
  comprobar('S y XXL con el mismo cuerpo', cerca(ajustadas[0].textos[0].ajuste.cuerpoCm, ajustadas[1].textos[0].ajuste.cuerpoCm, 1e-3));
  const bytes = await generarPdfPaginas(armarMesas(ajustadas));
  const lector = await pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
  const ops = await (await lector.getPage(1)).getOperatorList();
  const blanco = ops.fnArray.findIndex((f, i) => f === pdfjs.OPS.setFillRGBColor && ops.argsArray[i][0] === '#ffffff');
  const texto = ops.fnArray.indexOf(pdfjs.OPS.showText);
  comprobar('la cápsula blanca va debajo de la letra', blanco >= 0 && texto > blanco, blanco + ' / ' + texto);
  const curva = ops.fnArray.slice(blanco).findIndex((f, i) => f === pdfjs.OPS.constructPath && Array.from(ops.argsArray[blanco + i][1][0]).includes(2));
  comprobar('con las puntas redondas (curvas)', curva >= 0);
  const negro = ops.fnArray.slice(0, texto).lastIndexOf(pdfjs.OPS.setFillRGBColor);
  comprobar('la letra en negro', ops.argsArray[negro][0] === '#000000', ops.argsArray[negro][0]);
}

console.log('\n' + pasadas + ' pasadas, ' + fallos + ' fallos');
process.exit(fallos ? 1 : 0);
