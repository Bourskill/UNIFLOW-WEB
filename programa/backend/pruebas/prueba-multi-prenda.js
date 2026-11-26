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

console.log('\n--- Conjuntos (dama / caballero) en UNA producción: cada jugador lleva solo las prendas de su conjunto ---');
(function () {
  // Camiseta de dama solo en S; short de caballero solo en XL -- cada
  // conjunto sale en SUS tallas, sin que el otro lo frene.
  var piezaDama = { id: 'pz-dama', nombre: 'Frente dama', angulosPermitidos: [0], tela: null,
    dimensionesPorTalla: { S: { anchoCm: 38, altoCm: 50 } }, geometriaPorTalla: { S: poligono(380, 500) } };
  var piezaCaballero = { id: 'pz-cab', nombre: 'Frente caballero', angulosPermitidos: [0], tela: null,
    dimensionesPorTalla: { XL: { anchoCm: 50, altoCm: 60 } }, geometriaPorTalla: { XL: poligono(500, 600) } };
  var gDama = { id: 'g-dama', nombre: 'Camiseta dama', piezas: [{ piezaId: 'pz-dama', rol: 'Frente' }] };
  var gCab = { id: 'g-cab', nombre: 'Camiseta caballero', piezas: [{ piezaId: 'pz-cab', rol: 'Frente' }] };
  // Una zona en cada prenda (clave grupoId::rol): la del otro conjunto no tiene que estorbar.
  var anclaje = {
    anclas: [
      { id: 'A1', pieza: 'g-dama::Frente', x: { ref: { tipo: 'contorno', parte: 'centro' }, modo: 'fijo', valor: 0 }, y: { ref: { tipo: 'contorno', parte: 'centro' }, modo: 'fijo', valor: 0 } },
      { id: 'A2', pieza: 'g-cab::Frente', x: { ref: { tipo: 'contorno', parte: 'centro' }, modo: 'fijo', valor: 0 }, y: { ref: { tipo: 'contorno', parte: 'centro' }, modo: 'fijo', valor: 0 } },
    ],
    zonas: [
      { id: 'Z1', pieza: 'g-dama::Frente', tipo: 'texto', anclaX: 'A1', anclaY: 'A1', origen: 'centro', ancho: { modo: 'fijo', valor: 20 }, alto: { modo: 'fijo', valor: 5 }, campoPedido: 'nombre' },
      { id: 'Z2', pieza: 'g-cab::Frente', tipo: 'texto', anclaX: 'A2', anclaY: 'A2', origen: 'centro', ancho: { modo: 'fijo', valor: 20 }, alto: { modo: 'fijo', valor: 5 }, campoPedido: 'nombre' },
    ],
  };
  var producto = { id: 'p-mixta', nombre: 'Mixta', grupoIds: ['g-dama', 'g-cab'], disenoId: null, anclaje: anclaje, bordeContraste: null,
    conjuntos: [{ id: 'cd', nombre: 'Dama', grupoIds: ['g-dama'] }, { id: 'cc', nombre: 'Caballero', grupoIds: ['g-cab'] }] };
  var pedido = { lineas: [
    { id: 'l1', productoId: 'p-mixta', conjuntoId: 'cd', talla: 'S', nombre: 'ANA', numero: '1' },
    { id: 'l2', productoId: 'p-mixta', conjuntoId: 'cc', talla: 'XL', nombre: 'LUIS', numero: '2' },
  ] };
  var r, error = null;
  try { r = resolverPiezasDePedido({ pedido, productos: [producto], grupos: [gDama, gCab], piezas: [piezaDama, piezaCaballero], disenos: [] }); }
  catch (e) { error = e.message; }
  comprobar('Cada jugador sale en su talla aunque el otro conjunto no la tenga', !error, error);
  if (error) return;
  var deAna = r.filter(function (p) { return p.lineaPedidoId === 'l1'; });
  var deLuis = r.filter(function (p) { return p.lineaPedidoId === 'l2'; });
  comprobar('La de dama lleva solo la camiseta de dama', deAna.length === 1 && deAna[0].anchoCm === 38, JSON.stringify(deAna.map(function (p) { return p.piezaId; })));
  comprobar('El de caballero lleva solo la de caballero', deLuis.length === 1 && deLuis[0].anchoCm === 50, JSON.stringify(deLuis.map(function (p) { return p.piezaId; })));
  comprobar('Las piezas se siguen llamando con su prenda', /Camiseta dama/.test(deAna[0].piezaId), deAna[0].piezaId);
  var sinConjunto = resolverPiezasDePedido({ pedido: { lineas: [{ id: 'l3', productoId: 'p-mixta', talla: 'S', nombre: 'X', numero: '' }] },
    productos: [producto], grupos: [gDama, gCab], piezas: [piezaDama, piezaCaballero], disenos: [] });
  comprobar('Una línea sin conjunto elegido usa el primero', sinConjunto.length === 1 && sinConjunto[0].anchoCm === 38);

  // Sin conjuntos, con una hoja del Excel por prenda: el jugador de la hoja
  // "Masculino" saca las piezas de dama. Su talla (XL) solo la tiene la de
  // caballero, y aun así sale, con la zona de su prenda.
  var sinConjuntos = Object.assign({}, producto, { conjuntos: undefined });
  var soloCab, errorSolo = null;
  try {
    soloCab = resolverPiezasDePedido({ pedido: { lineas: [{ id: 'l4', productoId: 'p-mixta', talla: 'XL', nombre: 'LUIS', numero: '', piezasExcluidas: ['g-dama::Frente'] }] },
      productos: [sinConjuntos], grupos: [gDama, gCab], piezas: [piezaDama, piezaCaballero], disenos: [] });
  } catch (e) { errorSolo = e.message; }
  comprobar('"Solo una prenda": sale en una talla que la otra prenda no tiene', !errorSolo && soloCab.length === 1 && soloCab[0].anchoCm === 50, errorSolo || JSON.stringify(soloCab.map(function (p) { return p.piezaId; })));
  comprobar('…y con el nombre en su zona', !errorSolo && soloCab[0].textos?.length === 1, JSON.stringify(soloCab && soloCab[0].textos));

  // Un conjunto con camiseta + short (columna PRENDA del Excel: una fila por
  // prenda): "Caballero · solo short" saca solo el short, con su zona.
  var unConjunto = Object.assign({}, producto, { conjuntos: [{ id: 'todo', nombre: 'Caballero', grupoIds: ['g-dama', 'g-cab'] }] });
  var soloShort, errorShort = null;
  try {
    soloShort = resolverPiezasDePedido({ pedido: { lineas: [{ id: 'l5', productoId: 'p-mixta', conjuntoId: 'todo', talla: 'XL', nombre: 'LUIS', numero: '', piezasExcluidas: ['g-dama::Frente'] }] },
      productos: [unConjunto], grupos: [gDama, gCab], piezas: [piezaDama, piezaCaballero], disenos: [] });
  } catch (e) { errorShort = e.message; }
  comprobar('Conjunto + "solo una prenda": sale solo esa prenda, con su zona', !errorShort && soloShort.length === 1 && soloShort[0].anchoCm === 50 && soloShort[0].textos?.length === 1,
    errorShort || JSON.stringify(soloShort.map(function (p) { return p.piezaId; })));
})();

