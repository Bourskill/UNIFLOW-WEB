"use strict";

// ============================================================
// Pruebas de contornoYPiquetesDeTrazos (geometriaComun.js)
// ============================================================
// Puerto de la regla real del panel de Illustrator (host.jsx,
// pareceUnPiquete): "un piquete es CORTO. Y punto." -- no importa si el
// trazo es abierto o cerrado, lo único que lo distingue del contorno real
// es la longitud (un molde mide decenas de cm, un piquete no llega a 2.5).
//
// Los trazos de prueba son sintéticos a propósito -- se comprueba la
// aritmética de separar contorno/piquetes, no la lectura de un DXF/PDF real
// (eso lo verifican los propios importadores, ya probados en pasadas
// anteriores con archivos de prueba).

import { contornoYPiquetesDeTrazos, PIQUETE_LARGO_MAX_CM } from '../src/motor/geometriaComun.js';

let fallos = 0, pasadas = 0;
function comprobar(desc, cond, detalle) {
  if (cond) { pasadas++; console.log('  ✓ ' + desc); }
  else { fallos++; console.log('  ✗ ' + desc + (detalle ? '\n      ' + detalle : '')); }
}
function casi(a, b, tol = 0.02) { return Math.abs(a - b) <= tol; }

// Un rectángulo cerrado de anchoCm x altoCm, en cm (mmPorUnidad=10 abajo
// para poder escribir los trazos directamente en cm en las pruebas).
function rectangulo(x0, y0, ancho, alto) {
  return {
    puntos: [[x0, y0], [x0 + ancho, y0], [x0 + ancho, y0 + alto], [x0, y0 + alto]],
    cerrado: true,
  };
}
function linea(x0, y0, x1, y1) {
  return { puntos: [[x0, y0], [x1, y1]], cerrado: false };
}

const MM_POR_CM = 10; // trazos escritos en cm; contornoYPiquetesDeTrazos pide unidades del archivo + mmPorUnidad

console.log('\n--- Contorno + un piquete suelto (abierto) ---');
{
  const contorno = rectangulo(0, 0, 60, 80); // perímetro 280cm, muy por encima del umbral
  const piquete = linea(5, 5, 5, 6); // 1cm, una muesca vertical
  const r = contornoYPiquetesDeTrazos([contorno, piquete], MM_POR_CM);
  comprobar('El contorno elegido es el trazo largo (4 vértices)', r.poligonoMm.length === 4);
  comprobar('Se detectó exactamente 1 piquete', r.piquetesMm.length === 1, 'piquetes=' + r.piquetesMm.length);
  const p = r.piquetesMm[0];
  comprobar('El piquete queda por su CENTRO (5,5.5 cm -> 50,55 mm)', casi(p.xMm, 50) && casi(p.yMm, 55), 'x=' + p.xMm + ' y=' + p.yMm);
  comprobar('El bounding box del piquete es 0 x 1 cm (10mm de alto)', casi(p.anchoMm, 0) && casi(p.altoMm, 10), 'ancho=' + p.anchoMm + ' alto=' + p.altoMm);
  comprobar('El bounding box del contorno sigue siendo el del rectángulo, sin el piquete', casi(r.boundingBoxMm.anchoMm, 600) && casi(r.boundingBoxMm.altoMm, 800));
}

console.log('\n--- Un piquete CERRADO (una V dibujada como forma) cuenta igual ---');
{
  const contorno = rectangulo(0, 0, 60, 80);
  // Triángulo pequeño cerrado, perímetro real bien por debajo de 2.5cm.
  const piqueteCerrado = { puntos: [[10, 0], [10.3, 0.4], [10.6, 0]], cerrado: true };
  const r = contornoYPiquetesDeTrazos([contorno, piqueteCerrado], MM_POR_CM);
  comprobar('Un piquete cerrado también se detecta (no depende de abierto/cerrado)', r.piquetesMm.length === 1, JSON.stringify(r.piquetesMm));
}

