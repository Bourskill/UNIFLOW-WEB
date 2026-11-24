// Datos y archivos en una carpeta (app de escritorio).
//
//   <carpeta>/datos/<colección>/<id>.json   un archivo por registro: { creadoEn, datos }
//   <carpeta>/archivos/<nombre>             diseños, moldes, logos, tipografías…
//   <carpeta>/eventos/<mes>-<pc>.jsonl      historial (una línea por cambio)
//
// La carpeta puede ser COMPARTIDA (una carpeta de red, un NAS, Google Drive):
// cada PC con la app instalada lee y escribe la misma. Por eso nada queda
// "guardado en memoria" de una PC: cada lectura mira si alguien cambió algo
// (por la fecha de modificación de cada archivo), y cada PC escribe su propio
// archivo de historial para no pisarse con las demás.
//
// Un archivo por registro (y no uno por colección) para que guardar una pieza
// no reescriba todas las demás, y para que dos personas guardando cosas
// distintas a la vez no se pisen. Cada escritura va a un archivo temporal y
// después se renombra: si se corta la luz o la red a mitad de camino, queda el
// registro anterior entero, nunca uno a medias.
//
// Los archivos se guardan con una URL relativa (/api/archivos-locales/…): la
// app la pide al mismo servidor que la sirve, y el backend, cuando necesita
// leer uno (para armar un PDF), lo lee directo del disco -- ver más abajo cómo
// se atiende `fetch` de esas URLs.

import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import os from 'node:os';
import path from 'node:path';
import { nanoid } from 'nanoid';

const CARPETA = path.resolve(process.env.UNIFLOW_CARPETA);
const CARPETA_DATOS = path.join(CARPETA, 'datos');
const CARPETA_ARCHIVOS = path.join(CARPETA, 'archivos');
const CARPETA_EVENTOS = path.join(CARPETA, 'eventos');
export const PREFIJO_ARCHIVOS = '/api/archivos-locales/';

await fs.mkdir(CARPETA_DATOS, { recursive: true });
await fs.mkdir(CARPETA_ARCHIVOS, { recursive: true });
await fs.mkdir(CARPETA_EVENTOS, { recursive: true });

export function carpetaDeDatos() {
  return CARPETA;
}

// ---- escribir sin dejar archivos a medias --------------------------------------

async function renombrarConReintentos(origen, destino) {
  // Un sincronizador (Drive, OneDrive), el antivirus o la otra PC pueden tener
  // el archivo abierto un instante: se reintenta antes de darse por vencido.
  for (let intento = 0; ; intento++) {
    try {
      await fs.rename(origen, destino);
      return;
    } catch (error) {
      if (intento >= 10 || !['EPERM', 'EBUSY', 'EACCES'].includes(error.code)) throw error;
      await new Promise((r) => setTimeout(r, 60 * (intento + 1)));
    }
  }
}

async function escribirSeguro(destino, contenido) {
  const temporal = destino + '.' + nanoid(6) + '.tmp';
  await fs.writeFile(temporal, contenido);
  try {
    await renombrarConReintentos(temporal, destino);
  } catch (error) {
    await fs.rm(temporal, { force: true });
    throw error;
  }
}

// ---- registros ------------------------------------------------------------------

const NOMBRE_VALIDO = /^[a-z0-9_-]+$/i;
function carpetaDe(coleccion) {
  if (!NOMBRE_VALIDO.test(coleccion)) throw new Error('Colección no válida: ' + coleccion);
  return path.join(CARPETA_DATOS, coleccion);
}
function archivoDe(coleccion, id) {
  return path.join(carpetaDe(coleccion), encodeURIComponent(String(id)).replace(/\*/g, '%2A') + '.json');
}

// Lo ya leído se recuerda junto con la fecha de modificación de su archivo: en
// cada lectura solo se vuelven a leer los archivos que cambiaron (otra PC
// guardó algo) y se olvidan los que ya no están (otra PC los borró).
const cache = new Map(); // colección -> { leidoEn, archivos: Map(nombre -> { mtimeMs, fila }), porId }
const FRESCURA_MS = 1000; // varias lecturas seguidas (un mismo pedido) no repiten la búsqueda