console.log('\n--- Cambiar el molde de una pieza solo en una producción (MANGA → MANGA LARGA) ---');
await (async function () {
  var corta = { id: 'pz-corta', nombre: 'Manga corta', angulosPermitidos: [0], tela: null,
    dimensionesPorTalla: { M: { anchoCm: 40, altoCm: 20 } }, geometriaPorTalla: { M: poligono(400, 200) } };
  var larga = { id: 'pz-larga', nombre: 'Manga larga', angulosPermitidos: [0], tela: null,
    dimensionesPorTalla: { M: { anchoCm: 40, altoCm: 60 } }, geometriaPorTalla: { M: poligono(400, 600) } };
  var g = { id: 'g-cam', nombre: 'Camiseta', piezas: [{ piezaId: 'pz-corta', rol: 'Manga' }] };
  var ref = { ref: { tipo: 'extremo', parte: 'abajo' }, modo: 'fijo', valor: 0 };
  var anclaje = { anclas: [{ id: 'A1', pieza: 'Manga', x: { ref: { tipo: 'contorno', parte: 'centro' }, modo: 'fijo', valor: 0 }, y: ref }],
    zonas: [{ id: 'Z1', pieza: 'Manga', tipo: 'texto', anclaX: 'A1', anclaY: 'A1', origen: 'centro', ancho: { modo: 'fijo', valor: 10 }, alto: { modo: 'fijo', valor: 4 }, campoPedido: 'numero' }] };
  var original = { id: 'p1', nombre: 'Corta', grupoId: 'g-cam', anclaje: anclaje };
  var copia = { id: 'p2', nombre: 'Larga', grupoId: 'g-cam', anclaje: anclaje, moldes: { Manga: 'pz-larga' } };
  var lineas = [{ id: 'l1', productoId: 'p1', talla: 'M', nombre: '', numero: '7' }, { id: 'l2', productoId: 'p2', talla: 'M', nombre: '', numero: '7' }];
  var r = resolverPiezasDePedido({ pedido: { lineas: lineas }, productos: [original, copia], grupos: [g], piezas: [corta, larga], disenos: [] });
  var de = function (id) { return r.find(function (p) { return p.lineaPedidoId === id; }); };
  comprobar('La producción con el molde cambiado saca la manga larga', de('l2').altoCm === 60, de('l2').altoCm);
  comprobar('La otra producción (y la prenda) siguen con la corta', de('l1').altoCm === 20, de('l1').altoCm);
  comprobar('La zona sigue en la pieza y se recalcula sobre el molde nuevo (abajo de la manga larga)',
    de('l2').textos?.length === 1 && de('l2').textos[0].cyCm > 50, JSON.stringify(de('l2').textos?.map(function (t) { return t.cyCm; })));
  var { gruposConMoldes } = await import('../src/dominio/moldesDeProduccion.js');
  var dos = gruposConMoldes([g, { id: 'g-pant', nombre: 'Pant', piezas: [{ piezaId: 'x', rol: 'Manga' }] }], { 'g-cam::Manga': 'pz-larga' });
  comprobar('Con varias prendas, cambia solo la pieza de esa prenda', dos[0].piezas[0].piezaId === 'pz-larga' && dos[1].piezas[0].piezaId === 'x');
})();

console.log('\n' + pasadas + ' pasadas · ' + fallos + ' fallidas');
if (fallos > 0) process.exit(1);
