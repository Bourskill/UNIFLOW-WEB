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

console.log('\n--- Número: la cifra plana ocupa TODO el alto de la zona, y todos salen a la misma altura ---');
const bandaNum = medidor.bandaNumeros;
const altoCifra = bandaNum.maxY - bandaNum.minY;
{
  const W = 20, H = 12;
  const cuerpo = calibrarCuerpo({ medidor, candidatos: ['55'], anchoCm: W, altoCm: H });
  comprobar('el cuerpo común hace que un "1" mida exactamente el alto de la zona', cerca(cuerpo * altoCifra, H, 1e-6), String(cuerpo * altoCifra));
  const r7 = ajustarTexto({ medidor, texto: '7', anchoCm: W, altoCm: H, modo: 'calibrado', cuerpoCalibradoCm: cuerpo });
  const r10 = ajustarTexto({ medidor, texto: '10', anchoCm: W, altoCm: H, modo: 'calibrado', cuerpoCalibradoCm: cuerpo });
  const r55 = ajustarTexto({ medidor, texto: '55', anchoCm: W, altoCm: H, modo: 'calibrado', cuerpoCalibradoCm: cuerpo });
  comprobar('el 7, el 10 y el 55 salen del mismo cuerpo (misma altura)',
    cerca(r7.cuerpoCm, cuerpo, 1e-9) && cerca(r10.cuerpoCm, cuerpo, 1e-9) && cerca(r55.cuerpoCm, cuerpo, 1e-9));
  comprobar('el 7 queda más angosto que la zona (el alto manda, no se estira a lo ancho)', r7.tintaCm.ancho < W - 1);
  comprobar('sin cuerpo común (zona nueva en el lienzo) da el mismo alto completo',
    cerca(ajustarTexto({ medidor, texto: '10', anchoCm: W, altoCm: H, modo: 'calibrado' }).cuerpoCm, cuerpo, 1e-9));
  // Colocación: base de la cifra en el borde de abajo, tope en el de arriba.
  // dyCm = dónde cae la línea de base respecto del centro (Y hacia abajo).
  const baseCifra = r10.dyCm + (-bandaNum.minY) * r10.cuerpoCm; // borde inferior de la banda de la cifra
  comprobar('la base de la cifra queda en el borde inferior de la zona', cerca(baseCifra, H / 2, 1e-6), String(baseCifra));
}

console.log('\n--- El desborde de las cifras redondas se permite (puede salirse de la zona) ---');
{
  const W = 20, H = 12;
  const r = ajustarTexto({ medidor, texto: '10', anchoCm: W, altoCm: H, modo: 'calibrado' });
  const glifo0 = medidor.glifos('0')[0];
  comprobar('el "0" es más alto que el "1" en esta fuente (tiene desborde)', glifo0.arriba > bandaNum.maxY || glifo0.abajo < bandaNum.minY,
    '0: ' + glifo0.abajo + '..' + glifo0.arriba + ' · 1: ' + bandaNum.minY + '..' + bandaNum.maxY);
  comprobar('la tinta del "10" mide más que la zona...', r.tintaCm.alto > H, String(r.tintaCm.alto));
  comprobar('...y aun así cuenta como que cabe (no se achica por eso)', r.cabe && r.escalaH === 100 && r.trackingMil === 0);
}

