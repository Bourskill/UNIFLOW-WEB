"use strict";

// ============================================================
// Pruebas de geometriaSalientes.js (piquetes pegados + puntos notables)
// ============================================================
// Puerto de host.jsx (piquetesPegadosDeTrazo/puntosNotables), leído a fondo
// antes de escribir esto -- ver el comentario grande del propio archivo
// portado sobre "el fallo que se repitió tres rondas, y no era de
// detección: era mío, de criterio" (piquetes SUELTOS vs. PEGADOS, "su
// función es la misma"). Polígonos sintéticos a propósito -- se comprueba
// la aritmética del puerto, no la lectura de un DXF/PDF real.

import { piquetesPegadosDe, puntosNotablesDe } from '../src/motor/geometriaSalientes.js';

let fallos = 0, pasadas = 0;
function comprobar(desc, cond, detalle) {
  if (cond) { pasadas++; console.log('  ✓ ' + desc); }
  else { fallos++; console.log('  ✗ ' + desc + (detalle ? '\n      ' + detalle : '')); }
}
function casi(a, b, tol = 0.05) { return Math.abs(a - b) <= tol; }

// Rectángulo CCW (500x800mm, escala real de una pieza) -- el signo del
// área confirma que "hacia adentro" se puede comprobar sin adivinar cuál
// lado del contorno es el interior.
function rectangulo(ancho, alto) {
  return [[0, 0], [ancho, 0], [ancho, alto], [0, alto]];
}

console.log('\n--- piquetesPegadosDe: rectángulo liso, sin muescas ---');
{
  const r = piquetesPegadosDe(rectangulo(500, 800));
  comprobar('Sin ninguna muesca, no hay piquetes pegados', r.length === 0, 'piquetes=' + r.length);
}

console.log('\n--- piquetesPegadosDe: AGUJA (piquete unido, angosto) ---');
{
  // Un pico angosto (base 4mm, fondo ~10.2mm) sobre el lado inferior --
  // desde la punta, los vecinos quedan casi en la MISMA dirección (un
  // trazo que entra y sale casi por su propia huella), justo lo que
  // distingue una aguja de una muesca ancha.
  const poligono = [[0, 0], [48, 0], [50, 10], [52, 0], [500, 0], [500, 800], [0, 800]];
  const r = piquetesPegadosDe(poligono);
  comprobar('Se detectó exactamente 1 aguja', r.length === 1, JSON.stringify(r));
  if (r.length === 1) {
    comprobar('La punta queda en (50,10)', casi(r[0].xMm, 50) && casi(r[0].yMm, 10), JSON.stringify(r[0]));
    comprobar('El ancho es la distancia entrada-salida (4mm)', casi(r[0].anchoMm, 4));
    comprobar('El fondo es ~10.2mm (promedio de los dos brazos)', casi(r[0].altoMm, 10.198, 0.01));
  }
}

console.log('\n--- piquetesPegadosDe: MUESCA en V, ancha (no es aguja) ---');
{
  // Vecinos separados 10mm, fondo 3mm -- desde la punta, los vecinos NO
  // quedan casi en la misma dirección (falla el coseno de aguja), así que
  // esto lo tiene que atrapar el paso de "tramo" (V/U), no el de aguja.
  const poligono = [[0, 0], [45, 0], [50, 3], [55, 0], [200, 0], [200, 100], [0, 100]];
  const r = piquetesPegadosDe(poligono);
  comprobar('Se detectó exactamente 1 muesca en V', r.length === 1, JSON.stringify(r));
  if (r.length === 1) {
    comprobar('El fondo de la V queda en (50,3)', casi(r[0].xMm, 50) && casi(r[0].yMm, 3), JSON.stringify(r[0]));
    comprobar('El ancho es la cuerda (10mm)', casi(r[0].anchoMm, 10));
    comprobar('El fondo (altoMm) es 3mm', casi(r[0].altoMm, 3));
  }
}

console.log('\n--- piquetesPegadosDe: MUESCA en U (2 nodos en el fondo) cuenta como UNA sola ---');
{
  // El fondo plano de la U tiene DOS nodos a la misma profundidad -- si se
  // probara tramo=1 primero, cada uno formaría su propia media V contra su
  // vecino y saldrían dos piquetes donde hay uno. Se prueba tramo=2 primero
  // exactamente para evitar esto.
  const poligono = [[0, 0], [45, 0], [48, 4], [52, 4], [55, 0], [200, 0], [200, 100], [0, 100]];
  const r = piquetesPegadosDe(poligono);
  comprobar('Se detectó exactamente 1 muesca (no 2)', r.length === 1, JSON.stringify(r));
  if (r.length === 1) {
    comprobar('El ancho es la cuerda entrada-salida (10mm)', casi(r[0].anchoMm, 10));
    comprobar('El fondo (altoMm) es 4mm', casi(r[0].altoMm, 4));
  }
}

