import { useCallback, useEffect, useSyncExternalStore } from 'react';
import {
  listarPiezas, listarGrupos, listarDisenos, listarProductos, listarPlantillas,
  listarPedidos, listarFuentes, listarGeneraciones, verificarSalud, EVENTO_ESCRITURA,
} from '../api.js';
import { crearAlmacen } from './almacen.js';
import { avisar } from './avisos.js';

// La caché única de la app (ver almacen.js). Cada nombre es una tabla del backend.
export const almacen = crearAlmacen({
  listadores: {
    piezas: listarPiezas,
    grupos: listarGrupos,
    disenos: listarDisenos,
    productos: listarProductos,
    plantillas: listarPlantillas,
    pedidos: listarPedidos,
    fuentes: listarFuentes,
    generaciones: listarGeneraciones,
  },
  avisar,
  // Toda escritura hecha desde esta app ya invalida la caché (ver más
  // abajo); la vigencia solo cubre cambios hechos desde otro dispositivo.
  vigenciaMs: 5 * 60 * 1000,
});

// Cualquier guardado o borrado (api.js avisa con este evento) deja vieja la
// caché: lo ya cargado se vuelve a pedir por detrás, y quien lo lea mientras
// tanto espera esa versión nueva en vez de recibir la anterior.
// `sucias`: colecciones que pueden haber cambiado por un guardado propio --
// solo ESAS hacen esperar a obtener(); un refresco de rutina (ej. al volver
// a la pestaña) no frena a nadie, se muestra lo que hay y se actualiza solo.
const sucias = new Set();
if (typeof window !== 'undefined') {
  window.addEventListener(EVENTO_ESCRITURA, (evento) => {
    const coleccion = evento.detail?.coleccion;
    const cuales = coleccion && almacen.nombres.includes(coleccion) ? [coleccion] : almacen.nombres;
    for (const n of cuales) sucias.add(n);
    almacen.invalidar(cuales);
  });
}

/**
 * Tras un guardado cuyo resultado YA devolvió el servidor (el registro
 * actualizado): se pone en la caché tal cual y nadie tiene que esperar a
 * volver a pedir la colección entera -- eso era lo que hacía lento
 * "Guardar cambios" (la lista de piezas trae la geometría de todo).
 */
export function confirmarGuardado(nombre, registro) {
  almacen.guardarLocal(nombre, registro);
  sucias.delete(nombre);
  return registro;
}

/**
 * Borrado optimista: desaparece de la caché YA y el DELETE corre por detrás;
 * si falla, vuelve a su lugar y sale un aviso (datos/avisos.js). Devuelve
 * true/false según cómo terminó.
 */
export async function borrarRegistro(nombre, id, llamada, etiqueta) {
  const promesa = almacen.eliminar(nombre, id, llamada, { etiqueta });
  sucias.delete(nombre);
  const ok = await promesa;
  sucias.delete(nombre);
  return ok;
}

/**
 * Lo que usan las pantallas para leer una colección: si ya está en la caché,
 * vuelve AL INSTANTE (y, si está vieja, se refresca por detrás para la próxima
 * vez); si un guardado propio la dejó vieja, espera la versión nueva. Tira si
 * no hay datos y la carga falló.
 */
export async function obtener(nombre) {
  const estado = almacen.leer(nombre);
  if (estado.datos !== null && !sucias.has(nombre)) {
    almacen.asegurar(nombre);
    return estado.datos;
  }
  await almacen.asegurar(nombre);
  sucias.delete(nombre);
  const final = almacen.leer(nombre);
  if (final.datos === null) throw new Error(final.error || 'No se pudieron cargar los datos (' + nombre + ').');
  return final.datos;
}

/**
 * Al abrir la app: despierta el servidor (Render gratis se duerme y tarda
 * hasta un minuto) y, apenas responde, pide todas las colecciones en
 * paralelo -- así cada pantalla ya tiene sus datos al entrar, en vez de
 * cargarlos recién ahí.
 */
export async function precargar({ intentos = 30, esperaMs = 3000 } = {}) {
  for (let i = 0; i < intentos; i++) {
    if (await verificarSalud()) {
      await Promise.all(almacen.nombres.map((n) => almacen.asegurar(n)));
      return true;
    }
    await new Promise((r) => setTimeout(r, esperaMs));
  }
  return false;
}

// Al volver a la pestaña del navegador (o desde otro dispositivo) lo que se
// ve puede estar viejo: se actualiza por detrás, sin "Cargando…". Con un
// respiro para no pedir de más si se cambia de pestaña varias veces seguidas.
if (typeof document !== 'undefined') {
  let ultimo = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || Date.now() - ultimo < 10000) return;
    ultimo = Date.now();
    almacen.invalidar();
  });
}

const VACIA = Object.freeze([]);

/**
 * Una colección de la caché, para una pantalla.
 *  - `datos`: siempre una lista (vacía mientras no hay nada).
 *  - `cargando`: SOLO true la primera vez, cuando todavía no hay nada que mostrar.
 *  - `error`: solo si no hay datos que mostrar (un fallo de fondo no los tumba).
 *  - `recargar()`: vuelve a pedirla por detrás.
 */
export function useColeccion(nombre) {
  const estado = useSyncExternalStore(
    useCallback((oyente) => almacen.suscribir(nombre, oyente), [nombre]),
    () => almacen.leer(nombre)
  );
  useEffect(() => {
    almacen.asegurar(nombre);
  }, [nombre]);
  const recargar = useCallback(() => almacen.cargar(nombre), [nombre]);
  return {
    datos: estado.datos ?? VACIA,
    cargando: estado.datos === null && !estado.error,
    error: estado.error,
    recargar,
  };
}
