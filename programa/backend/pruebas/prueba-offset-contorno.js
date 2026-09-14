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
  // Un pentágono suave (sin esquinas agudas: cada vértice sale como UN solo
  // punto, sin bisel) -- así el índice de salida sigue siendo el mismo que
  // el de entrada, y se puede comparar 1 a 1 contra el original.
  const poligono = [{ x: 0, y: 0 }, { x: 8, y: 1 }, { x: 10, y: 6 }, { x: 4, y: 9 }, { x: -2, y: 4 }];
  const cx = poligono.reduce((s, v) => s + v.x, 0) / poligono.length;
  const cy = poligono.reduce((s, v) => s + v.y, 0) / poligono.length;
  const r = offsetPoligono(poligono, 0.5);
  comprobar('Ningún vértice biseló (salió el mismo número de puntos)', r.length === poligono.length, 'salieron ' + r.length);
  const todosMasLejos = poligono.every((v, i) => {
    const dOriginal = Math.hypot(v.x - cx, v.y - cy);
    const dNuevo = Math.hypot(r[i].x - cx, r[i].y - cy);
    return dNuevo > dOriginal;
  });
  comprobar('Los 5 vértices quedan más lejos del centroide tras el offset', todosMasLejos);
}

console.log('\n--- Una esquina muy aguda (piquete pegado tipo "aguja") BISELA en vez de picar ---');
{
  // Mismo tipo de forma que geometriaSalientes.js detecta como aguja: dos
  // aristas casi opuestas. Antes (miter sin límite) esto disparaba un pico
  // que se salía del molde entero -- justo el bug real reportado ("hay
  // trazos que se disparan y desbordan"). Ahora tiene que biselar: la
  // punta original desaparece, la reemplazan DOS puntos, y NINGUNO de los
  // dos se aleja más que `distancia` de su arista.
  const poligono = [
    { x: 0, y: 0 }, { x: 48, y: 0 }, { x: 50, y: 10 }, { x: 52, y: 0 },
    { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 0, y: 80 },
  ];
  const distancia = 0.1;
  const r = offsetPoligono(poligono, distancia);
  comprobar('Salió UN punto más que el original (una esquina biseló)', r.length === poligono.length + 1, 'salieron ' + r.length);
  // Los dos puntos del bisel quedan cerca de la punta original (48,0)-(50,10)-(52,0),
  // nunca a una distancia absurda como daría un miter sin límite.
  const puntaOriginal = poligono[2];
  const cercaDeLaPunta = r.filter((p) => Math.hypot(p.x - puntaOriginal.x, p.y - puntaOriginal.y) < distancia * 2);
  comprobar('Los dos puntos del bisel quedan cerca de la punta original, no disparados', cercaDeLaPunta.length === 2, JSON.stringify(r));
}

console.log('\n--- El mismo piquete, con un desplazamiento GRANDE, sigue sin desbordar el molde ---');
{
  // El caso real que motivó el fix: con miter sin límite, un desplazamiento
  // de varios cm sobre un piquete agudo real disparaba el pico varios cm
  // fuera del molde. Con bisel, el punto desplazado nunca se aleja más de
  // `distancia` de la arista más cercana -- se verifica indirectamente
  // comprobando que ningún punto de salida quede a más de `distancia` +
  // margen de la caja del polígono ORIGINAL ensanchada por `distancia`.
  const poligono = [
    { x: 0, y: 0 }, { x: 48, y: 0 }, { x: 50, y: 10 }, { x: 52, y: 0 },
    { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 0, y: 80 },
  ];
  const distancia = 3;
  const r = offsetPoligono(poligono, distancia);
  const xs = poligono.map((p) => p.x), ys = poligono.map((p) => p.y);
  const cajaMax = {
    minX: Math.min(...xs) - distancia * 1.5, maxX: Math.max(...xs) + distancia * 1.5,
    minY: Math.min(...ys) - distancia * 1.5, maxY: Math.max(...ys) + distancia * 1.5,
  };
  const dentroDeLaCaja = r.every((p) => p.x >= cajaMax.minX && p.x <= cajaMax.maxX && p.y >= cajaMax.minY && p.y <= cajaMax.maxY);
  comprobar('Con 3cm de desplazamiento, ningún punto se dispara fuera de una caja razonable', dentroDeLaCaja, JSON.stringify(r));
}

console.log('\n' + pasadas + ' pasadas · ' + fallos + ' fallidas\n');
if (fallos > 0) process.exit(1);