console.log('\n--- Un número más ancho que su zona: NO se achica ni se deforma, se sale por los costados ---');
{
  const W = 10, H = 12;
  const cuerpo = calibrarCuerpo({ medidor, candidatos: ['55'], anchoCm: W, altoCm: H });
  const r = ajustarTexto({ medidor, texto: '55', anchoCm: W, altoCm: H, modo: 'calibrado', cuerpoCalibradoCm: cuerpo });
  comprobar('mantiene el alto completo (mismo cuerpo)', cerca(r.cuerpoCm, cuerpo, 1e-9));
  comprobar('sin tracking ni condensado (forma natural)', r.trackingMil === 0 && r.escalaH === 100, JSON.stringify(r.pasos));
  comprobar('es más ancho que la zona y lo informa', r.tintaCm.ancho > W && cerca(r.desbordeAnchoCm, r.tintaCm.ancho - W, 1e-9));
  comprobar('cuenta como que cabe (para un número solo manda el alto)', r.cabe === true);
  const enZonaAncha = ajustarTexto({ medidor, texto: '7', anchoCm: 30, altoCm: H, modo: 'calibrado', cuerpoCalibradoCm: cuerpo });
  comprobar('un número que entra no informa desborde', enZonaAncha.desbordeAnchoCm === 0);
  // Un nombre, en cambio, sí sigue ajustándose al ancho.
  const nombre = ajustarTexto({ medidor, texto: 'HERNANDEZ', anchoCm: W, altoCm: H, modo: 'llenar' });
  comprobar('un nombre no se sale del ancho', nombre.tintaCm.ancho <= W + 0.02 && nombre.desbordeAnchoCm < 0.02);
}

console.log('\n--- El cuerpo común ya no depende de los datos: un número larguísimo no encoge a nadie ---');
{
  const normales = ['7', '10', '23', '11', '9', '8', '14', '5', '12'];
  const conExtremo = calibrarCuerpo({ medidor, candidatos: [...normales, '88888888'], anchoCm: 10, altoCm: 12 });
  const soloNormales = calibrarCuerpo({ medidor, candidatos: normales, anchoCm: 10, altoCm: 12 });
  comprobar('mismo cuerpo con o sin el número larguísimo', cerca(conExtremo, soloNormales, 1e-9), conExtremo + ' vs ' + soloNormales);
  const sinDatos = calibrarCuerpo({ medidor, candidatos: [], anchoCm: 10, altoCm: 12 });
  comprobar('sin candidatos no inventa un cuerpo (null)', sinDatos === null);
}
console.log('\n--- Estilo de la zona: espaciado entre letras ---');
{
  const normal = ajustarTexto({ medidor, texto: 'GIL', anchoCm: 40, altoCm: 5, modo: 'llenar' });
  const abierto = ajustarTexto({ medidor, texto: 'GIL', anchoCm: 40, altoCm: 5, modo: 'llenar', espaciadoMil: 200 });
  comprobar('el espaciado elegido se usa como tracking', abierto.trackingMil === 200, String(abierto.trackingMil));
  comprobar('con letras más abiertas el texto es más ancho, al mismo alto', abierto.tintaCm.ancho > normal.tintaCm.ancho && cerca(abierto.cuerpoCm, normal.cuerpoCm, 1e-9));
  const angosto = ajustarTexto({ medidor, texto: 'HERNANDEZ', anchoCm: 12, altoCm: 5, modo: 'llenar', espaciadoMil: 300 });
  comprobar('si con ese espaciado no entra, igual termina dentro del ancho', angosto.tintaCm.ancho <= 12.02, String(angosto.tintaCm.ancho));
  const numero = ajustarTexto({ medidor, texto: '10', anchoCm: 20, altoCm: 12, modo: 'calibrado', espaciadoMil: -100 });
  const numeroNormal = ajustarTexto({ medidor, texto: '10', anchoCm: 20, altoCm: 12, modo: 'calibrado' });
  comprobar('un número también lo usa, sin perder su alto completo', numero.trackingMil === -100 && cerca(numero.cuerpoCm, numeroNormal.cuerpoCm, 1e-9));
  comprobar('un espaciado fuera de rango se acota', ajustarTexto({ medidor, texto: 'GIL', anchoCm: 40, altoCm: 5, modo: 'llenar', espaciadoMil: 99999 }).trackingMil <= 500);
}

