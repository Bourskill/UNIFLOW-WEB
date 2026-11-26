// Leer una hoja de cálculo con los jugadores de un pedido (nombre, talla,
// número), en el navegador y sin librerías: CSV/TSV/TXT, Excel (.xlsx/.xlsm)
// y LibreOffice/OpenOffice (.ods). Un .xls viejo (binario) no: se pide
// guardarlo como .xlsx o .csv.
//
// leerHoja(nombreArchivo, bytes) → filas (arreglo de arreglos de texto) de la
// PRIMERA hoja. leerHojas(nombreArchivo, bytes) → [{ nombre, filas }], TODAS
// las hojas del libro (un CSV es una sola, con el nombre del archivo). interpretarJugadores(filas, tallasValidas) → las líneas del
// pedido, con avisos por fila.

export async function leerHoja(nombreArchivo, bytes) {
  return (await leerHojas(nombreArchivo, bytes))[0]?.filas || [];
}

export async function leerHojas(nombreArchivo, bytes) {
  const ext = (String(nombreArchivo).toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';
  const datos = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const esZip = datos[0] === 0x50 && datos[1] === 0x4b;
  if (esZip) {
    const archivos = await leerZip(datos);
    if (archivos.has('xl/workbook.xml')) return hojasDeXlsx(archivos);
    if (archivos.has('content.xml')) return hojasDeOds(archivos);
    throw new Error('El archivo no parece una hoja de cálculo (.xlsx u .ods).');
  }
  if (ext === 'xls' || (datos[0] === 0xd0 && datos[1] === 0xcf)) {
    throw new Error('Los .xls viejos no se pueden leer: guardalo como .xlsx o .csv desde Excel.');
  }
  const nombre = String(nombreArchivo).replace(/\.[a-z0-9]+$/i, '');
  return [{ nombre, filas: filasDeTexto(decodificarTexto(datos)) }];
}

// --- texto (CSV / TSV) ---------------------------------------------------

function decodificarTexto(datos) {
  // UTF-8 (con o sin BOM); si no es UTF-8 válido, Windows-1252 (el CSV de Excel en español).
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(datos).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(datos);
  }
}

