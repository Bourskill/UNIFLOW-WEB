"use strict";

// ============================================================
// Pruebas del ajuste de texto a su zona (ajusteTexto.js), con la fuente de
// base REAL (Arimo Bold, la misma con la que se imprime) -- no con mocks:
// lo que se prueba es justamente que las medidas de tinta sean las de verdad.
// Más una vuelta completa por exportarPdf.js, leyendo el PDF resultante con
// pdfjs-dist para confirmar dónde quedó escrito el texto.

import { ajustarTexto, calibrarCuerpo, ajustarTextosDePiezas, normalizarTexto, advertenciasDeTextos, REGLAS_TEXTO } from '../src/motor/ajusteTexto.js';
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

console.log('\n--- Sentido de giro: grados POSITIVOS = ANTIHORARIO (como Illustrator, el PDF y el lienzo) ---');
{
  const textoBase = { colorHex: '#000000', fuenteUrl: null, xCm: 0, yCm: 0, cxCm: 25, cyCm: 35, anchoCm: 30, altoCm: 6, modo: 'llenar', zonaClave: 'g|m' };
  const mk = (rot) => ({ id: 'r', piezaId: 'Espalda', talla: 'm', anchoCm: 50, altoCm: 70, posicion: { x: 0, y: 0 }, rotacionGrados: 0, imagenes: [],
    textos: [{ ...textoBase, texto: 'GIRO', rotacionGrados: rot }] });
  const leer = async (rot) => {
    const [p] = await ajustarTextosDePiezas([mk(rot)], obtenerMedidor);
    const bytes = await generarPdfNesting({ anchoLienzoCm: 50, altoLienzoCm: 70, piezas: [p] });
    const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
    const item = (await (await doc.getPage(1)).getTextContent()).items.find((i) => i.str === 'GIRO');
    return { m: item.transform, a: p.textos[0].ajuste };
  };
  const cero = await leer(0), noventa = await leer(90);
  comprobar('a 0° el texto se lee de izquierda a derecha', cero.m[0] > 0 && cerca(cero.m[1], 0, 1e-6));
  comprobar('a +90° el texto se lee de ABAJO hacia ARRIBA (antihorario)', cerca(noventa.m[0], 0, 1e-6) && noventa.m[1] > 0, JSON.stringify(noventa.m));
  // El origen rota alrededor del CENTRO de la zona: centro + R(+90°)·(dx, -dy), en cm de PDF (Y hacia arriba).
  const PT = 28.3465, a = noventa.a;
  const cx = 25 * PT, cy = (70 - 35) * PT, dx = a.dxCm * PT, dy = -a.dyCm * PT;
  comprobar('y su origen cae donde la rotación alrededor del centro lo manda',
    cerca(noventa.m[4], cx - dy, 0.05) && cerca(noventa.m[5], cy + dx, 0.05), noventa.m[4] + ',' + noventa.m[5] + ' vs ' + (cx - dy) + ',' + (cy + dx));
}

console.log('\n--- Texto con caracteres de control o sin glifo: se normaliza y se AVISA, no sale un cuadrito en silencio ---');
{
  comprobar('quita saltos de línea, tabulaciones y ancho cero', normalizarTexto(' ANA\nLUIS\t\u200bX  Y ') === 'ANA LUIS X Y', JSON.stringify(normalizarTexto(' ANA\nLUIS\t\u200bX  Y ')));
  const r = ajustarTexto({ medidor, texto: 'JUAN ⚽', anchoCm: 20, altoCm: 5, modo: 'llenar' });
  comprobar('detecta el carácter que la fuente no trae', JSON.stringify(r.sinGlifo) === JSON.stringify(['⚽']), JSON.stringify(r.sinGlifo));
  comprobar('un nombre con ñ y acentos no reporta nada', ajustarTexto({ medidor, texto: 'MUÑOZ ÁLVAREZ', anchoCm: 20, altoCm: 5, modo: 'llenar' }).sinGlifo.length === 0);
  comprobar('la fuente de base trae todo lo que traía la Helvetica estándar (Š Ž Ÿ Œ €) y el Latin Extended-A (Ć Č Ł Ş Đ Ğ İ Ő Ű)',
    ajustarTexto({ medidor, texto: 'ŠKRTEL ŽUPAN ŸŒ € ĆČŁŞĐĞİŐŰ', anchoCm: 40, altoCm: 5, modo: 'llenar' }).sinGlifo.length === 0);

  const base = { colorHex: '#000000', rotacionGrados: 0, fuenteUrl: null, xCm: 0, yCm: 0, cxCm: 10, cyCm: 5, anchoCm: 12, altoCm: 6, modo: 'calibrado', zonaClave: 'p|n|m' };
  // Diez números normales y UNO con más dígitos de los que caben: con el
  // percentil 85 el largo no manda sobre el cuerpo común, así que queda desbordado.
  const normales = ['55', '10', '7', '23', '9', '11', '14', '8', '5', '12'].map((n, i) => ({ id: 'n' + i, piezaId: 'Espalda', talla: 'm', textos: [{ ...base, texto: n }] }));
  const piezas = [
    ...normales,
    { id: '2', piezaId: 'Espalda', talla: 'm', textos: [{ ...base, texto: '5555555' }] }, // más dígitos de los que caben
    { id: '3', piezaId: 'Espalda', talla: 'm', textos: [{ ...base, modo: 'llenar', zonaClave: 'p|nom|m', texto: 'LUIS ⚽' }] },
    { id: '4', piezaId: 'Espalda', talla: 'm', textos: [{ ...base, modo: 'llenar', zonaClave: 'p|nom|m', texto: ' \u200b ' }] },
  ];
  const ajustadas = await ajustarTextosDePiezas(piezas, obtenerMedidor);
  const avisos = advertenciasDeTextos(ajustadas);
  const tipos = avisos.map((x) => x.tipo).sort().join();
  comprobar('avisa del número que no cabe', avisos.some((x) => x.tipo === 'no-cabe' && /5555555/.test(x.mensaje)), JSON.stringify(avisos));
  comprobar('avisa del carácter sin glifo', avisos.some((x) => x.tipo === 'sin-glifo' && /⚽/.test(x.mensaje)));
  comprobar('avisa del texto sin nada que dibujar', avisos.some((x) => x.tipo === 'sin-tinta'));
  comprobar('y no inventa avisos para el "55" que sí cabe', !avisos.some((x) => x.texto === '55'), tipos);

  // El texto nuevo sin ajuste (nada que dibujar) se omite; antes caía al camino viejo y tumbaba todo el PDF.
  const bytes = await generarPdfNesting({ anchoLienzoCm: 30, altoLienzoCm: 30, piezas: [{ ...ajustadas.find((x) => x.id === '4'), posicion: { x: 0, y: 0 }, anchoCm: 20, altoCm: 20, rotacionGrados: 0, imagenes: [] }] });
  comprobar('un texto sin nada que dibujar no tumba la generación del PDF', bytes.length > 500);
}