console.log('\n--- Estilo de la zona: contorno de color ---');
{
  const sin = ajustarTexto({ medidor, texto: 'GIL', anchoCm: 25, altoCm: 5, modo: 'llenar' });
  const con = ajustarTexto({ medidor, texto: 'GIL', anchoCm: 25, altoCm: 5, modo: 'llenar', contornoCm: 0.3 });
  comprobar('un nombre con contorno deja ese margen adentro de la zona (letra + borde = alto de la zona)',
    cerca(con.cuerpoCm * altoBanda + 2 * 0.3, 5, 0.01), String(con.cuerpoCm * altoBanda + 0.6));
  comprobar('por eso sale un poco más chico que sin contorno', con.cuerpoCm < sin.cuerpoCm);
  const n = ajustarTexto({ medidor, texto: '10', anchoCm: 20, altoCm: 12, modo: 'calibrado', contornoCm: 0.3 });
  const nSin = ajustarTexto({ medidor, texto: '10', anchoCm: 20, altoCm: 12, modo: 'calibrado' });
  comprobar('un número con contorno NO se achica (su alto completo manda)', cerca(n.cuerpoCm, nSin.cuerpoCm, 1e-9));
}

console.log('\n--- Alineación: el texto arranca desde la izquierda, el centro o la derecha de su zona ---');
{
  const W = 30, H = 5;
  // La tinta va de (dxCm + izq) a (dxCm + der) respecto del centro de la zona.
  const bordes = (r) => {
    const g = medidor.glifos(r.texto);
    const t = r.trackingMil / 1000, h = r.escalaH / 100;
    const izq = Math.min(...g.map((x) => (x.izq + x.indice * t) * h)) * r.cuerpoCm;
    const der = Math.max(...g.map((x) => (x.der + x.indice * t) * h)) * r.cuerpoCm;
    return { izq: r.dxCm + izq, der: r.dxCm + der };
  };
  const izq = bordes(ajustarTexto({ medidor, texto: 'GIL', anchoCm: W, altoCm: H, modo: 'llenar', alineacion: 'izquierda' }));
  const cen = bordes(ajustarTexto({ medidor, texto: 'GIL', anchoCm: W, altoCm: H, modo: 'llenar' }));
  const der = bordes(ajustarTexto({ medidor, texto: 'GIL', anchoCm: W, altoCm: H, modo: 'llenar', alineacion: 'derecha' }));
  comprobar('a la izquierda: la tinta arranca en el borde izquierdo de la zona', cerca(izq.izq, -W / 2, 1e-6), JSON.stringify(izq));
  comprobar('al centro (por defecto): centrada', cerca(cen.izq + cen.der, 0, 1e-6), JSON.stringify(cen));
  comprobar('a la derecha: termina en el borde derecho', cerca(der.der, W / 2, 1e-6), JSON.stringify(der));
  // Con borde de color, la que toca el borde de la zona es la línea del borde.
  const conBorde = bordes(ajustarTexto({ medidor, texto: 'GIL', anchoCm: W, altoCm: H, modo: 'llenar', alineacion: 'izquierda', contornoCm: 0.3 }));
  comprobar('con borde, la letra queda a "grosor" del borde izquierdo', cerca(conBorde.izq, -W / 2 + 0.3, 1e-6), JSON.stringify(conBorde));
  // Un número ancho alineado a la izquierda se sale solo por la derecha.
  const n = bordes(ajustarTexto({ medidor, texto: '10', anchoCm: 6, altoCm: 12, modo: 'calibrado', alineacion: 'izquierda' }));
  comprobar('un número ancho a la izquierda se sale solo por la derecha', cerca(n.izq, -3, 1e-6) && n.der > 3, JSON.stringify(n));
}


