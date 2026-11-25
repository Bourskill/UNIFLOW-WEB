// Cambiar las prendas de una producción SIN perder lo armado.
//
// La clave de cada pieza depende de cuántas prendas hay (dominio/
// resolverGrupo.js·resolverPiezasDeGrupos): con UNA, el rol tal cual
// ("ESPALDA"); con varias, "grupoId::ESPALDA". Al agregar o sacar una prenda,
// las claves cambian -- antes el editor borraba todo por eso. Acá se traducen:
// lo de las prendas que siguen queda igual (con su clave nueva) y solo se
// quita lo de la prenda que se sacó.

/**
 * Función que traduce una clave de pieza de las prendas `antes` a `despues`
 * (listas de ids de grupo, en orden). null = la prenda de esa pieza se sacó.
 */
export function traductorDeClaves(antes, despues) {
  const nsAntes = antes.length > 1, nsDespues = despues.length > 1;
  return (clave) => {
    if (typeof clave !== 'string') return clave;
    let grupo, base;
    if (nsAntes) {
      const i = clave.indexOf('::');
      if (i < 0) return clave; // no es una clave de pieza de esta producción
      grupo = clave.slice(0, i);
      base = clave.slice(i + 2);
    } else {
      grupo = antes[0];
      base = clave;
    }
    if (!despues.includes(grupo)) return null;
    return nsDespues ? grupo + '::' + base : base;
  };
}

// Renombra las claves de un mapa { clave: valor }, quitando las de prendas sacadas.
function mapaTraducido(mapa, traducir) {
  if (!mapa || typeof mapa !== 'object') return mapa;
  const salida = {};
  for (const [k, v] of Object.entries(mapa)) {
    const nueva = traducir(k);
    if (nueva) salida[nueva] = traducirRefs(v, traducir);
  }
  return salida;
}

// Dentro de anclas, zonas y ajustes, toda referencia a una pieza (`pieza`).
function traducirRefs(valor, traducir) {
  if (Array.isArray(valor)) return valor.map((v) => traducirRefs(v, traducir));
  if (!valor || typeof valor !== 'object') return valor;
  const salida = {};
  for (const [k, v] of Object.entries(valor)) {
    salida[k] = k === 'pieza' && typeof v === 'string' ? (traducir(v) ?? v) : traducirRefs(v, traducir);
  }
  return salida;
}

/**
 * El anclaje con las claves nuevas; sin las anclas y zonas de la prenda que
 * se sacó, ni las zonas que colgaban de ellas.
 */
export function anclajeTraducido(anclaje, traducir) {
  const anclas = (anclaje?.anclas || []).filter((a) => traducir(a.pieza) !== null).map((a) => traducirRefs(a, traducir));
  const idsAnclas = new Set(anclas.map((a) => a.id));
  let zonas = (anclaje?.zonas || []).filter((z) => traducir(z.pieza) !== null).map((z) => traducirRefs(z, traducir));
  // Zonas que colgaban de un ancla quitada (o de otra zona quitada), afuera.
  for (let cambio = true; cambio;) {
    cambio = false;
    const idsZonas = new Set(zonas.map((z) => z.id));
    const quedan = zonas.filter((z) => [z.anclaX, z.anclaY, z.ancla].every((id) => !id || idsAnclas.has(id) || idsZonas.has(id)));
    if (quedan.length !== zonas.length) { zonas = quedan; cambio = true; }
  }
  return { ...anclaje, anclas, zonas };
}

/** Un diseño (imágenes, vistas y ajustes por pieza) con las claves nuevas. */
export function disenoTraducido(diseno, traducir) {
  return {
    imagenesPorPieza: mapaTraducido(diseno.imagenesPorPieza || {}, traducir),
    vistasPorPieza: mapaTraducido(diseno.vistasPorPieza || {}, traducir),
    ajusteArtePorPieza: mapaTraducido(diseno.ajusteArtePorPieza || {}, traducir),
  };
}

/** Un mapa por clave cualquiera (lados propios, talla de trabajo), traducido. */
export function porClaveTraducido(mapa, traducir) {
  return mapaTraducido(mapa || {}, traducir);
}
