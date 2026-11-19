// La pieza sale con EXACTAMENTE los nodos que trae el archivo: ni uno más,
// ni uno menos. Antes, cada curva se tesselaba en 48 rectas y eso era lo
// que se exportaba -- el molde y el contorno llegaban a Illustrator con
// cientos de nodos y el script de cabidas se volvía pesadísimo.
//
// Recorrido completo: un PDF con una capa (como lo exporta Illustrator) →
// importar → geometría de la pieza → mesa → PDF de producción y documento
// de Illustrator. En cada paso se cuentan los nodos.

import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDocument, PDFName, PDFOperator, PDFNumber, PDFString } from 'pdf-lib';
import { resolverGeometriasPorTalla, analizarPrendaPdf } from '../src/motor/importarPdf.js';
import { geometriasDePiezaEnPrenda } from '../src/motor/reprocesarPrenda.js';
import { resolverGeometriasPorTalla as resolverDxf } from '../src/motor/importarDxf.js';
import { geometriaParaAnclaje } from '../src/motor/geometriaAnclaje.js';
import { espejarGeometria } from '../src/motor/espejoPieza.js';
import { armarMesas } from '../src/motor/mesas.js';
import { generarPdfPaginas } from '../src/motor/exportarPdf.js';
import { documentoAiDePdf, textoDePartes } from '../src/motor/illustrator/documentoAi.js';
import { nodosDeTrazado, desplazarTrazado, aplanarTrazado, invertirTrazado, normalizarTrazado } from '../src/motor/trazado.js';

let fallos = 0, pasadas = 0;
function comprobar(desc, cond, detalle) {
  if (cond) { pasadas++; console.log('  ✓ ' + desc); }
  else { fallos++; console.log('  ✗ ' + desc + (detalle ? '\n      ' + detalle : '')); }
}

// Un delantero de camiseta (en puntos, Y hacia arriba), parecido al de la
// captura: hombros rectos, escote, sisas y costados curvos, bajo curvo.
// 14 nodos; el cierre es la recta del último al primero.
const DELANTERO = [
  ['M', 0, 600],                                   // 1 axila izq
  ['C', 40, 610, 60, 640, 62, 700],                // 2 sisa izq
  ['L', 55, 760],                                  // 3 punta hombro izq
  ['L', 210, 800],                                 // 4 cuello izq
  ['C', 220, 740, 260, 715, 300, 715],             // 5 fondo escote
  ['C', 340, 715, 380, 740, 390, 800],             // 6 cuello der
  ['L', 545, 760],                                 // 7 punta hombro der
  ['L', 538, 700],                                 // 8 sisa der
  ['C', 540, 640, 560, 610, 600, 600],             // 9 axila der
  ['C', 585, 450, 580, 300, 595, 20],              // 10 costado der
  ['C', 500, 5, 400, 0, 300, 0],                   // 11 centro del bajo
  ['C', 200, 0, 100, 5, 5, 20],                    // 12 bajo izq
  ['C', 20, 300, 15, 450, 0, 600],                 // cierre curvo (vuelve al 1)
];
const NODOS = 12;

async function pdfConCapa(nombreCapa, segmentos, cerrar = true) {
  return pdfConCapaYTrazos(nombreCapa, [segmentos], cerrar);
}

async function pdfConCapaYTrazos(nombreCapa, trazos, cerrar = true) {
  const pdf = await PDFDocument.create();
  const pagina = pdf.addPage([700, 900]);
  const ocg = pdf.context.register(pdf.context.obj({ Type: 'OCG', Name: PDFString.of(nombreCapa) }));
  pdf.catalog.set(PDFName.of('OCProperties'), pdf.context.obj({ OCGs: [ocg], D: { Order: [ocg], ON: [ocg] } }));
  pagina.node.Resources().set(PDFName.of('Properties'), pdf.context.obj({ OC1: ocg }));
  const n = (v) => PDFNumber.of(v);
  const ops = [PDFOperator.of('BDC', [PDFName.of('OC'), PDFName.of('OC1')])];
  for (const segmentos of trazos) {
    for (const s of segmentos) {
      if (s[0] === 'M') ops.push(PDFOperator.of('m', [n(s[1]), n(s[2])]));
      else if (s[0] === 'L') ops.push(PDFOperator.of('l', [n(s[1]), n(s[2])]));
      else ops.push(PDFOperator.of('c', s.slice(1).map(n)));
    }
    if (cerrar) ops.push(PDFOperator.of('h'));
    ops.push(PDFOperator.of('S'));
  }
  ops.push(PDFOperator.of('EMC'));
  pagina.pushOperators(...ops);
  return Buffer.from(await pdf.save());
}