console.log('\n--- Sin piquetes: solo el contorno ---');
{
  const contorno = rectangulo(0, 0, 40, 50);
  const r = contornoYPiquetesDeTrazos([contorno], MM_POR_CM);
  comprobar('Sin otros trazos, no hay piquetes', r.piquetesMm.length === 0);
  comprobar('El contorno se mide igual que antes', casi(r.boundingBoxMm.anchoMm, 400) && casi(r.boundingBoxMm.altoMm, 500));
}

console.log('\n--- Varios piquetes sueltos en la misma capa ---');
{
  const contorno = rectangulo(0, 0, 60, 80);
  const trazos = [contorno, linea(0, 20, 0, 21), linea(60, 20, 60, 21), linea(30, 0, 30, 0.8)];
  const r = contornoYPiquetesDeTrazos(trazos, MM_POR_CM);
  comprobar('Los 3 piquetes sueltos se detectan todos', r.piquetesMm.length === 3, 'piquetes=' + r.piquetesMm.length);
}

console.log('\n--- Un trazo grande de más (ni contorno ni piquete) no se adivina ---');
{
  // Dos formas grandes en la misma capa (ej. un contorno láser aparte del
  // molde): la más larga gana como "contorno"; la otra, al no ser corta,
  // NO se cuenta como piquete -- se ignora, mismo criterio que host.jsx
  // (queda como diagnóstico, no como dato).
  const contorno = rectangulo(0, 0, 60, 80); // perímetro 280cm
  const otroGrande = rectangulo(0, 0, 61, 81); // perímetro 284cm, un poco más grande -- éste debería ganar como contorno
  const piquete = linea(5, 5, 5, 5.5);
  const r = contornoYPiquetesDeTrazos([contorno, otroGrande, piquete], MM_POR_CM);
  comprobar('El trazo más largo de verdad gana como contorno', casi(r.boundingBoxMm.anchoMm, 610), 'anchoMm=' + r.boundingBoxMm.anchoMm);
  comprobar('El otro trazo grande NO se cuenta como piquete', r.piquetesMm.length === 1, 'piquetes=' + r.piquetesMm.length);
}

console.log('\n--- El umbral es real (2.5cm), no un número cualquiera ---');
{
  const contorno = rectangulo(0, 0, 60, 80);
  const piqueteChico = linea(5, 5, 5, 5 + (PIQUETE_LARGO_MAX_CM - 0.1));
  const trazoGrande = linea(20, 0, 20, 0 + (PIQUETE_LARGO_MAX_CM + 0.1));
  const r = contornoYPiquetesDeTrazos([contorno, piqueteChico, trazoGrande], MM_POR_CM);
  comprobar('Justo por debajo del umbral, cuenta como piquete', r.piquetesMm.length === 1, 'piquetes=' + r.piquetesMm.length);
}

console.log('\n--- Una línea de referencia larga y angosta NO le gana al contorno ---');
{
  // El bug real que motivó este cambio: elegir el contorno por PERÍMETRO
  // (como hacía esta función antes) se rompe con una marca de hilo/doblez
  // -- una línea recta que puede medir más de largo que el contorno real
  // sin ser el molde. Por ÁREA de caja (mismo criterio que host.jsx) esto
  // no pasa nunca: una línea, por larga que sea, tiene una caja casi sin
  // área (un lado es 0).
  const contorno = rectangulo(0, 0, 40, 30); // perímetro 140cm, área 1200cm²
  const lineaLarga = linea(20, 0, 20, 100);  // perímetro 100cm... pero área de caja = 0 (ancho 0)
  const r = contornoYPiquetesDeTrazos([contorno, lineaLarga], MM_POR_CM);
  comprobar('El contorno sigue siendo el rectángulo real, no la línea larga',
    casi(r.boundingBoxMm.anchoMm, 400) && casi(r.boundingBoxMm.altoMm, 300),
    'anchoMm=' + r.boundingBoxMm.anchoMm + ' altoMm=' + r.boundingBoxMm.altoMm);
  comprobar('La línea (100cm, muy por encima del umbral) no se cuenta como piquete', r.piquetesMm.length === 0, 'piquetes=' + r.piquetesMm.length);
}

console.log('\n' + pasadas + ' pasadas · ' + fallos + ' fallidas\n');
if (fallos > 0) process.exit(1);
