"use strict";

// ============================================================
// Pruebas del versionado de Piezas (dominio/resolverGrupo.js).
// ============================================================
// La pregunta que responden: si un Producto queda FIJADO a una versión
// vieja de una pieza (Producto.versionesPiezas), ¿de verdad ve la
// geometría de esa versión y no la que Biblioteca tenga hoy? Y si Biblioteca
// avanza (nueva versión) sin que nadie pida un pin, ¿todo sigue viendo la
// actual, como siempre (Grupos, Plantillas)?
//
// Geometrías sintéticas a propósito -- acá se prueba la aritmética del pin
// de versión, no la lectura de un DXF/PDF real.
//
// Correr con: npm run prueba (desde programa/backend).

import { resolverPiezasDeGrupo } from '../src/dominio/resolverGrupo.js';

var fallos = 0, pasadas = 0;
function comprobar(desc, cond, detalle) {
  if (cond) { pasadas++; console.log("  ✓ " + desc); }
  else { fallos++; console.log("  ✗ " + desc + (detalle ? "\n      " + detalle : "")); }
}

var geoV1 = { vertices: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 50 }, { x: 0, y: 50 }] };
var geoV2 = { vertices: [{ x: 0, y: 0 }, { x: 42, y: 0 }, { x: 42, y: 52 }, { x: 0, y: 52 }] };

var pieza = {
  id: 'pieza-1',
  nombre: 'Delantero',
  angulosPermitidos: [0, 180],
  tela: null,
  // Estado ACTUAL de la pieza: ya está en la versión 2 (Biblioteca avanzó).
  geometriaPorTalla: { M: geoV2 },
  dimensionesPorTalla: { M: { anchoCm: 42, altoCm: 52 } },
  version: 2,
  versiones: [
    { version: 1, geometriaPorTalla: { M: geoV1 }, dimensionesPorTalla: { M: { anchoCm: 40, altoCm: 50 } }, creadoEn: '2026-01-01T00:00:00.000Z', motivo: 'Creada' },
    { version: 2, geometriaPorTalla: { M: geoV2 }, dimensionesPorTalla: { M: { anchoCm: 42, altoCm: 52 } }, creadoEn: '2026-02-01T00:00:00.000Z', motivo: 'Reprocesada' },
  ],
};

var grupo = { id: 'grupo-1', nombre: 'Camiseta', piezas: [{ piezaId: 'pieza-1', rol: 'Delantero' }] };

console.log('\n--- Sin pin de versión: usa la geometría ACTUAL de la pieza (Grupos/Plantillas de siempre) ---');
(function () {
  var resuelto = resolverPiezasDeGrupo(grupo, [pieza]);
  comprobar('Devuelve las dimensiones de la versión 2 (la actual)',
    resuelto[0].dimensionesPorTalla.M.anchoCm === 42 && resuelto[0].dimensionesPorTalla.M.altoCm === 52);
})();

console.log('\n--- Con pin a la versión 1: un Producto fijado ve la geometría VIEJA, no la actual ---');
(function () {
  var resuelto = resolverPiezasDeGrupo(grupo, [pieza], { 'pieza-1': 1 });
  comprobar('Devuelve las dimensiones de la versión 1 (la vieja), no de la 2',
    resuelto[0].dimensionesPorTalla.M.anchoCm === 40 && resuelto[0].dimensionesPorTalla.M.altoCm === 50);
  comprobar('La geometría real (vertices) también es la de la versión 1',
    resuelto[0].geometriaPorTalla.M.vertices[1].x === 40);
})();

console.log('\n--- Pin a una versión que ya no existe (borrada): falla explícito, no cae silencioso a la actual ---');
(function () {
  var tiroError = false, mensaje = '';
  try {
    resolverPiezasDeGrupo(grupo, [pieza], { 'pieza-1': 99 });
  } catch (e) {
    tiroError = true;
    mensaje = e.message;
  }
  comprobar('Tira un error en vez de devolver cualquier cosa', tiroError);
  comprobar('El mensaje explica qué pasó (menciona la pieza)', mensaje.indexOf('Delantero') !== -1, mensaje);
})();

console.log('\n' + pasadas + ' pasadas · ' + fallos + ' fallidas');
if (fallos > 0) process.exit(1);
