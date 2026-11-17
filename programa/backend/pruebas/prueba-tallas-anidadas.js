"use strict";

// ============================================================
// Pruebas de separarTallasAnidadas (tallasAnidadas.js)
// ============================================================
// Una capa con la misma pieza en varias tallas, una dentro de otra, cada
// contorno con sus piquetes -- el formato del PDF de prenda completa. Los
// trazos son sintéticos (en cm, mmPorUnidad = 10): se comprueba que cada
// piquete termine en SU talla y el orden de mayor a menor, no la lectura
// del PDF (eso se probó a mano con el archivo real del taller).

import { separarTallasAnidadas } from '../src/motor/tallasAnidadas.js';

let fallos = 0, pasadas = 0;
function comprobar(desc, cond, detalle) {
  if (cond) { pasadas++; console.log('  ✓ ' + desc); }
  else { fallos++; console.log('  ✗ ' + desc + (detalle ? '\n      ' + detalle : '')); }
}
function casi(a, b, tol = 0.05) { return Math.abs(a - b) <= tol; }

// Contorno abierto que vuelve al inicio (como lo deja Illustrator: un
// stroke sin closePath explícito).
function rectangulo(x0, y0, ancho, alto) {
  return { puntos: [[x0, y0], [x0 + ancho, y0], [x0 + ancho, y0 + alto], [x0, y0 + alto], [x0, y0]], cerrado: false };
}
function linea(x0, y0, x1, y1) {
  return { puntos: [[x0, y0], [x1, y1]], cerrado: false };
}

const MM = 10;

console.log('\n--- Tres tallas anidadas, cada una con su piquete en el borde de abajo ---');
{
  // Grande 40x50 en (0,0); mediana 36x46 en (2,2); chica 32x42 en (4,4).
  // Cada piquete: raya de 0.4 cm parada sobre el borde de abajo de SU talla.
  const trazos = [
    rectangulo(0, 0, 40, 50), linea(20, 0, 20, 0.4),
    rectangulo(2, 2, 36, 46), linea(20, 2, 20, 2.4),
    rectangulo(4, 4, 32, 42), linea(20, 4, 20, 4.4),
  ];
  const r = separarTallasAnidadas(trazos, MM);
  comprobar('salen 3 tallas', r.tallas.length === 3, 'salieron ' + r.tallas.length);
  comprobar('la primera es la más grande (400 mm de ancho)', casi(r.tallas[0].boundingBoxMm.anchoMm, 400));
  comprobar('la última es la más chica (320 mm de ancho)', casi(r.tallas[2].boundingBoxMm.anchoMm, 320));
  const yPiquete = (t) => t.piquetesMm.find((p) => casi(p.xMm, 200, 1))?.yMm;
  comprobar('el piquete de la grande queda en la grande', casi(yPiquete(r.tallas[0]), 2, 0.5), 'y=' + yPiquete(r.tallas[0]));
  comprobar('el piquete de la mediana queda en la mediana', casi(yPiquete(r.tallas[1]), 22, 0.5), 'y=' + yPiquete(r.tallas[1]));
  comprobar('el piquete de la chica queda en la chica', casi(yPiquete(r.tallas[2]), 42, 0.5), 'y=' + yPiquete(r.tallas[2]));
  comprobar('ningún piquete sin contorno', r.piquetesSinContorno === 0);
}

console.log('\n--- Primero todos los contornos y después todos los piquetes (otro orden de dibujo) ---');
{
  // Mismo caso, pero los piquetes vienen al final: tiene que decidir por
  // dónde están apoyados, no por el orden.
  const trazos = [
    rectangulo(4, 4, 32, 42), rectangulo(0, 0, 40, 50), rectangulo(2, 2, 36, 46),
    linea(20, 0, 20, 0.4), linea(20, 2, 20, 2.4), linea(20, 4, 20, 4.4),
  ];
  const r = separarTallasAnidadas(trazos, MM);
  const cuantos = r.tallas.map((t) => t.piquetesMm.filter((p) => casi(p.xMm, 200, 1)).length);
  comprobar('cada talla se queda con exactamente su piquete', cuantos.every((n) => n === 1), JSON.stringify(cuantos));
  comprobar('sigue ordenado de mayor a menor', r.tallas[0].boundingBoxMm.anchoMm > r.tallas[1].boundingBoxMm.anchoMm &&
    r.tallas[1].boundingBoxMm.anchoMm > r.tallas[2].boundingBoxMm.anchoMm);
}

console.log('\n--- Borde compartido: el piquete toca todas las tallas, decide el orden de dibujo ---');
{
  // Como un cuello: todas las tallas comparten el borde de abajo (y=0) y el
  // piquete del centro cae en el mismo lugar para todas.
  const trazos = [
    rectangulo(0, 0, 60, 5), linea(30, 0, 30, 0.4),
    rectangulo(2, 0, 56, 5), linea(30, 0, 30, 0.4),
  ];
  const r = separarTallasAnidadas(trazos, MM);
  comprobar('salen 2 tallas', r.tallas.length === 2);
  comprobar('cada una tiene su piquete del centro',
    r.tallas.every((t) => t.piquetesMm.some((p) => casi(p.xMm, 300, 1) && casi(p.yMm, 2, 0.5))));
}

console.log('\n--- Una sola forma: talla única ---');
{
  const r = separarTallasAnidadas([rectangulo(0, 0, 3.5, 37)], MM);
  comprobar('sale 1 talla', r.tallas.length === 1);
  comprobar('sin piquetes', r.tallas[0].piquetesMm.length === 0);
}

console.log('\n--- Una línea larga sin área (hilo / doblez) no es una talla ---');
{
  const r = separarTallasAnidadas([rectangulo(0, 0, 40, 50), linea(20, 5, 20, 45)], MM);
  comprobar('sale 1 talla, no 2', r.tallas.length === 1, 'salieron ' + r.tallas.length);
  comprobar('la línea queda contada como ignorada', r.lineasIgnoradas === 1);
}

console.log('\n' + pasadas + ' pasadas, ' + fallos + ' fallidas');
if (fallos > 0) process.exit(1);
