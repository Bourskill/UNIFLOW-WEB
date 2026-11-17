// Conjuntos de zonas: un grupo de zonas encadenadas (una pegada a otra) que
// se guarda para reusar en otro producto o en otra pieza, y se vuelve a
// pegar ahí a un punto que elige el usuario.
//
// "Encadenadas" = una zona cuya ancla está pegada a OTRA zona (ref.tipo
// 'zona'), no a un rasgo de la pieza. Un conjunto es todo el grupo conectado
// por esas cadenas (en cualquier dirección): ej. un escudo pegado a un
// piquete, el número pegado debajo del escudo y el nombre debajo del número.
// Lo que lo une a la pieza son sus referencias EXTERNAS (piquete, contorno,
// extremo...) -- son justamente las que se reemplazan al importarlo.
//
// JavaScript puro (sin React), para poder probarlo en Node.

function idLibre(prefijo, usados) {
  for (let n = 1; n < 9999; n++) {
    if (!usados.has(prefijo + n)) return prefijo + n;
  }
  return prefijo + Date.now();
}

function zonasDeLaQueCuelga(zona, anclaPorId) {
  const padres = new Set();
  for (const anclaId of [zona.anclaX, zona.anclaY]) {
    const ancla = anclaPorId.get(anclaId);
    if (!ancla) continue;
    for (const eje of ['x', 'y']) {
      const ref = ancla[eje]?.ref;
      if (ref?.tipo === 'zona' && ref.zona) padres.add(ref.zona);
    }
  }
  return padres;
}

/**
 * El conjunto al que pertenece una zona: ella y todas las zonas conectadas
 * por "pegada a" (padres e hijas, de la misma pieza), con las anclas que
 * usan. null si la zona está sola (no cuelga de otra ni otra cuelga de ella)
 * -- un conjunto necesita al menos una zona anclada a otra.
 *
 * @param {{anclas: object[], zonas: object[]}} anclaje
 * @param {string} zonaId
 * @returns {{zonas: object[], anclas: object[]} | null}
 */
export function conjuntoDeZona(anclaje, zonaId) {
  const zonas = anclaje.zonas || [];
  const anclaPorId = new Map((anclaje.anclas || []).map((a) => [a.id, a]));
  const inicial = zonas.find((z) => z.id === zonaId);
  if (!inicial) return null;

  // Grafo no dirigido zona <-> zona, solo dentro de la misma pieza.
  const vecinos = new Map(zonas.map((z) => [z.id, new Set()]));
  for (const z of zonas) {
    if (z.pieza !== inicial.pieza) continue;
    for (const padre of zonasDeLaQueCuelga(z, anclaPorId)) {
      if (!vecinos.has(padre)) continue;
      vecinos.get(z.id).add(padre);
      vecinos.get(padre).add(z.id);
    }
  }

  const visto = new Set([zonaId]);
  const pendientes = [zonaId];
  while (pendientes.length) {
    const actual = pendientes.pop();
    for (const v of vecinos.get(actual) || []) {
      if (!visto.has(v)) { visto.add(v); pendientes.push(v); }
    }
  }
  if (visto.size < 2) return null;

  const zonasDelConjunto = zonas.filter((z) => visto.has(z.id));
  const idsAnclas = new Set(zonasDelConjunto.flatMap((z) => [z.anclaX, z.anclaY]));
  return {
    zonas: JSON.parse(JSON.stringify(zonasDelConjunto)),
    anclas: JSON.parse(JSON.stringify((anclaje.anclas || []).filter((a) => idsAnclas.has(a.id)))),
  };
}

/** ¿Este eje del ancla apunta a algo de FUERA del conjunto (un rasgo de la pieza)? */
function esExterno(eje, idsZonasConjunto) {
  return !(eje?.ref?.tipo === 'zona' && idsZonasConjunto.has(eje.ref.zona));
}

