// Carga de archivos de fuente y sus medidores (ver ajusteTexto.js). Es la
// parte con entrada/salida: lee la fuente de base del disco y baja las
// fuentes propias del catálogo (Supabase Storage). Todo se guarda en memoria
// por URL -- una fuente se baja y se interpreta UNA sola vez por proceso,
// aunque la usen cientos de textos o varios PDF seguidos.
//
// Las URLs de fuente llegan DESDE EL CLIENTE (el cuerpo de /texto/ajustar y
// los textos del layout que se manda a /nesting/generar), así que el servidor
// nunca baja "lo que le pidan": solo archivos públicos del Storage de este
// mismo proyecto de Supabase, sin seguir redirecciones, con tope de tamaño, y
// solo se guardan en memoria si de verdad son una fuente (y con un máximo de
// entradas).

import { readFile } from 'node:fs/promises';
import fontkit from '@pdf-lib/fontkit';
import { medidorDeFontkit } from './ajusteTexto.js';

// Fuente de base: la que se usa cuando una zona no elige ninguna. Es Arimo
// Bold (OFL, métricamente compatible con Helvetica/Arial) y no la Helvetica
// estándar de pdf-lib A PROPÓSITO: las 14 fuentes estándar de PDF no traen
// contornos, y sin contornos no se puede medir la tinta real de un texto --
// que es lo que hace falta para llenar la zona. Arimo se ve igual a
// Helvetica Bold a este tamaño y sí se puede medir (y el navegador la
// dibuja idéntica en la vista previa, ver GET /api/fuentes/base).
const RUTA_FUENTE_BASE = new URL('../../assets/fuentes/Arimo-Bold.ttf', import.meta.url);

const TOPE_BYTES = 10 * 1024 * 1024; // ninguna fuente real se acerca a esto
const TOPE_ENTRADAS = 20; // fuentes distintas en memoria a la vez
const TIEMPO_MAXIMO_MS = 20000;

const cacheBytes = new Map(); // url ('' = base) -> Promise<Buffer>; el orden de inserción es el de uso
const cacheMedidores = new Map(); // url ('' = base) -> medidor

// Mantiene a lo sumo TOPE_ENTRADAS: al pasarse, sale el menos usado (la base nunca).
function acotar(mapa) {
  for (const clave of mapa.keys()) {
    if (mapa.size <= TOPE_ENTRADAS) break;
    if (clave !== '') mapa.delete(clave);
  }
}

function usado(mapa, clave) {
  const valor = mapa.get(clave);
  mapa.delete(clave);
  mapa.set(clave, valor);
  return valor;
}

/**
 * Solo se baja de acá: el Storage público de ESTE proyecto de Supabase.
 * Lee SUPABASE_URL en el momento (no al importar) para poder probarse.
 */
export function urlDeFuentePermitida(url) {
  try {
    const origen = process.env.SUPABASE_URL;
    if (!origen) return false;
    const destino = new URL(url);
    const propio = new URL(origen);
    return (
      destino.protocol === propio.protocol &&
      destino.host === propio.host &&
      destino.pathname.startsWith('/storage/v1/object/public/')
    );
  } catch {
    return false;
  }
}

async function leerConTope(respuesta) {
  const declarado = Number(respuesta.headers.get('content-length'));
  if (declarado > TOPE_BYTES) throw new Error('el archivo pesa más de ' + TOPE_BYTES / 1024 / 1024 + ' MB');
  const partes = [];
  let total = 0;
  for await (const trozo of respuesta.body) {
    total += trozo.length;
    if (total > TOPE_BYTES) throw new Error('el archivo pesa más de ' + TOPE_BYTES / 1024 / 1024 + ' MB');
    partes.push(trozo);
  }
  return Buffer.concat(partes);
}

export function bytesFuenteBase() {
  if (!cacheBytes.has('')) {
    cacheBytes.set('', readFile(RUTA_FUENTE_BASE).catch((error) => {
      cacheBytes.delete(''); // que un fallo no quede guardado para siempre
      throw error;
    }));
  }
  return cacheBytes.get('');
}

/** Bytes de una fuente por URL (null/'' = la de base). Falla si no se puede bajar o no es una fuente. */
export function bytesDeFuente(url) {
  if (!url) return bytesFuenteBase();
  if (cacheBytes.has(url)) return usado(cacheBytes, url);
  if (!urlDeFuentePermitida(url)) return Promise.reject(new Error('URL de fuente no permitida'));

  const promesa = fetch(url, { redirect: 'error', signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS) })
    .then(async (respuesta) => {
      if (!respuesta.ok) throw new Error('HTTP ' + respuesta.status);
      const bytes = await leerConTope(respuesta);
      fontkit.create(bytes); // lanza si no es una fuente: basura y errores en HTML no se guardan
      return bytes;
    })
    .catch((error) => {
      cacheBytes.delete(url); // un fallo no se guarda: el próximo intento vuelve a probar
      throw error;
    });
  cacheBytes.set(url, promesa);
  acotar(cacheBytes);
  return promesa;
}

/**
 * Medidor de una fuente por URL, y la URL efectivamente usada. Si la fuente
 * propia no se puede bajar o leer, cae a la de base (y devuelve fuenteUrl
 * null): quien llama imprime con la que se midió, nunca con otra.
 */
export async function obtenerMedidor(fuenteUrl) {
  const clave = fuenteUrl || '';
  if (cacheMedidores.has(clave)) return { medidor: usado(cacheMedidores, clave), fuenteUrl: fuenteUrl || null };
  try {
    const medidor = medidorDeFontkit(fontkit.create(await bytesDeFuente(fuenteUrl)));
    cacheMedidores.set(clave, medidor);
    acotar(cacheMedidores);
    return { medidor, fuenteUrl: fuenteUrl || null };
  } catch (error) {
    if (!fuenteUrl) throw error; // sin fuente de base no hay nada a lo que caer
    console.error('No se pudo usar la fuente (' + fuenteUrl + '): ' + error.message + ' -- se usa la de base.');
    return obtenerMedidor(null);
  }
}
