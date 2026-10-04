import { useCallback, useEffect, useSyncExternalStore } from 'react';
import {
  listarPiezas, listarGrupos, listarDisenos, listarProductos, listarPlantillas,
  listarPedidos, listarFuentes, listarGeneraciones,
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
});

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
