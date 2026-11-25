// Copia de programa/backend/src/dominio/moldesDeProduccion.js (mismo criterio en el navegador).
// Moldes cambiados en UNA producción: una pieza de la prenda se reemplaza
// por otra de la Biblioteca (p. ej. MANGA → MANGA LARGA) sin tocar la
// prenda ni las demás producciones que la usan:
//   producto.moldes = { [clave de la pieza]: piezaId del molde nuevo }
// La clave es la misma de siempre (el rol, o grupoId::rol con varias
// prendas), así el diseño, las zonas y el calce de esa pieza siguen siendo
// suyos: las anclas se recalculan sobre el molde nuevo (piquetes, extremos).

/** Las prendas de la producción, en su orden, con sus moldes cambiados. */
export function gruposDeProduccion(producto, grupos) {
  const ids = producto?.grupoIds || (producto?.grupoId ? [producto.grupoId] : []);
  const propios = ids.map((id) => grupos.find((g) => g.id === id)).filter(Boolean);
  return gruposConMoldes(propios, producto?.moldes);
}

/** Las mismas prendas, con la pieza de cada clave cambiada por su molde nuevo. */
export function gruposConMoldes(grupos, moldes) {
  if (!moldes || !Object.keys(moldes).length) return grupos;
  const namespacear = grupos.length > 1;
  return grupos.map((g) => ({
    ...g,
    piezas: (g.piezas || []).map((gp) => {
      const nuevo = moldes[namespacear ? g.id + '::' + gp.rol : gp.rol];
      return nuevo ? { ...gp, piezaId: nuevo } : gp;
    }),
  }));
}
