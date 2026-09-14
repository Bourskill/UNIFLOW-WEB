"use strict";

// ============================================================
// Pruebas de Productos multi-prenda ("kit": varias prendas en un solo
// armado, ej. camiseta + short) -- motor/resolverPedido.js.
// ============================================================
// La pregunta que responden: si dos prendas combinadas en un mismo
// Producto tienen, por casualidad, un rol con el MISMO nombre (ej. las dos
// tienen un "Delantero"), ¿el motor sigue distinguiéndolos y resolviendo
// la geometría correcta de cada uno? Ese es el riesgo real que hizo
// separar esto en una entrega aparte: el resto del motor (resolver.js,
// referencias.js, grafo.js) usa el nombre del rol como clave plana en
// objetos -- sin namespacear, la segunda prenda pisaría en silencio la
// geometría de la primera.
//
// Y, ya que se toca: ¿un Producto de UNA sola prenda (grupoId, el caso de
// siempre) sigue viendo exactamente lo mismo que antes? Namespacear ahí
// también hubiera roto cada Producto ya guardado (sus anclas/zonas
// referencian el rol crudo, sin namespace).
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

// Dos prendas distintas, cada una con un rol llamado "Delantero" -- a
// propósito, el caso peligroso.
var piezaDelanteroCamiseta = {
  id: 'pieza-delantero-camiseta', nombre: 'Delantero camiseta', angulosPermitidos: [0, 180], tela: null,
  dimensionesPorTalla: { M: { anchoCm: 42, altoCm: 52 } },
  geometriaPorTalla: { M: poligono(420, 520) },
};
var piezaEspaldaCamiseta = {
  id: 'pieza-espalda-camiseta', nombre: 'Espalda camiseta', angulosPermitidos: [0, 180], tela: null,
  dimensionesPorTalla: { M: { anchoCm: 41, altoCm: 51 } },
  geometriaPorTalla: { M: poligono(410, 510) },
};
var piezaDelanteroShort = {
  id: 'pieza-delantero-short', nombre: 'Delantero short', angulosPermitidos: [0, 180], tela: null,
  dimensionesPorTalla: { M: { anchoCm: 30, altoCm: 25 } },
  geometriaPorTalla: { M: poligono(300, 250) },
};

var grupoCamiseta = {
  id: 'grupo-camiseta', nombre: 'Camiseta',
  piezas: [{ piezaId: 'pieza-delantero-camiseta', rol: 'Delantero' }, { piezaId: 'pieza-espalda-camiseta', rol: 'Espalda' }],
};
var grupoShort = {
  id: 'grupo-short', nombre: 'Short',
  piezas: [{ piezaId: 'pieza-delantero-short', rol: 'Delantero' }], // mismo nombre de rol que la camiseta, a propósito
};

var todasLasPiezas = [piezaDelanteroCamiseta, piezaEspaldaCamiseta, piezaDelanteroShort];
var todosLosGrupos = [grupoCamiseta, grupoShort];

console.log('\n--- Kit (camiseta + short) con roles "Delantero" repetidos: cada uno resuelve SU PROPIA geometría, sin pisarse ---');
(function () {
  var productoKit = {
    id: 'producto-kit', nombre: 'Kit titular', grupoIds: ['grupo-camiseta', 'grupo-short'], disenoId: null,
    anclaje: { anclas: [], zonas: [] }, bordeContraste: null,
  };
  var pedido = { lineas: [{ id: 'l1', productoId: 'producto-kit', talla: 'M', nombre: 'PEÑA', numero: '7' }] };
  var piezasParaAnidar = resolverPiezasDePedido({
    pedido, productos: [productoKit], grupos: todosLosGrupos, piezas: todasLasPiezas, disenos: [],
  });

  comprobar('Salen las 3 piezas del kit (2 de camiseta + 1 de short)', piezasParaAnidar.length === 3,
    'salieron ' + piezasParaAnidar.length);

  var delanteroCamiseta = piezasParaAnidar.find(function (p) { return p.anchoCm === 42; });
  var delanteroShort = piezasParaAnidar.find(function (p) { return p.anchoCm === 30; });
  comprobar('El "Delantero" de la camiseta tiene SU medida (42x52), no la del short',
    !!delanteroCamiseta && delanteroCamiseta.altoCm === 52);
  comprobar('El "Delantero" del short tiene SU medida (30x25), no la de la camiseta',
    !!delanteroShort && delanteroShort.altoCm === 25);
  comprobar('Ninguna pieza quedó pisada/perdida por el nombre de rol repetido',
    !!delanteroCamiseta && !!delanteroShort && delanteroCamiseta !== delanteroShort);

  comprobar('La etiqueta visible (piezaId) del delantero de la camiseta nombra la prenda, no un id crudo',
    delanteroCamiseta.piezaId === 'Camiseta · Delantero', delanteroCamiseta.piezaId);
  comprobar('La etiqueta visible del delantero del short también nombra SU prenda',
    delanteroShort.piezaId === 'Short · Delantero', delanteroShort.piezaId);
})();

console.log('\n--- Producto de UNA sola prenda (grupoId, el caso de siempre): idéntico a antes de esta entrega ---');
(function () {
  var productoSimple = {
    id: 'producto-simple', nombre: 'Camiseta suelta', grupoId: 'grupo-camiseta', disenoId: null,
    anclaje: { anclas: [], zonas: [] }, bordeContraste: null,
  };
  var pedido = { lineas: [{ id: 'l2', productoId: 'producto-simple', talla: 'M', nombre: 'PEÑA', numero: '7' }] };
  var piezasParaAnidar = resolverPiezasDePedido({
    pedido, productos: [productoSimple], grupos: todosLosGrupos, piezas: todasLasPiezas, disenos: [],
  });

  comprobar('Salen las 2 piezas de la camiseta sola', piezasParaAnidar.length === 2);
  var delantero = piezasParaAnidar.find(function (p) { return p.anchoCm === 42; });
  comprobar('La etiqueta visible es SOLO el rol, sin prefijo de prenda (una sola prenda, no hace falta)',
    !!delantero && delantero.piezaId === 'Delantero', delantero && delantero.piezaId);
})();

console.log('\n--- Un producto que combina prendas donde una ya no existe: falla explícito ---');
(function () {
  var productoRoto = {
    id: 'producto-roto', nombre: 'Kit roto', grupoIds: ['grupo-camiseta', 'grupo-que-no-existe'], disenoId: null,
    anclaje: { anclas: [], zonas: [] }, bordeContraste: null,
  };
  var pedido = { lineas: [{ id: 'l3', productoId: 'producto-roto', talla: 'M', nombre: 'PEÑA', numero: '7' }] };
  var tiroError = false, mensaje = '';
  try {
    resolverPiezasDePedido({ pedido, productos: [productoRoto], grupos: todosLosGrupos, piezas: todasLasPiezas, disenos: [] });
  } catch (e) {
    tiroError = true;
    mensaje = e.message;
  }
  comprobar('Tira un error en vez de generar el kit a medias', tiroError);
  comprobar('El mensaje menciona el producto', mensaje.indexOf('Kit roto') !== -1, mensaje);
})();

console.log('\n' + pasadas + ' pasadas · ' + fallos + ' fallidas');
if (fallos > 0) process.exit(1);
