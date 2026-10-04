// Carga de archivos de fuente y sus medidores (ver ajusteTexto.js). Es la
// parte con entrada/salida: lee la fuente de base del disco y baja las
// fuentes propias del catálogo (Supabase Storage). Todo se guarda en memoria
// por URL -- una fuente se baja y se interpreta UNA sola vez por proceso,
// aunque la usen cientos de textos o varios PDF seguidos.

import { readFile } from 'node:fs/promises';
import fontkit from '@pdf-lib/fontkit';
import { medidorDeFontkit } from './ajusteTexto.js';

// Fuente de base: la que se usa cuando una zona no elige ninguna. Es Arimo
// Bold (Apache/OFL, métricamente compatible con Helvetica/Arial) y no la
// Helvetica estándar de pdf-lib A PROPÓSITO: las 14 fuentes estándar de PDF
// no traen contornos, y sin contornos no se puede medir la tinta real de un
// texto -- que es lo que hace falta para llenar la zona. Arimo se ve igual a
// Helvetica Bold a este tamaño y sí se puede medir (y el navegador la
// dibuja idéntica en la vista previa, ver GET /api/fuentes/base).
const RUTA_FUENTE_BASE = new URL('../../assets/fuentes/Arimo-Bold.ttf', import.meta.url);

const cacheBytes = new Map(); // url ('' = base) -> Promise<Buffer>
const cacheMedidores = new Map(); // url ('' = base) -> medidor

export function bytesFuenteBase() {
  if (!cacheBytes.has('')) cacheBytes.set('', readFile(RUTA_FUENTE_BASE));
  return cacheBytes.get('');
}

/** Bytes de una fuente por URL (null/'' = la de base). Falla si no se puede bajar. */
export function bytesDeFuente(url) {
  if (!url) return bytesFuenteBase();
  if (!cacheBytes.has(url)) {
    const promesa = fetch(url, { signal: AbortSignal.timeout(20000) })
      .then(async (respuesta) => {
        if (!respuesta.ok) throw new Error('HTTP ' + respuesta.status);
        return Buffer.from(await respuesta.arrayBuffer());
      })
      .catch((error) => {
        cacheBytes.delete(url); // que un fallo pasajero no quede guardado
        throw error;
      });
    cacheBytes.set(url, promesa);
  }
  return cacheBytes.get(url);
}

/**
 * Medidor de una fuente por URL, y la URL efectivamente usada. Si la fuente
 * propia no se puede bajar o leer, cae a la de base (y devuelve fuenteUrl
 * null): quien llama imprime con la que se midió, nunca con otra.
 */
export async function obtenerMedidor(fuenteUrl) {
  const clave = fuenteUrl || '';
  if (cacheMedidores.has(clave)) return { medidor: cacheMedidores.get(clave), fuenteUrl: fuenteUrl || null };
  try {
    const medidor = medidorDeFontkit(fontkit.create(await bytesDeFuente(fuenteUrl)));
    cacheMedidores.set(clave, medidor);
    return { medidor, fuenteUrl: fuenteUrl || null };
  } catch (error) {
    if (!fuenteUrl) throw error; // sin fuente de base no hay nada a lo que caer
    console.error('No se pudo usar la fuente (' + fuenteUrl + '): ' + error.message + ' -- se usa la de base.');
    return obtenerMedidor(null);
  }
}
