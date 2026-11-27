// Heredar el diseño y las zonas de una prenda a otra de la misma producción
// (ej. el conjunto Caballero copia lo del conjunto Dama), con las zonas
// ENLAZADAS: anclas y zonas copiadas llevan el mismo `enlace` que su
// original, y lo que se cambia en una (posición, tamaño, contenido, ancla)
// pasa a las demás del mismo enlace. Cada una se puede desenlazar.
//
// Las claves de pieza son las del editor (con varias prendas, "grupoId::rol").

const sinTildes = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const normal = (s) => sinTildes(s).toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Empareja las piezas de la prenda destino con las de la de origen por su
 * rol: igual (sin mayúsculas ni tildes), o si no, la que más palabras
 * comparte. `origen`/`destino`: [{clave, rol}]. Devuelve {claveDestino: claveOrigen|null}.
 */
// Palabras que no dicen qué pieza es: el público de la prenda.
const DEL_PUBLICO = new Set(['masc', 'masculino', 'fem', 'femenino', 'dama', 'caballero', 'hombre', 'mujer', 'nino', 'nina', 'ninos', 'ninas', 'infantil', 'unisex', 'm', 'f']);
const raiz = (p) => (p.length > 3 && p.endsWith('s') ? p.slice(0, -1) : p);
function casiIgual(a, b) {
  if (a === b) return true;
  if (a.length < 4 || b.length < 4 || Math.abs(a.length - b.length) > 1) return false;
  // A lo sumo una letra distinta (SISA / SIZA, MANGA / MANGAS).
  let i = 0, j = 0, dif = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++dif > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return dif + (a.length - i) + (b.length - j) <= 1;
}

export function emparejarPiezas(origen, destino) {
  const palabrasDe = (s) => normal(s).split(/[^a-z0-9]+/).filter(Boolean).map(raiz);
  // Lo que se repite en TODAS las piezas de una prenda ("VOLEY", "MASC") no
  // distingue una pieza de otra.
  const comunesA = (lista) => {
    const conjuntos = lista.map((x) => new Set(palabrasDe(x.rol)));
    return lista.length > 1 ? new Set([...conjuntos[0]].filter((p) => conjuntos.every((c) => c.has(p)))) : new Set();
  };
  const fuera = new Set([...comunesA(origen), ...comunesA(destino)]);
  const utiles = (s) => palabrasDe(s).filter((p) => !DEL_PUBLICO.has(p) && !fuera.has(p));
  const puntaje = (o, d) => {
    if (normal(o.rol) === normal(d.rol)) return 1000;
    const po = utiles(o.rol), pd = utiles(d.rol);
    let p = 0;
    for (const a of pd) if (po.some((b) => casiIgual(a, b))) p += a.length > 1 ? 10 : 1;
    // Desempate: la que no tiene palabras de más.
    return p ? p - Math.abs(po.length - pd.length) * 0.1 : 0;
  };
  const candidatos = [];
  for (const d of destino) for (const o of origen) { const p = puntaje(o, d); if (p > 0) candidatos.push({ d: d.clave, o: o.clave, p }); }
  candidatos.sort((x, y) => y.p - x.p);
  const salida = Object.fromEntries(destino.map((d) => [d.clave, null]));
  const usadas = new Set();
  for (const c of candidatos) {
    if (salida[c.d] || usadas.has(c.o)) continue;
    salida[c.d] = c.o;
    usadas.add(c.o);
  }
  return salida;
}

function idLibre(prefijo, lista) {
  for (let n = 1; n < 9999; n++) {
    const candidato = prefijo + n;
    if (!lista.some((x) => x.id === candidato)) return candidato;
  }
  return prefijo + Date.now();
}
const nuevoEnlace = () => 'E' + Math.random().toString(36).slice(2, 10);
const copia = (v) => JSON.parse(JSON.stringify(v));

// Con varias prendas, la pieza "g1::MANGA" del original corresponde a
// "g2::MANGA" en la de destino.
function piezaCorrespondiente(pieza, desde, hacia) {
  if (!pieza || pieza === desde) return hacia;
  const i = desde.indexOf('::'), j = hacia.indexOf('::'), k = pieza.indexOf('::');
  if (i < 0 || j < 0 || k < 0) return pieza;
  return pieza.slice(0, k) === desde.slice(0, i) ? hacia.slice(0, j) + pieza.slice(k) : pieza;
}

