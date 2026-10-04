"use strict";

// ============================================================
// Pruebas del ajuste de texto a su zona (ajusteTexto.js), con la fuente de
// base REAL (Arimo Bold, la misma con la que se imprime) -- no con mocks:
// lo que se prueba es justamente que las medidas de tinta sean las de verdad.
// Más una vuelta completa por exportarPdf.js, leyendo el PDF resultante con
// pdfjs-dist para confirmar dónde quedó escrito el texto.

import { ajustarTexto, calibrarCuerpo, ajustarTextosDePiezas, REGLAS_TEXTO } from '../src/motor/ajusteTexto.js';
import { obtenerMedidor } from '../src/motor/medidorFuentes.js';
import { generarPdfNesting } from '../src/motor/exportarPdf.js';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

let fallos = 0, pasadas = 0;
function comprobar(desc, cond, detalle) {
  if (cond) { pasadas++; console.log('  ✓ ' + desc); }
  else { fallos++; console.log('  ✗ ' + desc + (detalle ? '\n      ' + detalle : '')); }
}
const cerca = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

const { medidor } = await obtenerMedidor(null);
const altoBanda = medidor.banda.maxY - medidor.banda.minY;

console.log('\n--- Nombre corto en una zona ancha: llena el ALTO (banda de mayúsculas), centrado ---');
{
  const r = ajustarTexto({ medidor, texto: 'GIL', anchoCm: 25, altoCm: 5, modo: 'llenar' });
  comprobar('la banda de mayúsculas mide exactamente el alto de la zona',
    cerca(r.cuerpoCm * altoBanda, 5), 'banda = ' + (r.cuerpoCm * altoBanda));
  comprobar('el ancho de la tinta cabe en la zona', r.tintaCm.ancho <= 25);
  comprobar('sin tracking ni condensado', r.trackingMil === 0 && r.escalaH === 100);
  comprobar('cabe', r.cabe);
}

console.log('\n--- Nombre largo en una zona angosta: manda el ANCHO, llena el ancho exacto ---');
{
  const r = ajustarTexto({ medidor, texto: 'ESTIVEN HERNANDEZ', anchoCm: 12, altoCm: 5, modo: 'llenar' });
  comprobar('el ancho de la tinta es exactamente el de la zona', cerca(r.tintaCm.ancho, 12), 'ancho = ' + r.tintaCm.ancho);
  comprobar('la banda queda por debajo del alto (no se pasa)', r.cuerpoCm * altoBanda < 5);
  comprobar('sin deformar la letra (no hizo falta la escalera)', r.escalaH === 100 && r.trackingMil === 0);
}

console.log('\n--- La tilde no cambia el cuerpo (la altura se mide con la "H", no con la tinta) ---');
{
  const a = ajustarTexto({ medidor, texto: 'GARCIA', anchoCm: 40, altoCm: 5, modo: 'llenar' });
  const b = ajustarTexto({ medidor, texto: 'GARCÍA', anchoCm: 40, altoCm: 5, modo: 'llenar' });
  comprobar('GARCIA y GARCÍA salen del mismo cuerpo', cerca(a.cuerpoCm, b.cuerpoCm, 1e-9), a.cuerpoCm + ' vs ' + b.cuerpoCm);
  comprobar('la base queda en el mismo lugar (la tilde sobresale por arriba)', cerca(a.dyCm, b.dyCm, 1e-9));
}

console.log('\n--- Número calibrado: todos al MISMO cuerpo, el que da la referencia "55" ---');
{
  const W = 10, H = 12;
  const cuerpo = calibrarCuerpo({ medidor, candidatos: ['55'], anchoCm: W, altoCm: H });
  const r7 = ajustarTexto({ medidor, texto: '7', anchoCm: W, altoCm: H, modo: 'calibrado', cuerpoCalibradoCm: cuerpo });
  const r10 = ajustarTexto({ medidor, texto: '10', anchoCm: W, altoCm: H, modo: 'calibrado', cuerpoCalibradoCm: cuerpo });
  const r55 = ajustarTexto({ medidor, texto: '55', anchoCm: W, altoCm: H, modo: 'calibrado', cuerpoCalibradoCm: cuerpo });
  comprobar('el 7, el 10 y el 55 salen del mismo cuerpo',
    cerca(r7.cuerpoCm, cuerpo, 1e-9) && cerca(r10.cuerpoCm, cuerpo, 1e-9) && cerca(r55.cuerpoCm, cuerpo, 1e-9));
  comprobar('el 7 queda más angosto que la zona (no se agranda a llenarla)', r7.tintaCm.ancho < W - 1);
  comprobar('el 55 (el más exigente) llena exactamente lo que le da la zona', r55.cabe && (cerca(r55.tintaCm.ancho, W, 0.05) || cerca(r55.cuerpoCm * altoBanda, H, 0.05)));
}

