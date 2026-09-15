"use strict";

// ============================================================
// Pruebas de verificarCobertura (fuentes.js). Con objetos mock (no hace
// falta un archivo de fuente real para esto) -- la verificación contra una
// fuente real (Arial: cobertura completa; Wingdings: "cobertura" según el
// cmap pero no letras de verdad, ver el comentario grande en fuentes.js) se
// hizo a mano durante esta pasada, no automatizada acá.

import { verificarCobertura, CARACTERES_CRITICOS } from '../src/motor/fuentes.js';

let fallos = 0, pasadas = 0;
function comprobar(desc, cond, detalle) {
  if (cond) { pasadas++; console.log('  ✓ ' + desc); }
  else { fallos++; console.log('  ✗ ' + desc + (detalle ? '\n      ' + detalle : '')); }
}

function fuenteMock(codepointsSoportados) {
  const set = new Set(codepointsSoportados);
  return { hasGlyphForCodePoint: (cp) => set.has(cp) };
}

console.log('\n--- Fuente que cubre todo lo crítico: soportado = true, sin faltantes ---');
{
  const todos = CARACTERES_CRITICOS.map((c) => c.codePointAt(0));
  const fuente = fuenteMock(todos);
  const r = verificarCobertura(fuente, 'PEÑA ÁÉÍÓÚ');
  comprobar('soportado es true', r.soportado === true);
  comprobar('faltantes está vacío', r.faltantes.length === 0, JSON.stringify(r.faltantes));
}

console.log('\n--- Fuente sin ñ ni acentos: reporta exactamente lo que falta ---');
{
  const fuente = fuenteMock(['A', 'B', 'C', ' ', 'P', 'E', 'N'].map((c) => c.codePointAt(0)));
  const r = verificarCobertura(fuente, 'PEÑA ÁÉÍÓÚ ñáéíóú');
  comprobar('soportado es false', r.soportado === false);
  const esperados = new Set(['Ñ', 'Á', 'É', 'Í', 'Ó', 'Ú', 'ñ', 'á', 'é', 'í', 'ó', 'ú']);
  const coincide = r.faltantes.length === esperados.size && r.faltantes.every((c) => esperados.has(c));
  comprobar('faltan exactamente los 12 caracteres críticos del texto (sin duplicar Ñ/ñ repetidos)',
    coincide, JSON.stringify(r.faltantes));
}

console.log('\n--- Solo se chequean los caracteres CRÍTICOS -- letras comunes de sobra no cuentan ---');
{
  const fuente = fuenteMock([]); // no soporta nada, ni siquiera A/B/C
  const r = verificarCobertura(fuente, 'ABC 123');
  comprobar('Sin ningún carácter crítico en el texto, soportado sigue siendo true', r.soportado === true, JSON.stringify(r));
}

console.log('\n' + pasadas + ' pasadas · ' + fallos + ' fallidas\n');
if (fallos > 0) process.exit(1);