// Nodos de cada trazo pintado de una página: [{ pintura, nodos, curvas }].
async function trazosDelPdf(bytes) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
  const ops = await (await doc.getPage(1)).getOperatorList();
  const trazos = [];
  ops.fnArray.forEach((f, i) => {
    if (f !== pdfjs.OPS.constructPath) return;
    const datos = Array.from(ops.argsArray[i][1][0] || []);
    let segmentos = 0, curvas = 0, inicio = null, fin = null;
    for (let j = 0; j < datos.length;) {
      const c = datos[j++];
      if (c === 0) { inicio = [datos[j], datos[j + 1]]; fin = inicio; j += 2; }
      else if (c === 1) { segmentos++; fin = [datos[j], datos[j + 1]]; j += 2; }
      else if (c === 2) { segmentos++; curvas++; fin = [datos[j + 4], datos[j + 5]]; j += 6; }
      else if (c === 4) { /* cierre */ }
      else break;
    }
    const vuelve = inicio && fin && Math.hypot(inicio[0] - fin[0], inicio[1] - fin[1]) < 1e-3;
    trazos.push({ pintura: ops.argsArray[i][0], nodos: segmentos + 1 - (vuelve ? 1 : 0), curvas });
  });
  return trazos;
}

const nodosDeCaminoAi = (lineas) => lineas.filter((l) => /^%_.* [LC]$/.test(l) || /^%_.* m$/.test(l));

console.log('\n--- Importar: el trazado original se guarda tal cual ---');
const archivo = await pdfConCapa('M', DELANTERO);
const { geometriasPorTalla } = await resolverGeometriasPorTalla(archivo, { M: 0 });
const geo = geometriasPorTalla.M;
comprobar('la geometría trae el trazado original', Array.isArray(geo.trazadoMm));
comprobar('con exactamente ' + NODOS + ' nodos', nodosDeTrazado(geo.trazadoMm) === NODOS, String(nodosDeTrazado(geo.trazadoMm)));
comprobar('las curvas siguen siendo curvas (8)', geo.trazadoMm.filter((s) => s[0] === 'C').length === 8);
comprobar('el polígono para medir sigue tesselado (no cambia lo demás)', geo.poligonoMm.length > 100);

console.log('\n--- Un trazado que cierra con una recta explícita no suma un nodo ---');
{
  const conCierre = [...DELANTERO.slice(0, -1), ['L', 5, 20 + 0], ['L', 0, 600]];
  const g = (await resolverGeometriasPorTalla(await pdfConCapa('M', conCierre), { M: 0 })).geometriasPorTalla.M;
  comprobar('el nodo de cierre repetido no se cuenta dos veces', nodosDeTrazado(g.trazadoMm) === NODOS, String(nodosDeTrazado(g.trazadoMm)));
}

console.log('\n--- Pieza → mesa → PDF: molde y corte con los mismos nodos ---');
const pieza = { nombre: 'Delantero', dimensionesPorTalla: { M: { anchoCm: geo.boundingBoxMm.anchoMm / 10, altoCm: geo.boundingBoxMm.altoMm / 10 } }, geometriaPorTalla: { M: geo } };
const anclaje = geometriaParaAnclaje(pieza, 'M');
comprobar('el anclaje pasa el trazado en cm, mismos nodos', nodosDeTrazado(anclaje.trazado) === NODOS);
const mesas = armarMesas([{
  piezaId: 'Delantero', talla: 'M', anchoCm: pieza.dimensionesPorTalla.M.anchoCm, altoCm: pieza.dimensionesPorTalla.M.altoCm,
  contornoCm: anclaje.vertices, trazadoCm: anclaje.trazado, piquetesCm: [], fondo: { tipo: 'solido', color1: '#3366cc' },
}]);
const cortesLaser = [];
const bytes = await generarPdfPaginas(mesas, { cortesLaser });
const trazos = await trazosDelPdf(bytes);
const largos = trazos.filter((t) => t.nodos > 4);
comprobar('fondo, contorno láser y molde: los tres con ' + NODOS + ' nodos', largos.length === 3 && largos.every((t) => t.nodos === NODOS),
  largos.map((t) => t.nodos).join(', '));