async function enTandas(lista, tamano, f) {
  for (let i = 0; i < lista.length; i += tamano) await Promise.all(lista.slice(i, i + tamano).map(f));
}

async function cargar(coleccion) {
  let estado = cache.get(coleccion);
  if (estado && Date.now() - estado.leidoEn < FRESCURA_MS) return estado.porId;
  estado ||= { archivos: new Map() };
  const carpeta = carpetaDe(coleccion);
  let nombres = [];
  try {
    nombres = (await fs.readdir(carpeta)).filter((n) => n.endsWith('.json'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const vigentes = new Set(nombres);
  for (const nombre of estado.archivos.keys()) if (!vigentes.has(nombre)) estado.archivos.delete(nombre);
  await enTandas(nombres, 32, async (nombre) => {
    const ruta = path.join(carpeta, nombre);
    try {
      const { mtimeMs } = await fs.stat(ruta);
      const previo = estado.archivos.get(nombre);
      if (previo && previo.mtimeMs === mtimeMs) return;
      const fila = JSON.parse(await fs.readFile(ruta, 'utf8'));
      if (fila && fila.datos && fila.datos.id != null) estado.archivos.set(nombre, { mtimeMs, fila });
    } catch (error) {
      // Borrado justo ahora por otra PC, o un archivo roto: no tumba la colección.
      if (error.code !== 'ENOENT') console.error('No se pudo leer ' + ruta + ': ' + error.message);
      estado.archivos.delete(nombre);
    }
  });
  // Si un sincronizador dejó dos copias del mismo registro ("x (1).json"), gana la más nueva.
  const porId = new Map();
  for (const { mtimeMs, fila } of estado.archivos.values()) {
    const id = String(fila.datos.id);
    const otro = porId.get(id);
    if (!otro || otro.mtimeMs < mtimeMs) porId.set(id, { mtimeMs, ...fila });
  }
  estado.porId = porId;
  estado.leidoEn = Date.now();
  cache.set(coleccion, estado);
  return porId;
}

function olvidar(coleccion) {
  const estado = cache.get(coleccion);
  if (estado) estado.leidoEn = 0;
}

export async function leerColeccion(nombre) {
  const registros = await cargar(nombre);
  return [...registros.values()]
    .sort((a, b) => (a.creadoEn < b.creadoEn ? -1 : a.creadoEn > b.creadoEn ? 1 : String(a.datos.id) < String(b.datos.id) ? -1 : 1))
    .map((fila) => fila.datos);
}

// Un registro suelto se lee siempre del disco: lo más nuevo, aunque lo haya
// guardado otra PC hace un segundo.
async function leerFila(nombre, id) {
  try {
    return JSON.parse(await fs.readFile(archivoDe(nombre, id), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function leerRegistro(nombre, id) {
  return (await leerFila(nombre, id))?.datos ?? null;
}

async function guardar(nombre, registro, creadoEn) {
  await fs.mkdir(carpetaDe(nombre), { recursive: true });
  await escribirSeguro(archivoDe(nombre, registro.id), JSON.stringify({ creadoEn, datos: registro }));
  olvidar(nombre);
}

export async function crearRegistro(nombre, registro) {
  if (await leerFila(nombre, registro.id)) throw new Error('Ya existe un registro con id ' + registro.id + ' en ' + nombre);
  await guardar(nombre, registro, new Date().toISOString());
}

export async function actualizarRegistro(nombre, id, registro) {
  const anterior = await leerFila(nombre, id);
  await guardar(nombre, { ...registro, id: registro.id ?? id }, anterior?.creadoEn || new Date().toISOString());
}

export async function borrarRegistro(nombre, id) {
  await fs.rm(archivoDe(nombre, id), { force: true });
  olvidar(nombre);
}

/** Guardar un registro tal cual (importar), respetando cuándo se creó. */
export async function importarRegistro(nombre, registro, creadoEn) {
  await guardar(nombre, registro, creadoEn || new Date().toISOString());
}

// ---- archivos -------------------------------------------------------------------

const RUTA_VALIDA = /^[a-z0-9_.-]+$/i;
export function rutaDeArchivo(ruta) {
  if (!RUTA_VALIDA.test(ruta) || ruta.startsWith('.')) throw new Error('Nombre de archivo no válido');
  return path.join(CARPETA_ARCHIVOS, ruta);
}

export async function subirArchivo(ruta, buffer) {
  await escribirSeguro(rutaDeArchivo(ruta), buffer);
  return PREFIJO_ARCHIVOS + ruta;
}

// El navegador sube directo al mismo servidor (PUT a esta URL, ver server.js):
// no hay tope de tamaño más que el disco.
export async function firmarSubida(ruta) {
  rutaDeArchivo(ruta);
  return { urlSubida: PREFIJO_ARCHIVOS + ruta, url: PREFIJO_ARCHIVOS + ruta };
}

export async function guardarArchivoSubido(ruta, flujo) {
  const destino = rutaDeArchivo(ruta);
  const temporal = destino + '.' + nanoid(6) + '.tmp';
  try {
    await pipeline(flujo, createWriteStream(temporal));
    await renombrarConReintentos(temporal, destino);
  } catch (error) {
    await fs.rm(temporal, { force: true });
    throw error;
  }
}

const TIPOS = {
  '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.dxf': 'application/dxf', '.json': 'application/json',
};
export function tipoDeArchivo(ruta) {
  return TIPOS[path.extname(ruta).toLowerCase()] || 'application/octet-stream';
}

// El backend lee archivos con `fetch(url)` en varios lugares (el arte de un
// diseño, una tipografía, el molde original). Con los archivos en la carpeta,
// esas URLs son relativas: se atienden leyendo el disco, sin red.
const fetchOriginal = globalThis.fetch;
globalThis.fetch = async function fetchConArchivosLocales(recurso, opciones) {
  const url = typeof recurso === 'string' ? recurso : recurso instanceof URL ? recurso.href : null;
  if (!url || !url.startsWith(PREFIJO_ARCHIVOS)) return fetchOriginal(recurso, opciones);
  const ruta = decodeURIComponent(url.slice(PREFIJO_ARCHIVOS.length).split(/[?#]/)[0]);
  try {
    const datos = await fs.readFile(rutaDeArchivo(ruta));
    return new Response(datos, { status: 200, headers: { 'content-type': tipoDeArchivo(ruta) } });
  } catch {
    return new Response('No está el archivo ' + ruta, { status: 404 });
  }
};

// ---- historial -----------------------------------------------------------------

// Cada PC escribe su propio archivo por mes: dos PCs agregando líneas al mismo
// archivo compartido a la vez podrían mezclarlas.
const nombrePc = os.hostname().replace(/[^a-z0-9_-]/gi, '_') || 'pc';

export async function registrarEvento(coleccion, accion, registroId, resumen) {
  const evento = { id: nanoid(), coleccion, accion, registroId, resumen: resumen || null, creadoEn: new Date().toISOString(), pc: nombrePc };
  try {
    await fs.appendFile(path.join(CARPETA_EVENTOS, evento.creadoEn.slice(0, 7) + '-' + nombrePc + '.jsonl'), JSON.stringify(evento) + '\n');
  } catch (error) {
    console.error('No se pudo registrar el evento (' + coleccion + '/' + accion + '/' + registroId + '): ' + error.message);
  }
}

export async function leerEventos(limite) {
  const eventos = [];
  for (const nombre of await fs.readdir(CARPETA_EVENTOS)) {
    if (!nombre.endsWith('.jsonl')) continue;
    const texto = await fs.readFile(path.join(CARPETA_EVENTOS, nombre), 'utf8').catch(() => '');
    for (const linea of texto.split('\n')) {
      if (!linea) continue;
      try { eventos.push(JSON.parse(linea)); } catch { /* una línea cortada: se salta */ }
    }
  }
  eventos.sort((a, b) => (a.creadoEn < b.creadoEn ? 1 : -1));
  return limite ? eventos.slice(0, limite) : eventos;
}