/**
 * Pega un conjunto guardado en otra pieza: copia sus zonas y anclas con
 * nombres que no choquen con los que ya hay, las pasa a `piezaDestino`, y
 * cada referencia EXTERNA (lo que lo unía a la pieza original) pasa a ser
 * `refDestino`, el punto que eligió el usuario -- sin distancia extra, así
 * el conjunto queda exactamente ahí. Las referencias internas (zona pegada
 * a zona) se conservan tal cual, con los nombres nuevos.
 *
 * Si una zona del conjunto tenía sus dos anclas pegadas a puntos externos
 * DISTINTOS (un "cruce"), al llevarlas al mismo punto el cruce deja de tener
 * sentido: queda pegada a una sola ancla.
 *
 * @param {{anclas: object[], zonas: object[]}} anclajeActual  el del producto que se está editando
 * @param {{anclas: object[], zonas: object[]}} conjunto
 * @param {string} piezaDestino   la clave de la pieza (rol, o grupoId::rol)
 * @param {object} refDestino     una `ref` de candidato (piquete, contorno, extremo, zona...)
 * @returns {{anclaje: {anclas: object[], zonas: object[]}, idsZonasNuevas: string[]}}
 */
export function importarConjunto(anclajeActual, conjunto, piezaDestino, refDestino) {
  const usados = new Set([...(anclajeActual.anclas || []), ...(anclajeActual.zonas || [])].map((n) => n.id));
  const idsZonasConjunto = new Set(conjunto.zonas.map((z) => z.id));

  // Nombres nuevos: las zonas conservan el suyo si está libre (son los que
  // el usuario reconoce), si no se numeran; las anclas siempre A1, A2...
  const nuevoIdZona = new Map();
  for (const z of conjunto.zonas) {
    const id = usados.has(z.id) ? idLibre(z.id + '_', usados) : z.id;
    usados.add(id);
    nuevoIdZona.set(z.id, id);
  }
  const nuevoIdAncla = new Map();
  for (const a of conjunto.anclas) {
    const id = idLibre('A', usados);
    usados.add(id);
    nuevoIdAncla.set(a.id, id);
  }

  const anclas = conjunto.anclas.map((a) => {
    const copia = JSON.parse(JSON.stringify(a));
    copia.id = nuevoIdAncla.get(a.id);
    copia.nombre = copia.id;
    copia.pieza = piezaDestino;
    for (const eje of ['x', 'y']) {
      if (esExterno(copia[eje], idsZonasConjunto)) {
        copia[eje] = { ref: JSON.parse(JSON.stringify(refDestino)), modo: 'fijo', valor: 0 };
      } else {
        copia[eje] = { ...copia[eje], ref: { ...copia[eje].ref, zona: nuevoIdZona.get(copia[eje].ref.zona) } };
      }
    }
    return copia;
  });

  const anclaOriginal = new Map(conjunto.anclas.map((a) => [a.id, a]));
  const totalmenteExterna = (id) => {
    const a = anclaOriginal.get(id);
    return a && esExterno(a.x, idsZonasConjunto) && esExterno(a.y, idsZonasConjunto);
  };

  const zonas = conjunto.zonas.map((z) => {
    const copia = JSON.parse(JSON.stringify(z));
    copia.id = nuevoIdZona.get(z.id);
    copia.nombre = copia.id;
    copia.pieza = piezaDestino;
    copia.anclaX = nuevoIdAncla.get(z.anclaX);
    copia.anclaY = nuevoIdAncla.get(z.anclaY);
    if (z.anclaX !== z.anclaY && totalmenteExterna(z.anclaX) && totalmenteExterna(z.anclaY)) {
      copia.anclaY = copia.anclaX;
      copia.modoCruce = 'esquina';
    }
    return copia;
  });

  // Un ancla que ninguna zona usa ya (la del cruce que se colapsó) no se copia.
  const anclasUsadas = new Set(zonas.flatMap((z) => [z.anclaX, z.anclaY]));
  return {
    anclaje: {
      ...anclajeActual,
      anclas: [...(anclajeActual.anclas || []), ...anclas.filter((a) => anclasUsadas.has(a.id))],
      zonas: [...(anclajeActual.zonas || []), ...zonas],
    },
    idsZonasNuevas: zonas.map((z) => z.id),
  };
}