console.log('\n--- Dos productos con el MISMO id de zona en un pedido no mezclan cajas ni fuentes ---');
{
  const textoBase = { colorHex: '#000000', rotacionGrados: 0, fuenteUrl: null, xCm: 0, yCm: 0, cxCm: 10, cyCm: 10, modo: 'calibrado', zonaClave: 'ZONA_1|M', texto: '10' };
  const camiseta = { id: 'c', piezaId: 'Espalda', talla: 'm', textos: [{ ...textoBase, anchoCm: 20, altoCm: 30 }] };
  const pantaloneta = { id: 'p', piezaId: 'Delantero', talla: 'm', textos: [{ ...textoBase, anchoCm: 6, altoCm: 8 }] };
  const juntas = await ajustarTextosDePiezas([camiseta, pantaloneta], obtenerMedidor);
  const sola = await ajustarTextosDePiezas([pantaloneta], obtenerMedidor);
  const aJuntas = juntas[1].textos[0].ajuste, aSola = sola[0].textos[0].ajuste;
  comprobar('la pantaloneta sale igual que si estuviera sola (a pesar de la clave repetida)', cerca(aJuntas.cuerpoCm, aSola.cuerpoCm, 1e-9) && aJuntas.cabe, aJuntas.cuerpoCm + ' vs ' + aSola.cuerpoCm);
  comprobar('y cabe en su zona de 6 cm', aJuntas.tintaCm.ancho <= 6.02, String(aJuntas.tintaCm.ancho));
}

console.log('\n--- Una fuente propia que ya no se puede bajar: se reajusta con la de base, no se imprime mal medido ---');
{
  const textoBase = { colorHex: '#000000', rotacionGrados: 0, xCm: 0, yCm: 0, cxCm: 15, cyCm: 8, anchoCm: 24, altoCm: 6, modo: 'llenar', zonaClave: 'x|m', texto: 'PEÑA' };
  // Un ajuste calculado "para otra letra" (muy distinta) con una URL que ya no existe en el Storage:
  const ajusteAjeno = { texto: 'PEÑA', sinGlifo: [], cuerpoCm: 1, trackingMil: 0, escalaH: 100, dxCm: -1, dyCm: 0.5, cabe: true, pasos: [], tintaCm: { ancho: 3, alto: 1 } };
  const bytes = await generarPdfNesting({
    anchoLienzoCm: 40, altoLienzoCm: 30,
    piezas: [{ id: 'f', piezaId: 'Espalda', talla: 'm', anchoCm: 30, altoCm: 20, posicion: { x: 0, y: 0 }, rotacionGrados: 0, imagenes: [],
      textos: [{ ...textoBase, fuenteUrl: 'https://ejemplo.invalido/fuente-borrada.ttf', ajuste: ajusteAjeno }] }],
  });
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  const it = (await (await doc.getPage(1)).getTextContent()).items.find((i) => i.str === 'PEÑA');
  const reajustado = ajustarTexto({ medidor, texto: 'PEÑA', anchoCm: 24, altoCm: 6, modo: 'llenar' });
  comprobar('el PDF sale igual con el texto', !!it);
  comprobar('con el cuerpo reajustado a la fuente de base (no el 1 cm del ajuste ajeno)', !!it && cerca(Math.hypot(it.transform[0], it.transform[1]), reajustado.cuerpoCm * 28.3465, 0.05));
}

console.log('\n' + pasadas + ' pasadas, ' + fallos + ' fallos');
process.exit(fallos ? 1 : 0);