console.log('\n--- Un dato que no cabe al cuerpo común baja por la escalera, sin pasarse ---');
{
  const W = 10, H = 12;
  const cuerpo = calibrarCuerpo({ medidor, candidatos: ['55'], anchoCm: W, altoCm: H });
  const r = ajustarTexto({ medidor, texto: '555', anchoCm: W, altoCm: H, modo: 'calibrado', cuerpoCalibradoCm: cuerpo });
  comprobar('no supera el cuerpo calibrado', r.cuerpoCm <= cuerpo + 1e-9);
  comprobar('termina cabiendo en la zona', r.cabe && r.tintaCm.ancho <= W + 0.02, 'ancho = ' + r.tintaCm.ancho);
  comprobar('registra qué pasos hizo', r.pasos.length > 0, JSON.stringify(r.pasos));
  // Un dato absurdo (7 dígitos donde la zona se calibró para 2) agota la
  // escalera -- cuerpo mínimo 50% y condensado 90% -- y se AVISA, no se
  // deforma más: mismo criterio que el panel ("NO cabe en su guía").
  const absurdo = ajustarTexto({ medidor, texto: '1000000', anchoCm: W, altoCm: H, modo: 'calibrado', cuerpoCalibradoCm: cuerpo });
  comprobar('un dato imposible de encajar lo dice (cabe = false) y no baja de la mitad del cuerpo',
    absurdo.cabe === false && absurdo.cuerpoCm >= cuerpo * 0.5 - 1e-9);
}

console.log('\n--- Calibrar con datos reales: el percentil 85 no deja que UN dato largo encoja a todos ---');
{
  const normales = ['7', '10', '23', '11', '9', '8', '14', '5', '12'];
  const conExtremo = calibrarCuerpo({ medidor, candidatos: [...normales, '88888888'], anchoCm: 10, altoCm: 12 });
  const mandaElMasLargo = calibrarCuerpo({ medidor, candidatos: [...normales, '88888888'], anchoCm: 10, altoCm: 12, reglas: { ...REGLAS_TEXTO, percentilCalibracion: 100 } });
  const soloNormales = calibrarCuerpo({ medidor, candidatos: normales, anchoCm: 10, altoCm: 12, reglas: { ...REGLAS_TEXTO, percentilCalibracion: 100 } });
  comprobar('con percentil 85 un número larguísimo NO manda: el cuerpo es como el de los normales', cerca(conExtremo, soloNormales, 1e-9), conExtremo + ' vs ' + soloNormales);
  comprobar('con percentil 100 sí mandaría (y encogería a todo el equipo)', mandaElMasLargo < conExtremo / 2, String(mandaElMasLargo));
  const sinDatos = calibrarCuerpo({ medidor, candidatos: [], anchoCm: 10, altoCm: 12 });
  comprobar('sin candidatos no inventa un cuerpo (null)', sinDatos === null);
}

console.log('\n--- Sin nada que ajustar: null, nunca un número inventado ---');
{
  comprobar('texto vacío', ajustarTexto({ medidor, texto: '', anchoCm: 10, altoCm: 5, modo: 'llenar' }) === null);
  comprobar('solo espacios (sin tinta)', ajustarTexto({ medidor, texto: '   ', anchoCm: 10, altoCm: 5, modo: 'llenar' }) === null);
  comprobar('zona sin tamaño', ajustarTexto({ medidor, texto: 'GIL', anchoCm: 0, altoCm: 5, modo: 'llenar' }) === null);
}

