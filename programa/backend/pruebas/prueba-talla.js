"use strict";

// ============================================================
// Zona "talla" (capsulaTalla.js): la talla de cada prenda en negro, dentro
// de un círculo / cápsula blanca, como se marca a mano en Illustrator.

import { readFileSync } from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { medidasDeCapsula, MARGEN_CAPSULA_CM, escalaDentroDelMolde } from '../src/motor/capsulaTalla.js';
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

{
  // Línea femenina: guion al final; siempre en mayúscula; sin el estilo de otras zonas.
  const fem = { ...producto, anclaje: { anclas: [ancla], zonas: [{ ...zona, generoTalla: 'femenino', colorHex: '#ff0000', espaciadoMil: 80, contorno: { activo: true, grosorCm: 0.2 } }] } };
  const pzs = resolverPiezasDePedido({
    pedido: { lineas: ['s', 'XXL'].map((talla, i) => ({ id: 'f' + i, productoId: 'pr1', talla, nombre: '', numero: '' })) },
    productos: [fem], grupos: [grupo], piezas: [{ ...pieza, dimensionesPorTalla: { ...pieza.dimensionesPorTalla, s: pieza.dimensionesPorTalla.S }, geometriaPorTalla: { ...pieza.geometriaPorTalla, s: pieza.geometriaPorTalla.S } }], disenos: [], fuentes: [],
  });
  const tf = pzs.map((p) => p.textos[0]);
  comprobar('femenina: en mayúscula y con guion (S-, XXL-)', tf.map((t) => t?.texto).join() === 'S-,XXL-', tf.map((t) => t?.texto).join());
  comprobar('la talla siempre negra, sin borde ni espaciado', tf.every((t) => t.colorHex === '#000000' && t.contornos.length === 0 && t.espaciadoMil === 0));
}

console.log('\n--- La talla no se sale del molde ---');
{
  const molde = [[0, 0], [30, 0], [30, 20], [0, 20]];
  comprobar('adentro: no se toca', escalaDentroDelMolde({ cx: 15, cy: 10, ancho: 3, alto: 1 }, molde) === 1);
  const s = escalaDentroDelMolde({ cx: 1, cy: 10, ancho: 3, alto: 1 }, molde);
  comprobar('pegada al borde: se achica justo hasta el borde', cerca(s, 2 / 3, 1e-4), s);
  const girada = escalaDentroDelMolde({ cx: 15, cy: 1, ancho: 3, alto: 1, rotacionGrados: 90 }, molde);
  comprobar('girada 90°: cuenta su alto real (3 cm) contra el borde', cerca(girada, 2 / 3, 1e-4), girada);
  // Un molde con una muesca (cóncavo) que se mete en la caja.
  const muesca = [[0, 0], [14.8, 0], [15, 9.8], [15.2, 0], [30, 0], [30, 20], [0, 20]];
  comprobar('una punta del molde que se mete en la caja también cuenta', escalaDentroDelMolde({ cx: 15, cy: 10.5, ancho: 3, alto: 2 }, muesca) < 1);
  comprobar('con el centro fuera de la pieza no se adivina', escalaDentroDelMolde({ cx: -5, cy: 10, ancho: 3, alto: 1 }, molde) === 1);

  // En el pedido: la zona a 1 cm del borde (su caja de 3 cm se sale 0.5 cm).
  const alBorde = { ...producto, anclaje: { anclas: [{ ...ancla, x: { ...ancla.x, valor: 1 } }], zonas: [zona] } };
  const [t] = resolverPiezasDePedido({
    pedido: { lineas: [{ id: 'b', productoId: 'pr1', talla: 'S', nombre: '', numero: '' }] },
    productos: [alBorde], grupos: [grupo], piezas: [pieza], disenos: [], fuentes: [],
  }).map((p) => p.textos[0]);
  // Ya no se achica (mismo tamaño en todas las piezas): se corre hacia adentro al ajustarla.
  comprobar('en el pedido la letra NO se achica: usa toda su zona', cerca(t.anchoCm, 3 - 0.2, 1e-3), t.anchoCm);
}

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

console.log('\n--- La talla mide lo mismo siempre: se corre adentro, no se achica ---');
{
  const { corrimientoDentroDelMolde } = await import('../src/motor/capsulaTalla.js');
  // Una manga con el borde de abajo curvo (más bajo al centro), como el puño.
  const contorno = [];
  for (let i = 0; i <= 20; i++) contorno.push({ x: i * 2, y: 20 + 1.5 * Math.sin((Math.PI * i) / 20) });
  contorno.push({ x: 40, y: 0 }, { x: 0, y: 0 });
  // Apoyada en el punto más bajo (20, 21.5), como se pone la talla: la caja se sale.
  const caja = { cx: 20, cy: 21.25, ancho: 1.2, alto: 0.5 };
  const { dx, dy } = corrimientoDentroDelMolde(caja, contorno);
  comprobar('sube lo justo para entrar (sin moverse de costado)', Math.abs(dx) < 0.05 && dy < 0 && dy > -0.6, dx + ',' + dy);
  comprobar('adentro no se mueve', JSON.stringify(corrimientoDentroDelMolde({ ...caja, cy: 10 }, contorno)) === '{"dx":0,"dy":0}');

  // En el PDF: S y 5XL- con la letra del MISMO alto, ambas adentro del molde.
  const pieza = (texto) => ({ id: 'p', piezaId: 'MANGA', talla: 'm', anchoCm: 40, altoCm: 21.5, contornoCm: contorno, imagenes: [],
    textos: [{ texto, cxCm: 20, cyCm: 21.25, anchoCm: 0.3, altoCm: 0.3, xCm: 0, yCm: 0, modo: 'calibrado', zonaClave: 't|' + texto,
      colorHex: '#000000', rotacionGrados: 0, fuenteUrl: null, capsula: { colorHex: '#ffffff', margenCm: MARGEN_CAPSULA_CM } }] });
  const [chica, larga] = await ajustarTextosDePiezas([pieza('S'), pieza('5XL-')], obtenerMedidor);
  const tc = chica.textos[0], tl = larga.textos[0];
  comprobar('la letra mide lo mismo con "S" que con "5XL-"', Math.abs(tc.ajuste.altoBandaCm - tl.ajuste.altoBandaCm) < 1e-9);
  const mL = medidasDeCapsula(tl.ajuste, MARGEN_CAPSULA_CM);
  comprobar('la cápsula larga envuelve todo el texto (píldora)', mL.anchoCm > mL.altoCm * 1.5 && mL.anchoCm >= tl.ajuste.tintaCm.ancho, JSON.stringify(mL));
  comprobar('y se corrió hacia adentro para entrar entera', tl.cyCm < 21.25 && escalaDentroDelMolde({ cx: tl.cxCm, cy: tl.cyCm, ancho: mL.anchoCm, alto: mL.altoCm }, contorno) === 1, tl.cyCm);
}

console.log('\n' + pasadas + ' pasadas, ' + fallos + ' fallos');
process.exit(fallos ? 1 : 0);
