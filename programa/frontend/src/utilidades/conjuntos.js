// Copia de programa/backend/src/motor/conjuntos.js (mismo criterio en el navegador).
// Conjuntos de una producción: una misma producción puede tener varias
// prendas para distintos públicos -- p. ej. camiseta + pantaloneta de DAMA
// y camiseta + pantaloneta de CABALLERO --, con el mismo diseño y las mismas
// zonas. Cada conjunto es un grupo de esas prendas con su nombre:
//   producto.conjuntos = [{ id, nombre, grupoIds: [...] }]
// y cada jugador del pedido lleva el suyo (linea.conjuntoId). Sin conjuntos
// (o con uno solo), la producción sale entera como siempre.
//
// Las claves de las piezas (grupoId::rol) no cambian: se arman con TODAS
// las prendas de la producción y después se dejan solo las del conjunto,
// así el anclaje y el diseño sirven igual para todos.

/** Los conjuntos válidos (con nombre y al menos una prenda de la producción). */
export function conjuntosDe(producto) {
  const ids = new Set(producto?.grupoIds || (producto?.grupoId ? [producto.grupoId] : []));
  return (producto?.conjuntos || [])
    .map((c) => ({ ...c, grupoIds: (c.grupoIds || []).filter((g) => ids.has(g)) }))
    .filter((c) => c.id && c.grupoIds.length);
}

/**
 * El conjunto de una línea del pedido: el elegido; si no eligió (o ya no
 * existe), el primero. null cuando la producción no tiene conjuntos.
 */
export function conjuntoDeLinea(producto, linea) {
  const lista = conjuntosDe(producto);
  if (!lista.length) return null;
  return lista.find((c) => c.id === linea?.conjuntoId) || lista[0];
}

/**
 * Las tallas en que se puede sacar COMPLETAS estas prendas: las que tienen
 * todas sus piezas (una de talla única sirve para cualquiera).
 */
export function tallasDeGrupos(grupoIds, grupos, piezas) {
  const conjuntosDeTallas = grupoIds
    .map((id) => grupos.find((g) => g.id === id))
    .filter(Boolean)
    .flatMap((g) => g.piezas || [])
    .map((gp) => piezas.find((p) => p.id === gp.piezaId))
    .filter((p) => p && !p.tallaUnica)
    .map((p) => new Set(Object.keys(p.dimensionesPorTalla || {})));
  if (!conjuntosDeTallas.length) return [];
  return [...conjuntosDeTallas[0]].filter((t) => conjuntosDeTallas.every((s) => s.has(t)));
}

/** El anclaje con solo lo de las piezas que quedan (claves de pieza). */
export function anclajeDePiezas(anclaje, claves) {
  if (!anclaje) return anclaje;
  return {
    ...anclaje,
    anclas: (anclaje.anclas || []).filter((a) => !a.pieza || claves.has(a.pieza)),
    zonas: (anclaje.zonas || []).filter((z) => !z.pieza || claves.has(z.pieza)),
  };
}
