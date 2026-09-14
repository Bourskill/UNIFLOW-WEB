"use strict";

// ============================================================
// Pruebas de piezas "talla única" en producción (motor/resolverPedido.js).
// ============================================================
// La pregunta que responden: si una prenda tiene piezas que SÍ escalan
// (S/M/L) junto con una pieza marcada `tallaUnica: true` (una sola talla
// cargada, ej. una vela que es igual en cualquier talla), ¿un pedido en
// talla "M" logra resolver esa pieza igual, usando su única geometría? Y
// si la pieza tiene VARIAS tallas cargadas pero ninguna coincide con la
// pedida, ¿sigue fallando explícito? Y el caso que de verdad importa: una
// pieza con una sola talla cargada pero SIN marcar `tallaUnica` (el estado
// real de una pieza a mitad de subir sus tallas de a una) -- ¿sigue
// fallando en vez de usar esa talla como si fuera la única de verdad?
// Confundir esos dos casos sería sustituir en silencio una talla real que
// todavía no se cargó, justo el error que este proyecto no perdona.
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

// No escala Y está marcada como tal: una sola talla cargada, con un nombre
// que ni siquiera está en la lista de tallas del pedido -- a propósito,
// para probar que el nombre de la talla no importa, solo que esté marcada
// y sea la única que tiene.
var piezaUnica = {
  id: 'pieza-vela', nombre: 'Vela', angulosPermitidos: [0, 180], tela: null,
  dimensionesPorTalla: { UNICA: { anchoCm: 8, altoCm: 8 } },
  geometriaPorTalla: { UNICA: poligono(80, 80) },
  tallaUnica: true,
};

// Dato real faltante (no es talla única -- tiene varias, pero falta la M).
var piezaIncompleta = {
  id: 'pieza-incompleta', nombre: 'Incompleta', angulosPermitidos: [0, 180], tela: null,
  dimensionesPorTalla: { S: { anchoCm: 10, altoCm: 10 }, L: { anchoCm: 12, altoCm: 12 } },
  geometriaPorTalla: { S: poligono(100, 100), L: poligono(120, 120) },
};

// El caso peligroso: UNA sola talla cargada (igual que piezaUnica) pero SIN
// marcar `tallaUnica` -- el estado real de una pieza a mitad de subir sus
// tallas de a una (PUT /piezas/:id/tallas/:talla). Tiene que fallar exacto
// igual que piezaIncompleta, NUNCA comportarse como piezaUnica solo porque
// la cuenta da 1.
var piezaAMedioSubir = {
  id: 'pieza-a-medio-subir', nombre: 'AMedioSubir', angulosPermitidos: [0, 180], tela: null,
  dimensionesPorTalla: { S: { anchoCm: 10, altoCm: 10 } },
  geometriaPorTalla: { S: poligono(100, 100) },
};

var grupo = {
  id: 'grupo-1', nombre: 'Camiseta',
  piezas: [{ piezaId: 'pieza-delantero', rol: 'Delantero' }, { piezaId: 'pieza-vela', rol: 'Vela' }],
};
var grupoIncompleto = {
  id: 'grupo-2', nombre: 'Camiseta rota',
  piezas: [{ piezaId: 'pieza-incompleta', rol: 'Incompleta' }],
};
var grupoAMedioSubir = {
  id: 'grupo-3', nombre: 'Camiseta a medio subir',
  piezas: [{ piezaId: 'pieza-a-medio-subir', rol: 'AMedioSubir' }],
};

var producto = {
  id: 'producto-1', nombre: 'Titular', grupoId: 'grupo-1', disenoId: null,
  anclaje: { anclas: [], zonas: [] }, bordeContraste: null,
};
var productoRoto = {
  id: 'producto-2', nombre: 'Roto', grupoId: 'grupo-2', disenoId: null,
  anclaje: { anclas: [], zonas: [] }, bordeContraste: null,
};
var productoAMedioSubir = {
  id: 'producto-3', nombre: 'AMedioSubir', grupoId: 'grupo-3', disenoId: null,
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

console.log('\n--- Una sola talla cargada pero SIN marcar tallaUnica: sigue fallando (no es lo mismo que talla única de verdad) ---');
(function () {
  var pedido = { lineas: [{ id: 'l3', productoId: 'producto-3', talla: 'M', nombre: 'PEÑA', numero: '7' }] };
  var tiroError = false, mensaje = '';
  try {
    resolverPiezasDePedido({
      pedido, productos: [productoAMedioSubir], grupos: [grupoAMedioSubir], piezas: [piezaAMedioSubir], disenos: [],
    });
  } catch (e) {
    tiroError = true;
    mensaje = e.message;
  }
  comprobar('Tira un error -- NO usa la única talla cargada como si fuera "talla única"', tiroError);
  comprobar('El mensaje menciona la pieza y la talla pedida', mensaje.indexOf('AMedioSubir') !== -1 && mensaje.indexOf('M') !== -1, mensaje);
})();

console.log('\n' + pasadas + ' pasadas · ' + fallos + ' fallidas');
if (fallos > 0) process.exit(1);