console.log('\n--- piquetesPegadosDe: una esquina normal de 90° no es una muesca ---');
{
  // Un rectángulo real: sus 4 esquinas de 90° no deben confundirse con
  // piquetes -- ninguna cuerda entre vecinos de una esquina real de un
  // rectángulo de este tamaño mide menos de 12mm.
  const r = piquetesPegadosDe(rectangulo(300, 400));
  comprobar('Las 4 esquinas del rectángulo no cuentan como piquetes', r.length === 0, JSON.stringify(r));
}

console.log('\n--- puntosNotablesDe: las esquinas de un cuadrado salen las 4 ---');
{
  // n=4 < 8 -- vueltasDeMuestreo no aporta nada (guarda de tamaño mínimo),
  // así que esto aísla esquinasDeVertices sola.
  const cuadrado = rectangulo(400, 400);
  const r = puntosNotablesDe(cuadrado, 400, 400);
  comprobar('Las 4 esquinas del cuadrado se reconocen', r.length === 4, JSON.stringify(r));
  comprobar('Las 4 están marcadas como esquina, no como vuelta', r.every((p) => p.esquina === true));
}

console.log('\n--- puntosNotablesDe: un pico agudo (V) se reconoce como esquina ---');
{
  // Un rectángulo con un solo vértice muy afilado en el medio de un lado
  // (un pico de cuello en V, mucho más grande que un piquete -- 60mm de
  // profundidad, muy por encima de PIQUETE_MUESCA_FONDO_MAX_MM) para que
  // sea inequívocamente "un giro real del contorno", no un piquete.
  const poligono = [[0, 0], [150, 0], [200, 80], [250, 0], [400, 0], [400, 300], [0, 300]];
  const r = puntosNotablesDe(poligono, 400, 300);
  const pico = r.find((p) => casi(p.xMm, 200, 1) && casi(p.yMm, 80, 1));
  comprobar('El pico del V se reconoce como punto notable', !!pico, JSON.stringify(r));
  comprobar('...y está marcado como esquina', pico && pico.esquina === true);
}

console.log('\n--- puntosNotablesDe: una curva suave (sin ángulo agudo) se reconoce como vuelta ---');
{
  // Un "hombro" redondeado -- una parábola de muchos pasos cortos (ningún
  // vértice gira más de unos pocos grados, así que esto NO lo puede
  // atrapar esquinasDeVertices) sobre un lado recto de 400mm.
  //
  // OJO CON UNA PROPIEDAD MATEMÁTICA REAL de este algoritmo (la MISMA en
  // host.jsx, no algo que se perdió al portarlo): justo en el ápice de una
  // curva simétrica el movimiento es de segundo orden (la derivada es cero
  // ahí), así que una ventana de tamaño realista casi nunca junta
  // suficiente desplazamiento como para pasar PROM en ESE punto exacto. Lo
  // que sí se detecta con margen es DÓNDE EMPIEZA A CURVARSE -- la
  // transición del tramo recto a la curva --, que es igual de útil como
  // ancla real (el fondo de una sisa, el nacimiento de un cuello). Por eso
  // esta prueba busca una vuelta CERCA del hombro, no exactamente en su
  // pico matemático.
  function hombro(xCentro, medioAncho, alto, pasos) {
    const pts = [];
    for (let i = -pasos; i <= pasos; i++) {
      const t = i / pasos;
      pts.push([xCentro + t * medioAncho, alto * (1 - t * t)]);
    }
    return pts;
  }
  const h = hombro(200, 60, 20, 12);
  const poligono = [[0, 0], [140, 0], ...h, [260, 0], [400, 0], [400, 300], [0, 300]];
  const r = puntosNotablesDe(poligono, 400, 300);
  const vuelta = r.find((p) => p.esquina === false && p.xMm > 100 && p.xMm < 300);
  comprobar('Se reconoce una vuelta cerca del hombro redondeado', !!vuelta, JSON.stringify(r));
}

console.log('\n' + pasadas + ' pasadas · ' + fallos + ' fallidas\n');
if (fallos > 0) process.exit(1);