console.log('\n--- El contorno llega al PDF: trazo por debajo, relleno encima ---');
{
  const pieza = {
    id: 'p0', piezaId: 'Espalda', talla: 'm', anchoCm: 50, altoCm: 70, posicion: { x: 0, y: 0 }, rotacionGrados: 0, imagenes: [],
    textos: [{ texto: 'PEÑA', cxCm: 25, cyCm: 10, anchoCm: 30, altoCm: 5, xCm: 0, yCm: 0, modo: 'llenar', zonaClave: 'n|m',
      colorHex: '#ffffff', rotacionGrados: 0, fuenteUrl: null, espaciadoMil: 50, contorno: { colorHex: '#ff0000', grosorCm: 0.3 } }],
  };
  const [conAjuste] = await ajustarTextosDePiezas([pieza], obtenerMedidor);
  comprobar('el ajuste del pedido usa el espaciado de la zona', conAjuste.textos[0].ajuste.trackingMil === 50);
  const bytes = await generarPdfNesting({ anchoLienzoCm: 60, altoLienzoCm: 80, piezas: [{ ...conAjuste, imagenDataUrl: null }] });
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false }).promise;
  const pagina = await doc.getPage(1);
  const items = (await pagina.getTextContent()).items.filter((i) => i.str === 'PEÑA');
  comprobar('el texto se escribe dos veces (contorno + relleno), en el mismo lugar', items.length === 2 &&
    cerca(items[0].transform[4], items[1].transform[4], 0.01) && cerca(items[0].transform[5], items[1].transform[5], 0.01), String(items.length));
  const ops = await pagina.getOperatorList();
  const modos = ops.fnArray.map((f, i) => (f === pdfjs.OPS.setTextRenderingMode ? ops.argsArray[i][0] : null)).filter((m) => m !== null);
  comprobar('la primera pasada es solo trazo (modo 1, contorno)', modos.includes(1), JSON.stringify(modos));
  const anchos = ops.fnArray.map((f, i) => (f === pdfjs.OPS.setLineWidth ? ops.argsArray[i][0] : null)).filter((w) => w !== null);
  comprobar('con el doble del grosor (la mitad de adentro la tapa el relleno)', anchos.some((w) => cerca(w, 2 * 0.3 * 28.3465, 0.05)), JSON.stringify(anchos));
}

console.log('\n--- Varios contornos, uno por fuera del otro ---');
{
  const { contornosDeZona, pasadasDeContornos } = await import('../src/motor/contornosTexto.js');
  comprobar('una zona de antes, con un solo borde activado, se sigue leyendo',
    JSON.stringify(contornosDeZona({ contorno: { activo: true, colorHex: '#ff0000', grosorCm: 0.3 } })) === '[{"colorHex":"#ff0000","grosorCm":0.3}]');
  comprobar('y uno desactivado no da contornos', contornosDeZona({ contorno: { activo: false, colorHex: '#ff0000', grosorCm: 0.3 } }).length === 0);
  comprobar('la lista nueva manda sobre el borde viejo',
    contornosDeZona({ contornos: [], contorno: { activo: true, grosorCm: 0.3 } }).length === 0);
  const anillos = [{ colorHex: '#000000', grosorCm: 0.2 }, { colorHex: '#ffffff', grosorCm: 0.3 }, { colorHex: '#ff0000', grosorCm: 0.1 }];
  const pasadasC = pasadasDeContornos(anillos);
  comprobar('se pinta del de afuera al pegado a la letra, cada uno hasta su borde',
    pasadasC.map((p) => p.colorHex).join() === '#ff0000,#ffffff,#000000' &&
    cerca(pasadasC[0].anchoTrazoCm, 1.2, 1e-9) && cerca(pasadasC[1].anchoTrazoCm, 1.0, 1e-9) && cerca(pasadasC[2].anchoTrazoCm, 0.4, 1e-9), JSON.stringify(pasadasC));

  const pieza = {
    id: 'p0', piezaId: 'Espalda', talla: 'm', anchoCm: 50, altoCm: 70, posicion: { x: 0, y: 0 }, rotacionGrados: 0, imagenes: [],
    textos: [{ texto: 'PEÑA', cxCm: 25, cyCm: 10, anchoCm: 30, altoCm: 5, xCm: 0, yCm: 0, modo: 'llenar', zonaClave: 'n|m',
      colorHex: '#ffffff', rotacionGrados: 0, fuenteUrl: null, espaciadoMil: 0, contornos: anillos }],
  };
  const [conAjuste] = await ajustarTextosDePiezas([pieza], obtenerMedidor);
  const solo = ajustarTexto({ medidor, texto: 'PEÑA', anchoCm: 30 - 1.2, altoCm: 5 - 1.2, modo: 'llenar' });
  comprobar('el texto deja adentro de la zona el espacio de los tres juntos', cerca(conAjuste.textos[0].ajuste.cuerpoCm, solo.cuerpoCm, 1e-9));
  const bytes = await generarPdfNesting({ anchoLienzoCm: 60, altoLienzoCm: 80, piezas: [{ ...conAjuste, imagenDataUrl: null }] });
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false }).promise;
  const pagina = await doc.getPage(1);
  const items = (await pagina.getTextContent()).items.filter((i) => i.str === 'PEÑA');
  comprobar('en el PDF: tres trazos y el relleno', items.length === 4, String(items.length));
  const ops = await pagina.getOperatorList();
  const anchos = ops.fnArray.map((f, i) => (f === pdfjs.OPS.setLineWidth ? ops.argsArray[i][0] : null)).filter((w) => w !== null);
  comprobar('con sus anchos, de afuera hacia adentro', [1.2, 1.0, 0.4].every((w, i) => cerca(anchos.slice(-3)[i], w * 28.3465, 0.05)), JSON.stringify(anchos));
}

