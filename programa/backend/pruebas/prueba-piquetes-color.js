// Piquetes en las mesas: con su forma real (orientación incluida) y de un
// color que resalte contra el DISEÑO (no solo contra el fondo), o el que se
// elija a mano en la producción.
import zlib from 'node:zlib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { leerPng } from '../src/motor/png.js';
import { armarMesas } from '../src/motor/mesas.js';
import { generarPdfPaginas, colorVisibleEn, blancoONegroSobre } from '../src/motor/exportarPdf.js';
import { contornoYPiquetesDeTrazos } from '../src/motor/geometriaComun.js';

let fallos = 0, pasadas = 0;
function comprobar(desc, cond, detalle) {
  if (cond) { pasadas++; console.log('  ✓ ' + desc); }
  else { fallos++; console.log('  ✗ ' + desc + (detalle ? '\n      ' + detalle : '')); }
}

// Un PNG RGBA de prueba: mitad izquierda de un color, mitad derecha de otro.
function png(ancho, alto, izq, der) {
  const filas = [];
  for (let y = 0; y < alto; y++) {
    const f = Buffer.alloc(1 + ancho * 4);
    for (let x = 0; x < ancho; x++) Buffer.from([...(x < ancho / 2 ? izq : der), 255]).copy(f, 1 + x * 4);
    filas.push(f);
  }
  const trozo = (tipo, datos) => {
    const t = Buffer.concat([Buffer.from(tipo, 'latin1'), datos]);
    const largo = Buffer.alloc(4); largo.writeUInt32BE(datos.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(t) >>> 0);
    return Buffer.concat([largo, t, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0); ihdr.writeUInt32BE(alto, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), trozo('IHDR', ihdr),
    trozo('IDAT', zlib.deflateSync(Buffer.concat(filas))), trozo('IEND', Buffer.alloc(0))]);
}

console.log('\n--- Leer los colores del diseño (PNG) ---');
{
  const p = leerPng(png(10, 4, [10, 20, 30], [250, 240, 230]));
  comprobar('lee tamaño y píxeles', p && p.ancho === 10 && p.alto === 4 && p.rgba[0] === 10 && p.rgba[(9 * 4)] === 250);
  comprobar('algo que no es PNG: null (se usa el fondo)', leerPng(Buffer.from('hola')) === null);
}

console.log('\n--- El color que resalta, contra lo que se ve ---');
{
  const pieza = { anchoCm: 40, altoCm: 20 };
  const pixeles = leerPng(png(40, 20, [5, 5, 5], [250, 250, 250])); // izquierda negra, derecha blanca
  const rect = { x: 0, y: 0, ancho: 40, alto: 20 };
  const enNegro = blancoONegroSobre(colorVisibleEn({ pieza, fondo: null, pixeles, rect, punto: { x: 5, y: 10 } }));
  const enBlanco = blancoONegroSobre(colorVisibleEn({ pieza, fondo: null, pixeles, rect, punto: { x: 35, y: 10 } }));
  comprobar('sobre la parte negra del diseño, blanco', enNegro.red === 1 && enNegro.green === 1);
  comprobar('sobre la parte blanca, negro', enBlanco.red === 0 && enBlanco.green === 0);
  const volteado = blancoONegroSobre(colorVisibleEn({ pieza, fondo: null, pixeles, rect: { ...rect, espejoH: true }, punto: { x: 5, y: 10 } }));
  comprobar('con el diseño en espejo, mira el lado que se ve', volteado.red === 0);
  const sinArte = blancoONegroSobre(colorVisibleEn({ pieza, fondo: { tipo: 'solido', color1: '#101010' }, pixeles: null, rect: null, punto: { x: 5, y: 10 } }));
  comprobar('sin diseño, contra el fondo de color (como antes)', sinArte.red === 1);
}

console.log('\n--- Forma real del piquete ---');
{
  // Contorno 40x20 cm (en mm) y un piquete en V de 6 mm en el borde de arriba.
  const geo = contornoYPiquetesDeTrazos([
    { puntos: [[0, 0], [400, 0], [400, 200], [0, 200]], cerrado: true, segmentos: null },
    { puntos: [[197, 200], [200, 194], [203, 200]], cerrado: false, segmentos: null },
  ], 1);
  comprobar('se guarda el trazo del piquete, no solo su caja', geo.piquetesMm[0]?.puntosMm?.length === 3, JSON.stringify(geo.piquetesMm));
}

