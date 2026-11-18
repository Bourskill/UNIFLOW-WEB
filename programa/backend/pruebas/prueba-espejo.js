"use strict";

// ============================================================
// Duplicar una pieza en espejo (motor/espejoPieza.js): izquierda ↔ derecha
// sin importar otro archivo.

import { espejarGeometria, espejarGeometriaPorTalla, nombreDeEspejo } from '../src/motor/espejoPieza.js';

let fallos = 0, pasadas = 0;
function comprobar(desc, cond, detalle) {
  if (cond) { pasadas++; console.log('  ✓ ' + desc); }
  else { fallos++; console.log('  ✗ ' + desc + (detalle ? '\n      ' + detalle : '')); }
}
function area(puntos) {
  let a = 0;
  for (let i = 0; i < puntos.length; i++) {
    const [x1, y1] = puntos[i], [x2, y2] = puntos[(i + 1) % puntos.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

// Una "manga" asimétrica de 300×500 mm, corrida (no empieza en 0).
const geo = {
  poligonoMm: [[100, 0], [400, 0], [400, 400], [250, 500], [100, 450]],
  boundingBoxMm: { anchoMm: 300, altoMm: 500 },
  piquetesMm: [{ xMm: 120, yMm: 200, anchoMm: 4, altoMm: 10 }],
  salientesMm: [{ xMm: 250, yMm: 500, esquina: true }, { xMm: 100, yMm: 450, esquina: false }],
  validadoPorUsuario: true,
};

console.log('\n--- Espejo de una talla ---');
{
  const e = espejarGeometria(geo);
  const xs = e.poligonoMm.map((p) => p[0]);
  comprobar('ocupa el mismo lugar (mismo rango de X)', Math.min(...xs) === 100 && Math.max(...xs) === 400);
  comprobar('mismas medidas', e.boundingBoxMm.anchoMm === 300 && e.boundingBoxMm.altoMm === 500);
  comprobar('el punto de la izquierda pasa a la derecha', e.poligonoMm.some(([x, y]) => x === 400 && y === 450));
  comprobar('mismo sentido de giro (lo esperan el borde y los salientes)', Math.sign(area(e.poligonoMm)) === Math.sign(area(geo.poligonoMm)),
    area(geo.poligonoMm) + ' / ' + area(e.poligonoMm));
  comprobar('misma superficie', Math.abs(area(e.poligonoMm)) === Math.abs(area(geo.poligonoMm)));
  comprobar('el piquete también se refleja', e.piquetesMm[0].xMm === 380 && e.piquetesMm[0].yMm === 200 && e.piquetesMm[0].anchoMm === 4);
  comprobar('y los salientes', e.salientesMm[0].xMm === 250 && e.salientesMm[1].xMm === 400 && e.salientesMm[0].esquina === true);
  comprobar('lo demás se conserva', e.validadoPorUsuario === true);
  comprobar('la original no se toca', geo.poligonoMm[0][0] === 100 && geo.piquetesMm[0].xMm === 120);
  const doble = espejarGeometria(e);
  comprobar('espejo del espejo = la original', JSON.stringify(doble.poligonoMm) === JSON.stringify(geo.poligonoMm) && doble.piquetesMm[0].xMm === 120);
}

console.log('\n--- Todas las tallas ---');
{
  const todas = espejarGeometriaPorTalla({ s: geo, m: { ...geo, poligonoMm: geo.poligonoMm.map(([x, y]) => [x * 1.1, y * 1.1]) } });
  comprobar('espeja cada talla', Object.keys(todas).join() === 's,m' && todas.s.piquetesMm[0].xMm === 380);
  comprobar('una talla sin contorno queda como estaba', espejarGeometria({ boundingBoxMm: {} }).boundingBoxMm !== undefined);
}

console.log('\n--- Nombre propuesto ---');
{
  const casos = [
    ['MANGA IZQ', 'MANGA DER'], ['Manga izquierda', 'Manga derecha'], ['manga der', 'manga izq'],
    ['DELANTERO DERECHO', 'DELANTERO IZQUIERDO'], ['Puño Izq.', 'Puño Der.'], ['ESPALDA', 'ESPALDA (espejo)'],
    ['DERBY', 'DERBY (espejo)'], // "der" dentro de otra palabra no cuenta
  ];
  for (const [entrada, esperado] of casos) {
    const sale = nombreDeEspejo(entrada);
    comprobar('"' + entrada + '" → "' + esperado + '"', sale === esperado, sale);
  }
  // La Biblioteca lo propone con su propia copia: tiene que dar lo mismo.
  const { nombreDeEspejo: delFrontend } = await import('../../frontend/src/utilidades/nombreEspejo.js');
  comprobar('la copia del frontend propone los mismos nombres', casos.every(([entrada]) => delFrontend(entrada) === nombreDeEspejo(entrada)));
}

console.log('\n' + pasadas + ' pasadas, ' + fallos + ' fallos');
process.exit(fallos ? 1 : 0);