console.log('\n--- Texto en varios renglones (saltos de línea) ---');
{
  const { normalizarLineas } = await import('../src/motor/ajusteTexto.js');
  comprobar('se parte por los saltos de línea, sin renglones vacíos',
    JSON.stringify(normalizarLineas('MEDIOS Y\r\n\n  CONTENIDO ')) === '["MEDIOS Y","CONTENIDO"]');
  const a = ajustarTexto({ medidor, texto: 'MEDIOS Y\nCONTENIDO', anchoCm: 30, altoCm: 8, modo: 'llenar' });
  comprobar('dos renglones', a.lineas.length === 2 && a.texto === 'MEDIOS Y\nCONTENIDO');
  const banda = a.altoBandaCm;
  const paso = a.lineas[1].dyCm - a.lineas[0].dyCm;
  comprobar('uno debajo del otro, con el 30% del alto de la letra entre ellos', cerca(paso, banda * 1.3, 1e-6), paso + ' / ' + banda);
  comprobar('el bloque entero cabe en el alto de la zona', banda + paso <= 8 + 1e-6 && a.cabe);
  comprobar('y queda centrado en la zona (la base del de abajo en el borde)', cerca(a.lineas[1].dyCm, 4, 1e-6) && cerca(a.lineas[0].dyCm - banda, -4, 1e-6));
  const centros = a.lineas.map((l) => l.dxCm + (l.tintaCm.izq + l.tintaCm.der) / 2);
  comprobar('cada renglón se centra por su propio ancho', cerca(centros[0], 0, 1e-6) && cerca(centros[1], 0, 1e-6), centros.join());
  const izq = ajustarTexto({ medidor, texto: 'MEDIOS Y\nCONTENIDO', anchoCm: 30, altoCm: 8, modo: 'llenar', alineacion: 'izquierda' });
  const bordes = izq.lineas.map((l) => l.dxCm + l.tintaCm.izq);
  comprobar('alineados a la izquierda, los dos arrancan en el borde de la zona', cerca(bordes[0], -15, 1e-6) && cerca(bordes[1], -15, 1e-6), bordes.join());
  const pegado = ajustarTexto({ medidor, texto: 'A\nB', anchoCm: 30, altoCm: 8, modo: 'llenar', interlineado: 0 });
  comprobar('con interlineado 0, cada renglón llena la mitad del alto', cerca(pegado.altoBandaCm, 4, 1e-6), pegado.altoBandaCm);
  const uno = ajustarTexto({ medidor, texto: 'GIL', anchoCm: 30, altoCm: 8, modo: 'llenar' });
  comprobar('un solo renglón sigue igual que antes', uno.lineas.length === 1 && cerca(uno.lineas[0].dyCm, uno.dyCm) && cerca(uno.altoBandaCm, 8, 1e-6));
  const num = ajustarTexto({ medidor, texto: '1\n0', anchoCm: 10, altoCm: 8, modo: 'calibrado' });
  comprobar('un número va siempre en un renglón', num.lineas.length === 1 && num.texto === '1 0');

  const pieza = {
    id: 'p0', piezaId: 'Espalda', talla: 'm', anchoCm: 50, altoCm: 70, posicion: { x: 0, y: 0 }, rotacionGrados: 0, imagenes: [],
    textos: [{ texto: 'MEDIOS Y\nCONTENIDO', cxCm: 25, cyCm: 10, anchoCm: 30, altoCm: 8, xCm: 0, yCm: 0, modo: 'llenar', zonaClave: 'n|m',
      colorHex: '#ffffff', rotacionGrados: 0, fuenteUrl: null, contornos: [{ colorHex: '#000000', grosorCm: 0.2 }] }],
  };
  const [conAjuste] = await ajustarTextosDePiezas([pieza], obtenerMedidor);
  const bytes = await generarPdfNesting({ anchoLienzoCm: 60, altoLienzoCm: 80, piezas: [{ ...conAjuste, imagenDataUrl: null }] });
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false }).promise;
  const items = (await (await doc.getPage(1)).getTextContent()).items.filter((i) => i.str.trim());
  // (pdf.js lee el espacio de la fuente incrustada como otro carácter: se compara sin espacios)
  const letras = (s) => s.replace(/[^A-Z]/g, '');
  const arriba = items.filter((i) => letras(i.str) === 'MEDIOSY'), abajo = items.filter((i) => letras(i.str) === 'CONTENIDO');
  comprobar('en el PDF: cada renglón con su contorno y su relleno', arriba.length === 2 && abajo.length === 2, items.map((i) => i.str).join('|'));
  comprobar('el primero encima del segundo, a un paso de distancia', arriba.length && abajo.length &&
    cerca(arriba[0].transform[5] - abajo[0].transform[5], conAjuste.textos[0].ajuste.lineas[1].dyCm * 28.3465 - conAjuste.textos[0].ajuste.lineas[0].dyCm * 28.3465, 0.05));
}

