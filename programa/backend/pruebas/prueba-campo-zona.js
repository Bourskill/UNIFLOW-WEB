"use strict";

// ============================================================
// Qué lleva cada zona de texto (campoDeZona.js) y el "ejemplo" al exportar:
// Diseño y la exportación tienen que leer IGUAL cada zona, para que lo que
// se ve en Diseño (el 26 del dorsal) salga en el PDF.

import { readFileSync } from 'node:fs';
import { campoDeZona } from '../src/motor/campoDeZona.js';
import { resolverPiezasDePedido } from '../src/motor/resolverPedido.js';

let fallos = 0, pasadas = 0;
function comprobar(desc, cond, detalle) {
  if (cond) { pasadas++; console.log('  ✓ ' + desc); }
  else { fallos++; console.log('  ✗ ' + desc + (detalle ? '\n      ' + detalle : '')); }
}

console.log('\n--- Qué lleva una zona ---');
comprobar('con "Qué va aquí" guardado: eso', campoDeZona({ campoPedido: 'talla' }) === 'talla' && campoDeZona({ campoPedido: 'fijo', tipo: 'numero' }) === 'fijo');
comprobar('sin guardar, tipo número (plantilla vieja): el número', campoDeZona({ tipo: 'numero', valorEjemplo: '26' }) === 'numero');
comprobar('sin guardar, con texto fijo: texto fijo', campoDeZona({ tipo: 'texto', valorFijo: 'BOGOTÁ' }) === 'fijo');
comprobar('sin guardar y sin texto fijo: el nombre', campoDeZona({ tipo: 'texto', valorEjemplo: 'PEÑA' }) === 'nombre');
{
  const cuerpo = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8').replace(/\r\n/g, '\n').split('\nexport function campoDeZona')[1];
  comprobar('mismo código en backend y frontend', cuerpo('../src/motor/campoDeZona.js') === cuerpo('../../frontend/src/utilidades/campoDeZona.js'));
}

console.log('\n--- Exportar con el ejemplo ---');
const pieza = {
  id: 'p1', nombre: 'ESPALDA', angulosPermitidos: [0, 180], tela: null,
  dimensionesPorTalla: { L: { anchoCm: 60, altoCm: 70 } },
  geometriaPorTalla: { L: { poligonoMm: [[0, 0], [600, 0], [600, 700], [0, 700]], boundingBoxMm: { anchoMm: 600, altoMm: 700 }, piquetesMm: [] } },
};
const grupo = { id: 'g1', nombre: 'CAMISETA', piezas: [{ piezaId: 'p1', rol: 'Espalda' }] };
const zona = (id, extra, offsetY) => ({
  id, pieza: 'Espalda', anclaX: 'A1', anclaY: 'A1', ancho: { modo: 'fijo', valor: 30 }, alto: { modo: 'fijo', valor: 6 },
  origen: 'centro', modoCruce: 'esquina', offset: { x: { modo: 'fijo', valor: 0 }, y: { modo: 'fijo', valor: offsetY } }, rotacion: 0, ...extra,
});
const ancla = { id: 'A1', nombre: 'A1', pieza: 'Espalda', x: { ref: { tipo: 'contorno', parte: 'supIzq' }, modo: 'fijo', valor: 30 }, y: { ref: { tipo: 'contorno', parte: 'supIzq' }, modo: 'fijo', valor: 10 } };
const producto = {
  id: 'pr1', nombre: 'Titular', grupoIds: ['g1'], disenoId: null,
  anclaje: { anclas: [ancla], zonas: [
    zona('CIUDAD', { tipo: 'texto', campoPedido: 'fijo', valorFijo: 'BOGOTÁ' }, 0),
    // Una zona de número traída de una plantilla vieja: sin "Qué va aquí".
    zona('DORSAL', { tipo: 'numero', valorEjemplo: '26' }, 15),
    zona('NOMBRE', { tipo: 'texto', campoPedido: 'nombre', valorEjemplo: 'PEÑA' }, 30),
  ] },
};
const resolver = (conEjemplo) => resolverPiezasDePedido({
  pedido: { lineas: [{ id: 'l1', productoId: 'pr1', talla: 'L', nombre: '', numero: '', conEjemplo }] },
  productos: [producto], grupos: [grupo], piezas: [pieza], disenos: [], fuentes: [],
})[0].textos.map((t) => t.texto);
comprobar('con el ejemplo: el texto fijo, el 26 y el nombre, como en Diseño', resolver(true).join('|') === 'BOGOTÁ|26|PEÑA', resolver(true).join('|'));
comprobar('sin el ejemplo: solo el texto fijo', resolver(false).join('|') === 'BOGOTÁ', resolver(false).join('|'));
{
  // Un pedido real: lo que dice el pedido, no el ejemplo.
  const real = resolverPiezasDePedido({
    pedido: { lineas: [{ id: 'l1', productoId: 'pr1', talla: 'L', nombre: 'GÓMEZ', numero: '9' }] },
    productos: [producto], grupos: [grupo], piezas: [pieza], disenos: [], fuentes: [],
  })[0].textos;
  comprobar('en un pedido real, el número y el nombre del pedido', real.map((t) => t.texto).join('|') === 'BOGOTÁ|9|GÓMEZ', real.map((t) => t.texto).join('|'));
  comprobar('el número va calibrado como número', real[1].modo === 'calibrado');
}

console.log('\n' + pasadas + ' pasadas, ' + fallos + ' fallos');
process.exit(fallos ? 1 : 0);