comprobar('y con sus 8 curvas cada uno', largos.every((t) => t.curvas === 8), largos.map((t) => t.curvas).join(', '));
comprobar('el corte guardado para Illustrator, mismos nodos', nodosDeTrazado(cortesLaser[0][0].trazado) === NODOS);

console.log('\n--- El corte va 1 mm afuera del molde ---');
{
  const corte = cortesLaser[0][0].trazado;
  const pt = 28.3465;
  const xs = aplanarTrazado(corte).map((p) => p[0] / pt);
  // Mesa: pieza a 1 cm del borde -> el corte, a 0,9 cm (lo más a la izquierda).
  comprobar('lo más a la izquierda del corte, 1 mm antes que la pieza', Math.abs(Math.min(...xs) - 0.9) < 0.01, String(Math.min(...xs)));
  comprobar('lo más a la derecha, 1 mm después', Math.abs(Math.max(...xs) - (1 + pieza.dimensionesPorTalla.M.anchoCm + 0.1)) < 0.01);
}

console.log('\n--- Documento de Illustrator: el corte con sus nodos ---');
{
  const partes = await documentoAiDePdf(bytes, { cortesLaser });
  const texto = textoDePartes(partes);
  const lineas = texto.split(/\r?\n/);
  const camino = nodosDeCaminoAi(lineas);
  const curvas = camino.filter((l) => / C$/.test(l)).length;
  // m + 12 segmentos (el último, la curva de cierre que vuelve al primer nodo) = 12 nodos.
  comprobar('el trazado del corte: 1 m + 12 tramos, 8 curvas', camino.length === NODOS + 1 && curvas === 8, camino.length + ' / ' + curvas);
  // Los objetos comunes del documento (molde y fondo): cuántos tramos por camino.
  const tramos = [];
  let actual = null;
  for (const l of lineas) {
    if (/^[-\d.]+ [-\d.]+ m$/.test(l)) { actual = { n: 0 }; tramos.push(actual); }
    else if (actual && /( L| C)$/.test(l) && !l.startsWith('%_')) actual.n++;
    else if (actual && /^[fFsSbBnN]$/.test(l)) actual = null;
  }
  const grandes = tramos.filter((t) => t.n > 4);
  comprobar('molde, fondo y vista del corte: 12 tramos cada uno (sin nodos de más)', grandes.length >= 2 && grandes.every((t) => t.n === NODOS), grandes.map((t) => t.n).join(', '));
}

console.log('\n--- Espejo: mismos nodos ---');
{
  const espejada = espejarGeometria(geo);
  comprobar('la pieza espejada conserva sus ' + NODOS + ' nodos', nodosDeTrazado(espejada.trazadoMm) === NODOS);
  const xs = geo.poligonoMm.map((p) => p[0]);
  const ancho = Math.max(...xs) + Math.min(...xs);
  const primero = geo.trazadoMm[0];
  comprobar('y arranca en el mismo nodo, reflejado', Math.abs(espejada.trazadoMm[0][1] - (ancho - primero[1])) < 1e-6 && Math.abs(espejada.trazadoMm[0][2] - primero[2]) < 1e-6);
}

console.log('\n--- Desplazamiento sin nodos de más ---');
{
  const cuadrado = normalizarTrazado([['M', 0, 0], ['L', 10, 0], ['L', 10, 10], ['L', 0, 10]]);
  const r = desplazarTrazado(cuadrado, 1);
  const xs = r.map((s) => s[1]), ys = r.map((s) => s[2]);
  comprobar('un cuadrado crece exactamente 1 por lado, 4 nodos', nodosDeTrazado(r) === 4 && Math.min(...xs) === -1 && Math.max(...xs) === 11 && Math.min(...ys) === -1 && Math.max(...ys) === 11, JSON.stringify(r));
  const alReves = desplazarTrazado(invertirTrazado(cuadrado), 1);
  const xs2 = alReves.map((s) => s[1]);
  comprobar('igual recorrido al revés (siempre hacia afuera)', Math.min(...xs2) === -1 && Math.max(...xs2) === 11);

  const k = 0.5522847498 * 10;
  const circulo = normalizarTrazado([['M', 10, 0], ['C', 10, k, k, 10, 0, 10], ['C', -k, 10, -10, k, -10, 0], ['C', -10, -k, -k, -10, 0, -10], ['C', k, -10, 10, -k, 10, 0]]);
  const c = desplazarTrazado(circulo, 1);
  const radios = aplanarTrazado(c, 32).map(([x, y]) => Math.hypot(x, y));
  comprobar('un círculo de radio 10 pasa a radio 11, con sus 4 nodos', nodosDeTrazado(c) === 4 && radios.every((r) => Math.abs(r - 11) < 0.01),
    Math.min(...radios) + ' – ' + Math.max(...radios));
}