console.log('\n--- Contornos que escalan con la letra ---');
{
  const { contornosDeZona } = await import('../src/motor/contornosTexto.js');
  const zona = { contornosEnlazados: true, contornos: [{ colorHex: '#000000', grosorCm: 0.2, pct: 5 }, { colorHex: '#ff0000', grosorCm: 0.1, pct: 3 }] };
  comprobar('enlazados: la zona da los contornos en % (no en cm)', contornosDeZona(zona).every((c) => c.pct > 0 && !(c.grosorCm > 0)));
  comprobar('sin enlazar: en cm, como siempre', contornosDeZona({ ...zona, contornosEnlazados: false }).every((c) => c.grosorCm > 0 && !c.pct));
  const texto = (anchoCm, altoCm) => ({ texto: '10', cxCm: 30, cyCm: 30, anchoCm, altoCm, xCm: 0, yCm: 0, modo: 'calibrado', zonaClave: 'n|' + altoCm,
    colorHex: '#fff', rotacionGrados: 0, fuenteUrl: null, contornos: contornosDeZona(zona) });
  const [p] = await ajustarTextosDePiezas([{ id: 'p', piezaId: 'E', talla: 'm', anchoCm: 60, altoCm: 70, textos: [texto(10, 8), texto(20, 16)] }], obtenerMedidor);
  const [chico, grande] = p.textos;
  comprobar('el número grande lleva el contorno el doble de grueso que el chico', cerca(grande.contornos[0].grosorCm, 2 * chico.contornos[0].grosorCm, 1e-6), chico.contornos[0].grosorCm + ' / ' + grande.contornos[0].grosorCm);
  comprobar('y es el 5% del alto de la letra', cerca(chico.contornos[0].grosorCm, 0.05 * chico.ajuste.altoBandaCm, 1e-9) && cerca(chico.contornos[1].grosorCm, 0.03 * chico.ajuste.altoBandaCm, 1e-9));
  // Un nombre (llenar): la letra deja lugar para su contorno proporcional.
  const nombre = ajustarTexto({ medidor, texto: 'GIL', anchoCm: 30, altoCm: 8, modo: 'llenar', contornoRelativo: 0.08 });
  const c = nombre.contornoEnlazadoCm;
  comprobar('un nombre deja lugar para su contorno proporcional, y entra justo', cerca(c, 0.08 * nombre.altoBandaCm, 1e-4) && cerca(nombre.altoBandaCm + 2 * c, 8, 1e-3), nombre.altoBandaCm + ' + 2×' + c);
}

