"use strict";

// ============================================================
// Pruebas de offsetPoligono (exportarPdf.js) -- el "desplazamiento" real
// del contorno para láser (compensa el grosor del corte). Espejo exacto de
// la misma función en frontend/src/componentes/LienzoAnclaje.jsx: se
// prueba acá la fórmula una vez, no dos.
//
// Desde que offsetPoligono pasó a usar clipper-lib (offsetting real de
// polígono, no un miter/bisel por vértice -- ver el comentario grande
// junto a la función), el ORDEN y hasta la CANTIDAD de puntos de salida
// pueden no corresponderse 1 a 1 con la entrada (Clipper puede reordenar,
// invertir el sentido de giro, o fusionar vértices). Por eso estas pruebas
// comprueban propiedades GEOMÉTRICAS (caja, área, distancia al centroide),
// nunca "el punto i de salida es el punto i de entrada, desplazado".

import { offsetPoligono } from '../src/motor/exportarPdf.js';

let fallos = 0, pasadas = 0;
function comprobar(desc, cond, detalle) {
  if (cond) { pasadas++; console.log('  ✓ ' + desc); }
  else { fallos++; console.log('  ✗ ' + desc + (detalle ? '\n      ' + detalle : '')); }
}
function casi(a, b, tol = 0.01) { return Math.abs(a - b) <= tol; }
function cajaDe(puntos) {
  const xs = puntos.map((p) => p.x), ys = puntos.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

console.log('\n--- Sin desplazamiento (0), el polígono no cambia ---');
{
  const cuadrado = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  const r = offsetPoligono(cuadrado, 0);
  comprobar('Distancia 0 devuelve los mismos puntos', r === cuadrado);
}

console.log('\n--- Un cuadrado desplazado 1cm hacia afuera crece EXACTAMENTE 1cm por lado ---');
{
  const cuadrado = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  const r = offsetPoligono(cuadrado, 1);
  const caja = cajaDe(r);
  comprobar('minX/minY bajaron exactamente 1', casi(caja.minX, -1) && casi(caja.minY, -1), JSON.stringify(caja));
  comprobar('maxX/maxY subieron exactamente 1', casi(caja.maxX, 11) && casi(caja.maxY, 11), JSON.stringify(caja));
  comprobar('Sigue siendo un cuadrado de 4 vértices (esquinas afiladas, jtMiter)', r.length === 4, 'salieron ' + r.length);
}

console.log('\n--- El offset es hacia AFUERA del centroide, nunca hacia adentro ---');
{
  const poligono = [{ x: 0, y: 0 }, { x: 8, y: 1 }, { x: 10, y: 6 }, { x: 4, y: 9 }, { x: -2, y: 4 }];
  const cx = poligono.reduce((s, v) => s + v.x, 0) / poligono.length;
  const cy = poligono.reduce((s, v) => s + v.y, 0) / poligono.length;
  const r = offsetPoligono(poligono, 0.5);
  // Sin asumir correspondencia de índice: cada punto de salida tiene que
  // quedar MÁS LEJOS del centroide que el vértice de entrada más cercano a
  // él (si el offset fuera hacia adentro, o nulo, esto fallaría).
  const todosMasLejos = r.every((p) => {
    const dNuevo = Math.hypot(p.x - cx, p.y - cy);
    const masCercano = Math.min(...poligono.map((v) => Math.hypot(v.x - cx, v.y - cy)));
    return dNuevo > masCercano - 0.001;
  });
  comprobar('Ningún punto de salida quedó más cerca del centroide que el original', todosMasLejos, JSON.stringify(r));
  const areaDe = (pts) => {
    let a = 0;
    for (let i = 0; i < pts.length; i++) { const p1 = pts[i], p2 = pts[(i + 1) % pts.length]; a += p1.x * p2.y - p2.x * p1.y; }
    return Math.abs(a) / 2;
  };
  comprobar('El área creció (offset hacia afuera, no un no-op)', areaDe(r) > areaDe(poligono));
}

console.log('\n--- Un piquete pegado tipo "aguja" ya NO deforma el molde con un offset chico ---');
{
  // El bug real reportado: "se deforma mucho, no es fiel al molde". Antes
  // (miter por vértice) esto podía disparar o distorsionar la caja; con
  // offsetting real de polígono (unión booleana, ver clipper-lib), la caja
  // tiene que crecer EXACTAMENTE `distancia` por lado, ni más ni menos --
  // igual que crecería un rectángulo liso.
  const poligono = [
    { x: 0, y: 0 }, { x: 48, y: 0 }, { x: 50, y: 10 }, { x: 52, y: 0 },
    { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 0, y: 80 },
  ];
  const distancia = 0.1;
  const r = offsetPoligono(poligono, distancia);
  const caja = cajaDe(r);
  comprobar('La caja creció EXACTAMENTE 0.1cm por lado, sin picos ni deformación',
    casi(caja.minX, -distancia) && casi(caja.maxX, 100 + distancia) &&
    casi(caja.minY, -distancia) && casi(caja.maxY, 80 + distancia),
    JSON.stringify(caja));
}

console.log('\n--- El mismo piquete, con un desplazamiento GRANDE, "traga" la muesca en vez de dispararla ---');
{
  // Con un desplazamiento (3cm) mucho mayor que el ancho de la muesca
  // (4mm), las dos paredes de la aguja quedan cubiertas por el offset de
  // las aristas vecinas -- un offset de polígono real hace desaparecer la
  // muesca del contorno resultante (correcto: no puede sobrevivir), en vez
  // de disparar un pico de varios cm como hacía el miter por vértice sin
  // límite real.
  const poligono = [
    { x: 0, y: 0 }, { x: 48, y: 0 }, { x: 50, y: 10 }, { x: 52, y: 0 },
    { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 0, y: 80 },
  ];
  const distancia = 3;
  const r = offsetPoligono(poligono, distancia);
  const caja = cajaDe(r);
  comprobar('La caja creció EXACTAMENTE 3cm por lado',
    casi(caja.minX, -distancia) && casi(caja.maxX, 100 + distancia) &&
    casi(caja.minY, -distancia) && casi(caja.maxY, 80 + distancia),
    JSON.stringify(caja));
  comprobar('La muesca desapareció del resultado (queda un rectángulo simple, 4 vértices)', r.length === 4, 'salieron ' + r.length + ': ' + JSON.stringify(r));
}

console.log('\n' + pasadas + ' pasadas · ' + fallos + ' fallidas\n');
if (fallos > 0) process.exit(1);
