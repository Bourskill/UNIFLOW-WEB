"use strict";

// ============================================================
// Pruebas de generarDxfNesting (exportarDxf.js) -- el export a DXF real
// para corte láser (moldería + talla + cantidad, sin personalizar).
//
// Verificación de ida y vuelta: en vez de comparar el texto del DXF a
// mano, se lo vuelve a leer con dxf-parser -- la MISMA librería que ya usa
// este proyecto del lado de lectura (importarDxf.js) -- para confirmar que
// lo que se escribe es DXF real y válido, no solo texto con la forma
// correcta. Las coordenadas esperadas salen del mismo cálculo que ya usa
// exportarPdf.js para el borde de contraste/láser (altoLienzo - posición -
// y), no una fórmula inventada para esta prueba.

import { generarDxfNesting } from '../src/motor/exportarDxf.js';
import DxfParser from 'dxf-parser';

let fallos = 0, pasadas = 0;
function comprobar(desc, cond, detalle) {
  if (cond) { pasadas++; console.log('  ✓ ' + desc); }
  else { fallos++; console.log('  ✗ ' + desc + (detalle ? '\n      ' + detalle : '')); }
}
function casi(a, b, tol = 0.001) { return Math.abs(a - b) <= tol; }

function parsear(dxfTexto) {
  return new DxfParser().parseSync(dxfTexto);
}

const contorno = [{ x: 1, y: 8 }, { x: 9, y: 9 }, { x: 6, y: 1 }];

console.log('\n--- Una pieza con contorno real: se escribe y se vuelve a leer exacto ---');
{
  const resultado = {
    anchoLienzoCm: 20, altoLienzoCm: 20,
    piezas: [{ id: 'a', piezaId: 'Delantero', talla: 'm', posicion: { x: 2, y: 3 }, anchoCm: 10, altoCm: 10, rotacionGrados: 0, contornoCm: contorno }],
  };
  const dxfTexto = generarDxfNesting(resultado);
  comprobar('El DXF empieza con la firma esperada', dxfTexto.startsWith('0\nSECTION'));

  const parsed = parsear(dxfTexto);
  comprobar('$INSUNITS declarado en milímetros (código 4)', parsed.header?.$INSUNITS === 4, String(parsed.header?.$INSUNITS));
  comprobar('Una sola entidad', parsed.entities.length === 1, String(parsed.entities.length));

  const esperado = contorno.map((v) => ({
    x: (2 + v.x) * 10,
    y: (20 - 3 - v.y) * 10,
  }));
  const real = parsed.entities[0].vertices.map((v) => ({ x: v.x, y: v.y }));
  const coincide = esperado.every((e, i) => casi(e.x, real[i].x) && casi(e.y, real[i].y));
  comprobar('Las coordenadas coinciden exacto con posición + contorno (mismo cálculo que el borde de láser de exportarPdf.js)',
    coincide, 'esperado ' + JSON.stringify(esperado) + ' -- real ' + JSON.stringify(real));
  comprobar('La capa es la talla en mayúsculas', parsed.entities[0].layer === 'M', parsed.entities[0].layer);
}

console.log('\n--- Pieza rotada 180°: el contorno se refleja dentro de su propio bounding box ---');
{
  const resultado = {
    anchoLienzoCm: 20, altoLienzoCm: 20,
    piezas: [{ id: 'c', piezaId: 'Delantero', talla: 'l', posicion: { x: 5, y: 12 }, anchoCm: 10, altoCm: 10, rotacionGrados: 180, contornoCm: contorno }],
  };
  const parsed = parsear(generarDxfNesting(resultado));
  const esperado = contorno.map((v) => {
    const lx = 10 - v.x, ly = 10 - v.y; // reflejo dentro del bbox de 10x10
    return { x: (5 + lx) * 10, y: (20 - 12 - ly) * 10 };
  });
  const real = parsed.entities[0].vertices.map((v) => ({ x: v.x, y: v.y }));
  const coincide = esperado.every((e, i) => casi(e.x, real[i].x) && casi(e.y, real[i].y));
  comprobar('Las coordenadas coinciden con el reflejo 180° esperado',
    coincide, 'esperado ' + JSON.stringify(esperado) + ' -- real ' + JSON.stringify(real));
}

console.log('\n--- Piezas sin contorno real (geometría no cargada para esa talla) quedan afuera, sin inventar un rectángulo ---');
{
  const resultado = {
    anchoLienzoCm: 20, altoLienzoCm: 20,
    piezas: [
      { id: 'a', piezaId: 'Con geometria', talla: 'm', posicion: { x: 0, y: 0 }, anchoCm: 10, altoCm: 10, rotacionGrados: 0, contornoCm: contorno },
      { id: 'b', piezaId: 'Sin geometria', talla: 'm', posicion: { x: 10, y: 0 }, anchoCm: 5, altoCm: 5, rotacionGrados: 0, contornoCm: null },
    ],
  };
  const parsed = parsear(generarDxfNesting(resultado));
  comprobar('Solo la pieza con contorno real aparece en el DXF', parsed.entities.length === 1, String(parsed.entities.length));
}

console.log('\n--- Ningún contorno real en todo el lote: falla explícito, no genera un DXF vacío ---');
{
  const resultado = {
    anchoLienzoCm: 20, altoLienzoCm: 20,
    piezas: [{ id: 'b', piezaId: 'Sin geometria', talla: 'm', posicion: { x: 0, y: 0 }, anchoCm: 5, altoCm: 5, rotacionGrados: 0, contornoCm: null }],
  };
  let tiroError = false, mensaje = '';
  try { generarDxfNesting(resultado); } catch (e) { tiroError = true; mensaje = e.message; }
  comprobar('Tira un error en vez de generar un DXF sin nada para cortar', tiroError, mensaje);
}

console.log('\n' + pasadas + ' pasadas · ' + fallos + ' fallidas\n');
if (fallos > 0) process.exit(1);