console.log('\n--- Alineación vertical en la zona ---');
{
  // Un nombre largo, limitado por el ancho: le sobra alto.
  const medio = ajustarTexto({ medidor, texto: 'RODRIGUEZ MARTINEZ', anchoCm: 20, altoCm: 8, modo: 'llenar' });
  const arriba = ajustarTexto({ medidor, texto: 'RODRIGUEZ MARTINEZ', anchoCm: 20, altoCm: 8, modo: 'llenar', alineacionV: 'arriba' });
  const abajo = ajustarTexto({ medidor, texto: 'RODRIGUEZ MARTINEZ', anchoCm: 20, altoCm: 8, modo: 'llenar', alineacionV: 'abajo' });
  const b = medio.altoBandaCm;
  comprobar('le sobra alto (el ancho manda)', b < 7.5, b);
  comprobar('arriba: el tope de las mayúsculas en el borde de arriba', cerca(arriba.dyCm - b, -4, 1e-6), arriba.dyCm - b);
  comprobar('abajo: la línea de base en el borde de abajo', cerca(abajo.dyCm, 4, 1e-6), abajo.dyCm);
  comprobar('mismo tamaño en los tres', medio.cuerpoCm === arriba.cuerpoCm && medio.cuerpoCm === abajo.cuerpoCm);
  const corto = ajustarTexto({ medidor, texto: 'GIL', anchoCm: 20, altoCm: 8, modo: 'llenar', alineacionV: 'arriba' });
  comprobar('un nombre que llena el alto no se mueve', cerca(corto.dyCm, 4, 1e-6), corto.dyCm);
  const num = ajustarTexto({ medidor, texto: '7', anchoCm: 20, altoCm: 8, modo: 'calibrado', alineacionV: 'arriba' });
  comprobar('un número tampoco (va a alto completo)', cerca(num.dyCm, ajustarTexto({ medidor, texto: '7', anchoCm: 20, altoCm: 8, modo: 'calibrado' }).dyCm, 1e-9));
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
      { ...textoBase, texto: '7', cxCm: 25, cyCm: 30, anchoCm: 30, altoCm: 20, modo: 'calibrado', zonaClave: 'numero|m' },
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
  // Diez números normales y UNO con muchos más dígitos que la zona: los
  // números no se achican, así que ese se sale bastante por los costados.
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
  comprobar('avisa del número que se sale mucho por los costados', avisos.some((x) => x.tipo === 'desborda-ancho' && /5555555/.test(x.mensaje)), JSON.stringify(avisos));
  comprobar('pero no lo da como "no cabe" (su alto sí cabe)', !avisos.some((x) => x.tipo === 'no-cabe' && /5555555/.test(x.mensaje)));
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
  const altoCifraPantaloneta = aJuntas.cuerpoCm * (medidor.bandaNumeros.maxY - medidor.bandaNumeros.minY);
  comprobar('y su cifra mide el alto de SU zona (8 cm), no el de la camiseta (30 cm)', cerca(altoCifraPantaloneta, 8, 1e-6), String(altoCifraPantaloneta));
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
