// Cargar jugadores desde una hoja de cálculo (utilidades/hojaDeCalculo.js):
// CSV (con ; , o tabulador, UTF-8 o Windows-1252), Excel .xlsx y .ods, con
// archivos armados acá igual que los guardan esos programas (zip con deflate).
import zlib from 'node:zlib';
import { leerHoja, interpretarJugadores } from '../src/utilidades/hojaDeCalculo.js';

let fallos = 0, pasadas = 0;
function comprobar(desc, cond, detalle) {
  if (cond) { pasadas++; console.log('  ✓ ' + desc); }
  else { fallos++; console.log('  ✗ ' + desc + (detalle ? '\n      ' + detalle : '')); }
}

// Un zip con deflate, como .xlsx/.ods de verdad.
function zip(archivos) {
  const tabla = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; tabla[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = tabla[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const partes = [], central = [];
  let pos = 0;
  for (const [nombre, texto] of Object.entries(archivos)) {
    const datos = Buffer.from(texto, 'utf8'), comp = zlib.deflateRawSync(datos), n = Buffer.from(nombre);
    const l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt16LE(8, 8);
    l.writeUInt32LE(crc(datos), 14); l.writeUInt32LE(comp.length, 18); l.writeUInt32LE(datos.length, 22); l.writeUInt16LE(n.length, 26);
    partes.push(l, n, comp);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(8, 10);
    c.writeUInt32LE(crc(datos), 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(datos.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(pos, 42);
    central.push(c, n);
    pos += 30 + n.length + comp.length;
  }
  const tc = central.reduce((t, b) => t + b.length, 0);
  const fin = Buffer.alloc(22); fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(central.length / 2, 8); fin.writeUInt16LE(central.length / 2, 10);
  fin.writeUInt32LE(tc, 12); fin.writeUInt32LE(pos, 16);
  return new Uint8Array(Buffer.concat([...partes, ...central, fin]));
}

const tallas = ['xs', 's', 'm', 'l', 'xl', 'xxl'];

console.log('\n--- CSV ---');
{
  const filas = await leerHoja('equipo.csv', new TextEncoder().encode('Nombre;Talla;Número\n"Peña, Juan";M;10\nGómez;2xl;7\n;;\nRUIZ;xxxl;9\n'));
  comprobar('lee el CSV con ; (Excel en español) y comillas', filas.length === 5 && filas[1][0] === 'Peña, Juan', JSON.stringify(filas));
  const r = interpretarJugadores(filas, tallas);
  comprobar('jugadores con su talla de la prenda (2XL = XXL, sin importar mayúsculas)', r.jugadores.map((j) => j.nombre + '/' + j.talla + '/' + j.numero).join(' ') === 'PEÑA, JUAN/m/10 GÓMEZ/xxl/7 RUIZ//9', JSON.stringify(r.jugadores));
  comprobar('avisa la talla que la prenda no tiene, con la fila', r.avisos.length === 1 && r.avisos[0].fila === 5 && r.avisos[0].mensaje.includes('xxxl'), JSON.stringify(r.avisos));
  // Windows-1252 (el CSV que guarda Excel), con tabulador y sin cabecera.
  const win = new Uint8Array(Buffer.from('PE\xd1A\tl\t5\nN\xda\xd1EZ\ts\t3\n', 'latin1'));
  const r2 = interpretarJugadores(await leerHoja('lista.txt', win), tallas);
  comprobar('sin cabecera: nombre, talla, número; y la Ñ de un CSV de Windows', r2.jugadores.map((j) => j.nombre + '/' + j.talla + '/' + j.numero).join(' ') === 'PEÑA/l/5 NÚÑEZ/s/3', JSON.stringify(r2.jugadores));
}

console.log('\n--- Excel (.xlsx) ---');
{
  const xlsx = zip({
    'xl/workbook.xml': '<workbook xmlns:r="r"><sheets><sheet name="Jugadores" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/sharedStrings.xml': '<sst><si><t>Jugador</t></si><si><t>Dorsal</t></si><si><t>Talla</t></si><si><t>Peña &amp; Cía</t></si><si><r><t>Gó</t></r><r><t>mez</t></r></si></sst>',
    'xl/worksheets/sheet1.xml': '<worksheet><sheetData>' +
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>' +
      '<row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2"><v>10</v></c><c r="C2" t="inlineStr"><is><t>M</t></is></c></row>' +
      '<row r="3"><c r="A3" t="s"><v>4</v></c><c r="C3" t="inlineStr"><is><t>XS</t></is></c></row>' +
      '</sheetData></worksheet>',
  });
  const filas = await leerHoja('Equipo.xlsx', xlsx);
  const r = interpretarJugadores(filas, tallas);
  comprobar('columnas por su título, en cualquier orden (Jugador, Dorsal, Talla)', r.jugadores.map((j) => j.nombre + '/' + j.talla + '/' + j.numero).join(' ') === 'PEÑA & CÍA/m/10 GÓMEZ/xs/', JSON.stringify(r.jugadores));
  comprobar('sin avisos', r.avisos.length === 0, JSON.stringify(r.avisos));
}

console.log('\n--- LibreOffice (.ods) ---');
{
  const ods = zip({
    'content.xml': '<office:document-content><office:body><office:spreadsheet><table:table table:name="Hoja1">' +
      '<table:table-row><table:table-cell><text:p>Nombre</text:p></table:table-cell><table:table-cell><text:p>Talla</text:p></table:table-cell><table:table-cell><text:p>N°</text:p></table:table-cell></table:table-row>' +
      '<table:table-row><table:table-cell office:value-type="string"><text:p>Ruiz<text:s/>Díaz</text:p></table:table-cell><table:table-cell><text:p>L</text:p></table:table-cell><table:table-cell office:value-type="float" office:value="8"><text:p>8</text:p></table:table-cell></table:table-row>' +
      '<table:table-row><table:table-cell table:number-columns-repeated="3"/></table:table-row>' +
      '</table:table></office:spreadsheet></office:body></office:document-content>',
  });
  const r = interpretarJugadores(await leerHoja('equipo.ods', ods), tallas);
  comprobar('lee el .ods (con espacios y filas vacías)', r.jugadores.map((j) => j.nombre + '/' + j.talla + '/' + j.numero).join(' ') === 'RUIZ DÍAZ/l/8', JSON.stringify(r.jugadores));
}

console.log('\n--- Lo que no se puede leer ---');
{
  let mensaje = '';
  try { await leerHoja('viejo.xls', new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])); } catch (e) { mensaje = e.message; }
  comprobar('un .xls viejo: pide guardarlo como .xlsx o .csv', mensaje.includes('.xlsx'), mensaje);
}

console.log('\n' + pasadas + ' pasadas, ' + fallos + ' fallos');
process.exit(fallos ? 1 : 0);