console.log('\n--- Vuelta completa: resolver textos de un pedido -> PDF -> leer dónde quedó el texto ---');
{
  const textoBase = { colorHex: '#000000', rotacionGrados: 0, fuenteUrl: null, xCm: 0, yCm: 0 };
  const pieza = {
    id: 'p0', piezaId: 'Espalda', talla: 'm', anchoCm: 50, altoCm: 70, posicion: { x: 0, y: 0 }, rotacionGrados: 0,
    textos: [
      { ...textoBase, texto: 'PEÑA', cxCm: 25, cyCm: 10, anchoCm: 30, altoCm: 5, modo: 'llenar', zonaClave: 'nombre|m' },
      { ...textoBase, texto: '7', cxCm: 25, cyCm: 30, anchoCm: 20, altoCm: 20, modo: 'calibrado', zonaClave: 'numero|m' },
    ],
  };
  const otra = { ...pieza, id: 'p1', textos: [{ ...pieza.textos[1], texto: '10' }] };
  const [conAjuste, otraConAjuste] = await ajustarTextosDePiezas([pieza, otra], obtenerMedidor);
  const tNombre = conAjuste.textos[0], tSiete = conAjuste.textos[1], tDiez = otraConAjuste.textos[0];
  comprobar('el 7 y el 10 de la misma zona comparten cuerpo', cerca(tSiete.ajuste.cuerpoCm, tDiez.ajuste.cuerpoCm, 1e-9));
  comprobar('el nombre llena el alto de su zona', cerca(tNombre.ajuste.cuerpoCm * altoBanda, 5, 0.01) || tNombre.ajuste.tintaCm.ancho <= 30);

  const bytes = await generarPdfNesting({
    anchoLienzoCm: 60, altoLienzoCm: 80, piezas: [{ ...conAjuste, imagenDataUrl: null, imagenes: [] }],
  });
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false }).promise;
  const contenido = await (await doc.getPage(1)).getTextContent();
  const items = contenido.items.filter((i) => i.str.trim());
  const nombre = items.find((i) => i.str === 'PEÑA');
  comprobar('el PDF contiene el texto con la ñ intacta', !!nombre, JSON.stringify(items.map((i) => i.str)));
  if (nombre) {
    const PT = 28.3465;
    comprobar('escrito al cuerpo calculado (en puntos)', cerca(Math.hypot(nombre.transform[0], nombre.transform[1]), tNombre.ajuste.cuerpoCm * PT, 0.05),
      'cuerpo pdf = ' + Math.hypot(nombre.transform[0], nombre.transform[1]) + ', esperado ' + tNombre.ajuste.cuerpoCm * PT);
    const baselineEsperada = (80 - (10 + tNombre.ajuste.dyCm)) * PT; // alto de página - (cy + dy), Y hacia arriba
    comprobar('la línea de base cae donde dijo el ajuste', cerca(nombre.transform[5], baselineEsperada, 0.05),
      'y = ' + nombre.transform[5] + ', esperada ' + baselineEsperada);
    const xEsperado = (25 + tNombre.ajuste.dxCm) * PT;
    comprobar('y el origen horizontal también', cerca(nombre.transform[4], xEsperado, 0.05),
      'x = ' + nombre.transform[4] + ', esperado ' + xEsperado);
  }
}

console.log('\n--- Una generación guardada ANTES del ajuste (sin `ajuste`) se sigue imprimiendo igual ---');
{
  const bytes = await generarPdfNesting({
    anchoLienzoCm: 60, altoLienzoCm: 80,
    piezas: [{
      id: 'v', piezaId: 'Vieja', talla: 'm', anchoCm: 50, altoCm: 70, posicion: { x: 0, y: 0 }, rotacionGrados: 0,
      textos: [{ texto: 'VIEJO', xCm: 5, yCm: 5, cxCm: 10, cyCm: 7, altoCm: 4, colorHex: '#000000', rotacionGrados: 0, fuenteUrl: null }],
      imagenes: [],
    }],
  });
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  const items = (await (await doc.getPage(1)).getTextContent()).items.filter((i) => i.str.trim());
  const t = items.find((i) => i.str === 'VIEJO');
  comprobar('el texto sale', !!t);
  comprobar('con el cuerpo de siempre (alto de la zona)', !!t && cerca(Math.hypot(t.transform[0], t.transform[1]), 4 * 28.3465, 0.05));
}

console.log('\n' + pasadas + ' pasadas, ' + fallos + ' fallos');
process.exit(fallos ? 1 : 0);