console.log('\n--- En la mesa: forma real y color ---');
{
  const contornoCm = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 20 }, { x: 0, y: 20 }];
  const piquete = { x: 20, y: 0.3, ancho_cm: 0.6, alto_cm: 0.6, puntos: [{ x: 19.7, y: 0 }, { x: 20, y: 0.6 }, { x: 20.3, y: 0 }] };
  const dato = 'data:image/png;base64,' + png(40, 20, [5, 5, 5], [5, 5, 5]).toString('base64'); // diseño negro
  const pieza = (extra = {}) => ({ piezaId: 'FRENTE', talla: 'm', anchoCm: 40, altoCm: 20, contornoCm, piquetesCm: [piquete],
    imagenDataUrl: dato, imagenVistaUrl: dato, textos: [], imagenes: [], ...extra });
  const colores = async (p) => {
    const bytes = await generarPdfPaginas(armarMesas([p]));
    const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
    const ops = await (await doc.getPage(1)).getOperatorList();
    const lineas = ops.fnArray.filter((f) => f === pdfjs.OPS.constructPath).length;
    const trazos = ops.fnArray.map((f, i) => (f === pdfjs.OPS.setStrokeRGBColor ? String(ops.argsArray[i]) : null)).filter(Boolean);
    return { lineas, trazos };
  };
  const auto = await colores(pieza());
  comprobar('automático sobre un diseño negro: piquetes y molde en blanco', auto.trazos.slice(-2).every((c) => /ffffff|255,255,255/i.test(c)), JSON.stringify(auto.trazos));
  const manual = await colores(pieza({ colorMarcas: '#ff00ff' }));
  comprobar('con un color elegido, ese', manual.trazos.slice(-2).every((c) => /ff00ff|255,0,255/i.test(c)), JSON.stringify(manual.trazos));
}

console.log('\n--- Piquete PEGADO al contorno (aguja): solo el del molde ---');
{
  const { geometriaParaAnclaje } = await import('../src/motor/geometriaAnclaje.js');
  // Borde de arriba con una aguja de 5 mm hacia adentro en x = 200 mm.
  const poligonoMm = [[0, 0], [400, 0], [400, 200], [201, 200], [200, 200], [200, 195], [200, 200], [199, 200], [0, 200]];
  const geo = contornoYPiquetesDeTrazos([{ puntos: poligonoMm, cerrado: true, segmentos: null }], 1);
  comprobar('se detecta la aguja', geo.piquetesMm.some((p) => p.tipo === 'aguja'), JSON.stringify(geo.piquetesMm));
  const pieza = { nombre: 'F', dimensionesPorTalla: { T: { anchoCm: 40, altoCm: 20 } }, geometriaPorTalla: { T: geo } };
  const a = geometriaParaAnclaje(pieza, 'T');
  comprobar('llega a la mesa marcado como pegado', a.piquetes.length === 1 && a.piquetes[0].pegado === true, JSON.stringify(a.piquetes));
  const trazos = async (piquetesCm) => {
    const bytes = await generarPdfPaginas(armarMesas([{ piezaId: 'F', talla: 'T', anchoCm: 40, altoCm: 20, contornoCm: a.vertices, trazadoCm: a.trazado,
      piquetesCm, fondo: { tipo: 'solido', color1: '#000000' }, textos: [], imagenes: [] }]));
    const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
    const ops = await (await doc.getPage(1)).getOperatorList();
    return ops.fnArray.filter((f) => f === pdfjs.OPS.constructPath).length;
  };
  const con = await trazos(a.piquetes), sin = await trazos([]);
  comprobar('no se le suma una raya encima (antes: centrada en la punta, se pasaba 2,5 mm)', con === sin, con + ' vs ' + sin);
}

console.log('\n' + pasadas + ' pasadas, ' + fallos + ' fallos');
process.exit(fallos ? 1 : 0);
