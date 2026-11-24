// Rutas que solo existen en la app de escritorio (datos en una carpeta, ver
// dominio/almacenLocal.js): servir y recibir los archivos de la carpeta, y
// traerse todo lo que hay en la versión web (Supabase) la primera vez.

import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import {
  PREFIJO_ARCHIVOS, rutaDeArchivo, tipoDeArchivo, guardarArchivoSubido, importarRegistro, carpetaDeDatos,
} from '../dominio/almacenLocal.js';
import { leerColeccion } from '../dominio/almacen.js';

export const router = express.Router();

// ---- archivos de la carpeta ---------------------------------------------------

const rutaPedida = (req) => decodeURIComponent(req.params.ruta || '');

router.get('/archivos-locales/:ruta', (req, res) => {
  let archivo;
  try { archivo = rutaDeArchivo(rutaPedida(req)); } catch { return res.status(400).end(); }
  res.sendFile(archivo, { headers: { 'Content-Type': tipoDeArchivo(archivo) }, maxAge: '1h' }, (error) => {
    if (error && !res.headersSent) res.status(error.statusCode === 404 || error.code === 'ENOENT' ? 404 : 500).end();
  });
});

// La subida "directa" del navegador (api.js·subirArchivo): el cuerpo es el
// archivo tal cual, sin tope de tamaño ni pasar por memoria entero.
router.put('/archivos-locales/:ruta', async (req, res) => {
  try {
    await guardarArchivoSubido(rutaPedida(req), req);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: 'No se pudo guardar el archivo: ' + error.message });
  }
});

router.get('/escritorio', (req, res) => {
  res.json({ carpeta: carpetaDeDatos() });
});

// ---- traerse los datos de la versión web --------------------------------------

const COLECCIONES = ['piezas', 'grupos', 'disenos', 'productos', 'plantillas', 'pedidos', 'fuentes', 'generaciones'];
// Una URL de Supabase Storage (lo que guarda la versión web para cada archivo).
const URL_STORAGE = /^https?:\/\/[^/\s]+\/storage\/v1\/object\/public\/archivos\/([^?#\s]+)$/i;

let importacion = null; // { estado, paso, hechos, total, archivos, errores[], error }

function urlsDeArchivos(valor, encontradas = new Set()) {
  if (typeof valor === 'string') {
    if (URL_STORAGE.test(valor)) encontradas.add(valor);
  } else if (Array.isArray(valor)) {
    for (const v of valor) urlsDeArchivos(v, encontradas);
  } else if (valor && typeof valor === 'object') {
    for (const v of Object.values(valor)) urlsDeArchivos(v, encontradas);
  }
  return encontradas;
}

function reemplazarUrls(valor, mapa) {
  if (typeof valor === 'string') return mapa.get(valor) ?? valor;
  if (Array.isArray(valor)) return valor.map((v) => reemplazarUrls(v, mapa));
  if (valor && typeof valor === 'object') return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, reemplazarUrls(v, mapa)]));
  return valor;
}

function nombreLocal(url) {
  const ruta = decodeURIComponent(url.match(URL_STORAGE)[1]).split('/').pop();
  return ruta.replace(/[^a-z0-9_.-]/gi, '_').replace(/^\.+/, '') || 'archivo';
}

async function importar(origen, clave) {
  const base = origen.replace(/\/+$/, '').replace(/\/api$/, '') + '/api';
  const encabezados = { Authorization: 'Bearer ' + clave };
  const pedirColeccion = async (nombre) => {
    let r = await fetch(base + '/respaldo/' + nombre, { headers: encabezados });
    // Una versión web anterior a la ruta de respaldo: la lista común.
    if (r.status === 404) r = await fetch(base + '/' + nombre, { headers: encabezados });
    if (r.status === 401) throw new Error('La clave de la versión web no es correcta.');
    if (!r.ok) throw new Error('La versión web respondió ' + r.status + ' al pedir ' + nombre + '.');
    return r.json();
  };

  importacion.paso = 'Leyendo los datos de la versión web';
  const datos = {};
  for (const nombre of COLECCIONES) datos[nombre] = await pedirColeccion(nombre);

  const urls = [...urlsDeArchivos(datos)];
  importacion.total = urls.length;
  importacion.paso = 'Bajando los archivos (diseños, moldes, logos, tipografías)';
  const mapa = new Map();
  const ya = new Set(fs.readdirSync(path.dirname(rutaDeArchivo('x'))));
  let siguiente = 0;
  async function trabajador() {
    while (siguiente < urls.length) {
      const url = urls[siguiente++];
      const nombre = nombreLocal(url);
      try {
        if (!ya.has(nombre)) {
          const r = await fetch(url);
          if (!r.ok) throw new Error('respondió ' + r.status);
          await guardarArchivoSubido(nombre, Readable.fromWeb(r.body));
        }
        mapa.set(url, PREFIJO_ARCHIVOS + nombre);
      } catch (error) {
        importacion.errores.push('No se pudo bajar ' + nombre + ': ' + error.message);
      }
      importacion.hechos++;
    }
  }
  await Promise.all(Array.from({ length: 4 }, trabajador));

  importacion.paso = 'Guardando en la carpeta';
  const inicio = Date.now() - 1e6;
  for (const nombre of COLECCIONES) {
    const lista = datos[nombre] || [];
    for (let i = 0; i < lista.length; i++) {
      const registro = reemplazarUrls(lista[i], mapa);
      await importarRegistro(nombre, registro, registro.creadoEn || new Date(inicio + i).toISOString());
    }
    importacion.registros[nombre] = lista.length;
  }
}

router.get('/escritorio/importar', (req, res) => {
  res.json(importacion || { estado: 'nada' });
});

router.post('/escritorio/importar', express.json(), (req, res) => {
  const { origen, clave } = req.body || {};
  if (!/^https?:\/\//i.test(origen || '') || !clave) return res.status(400).json({ error: 'Faltan la dirección de la versión web y su clave.' });
  if (importacion?.estado === 'trabajando') return res.status(409).json({ error: 'Ya se está importando.' });
  importacion = { estado: 'trabajando', paso: 'Conectando', hechos: 0, total: 0, errores: [], registros: {} };
  importar(origen, clave)
    .then(() => { importacion.estado = 'listo'; importacion.paso = 'Listo'; })
    .catch((error) => { importacion.estado = 'error'; importacion.error = error.message; });
  res.status(202).json(importacion);
});

// Para quien quiera revisar qué hay: cuántos registros tiene cada colección.
router.get('/escritorio/resumen', async (req, res) => {
  const resumen = {};
  for (const nombre of COLECCIONES) resumen[nombre] = (await leerColeccion(nombre)).length;
  res.json(resumen);
});