// Estado de trabajo: copias de las listas, que se van completando.
function estadoDe(anclaje) {
  return { anclas: copia(anclaje?.anclas || []), zonas: copia(anclaje?.zonas || []) };
}
const buscar = (estado, id) => estado.anclas.find((a) => a.id === id) ? ['ancla', estado.anclas.find((a) => a.id === id)]
  : estado.zonas.find((z) => z.id === id) ? ['zona', estado.zonas.find((z) => z.id === id)] : [null, null];

/** El id del par de `el` en la pieza `hacia` (lo crea, enlazado, si no está). */
function contraparte(estado, tipo, el, hacia) {
  const lista = tipo === 'ancla' ? estado.anclas : estado.zonas;
  if (el.pieza === hacia) return el.id;
  if (!el.enlace) el.enlace = nuevoEnlace();
  const ya = lista.find((x) => x.enlace === el.enlace && x.pieza === hacia);
  if (ya) return ya.id;
  const id = idLibre(tipo === 'ancla' ? 'A' : el.id + '_', lista);
  const clon = { ...copia(el), id, nombre: id, pieza: hacia };
  lista.push(clon); // antes de traducir: si algo lo vuelve a pedir, ya está
  pasarContenido(estado, tipo, el, clon);
  return id;
}

function traducirRef(estado, ref, desde, hacia) {
  if (!ref || typeof ref !== 'object') return ref;
  const r = { ...ref };
  if (r.pieza) r.pieza = piezaCorrespondiente(r.pieza, desde, hacia);
  const piezaRef = r.pieza || hacia;
  if (r.zona) { const z = estado.zonas.find((x) => x.id === r.zona); if (z) r.zona = contraparte(estado, 'zona', z, piezaCorrespondiente(z.pieza, desde, hacia) || piezaRef); }
  if (r.ancla) { const a = estado.anclas.find((x) => x.id === r.ancla); if (a) r.ancla = contraparte(estado, 'ancla', a, piezaCorrespondiente(a.pieza, desde, hacia) || piezaRef); }
  return r;
}

const PROPIOS = new Set(['id', 'nombre', 'pieza', 'enlace', 'anclaX', 'anclaY', 'x', 'y']);

// Copia a `hacia` todo lo de `desde`, menos lo que es de cada una (id,
// nombre, pieza), con sus anclas y referencias en la pieza de `hacia`.
function pasarContenido(estado, tipo, desde, hacia) {
  for (const k of Object.keys(hacia)) if (!PROPIOS.has(k) && !(k in desde)) delete hacia[k];
  for (const [k, v] of Object.entries(desde)) if (!PROPIOS.has(k)) hacia[k] = copia(v);
  const de = desde.pieza, a = hacia.pieza;
  if (tipo === 'ancla') {
    for (const eje of ['x', 'y']) if (desde[eje]) hacia[eje] = { ...copia(desde[eje]), ref: traducirRef(estado, desde[eje].ref, de, a) };
  } else {
    for (const campo of ['anclaX', 'anclaY']) {
      const [t, el] = buscar(estado, desde[campo]);
      hacia[campo] = el ? contraparte(estado, t, el, piezaCorrespondiente(el.pieza, de, a)) : desde[campo];
    }
  }
}

/**
 * Copia las anclas y zonas de cada pieza de origen a su pieza de destino,
 * enlazadas. `pares`: {claveDestino: claveOrigen}. Lo que ya estaba copiado
 * (mismo enlace en el destino) no se repite: volver a copiar suma solo lo nuevo.
 * Devuelve {anclaje, zonas: cuántas zonas nuevas}.
 */
export function copiarEnlazado(anclaje, pares) {
  const estado = estadoDe(anclaje);
  const antes = estado.zonas.length;
  for (const [destino, origen] of Object.entries(pares)) {
    if (!origen || origen === destino) continue;
    for (const z of estado.zonas.filter((x) => x.pieza === origen)) contraparte(estado, 'zona', z, destino);
  }
  return { anclaje: { ...anclaje, ...estado }, zonas: estado.zonas.length - antes };
}