export function filasDeTexto(texto) {
  const lineas = texto.replace(/\r\n?/g, '\n');
  // El separador: el que más aparece en la primera línea (; en el Excel en
  // español, , en el inglés, tabulador al copiar y pegar).
  const primera = lineas.split('\n')[0] || '';
  const sep = ['\t', ';', ','].map((s) => [s, primera.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const filas = [];
  let fila = [], campo = '', comillas = false;
  for (let i = 0; i < lineas.length; i++) {
    const c = lineas[i];
    if (comillas) {
      if (c === '"' && lineas[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"' && campo === '') comillas = true;
    else if (c === sep) { fila.push(campo); campo = ''; }
    else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; }
    else campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  return limpiarFilas(filas);
}

// Las filas vacías quedan (vacías): así el número de fila de un aviso es el
// mismo que se ve en la planilla.
function limpiarFilas(filas) {
  const r = filas.map((f) => (f || []).map((v) => String(v ?? '').trim()));
  while (r.length && !r[r.length - 1].some((v) => v !== '')) r.pop();
  return r;
}

// --- zip (xlsx / ods) ------------------------------------------------------

async function leerZip(datos) {
  const dv = new DataView(datos.buffer, datos.byteOffset, datos.byteLength);
  // Fin del directorio central: buscando desde el final.
  let fin = -1;
  for (let i = datos.length - 22; i >= Math.max(0, datos.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { fin = i; break; }
  }
  if (fin < 0) throw new Error('El archivo está dañado (no es un zip válido).');
  const cantidad = dv.getUint16(fin + 10, true);
  let p = dv.getUint32(fin + 16, true);
  const archivos = new Map();
  const decodificador = new TextDecoder('utf-8');
  for (let k = 0; k < cantidad; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const metodo = dv.getUint16(p + 10, true);
    const comprimido = dv.getUint32(p + 20, true);
    const largoNombre = dv.getUint16(p + 28, true), largoExtra = dv.getUint16(p + 30, true), largoComentario = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const nombre = decodificador.decode(datos.subarray(p + 46, p + 46 + largoNombre));
    p += 46 + largoNombre + largoExtra + largoComentario;
    // Solo lo que hace falta: XML del libro, no imágenes.
    if (!/\.(xml|rels)$/i.test(nombre)) continue;
    const inicio = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const crudo = datos.subarray(inicio, inicio + comprimido);
    let contenido;
    if (metodo === 0) contenido = crudo;
    else if (metodo === 8) contenido = await inflar(crudo);
    else continue;
    archivos.set(nombre, decodificador.decode(contenido));
  }
  return archivos;
}

async function inflar(bytes) {
  const flujo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(flujo).arrayBuffer());
}

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function textoXml(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTIDADES[e] ?? m;
  });
}

// Las hojas del libro en el orden de las pestañas, cada una por la relación
// del workbook (las ocultas también: el usuario decide si cargarlas).
function hojasDeXlsx(archivos) {
  const libro = archivos.get('xl/workbook.xml');
  const rels = archivos.get('xl/_rels/workbook.xml.rels') || '';
  const destinos = new Map();
  for (const m of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = (m[1].match(/\bId="([^"]+)"/) || [])[1];
    destinos.set(id, (m[1].match(/\bTarget="([^"]+)"/) || [])[1]);
  }
  const compartidos = textosCompartidos(archivos);
  const hojas = [];
  for (const s of libro.matchAll(/<sheet\b([^>]*?)\/?>/g)) {
    const id = (s[1].match(/\br:id="([^"]+)"/) || s[1].match(/\bid="([^"]+)"/) || [])[1];
    const nombre = textoXml((s[1].match(/\bname="([^"]*)"/) || [])[1] || 'Hoja ' + (hojas.length + 1));
    const destino = destinos.get(id);
    if (!destino) continue;
    const ruta = destino.startsWith('/') ? destino.slice(1) : 'xl/' + destino.replace(/^\.\//, '');
    const hoja = archivos.get(ruta);
    if (hoja) hojas.push({ nombre, filas: filasDeHojaXlsx(hoja, compartidos) });
  }
  if (!hojas.length) {
    const hoja = archivos.get('xl/worksheets/sheet1.xml');
    if (!hoja) throw new Error('No encontré ninguna hoja en el libro.');
    hojas.push({ nombre: 'Hoja 1', filas: filasDeHojaXlsx(hoja, compartidos) });
  }
  return hojas;
}

function textosCompartidos(archivos) {
  const compartidos = [];
  const sst = archivos.get('xl/sharedStrings.xml') || '';
  for (const si of sst.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    compartidos.push([...si[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => textoXml(t[1])).join(''));
  }
  return compartidos;
}

function filasDeHojaXlsx(hoja, compartidos) {
  const filas = [];
  for (const fila of hoja.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const valores = [];
    const numeroFila = Number((fila[1].match(/\br="(\d+)"/) || [])[1]) || filas.length + 1;
    for (const celda of fila[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = celda[1], cuerpo = celda[2] || '';
      const ref = (attrs.match(/\br="([A-Z]+)\d+"/) || [])[1];
      const col = ref ? columnaANumero(ref) : valores.length;
      const tipo = (attrs.match(/\bt="([^"]+)"/) || [])[1];
      const v = (cuerpo.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      let valor = '';
      if (tipo === 's') valor = compartidos[Number(v)] ?? '';
      else if (tipo === 'inlineStr') valor = [...cuerpo.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => textoXml(t[1])).join('');
      else if (v !== undefined) valor = textoXml(v);
      while (valores.length < col) valores.push('');
      valores[col] = valor;
    }
    // Las filas que Excel no guarda (vacías) también cuentan para el número de fila.
    while (filas.length < numeroFila - 1) filas.push([]);
    filas[numeroFila - 1] = valores;
  }
  return limpiarFilas(filas);
}

function columnaANumero(letras) {
  let n = 0;
  for (const c of letras) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

function hojasDeOds(archivos) {
  const contenido = archivos.get('content.xml');
  const hojas = [];
  for (const t of contenido.matchAll(/<table:table\b([^>]*)>([\s\S]*?)<\/table:table>/g)) {
    const nombre = textoXml((t[1].match(/table:name="([^"]*)"/) || [])[1] || 'Hoja ' + (hojas.length + 1));
    hojas.push({ nombre, filas: filasDeTablaOds(t[2]) });
  }
  return hojas.length ? hojas : [{ nombre: 'Hoja 1', filas: [] }];
}

function filasDeTablaOds(tabla) {
  const filas = [];
  for (const fila of tabla.matchAll(/<table:table-row\b([^>]*)>([\s\S]*?)<\/table:table-row>/g)) {
    const valores = [];
    for (const celda of fila[2].matchAll(/<table:(?:covered-)?table-cell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/table:(?:covered-)?table-cell>)/g)) {
      const attrs = celda[1], cuerpo = celda[2] || '';
      const repetir = Math.min(Number((attrs.match(/table:number-columns-repeated="(\d+)"/) || [])[1] || 1), 50);
      const parrafos = [...cuerpo.matchAll(/<text:p\b[^>]*>([\s\S]*?)<\/text:p>/g)].map((p) => textoXml(p[1].replace(/<text:s\b[^>]*\/>/g, ' ').replace(/<[^>]+>/g, '')));
      const valor = parrafos.length ? parrafos.join(' ') : (attrs.match(/office:value="([^"]*)"/) || [])[1] || '';
      for (let k = 0; k < repetir; k++) valores.push(valor);
    }
    filas.push(valores);
  }
  return limpiarFilas(filas);
}

// --- de filas a jugadores --------------------------------------------------

const CABECERAS = {
  nombre: /^(nombre|jugador|jugadora|name|apellido|nombre del jugador|estampado)$/i,
  talla: /^(talla|tallas|size|talle)$/i,
  numero: /^(n[uú]mero|numero|n[°º.]?|#|dorsal|num|number|no\.?)$/i,
};

function normalizarCabecera(v) {
  return String(v).normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();
}

// "2XL" y "XXL" son la misma talla; "Xs", "xs" y "XS" también.
function claveTalla(t) {
  const s = String(t).trim().toUpperCase().replace(/\s+/g, '');
  const m = s.match(/^(\d)XL$/);
  if (m) return 'X'.repeat(Number(m[1])) + 'L';
  return s;
}

/**
 * filas: la hoja leída. tallasValidas: las tallas que tiene la prenda.
 * Devuelve { jugadores: [{nombre, talla, numero, fila}], avisos: [{fila, mensaje}], columnas }.
 * La primera fila con "nombre"/"talla"/"número" es la cabecera; sin cabecera,
 * se asume nombre, talla, número en ese orden.
 */
export function interpretarJugadores(filas, tallasValidas = []) {
  const avisos = [];
  let inicio = 0;
  let columnas = { nombre: 0, talla: 1, numero: 2 };
  const idxCabecera = filas.findIndex((f, i) => i < 5 && f.some((v) => Object.values(CABECERAS).some((r) => r.test(normalizarCabecera(v)))));
  if (idxCabecera >= 0) {
    const cab = filas[idxCabecera].map(normalizarCabecera);
    const buscar = (r) => cab.findIndex((v) => r.test(v));
    columnas = { nombre: buscar(CABECERAS.nombre), talla: buscar(CABECERAS.talla), numero: buscar(CABECERAS.numero) };
    inicio = idxCabecera + 1;
    if (columnas.talla < 0) avisos.push({ fila: idxCabecera + 1, mensaje: 'No encontré la columna de la talla (ponele «Talla» de título).' });
  }
  const porClave = new Map(tallasValidas.map((t) => [claveTalla(t), t]));
  const jugadores = [];
  for (let i = inicio; i < filas.length; i++) {
    const f = filas[i];
    const valor = (c) => (c >= 0 && c < f.length ? String(f[c]).trim() : '');
    const nombre = valor(columnas.nombre).toUpperCase();
    const numero = valor(columnas.numero).replace(/\.0+$/, '');
    const tallaLeida = valor(columnas.talla);
    if (!nombre && !numero && !tallaLeida) continue;
    const talla = tallaLeida ? porClave.get(claveTalla(tallaLeida)) : undefined;
    if (!tallaLeida) avisos.push({ fila: i + 1, mensaje: 'Fila ' + (i + 1) + ' (' + (nombre || numero || 'sin nombre') + '): falta la talla.' });
    else if (!talla) avisos.push({ fila: i + 1, mensaje: 'Fila ' + (i + 1) + ' (' + (nombre || numero || 'sin nombre') + '): la talla «' + tallaLeida + '» no está en la prenda (' + tallasValidas.join(', ').toUpperCase() + ').' });
    jugadores.push({ nombre, numero, talla: talla || '', tallaLeida, fila: i + 1 });
  }
  return { jugadores, avisos, columnas };
}
