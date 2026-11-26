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
        // Un conjunto de varias prendas (camiseta + pantaloneta): también cada
        // una sola, para el listado con columna PRENDA o la hoja "solo shorts".
        const suyos = gs.filter((g) => c.grupoIds.includes(g.id));
        if (suyos.length > 1) {
          for (const g of suyos) {
            destinos.push({
              id: p.id + '|c|' + c.id + '|g|' + g.id, productoId: p.id, producto: p.nombre,
              etiqueta: c.nombre + ' · solo ' + g.nombre, nombre: c.nombre + ' ' + g.nombre, conjuntoId: c.id,
              piezasExcluidas: suyos.filter((o) => o.id !== g.id).flatMap((o) => clavesDeGrupo(o, varias)),
            });
          }
        }
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
// y de cada público: la hoja «Femenino» es el conjunto «Dama» o la prenda «… FEM».
const ABREVIATURAS = {
  cmst: 'camiseta', camisa: 'camiseta', pantalon: 'pantaloneta', short: 'pantaloneta', pant: 'pantaloneta',
  femenino: 'dama', femenina: 'dama', fem: 'dama', mujer: 'dama',
  masculino: 'caballero', masc: 'caballero', hombre: 'caballero',
  nino: 'nino', nina: 'nina', infantil: 'nino',
};

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
  // Varios nombres (la prenda de la columna PRENDA y su hoja): el primero pesa más.
  const [principal, ...resto] = (Array.isArray(nombreHoja) ? nombreHoja : [nombreHoja]).map((n) => new Set(palabras(n)));
  const deResto = new Set(resto.flatMap((r) => [...r]));
  let mejor = destinos[0] || null;
  let puntos = 0;
  const actual = destinos[0]?.productoId;
  for (const d of destinos) {
    const suyas = palabras(d.nombre);
    const dePrincipal = suyas.filter((w) => principal.has(w)).length;
    const comunes = dePrincipal * 3 + suyas.filter((w) => !principal.has(w) && deResto.has(w)).length;
    // Un destino puntual (conjunto o prenda sola) gana al de "toda la
    // producción", y la producción elegida en el pedido gana a las otras si
    // tiene esa prenda (CAMISA → su camiseta, no la de otra producción).
    const p = comunes ? comunes * 2 + (d.id !== d.productoId ? 1 : 0) + (d.productoId === actual && dePrincipal ? 100 : 0) : 0;
    if (p > puntos) { mejor = d; puntos = p; }
  }
  return mejor;
}

// La columna que dice qué prenda lleva cada fila (CAMISA, PANTALONETA...).
const CABECERA_PRENDA = /^(prenda|prendas|articulo|producto|tipo de prenda|tipo)$/;
const normal = (v) => String(v ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();

/**
 * Un listado con columna PRENDA (una fila por prenda de cada jugador: el 14
 * lleva camisa y pantaloneta, el 31 solo camisa) se parte en un listado por
 * prenda, como si cada una fuera su propia hoja: así cada una se enlaza a su
 * prenda de la producción. Las hojas sin esa columna quedan como están.
 * hojas: [{ nombre, filas }] (leerHojas). Devuelve la misma forma.
 */
export function separarPorPrenda(hojas) {
  return hojas.flatMap((h) => {
    const filas = h.filas || [];
    let cab = -1, col = -1;
    for (let i = 0; i < Math.min(filas.length, 10) && cab < 0; i++) {
      const j = filas[i].findIndex((v) => CABECERA_PRENDA.test(normal(v)));
      if (j >= 0) { cab = i; col = j; }
    }
    if (cab < 0) return [h];
    const grupos = new Map(); // clave normalizada -> { nombre, filas }
    for (const f of filas.slice(cab + 1)) {
      if (!f.some((v) => String(v ?? '').trim() !== '')) continue;
      const valor = String(f[col] ?? '').trim();
      const clave = normal(valor);
      if (!grupos.has(clave)) grupos.set(clave, { nombre: valor, filas: [] });
      grupos.get(clave).filas.push(f);
    }
    if (grupos.size < 2 && !grupos.has('')) return [h];
    return [...grupos.values()].map((g) => ({
      nombre: h.nombre + (g.nombre ? ' · ' + g.nombre : ''),
      filas: [filas[cab], ...g.filas],
      // Para adivinar el destino pesa la prenda; la hoja ("Masculino") desempata.
      pistas: [g.nombre || h.nombre, h.nombre],
    }));
  });
}

/** Lo que el destino le pone a cada línea del pedido. */
export function lineaDeDestino(destino) {
  return {
    productoId: destino.productoId,
    ...(destino.conjuntoId ? { conjuntoId: destino.conjuntoId } : {}),
    piezasExcluidas: [...destino.piezasExcluidas],
  };
}