/**
 * Después de un cambio: si de un enlace cambió UNA sola zona o ancla, lo
 * mismo pasa a las demás del enlace. Si cambiaron varias a la vez (se cargó
 * otra producción, se sumó una prenda) no se toca nada.
 */
export function sincronizarEnlaces(antes, despues) {
  if (!antes || !despues || antes === despues) return despues;
  const hayEnlaces = (despues.anclas || []).some((a) => a.enlace) || (despues.zonas || []).some((z) => z.enlace);
  if (!hayEnlaces) return despues;
  const previo = new Map([...(antes.anclas || []).map((a) => ['a:' + a.id, JSON.stringify(a)]), ...(antes.zonas || []).map((z) => ['z:' + z.id, JSON.stringify(z)])]);
  const estado = estadoDe(despues);
  let tocado = false;
  for (const [tipo, lista, p] of [['ancla', estado.anclas, 'a:'], ['zona', estado.zonas, 'z:']]) {
    const porEnlace = new Map();
    for (const el of lista) if (el.enlace) porEnlace.set(el.enlace, [...(porEnlace.get(el.enlace) || []), el]);
    for (const miembros of porEnlace.values()) {
      if (miembros.length < 2) continue;
      const cambiados = miembros.filter((el) => previo.has(p + el.id) && previo.get(p + el.id) !== JSON.stringify(el));
      const nuevos = miembros.filter((el) => !previo.has(p + el.id));
      if (cambiados.length !== 1 || nuevos.length) continue;
      for (const otro of miembros) if (otro !== cambiados[0]) pasarContenido(estado, tipo, cambiados[0], otro);
      tocado = true;
    }
  }
  return tocado ? { ...despues, ...estado } : despues;
}

/** Las otras zonas del mismo enlace (para mostrar con quién está enlazada). */
export function enlazadasCon(anclaje, zona) {
  if (!zona?.enlace) return [];
  return (anclaje?.zonas || []).filter((z) => z.id !== zona.id && z.enlace === zona.enlace);
}

/** La zona sale de su enlace (y sus anclas, si ninguna otra zona enlazada las usa). */
export function desenlazarZona(anclaje, zonaId) {
  const zona = (anclaje?.zonas || []).find((z) => z.id === zonaId);
  if (!zona?.enlace) return anclaje;
  const zonas = anclaje.zonas.map((z) => (z.id === zonaId ? (({ enlace, ...resto }) => resto)(z) : z));
  const suyas = new Set([zona.anclaX, zona.anclaY]);
  const otrasUsan = (id) => zonas.some((z) => z.id !== zonaId && z.enlace && (z.anclaX === id || z.anclaY === id));
  const anclas = anclaje.anclas.map((a) => (suyas.has(a.id) && a.enlace && !otrasUsan(a.id) ? (({ enlace, ...resto }) => resto)(a) : a));
  return { ...anclaje, anclas, zonas };
}

/** Sin ningún enlace (al pegar zonas de otro lado: no se enlazan con las de allá). */
export function sinEnlaces(anclaje) {
  if (!anclaje) return anclaje;
  const fuera = (x) => (x?.enlace ? (({ enlace, ...resto }) => resto)(x) : x);
  return { ...anclaje, anclas: (anclaje.anclas || []).map(fuera), zonas: (anclaje.zonas || []).map(fuera) };
}

/** Las imágenes, vistas, ajustes y fondo de cada pieza de origen, en su destino. */
export function disenoCopiado(diseno, pares) {
  const mapas = ['imagenesPorPieza', 'vistasPorPieza', 'ajusteArtePorPieza', 'fondoPorPieza'];
  const salida = {};
  let piezas = 0;
  for (const m of mapas) salida[m] = { ...(diseno?.[m] || {}) };
  for (const [destino, origen] of Object.entries(pares)) {
    if (!origen || origen === destino) continue;
    const tiene = (m) => Object.prototype.hasOwnProperty.call(salida[m], origen);
    // Una pieza de origen sin nada propio no borra lo que ya tenga el destino.
    if (!mapas.some(tiene)) continue;
    for (const m of mapas) {
      if (tiene(m)) salida[m][destino] = copia(salida[m][origen]);
      else delete salida[m][destino];
    }
    piezas++;
  }
  return { cambios: salida, piezas };
}
