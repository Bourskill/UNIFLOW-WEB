import { ordenarTallasNatural } from '../constantes.js';
import { conjuntosDe, tallasDeGrupos } from './conjuntos.js';
import { gruposDeProduccion } from './moldesDeProduccion.js';

// Utilidades de las producciones (antes "productos"), compartidas por Diseño
// (las más recientes) y Producción (todas, para exportar por tallas).

// Las más recientes primero: por la última vez que se guardaron. Las viejas,
// guardadas antes de que existiera actualizadoEn, van al final en el orden
// inverso al de la lista (la última agregada, primero).
export function ordenarPorReciente(producciones) {
  return producciones
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      const fa = a.p.actualizadoEn || a.p.creadoEn || '', fb = b.p.actualizadoEn || b.p.creadoEn || '';
      if (fa !== fb) return fa < fb ? 1 : -1;
      return b.i - a.i;
    })
    .map(({ p }) => p);
}

// Tallas en las que se puede sacar la prenda COMPLETA: las que tienen todas
// sus piezas (una de talla única sirve para cualquiera). Mismo criterio que
// Pedidos.jsx·tallasDelProducto.
export function tallasDeProduccion(produccion, grupos, piezas) {
  // Con conjuntos (dama / caballero...): las tallas de cualquiera de ellos
  // (cada talla sale con los conjuntos que la tienen).
  // Con sus moldes cambiados (MANGA → MANGA LARGA), las tallas de esos.
  const propios = gruposDeProduccion(produccion, grupos);
  const deConjuntos = conjuntosDe(produccion);
  if (deConjuntos.length) {
    return ordenarTallasNatural([...new Set(deConjuntos.flatMap((c) => tallasDeGrupos(c.grupoIds, propios, piezas)))]);
  }
  // Varias prendas sin conjuntos: las tallas de cualquiera (cada talla sale
  // con las prendas que la tienen -- rutas/api.js·prepararMesasDeProduccion).
  if (propios.length > 1) {
    return ordenarTallasNatural([...new Set(propios.flatMap((g) => tallasDeGrupos([g.id], propios, piezas)))]);
  }
  const conjuntos = propios
    .flatMap((g) => g.piezas)
    .map((gp) => piezas.find((p) => p.id === gp.piezaId))
    .filter((p) => p && !p.tallaUnica)
    .map((p) => new Set(Object.keys(p.dimensionesPorTalla || {})));
  if (conjuntos.length === 0) return [];
  return ordenarTallasNatural([...conjuntos[0]].filter((t) => conjuntos.every((s) => s.has(t))));
}

// Nombre de archivo legible para una exportación.
export function nombreDeExportacion(produccion, tallas) {
  const base = ((produccion?.nombre || 'produccion') + ' ' + tallas.join('-'))
    .normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '');
  return (base || 'produccion').slice(0, 120) + '.pdf';
}