console.log('\n--- Pieza vieja (sin trazado guardado): el polígono, sin el nodo repetido del cierre ---');
{
  const vieja = armarMesas([{ piezaId: 'Vieja', talla: 'M', anchoCm: 10, altoCm: 6, piquetesCm: [], fondo: null,
    contornoCm: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }, { x: 0, y: 0 }] }]);
  const t = (await trazosDelPdf(await generarPdfPaginas(vieja))).filter((x) => x.nodos >= 4);
  comprobar('molde y corte con 4 nodos', t.length === 2 && t.every((x) => x.nodos === 4), t.map((x) => x.nodos).join(', '));
}

console.log('\n--- DXF: una polilínea cerrada vuelve con sus vértices ---');
{
  // Rectángulo de 4 vértices, con el lado de arriba en arco de 90° (bulge = tan(22,5°)).
  const v = [[0, 0, 0], [100, 0, 0], [100, 60, Math.tan(Math.PI / 8)], [0, 60, 0]];
  const dxf = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES',
    '0', 'LWPOLYLINE', '8', 'M', '90', '4', '70', '1',
    ...v.flatMap(([x, y, b]) => ['10', String(x), '20', String(y), ...(b ? ['42', String(b)] : [])]),
    '0', 'ENDSEC', '0', 'EOF'].join('\n');
  const g = (await resolverDxf(dxf, { M: 0 }, { mmPorUnidad: 1 })).geometriasPorTalla.M;
  comprobar('4 nodos, sin el vértice de cierre repetido', nodosDeTrazado(g.trazadoMm) === 4, JSON.stringify(g.trazadoMm));
  comprobar('el arco queda como una curva', g.trazadoMm.filter((x) => x[0] === 'C').length === 1);
}

console.log('\n--- Prenda completa: reprocesar recupera los nodos de cada talla ---');
{
  // Dos tallas anidadas en la capa DELANTERO: la chica, achicada al 90 % desde el centro.
  const achicar = (seg) => seg.map((x) => [x[0], ...x.slice(1).map((v, i) => (i % 2 === 0 ? 300 + (v - 300) * 0.9 : 400 + (v - 400) * 0.9))]);
  const prendaPdf = await pdfConCapaYTrazos('DELANTERO', [DELANTERO, achicar(DELANTERO)]);
  const prenda = await analizarPrendaPdf(prendaPdf);
  // La pieza como quedó guardada antes: sin trazado original.
  const sinTrazado = (g) => { const { trazadoMm, ...resto } = g; return resto; };
  const guardada = { nombre: 'Delantero', geometriaPorTalla: { S: sinTrazado(prenda.piezas[0].tallas[1]), M: sinTrazado(prenda.piezas[0].tallas[0]) } };
  const { geometriasPorTalla: g, sinCoincidencia } = geometriasDePiezaEnPrenda(prenda, guardada);
  comprobar('encuentra las dos tallas en su lugar', !sinCoincidencia.length && g.S && g.M);
  comprobar('cada una con sus ' + NODOS + ' nodos', nodosDeTrazado(g.S?.trazadoMm) === NODOS && nodosDeTrazado(g.M?.trazadoMm) === NODOS);
  comprobar('y cada talla es la suya (S más chica que M)', g.S.boundingBoxMm.anchoMm < g.M.boundingBoxMm.anchoMm);
  const espejada = { nombre: 'Delantero', geometriaPorTalla: { M: espejarGeometria(guardada.geometriaPorTalla.M) } };
  comprobar('también una pieza espejada (misma caja)', !!geometriasDePiezaEnPrenda(prenda, espejada).geometriasPorTalla.M);
}

console.log('\n' + pasadas + ' pasadas, ' + fallos + ' fallos');
if (fallos > 0) process.exit(1);
