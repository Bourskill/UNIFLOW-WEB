"use strict";

// ============================================================
// Pruebas de piezas "talla única" en producción (motor/resolverPedido.js).
// ============================================================
// La pregunta que responden: si una prenda tiene piezas que SÍ escalan
// (S/M/L) junto con una pieza que NO escala (una sola talla cargada, ej.
// una vela que es igual en cualquier talla), ¿un pedido en talla "M" logra
// resolver esa pieza igual, usando su única geometría? Y si la pieza tiene
// VARIAS tallas cargadas pero ninguna coincide con la pedida, ¿sigue
// fallando explícito (nunca se inventa una talla que no está cargada)?
//
// Correr con: npm run prueba (desde programa/backend).

import { resolverPiezasDePedido } from '../src/motor/resolverPedido.js';

var fallos = 0, pasadas = 0;
function comprobar(desc, cond, detalle) {
  if (cond) { pasadas++; console.log("  ✓ " + desc); }
  else { fallos++; console.log("  ✗ " + desc + (detalle ? "\n      " + detalle : "")); }
}

function poligono(anchoMm, altoMm) {
  return { poligonoMm: [[0, 0], [anchoMm, 0], [anchoMm, altoMm], [0, altoMm]] };
}

var piezaEscala = {
  id: 'pieza-delantero', nombre: 'Delantero', angulosPermitidos: [0, 180], tela: null,
  dimensionesPorTalla: { S: { anchoCm: 40, altoCm: 50 }, M: { anchoCm: 42, altoCm: 52 }, L: { anchoCm: 44, altoCm: 54 } },
  geometriaPorTalla: { S: poligono(400, 500), M: poligono(420, 520), L: poligono(440, 540) },
};

// No escala: una sola talla cargada, con un nombre que ni siquiera está en
// la lista de tallas del pedido -- a propósito, para probar que el nombre
// de la talla no importa, solo que sea la única que tiene.
var piezaUnica = {
  id: 'pieza-vela', nombre: 'Vela', angulosPermitidos: [0, 180], tela: null,
  dimensionesPorTalla: { UNICA: { anchoCm: 8, altoCm: 8 } },
  geometriaPorTalla: { UNICA: poligono(80, 80) },
};

// Dato real faltante (no es talla única -- tiene varias, pero falta la M).
var piezaIncompleta = {
  id: 'pieza-incompleta', nombre: 'Incompleta', angulosPermitidos: [0, 180], tela: null,
  dimensionesPorTalla: { S: { anchoCm: 10, altoCm: 10 }, L: { anchoCm: 12, altoCm: 12 } },
  geometriaPorTalla: { S: poligono(100, 100), L: poligono(120, 120) },
};

var grupo = {
  id: 'grupo-1', nombre: 'Camiseta',
  piezas: [{ piezaId: 'pieza-delantero', rol: 'Delantero' }, { piezaId: 'pieza-vela', rol: 'Vela' }],
};
var grupoIncompleto = {
  id: 'grupo-2', nombre: 'Camiseta rota',
  piezas: [{ piezaId: 'pieza-incompleta', rol: 'Incompleta' }],
};

var producto = {
  id: 'producto-1', nombre: 'Titular', grupoId: 'grupo-1', disenoId: null,
  anclaje: { anclas: [], zonas: [] }, bordeContraste: null,
};
var productoRoto = {
  id: 'producto-2', nombre: 'Roto', grupoId: 'grupo-2', disenoId: null,
  anclaje: { anclas: [], zonas: [] }, bordeContraste: null,
};

console.log('\n--- Pieza talla única junto a piezas que sí escalan: el pedido en "M" resuelve igual ---');
(function () {
  var pedido = { lineas: [{ id: 'l1', productoId: 'producto-1', talla: 'M', nombre: 'PEÑA', numero: '7' }] };
  var piezasParaAnidar = resolverPiezasDePedido({
    pedido, productos: [producto], grupos: [grupo], piezas: [piezaEscala, piezaUnica], disenos: [],
  });

  var delantero = piezasParaAnidar.filter(function (p) { return p.piezaId === 'Delantero'; })[0];
  var vela = piezasParaAnidar.filter(function (p) { return p.piezaId === 'Vela'; })[0];

  comprobar('La pieza que escala usa la talla M pedida (42x52)',
    !!delantero && delantero.anchoCm === 42 && delantero.altoCm === 52);
  comprobar('La pieza talla única resuelve igual (usa su única geometría, 8x8)',
    !!vela && vela.anchoCm === 8 && vela.altoCm === 8);
  comprobar('La pieza talla única queda etiquetada con la talla del PEDIDO (M), no con "UNICA"',
    !!vela && vela.talla === 'M');
})();

console.log('\n--- Pieza con VARIAS tallas cargadas pero sin la pedida: sigue fallando explícito ---');
(function () {
  var pedido = { lineas: [{ id: 'l2', productoId: 'producto-2', talla: 'M', nombre: 'PEÑA', numero: '7' }] };
  var tiroError = false, mensaje = '';
  try {
    resolverPiezasDePedido({
      pedido, productos: [productoRoto], grupos: [grupoIncompleto], piezas: [piezaIncompleta], disenos: [],
    });
  } catch (e) {
    tiroError = true;
    mensaje = e.message;
  }
  comprobar('Tira un error en vez de inventar una talla', tiroError);
  comprobar('El mensaje menciona la pieza y la talla pedida', mensaje.indexOf('Incompleta') !== -1 && mensaje.indexOf('M') !== -1, mensaje);
})();

console.log('\n' + pasadas + ' pasadas · ' + fallos + ' fallidas');
if (fallos > 0) process.exit(1);
