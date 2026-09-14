"use strict";

// ============================================================
// Pruebas de offsetPoligono (exportarPdf.js) -- el "desplazamiento" real
// del contorno para láser (compensa el grosor del corte). Espejo exacto de
// la misma función en frontend/src/componentes/LienzoAnclaje.jsx: se
// prueba acá la fórmula una vez, no dos.

import { offsetPoligono } from '../src/motor/exportarPdf.js';

let fallos = 0, pasadas = 0;
function comprobar(desc, cond, detalle) {
  if (cond) { pasadas++; console.log('  ✓ ' + desc); }
  else { fallos++; console.log('  ✗ ' + desc + (detalle ? '\n      ' + detalle : '')); }
}
function casi(a, b, tol = 0.01) { return Math.abs(a - b) <= tol; }

console.log('\n--- Sin desplazamiento (0), el polígono no cambia ---');
{
  const cuadrado = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  const r = offsetPoligono(cuadrado, 0);
  comprobar('Distancia 0 devuelve los mismos puntos', r === cuadrado);
}

console.log('\n--- Un cuadrado desplazado 1cm hacia afuera crece exactamente 1cm por lado ---');
{
  const cuadrado = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  const r = offsetPoligono(cuadrado, 1);
  // En un cuadrado, cada esquina se mueve en diagonal -- pero el resultado
  // debe seguir siendo un cuadrado, ahora de 12x12 centrado en el mismo
  // centro (0..10 -> -1..11).
  const xs = r.map((p) => p.x), ys = r.map((p) => p.y);
  comprobar('El nuevo ancho es 12 (10 + 1 por lado)', casi(Math.max(...xs) - Math.min(...xs), 12));
  comprobar('El nuevo alto es 12', casi(Math.max(...ys) - Math.min(...ys), 12));
  comprobar('Sigue centrado en el mismo centro (5,5)', casi((Math.max(...xs) + Math.min(...xs)) / 2, 5) && casi((Math.max(...ys) + Math.min(...ys)) / 2, 5));
}

console.log('\n--- El offset es hacia AFUERA del centroide, nunca hacia adentro ---');
{
  // Un pentágono irregular cualquiera -- lo único que importa es que cada
  // vértice desplazado quede MÁS LEJOS del centroide que el original.
  const poligono = [{ x: 0, y: 0 }, { x: 8, y: 1 }, { x: 10, y: 6 }, { x: 4, y: 9 }, { x: -2, y: 4 }];
  const cx = poligono.reduce((s, v) => s + v.x, 0) / poligono.length;
  const cy = poligono.reduce((s, v) => s + v.y, 0) / poligono.length;
  const r = offsetPoligono(poligono, 0.5);
  const todosMasLejos = poligono.every((v, i) => {
    const dOriginal = Math.hypot(v.x - cx, v.y - cy);
    const dNuevo = Math.hypot(r[i].x - cx, r[i].y - cy);
    return dNuevo > dOriginal;
  });
  comprobar('Los 5 vértices quedan más lejos del centroide tras el offset', todosMasLejos);
}

console.log('\n--- Una esquina muy aguda (una V cerrada, tipo piquete pegado) no dispara el miter al infinito ---');
{
  // Un rectángulo con un piquete angosto insertado (mismo tipo de forma que
  // geometriaSalientes.js detecta como "aguja") -- el tope de miter debe
  // evitar que ese vértice se dispare a una distancia absurda.
  const poligono = [
    { x: 0, y: 0 }, { x: 48, y: 0 }, { x: 50, y: 10 }, { x: 52, y: 0 },
    { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 0, y: 80 },
  ];
  const r = offsetPoligono(poligono, 0.1);
  const puntaOriginal = poligono[2], puntaNueva = r[2];
  const distancia = Math.hypot(puntaNueva.x - puntaOriginal.x, puntaNueva.y - puntaOriginal.y);
  comprobar('La punta de la aguja se movió una distancia razonable (no se disparó)', distancia < 2, 'distancia=' + distancia);
}

console.log('\n' + pasadas + ' pasadas · ' + fallos + ' fallidas\n');
if (fallos > 0) process.exit(1);
