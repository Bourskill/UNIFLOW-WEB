// Excel con varias hojas, una por prenda: cada hoja es un listado de
// jugadores y va a un "destino" del pedido -- una producción entera, un
// conjunto de ella (Dama / Caballero) o una sola de sus prendas (los que
// solo llevan pantaloneta, p. ej.). Acá se arman los destinos posibles, se
// adivina cuál le toca a cada hoja por su nombre y se dice cómo queda la
// línea del pedido.
import { conjuntosDe } from './conjuntos.js';
import { gruposDeProduccion } from './moldesDeProduccion.js';

// Clave de una pieza en el pedido (la misma que espera resolverPedido.js):
// con varias prendas en la producción, grupoId::rol; con una, el rol.
function clavesDeGrupo(g, varias) {
  return (g.piezas || []).map((gp) => (varias ? g.id + '::' + gp.rol : gp.rol));
}

/**
 * Los destinos de todas las producciones, la `actualId` primero.
 * [{ id, productoId, producto, etiqueta, nombre, conjuntoId?, piezasExcluidas }]
 * `nombre` es lo que se compara con el nombre de la hoja.
 */
export function destinosDeImportacion(productos, grupos, actualId) {
  const ordenados = [...productos].sort((a, b) => (a.id === actualId ? -1 : b.id === actualId ? 1 : 0));
  const destinos = [];
  for (const p of ordenados) {
    const gs = gruposDeProduccion(p, grupos);
    const varias = gs.length > 1;
    const conjuntos = conjuntosDe(p);
    if (conjuntos.length > 1) {
      for (const c of conjuntos) {
        destinos.push({ id: p.id + '|c|' + c.id, productoId: p.id, producto: p.nombre, etiqueta: c.nombre, nombre: c.nombre, conjuntoId: c.id, piezasExcluidas: [] });
      }
      continue;
    }
    destinos.push({ id: p.id, productoId: p.id, producto: p.nombre, etiqueta: varias ? 'Todas sus prendas' : p.nombre, nombre: p.nombre, piezasExcluidas: [] });
    if (varias) {
      for (const g of gs) {
        destinos.push({
          id: p.id + '|g|' + g.id, productoId: p.id, producto: p.nombre, etiqueta: 'Solo ' + g.nombre, nombre: g.nombre,
          // Sale solo esta prenda: las piezas de las otras quedan excluidas.
          piezasExcluidas: gs.filter((o) => o.id !== g.id).flatMap((o) => clavesDeGrupo(o, true)),
        });
      }
    }
  }
  return destinos;
}

// Cómo se abrevian las prendas en los nombres de la moldería ("CMST CUELLO R").
const ABREVIATURAS = { cmst: 'camiseta', camisa: 'camiseta', pantalon: 'pantaloneta', short: 'pantaloneta', pant: 'pantaloneta' };

function palabras(texto) {
  return String(texto || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    .split(/[^a-z0-9]+/).filter((w) => w.length >= 3 || /^\d+$/.test(w))
    // Sin plural: la hoja «DAMAS» es el conjunto «Dama».
    .map((w) => (w.length >= 4 && w.endsWith('s') ? w.slice(0, -1) : w))
    .map((w) => ABREVIATURAS[w] || w);
}

/**
 * El destino que más se parece al nombre de la hoja ("DAMA" → conjunto Dama,
 * "PANTALONETA" → Solo Pantaloneta). Sin parecido, el primero de la
 * producción actual (los destinos vienen con ella primero).
 */
export function destinoSugerido(nombreHoja, destinos) {
  const deHoja = new Set(palabras(nombreHoja));
  let mejor = destinos[0] || null;
  let puntos = 0;
  for (const d of destinos) {
    const comunes = palabras(d.nombre).filter((w) => deHoja.has(w)).length;
    // Un destino puntual (conjunto o prenda sola) gana al de "toda la producción".
    const p = comunes ? comunes * 2 + (d.id !== d.productoId ? 1 : 0) : 0;
    if (p > puntos) { mejor = d; puntos = p; }
  }
  return mejor;
}

/** Lo que el destino le pone a cada línea del pedido. */
export function lineaDeDestino(destino) {
  return {
    productoId: destino.productoId,
    ...(destino.conjuntoId ? { conjuntoId: destino.conjuntoId } : {}),
    piezasExcluidas: [...destino.piezasExcluidas],
  };
}
