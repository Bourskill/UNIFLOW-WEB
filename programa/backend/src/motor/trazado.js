// El TRAZADO ORIGINAL del contorno de una pieza: los mismos nodos (anclas)
// y manejadores Bézier que trae el archivo, sin tesselar.
//
// El polígono tesselado (poligonoMm, decenas de puntos por curva) sirve
// para medir: piquetes, salientes, anclaje, la vista previa. Pero si eso es
// lo que se escribe en el archivo de producción, cada curva llega a
// Illustrator como decenas de nodos sueltos: la pieza pesa mucho más y el
// script de cabidas se vuelve lentísimo. Lo que se exporta (molde, fondo,
// recorte del arte y contorno láser) sale de acá: el molde vuelve con
// EXACTAMENTE sus nodos, ni uno más ni uno menos.
//
// Formato: una lista de segmentos de UN subcamino cerrado
//   ['M', x, y]                        el primer nodo
//   ['L', x, y]                        recta hasta el nodo
//   ['C', x1, y1, x2, y2, x, y]        curva (dos manejadores) hasta el nodo
// El cierre es implícito: una recta del último nodo al primero no se guarda
// (sería un nodo repetido). Si el cierre es una curva, el último segmento
// 'C' termina exactamente en el primer nodo, como lo escribe Illustrator.

const EPS = 1e-6;

const finDe = (s) => (s[0] === 'C' ? [s[5], s[6]] : [s[1], s[2]]);
const iguales = (a, b, tol = EPS) => Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol;

/**
 * Deja un subcamino cerrado sin nodos repetidos: quita rectas de largo cero
 * y la recta de cierre explícita (la que vuelve al primer nodo). Devuelve
 * null si no hay un trazado utilizable.
 */
export function normalizarTrazado(segmentos, tol = EPS) {
  if (!Array.isArray(segmentos) || segmentos.length < 2 || segmentos[0][0] !== 'M') return null;
  if (segmentos.slice(1).some((s) => s[0] !== 'L' && s[0] !== 'C')) return null;
  const inicio = [segmentos[0][1], segmentos[0][2]];
  const salida = [segmentos[0].slice()];
  let ultimo = inicio;
  for (const s of segmentos.slice(1)) {
    const fin = finDe(s);
    if (s[0] === 'L' && iguales(fin, ultimo, tol)) continue; // recta de largo cero: nodo repetido
    salida.push(s.slice());
    ultimo = fin;
  }
  // El cierre: una recta de vuelta al inicio sobra (la pone el cierre); una
  // curva que vuelve al inicio se queda, terminando justo en el primer nodo.
  while (salida.length > 1) {
    const u = salida[salida.length - 1];
    if (!iguales(finDe(u), inicio, tol)) break;
    if (u[0] === 'L') { salida.pop(); continue; }
    u[5] = inicio[0]; u[6] = inicio[1];
    break;
  }
  return salida.length >= 2 ? salida : null;
}

/** Cantidad de nodos (anclas) del trazado cerrado. */
export function nodosDeTrazado(t) {
  if (!t?.length) return 0;
  const u = t[t.length - 1];
  return t.length - (iguales(finDe(u), [t[0][1], t[0][2]]) ? 1 : 0);
}

/** Aplica `f([x, y]) -> [x, y]` a cada nodo y manejador. Exacto para transformaciones afines. */
export function mapearTrazado(t, f) {
  if (!t) return null;
  return t.map((s) => {
    if (s[0] === 'C') return ['C', ...f([s[1], s[2]]), ...f([s[3], s[4]]), ...f([s[5], s[6]])];
    return [s[0], ...f([s[1], s[2]])];
  });
}

// Las aristas del contorno cerrado, cada una de nodo a nodo, incluida la de
// cierre: { tipo, a, c1, c2, b }.
function aristasDe(t) {
  const inicio = [t[0][1], t[0][2]];
  const aristas = [];
  let a = inicio;
  for (const s of t.slice(1)) {
    const b = finDe(s);
    aristas.push(s[0] === 'C' ? { tipo: 'C', a, c1: [s[1], s[2]], c2: [s[3], s[4]], b } : { tipo: 'L', a, b });
    a = b;
  }
  if (!iguales(a, inicio)) aristas.push({ tipo: 'L', a, b: inicio });
  return aristas;
}

function trazadoDeAristas(aristas) {
  const t = [['M', ...aristas[0].a]];
  for (const e of aristas) t.push(e.tipo === 'C' ? ['C', ...e.c1, ...e.c2, ...e.b] : ['L', ...e.b]);
  return normalizarTrazado(t);
}

/** El mismo trazado recorrido al revés (mismos nodos). */
export function invertirTrazado(t) {
  if (!t) return null;
  const aristas = aristasDe(t).reverse().map((e) => (e.tipo === 'C'
    ? { tipo: 'C', a: e.b, c1: e.c2, c2: e.c1, b: e.a }
    : { tipo: 'L', a: e.b, b: e.a }));
  // Arranca en el mismo primer nodo que el original.
  const k = aristas.findIndex((e) => iguales(e.a, [t[0][1], t[0][2]]));
  return trazadoDeAristas(k > 0 ? [...aristas.slice(k), ...aristas.slice(0, k)] : aristas);
}

function puntoDeCurva(e, u) {
  const m = 1 - u;
  return [0, 1].map((k) => m * m * m * e.a[k] + 3 * m * m * u * e.c1[k] + 3 * m * u * u * e.c2[k] + u * u * u * e.b[k]);
}

/** Polígono aproximado (para medir o dibujar donde no importan los nodos). */
export function aplanarTrazado(t, pasosPorCurva = 16) {
  if (!t) return [];
  const puntos = [[t[0][1], t[0][2]]];
  for (const e of aristasDe(t)) {
    if (e.tipo === 'C') for (let i = 1; i <= pasosPorCurva; i++) puntos.push(puntoDeCurva(e, i / pasosPorCurva));
    else puntos.push(e.b);
  }
  puntos.pop(); // el último es el primero otra vez
  return puntos;
}

function areaFirmada(puntos) {
  let area = 0;
  for (let i = 0; i < puntos.length; i++) {
    const p = puntos[i], q = puntos[(i + 1) % puntos.length];
    area += p[0] * q[1] - q[0] * p[1];
  }
  return area / 2;
}

// Recta desplazada `d` hacia afuera de la arista p→q: { p, dir, n } o null si p = q.
function rectaDesplazada(p, q, d, signo) {
  const dx = q[0] - p[0], dy = q[1] - p[1];
  const largo = Math.hypot(dx, dy);
  if (largo < EPS) return null;
  const n = [(signo * dy) / largo, (-signo * dx) / largo];
  return { p: [p[0] + n[0] * d, p[1] + n[1] * d], dir: [dx / largo, dy / largo], n };
}

// Dónde se cruzan dos rectas desplazadas, para el punto `original` que
// las une. Si son (casi) paralelas, o el cruce se dispara lejos (una punta
// muy aguda), el punto se corre `d` sobre la normal promedio.
function cruce(r1, r2, original, d) {
  const correrPromedio = () => {
    const nx = r1.n[0] + r2.n[0], ny = r1.n[1] + r2.n[1];
    const l = Math.hypot(nx, ny);
    const n = l < EPS ? r1.n : [nx / l, ny / l];
    return [original[0] + n[0] * d, original[1] + n[1] * d];
  };
  const det = r1.dir[0] * r2.dir[1] - r1.dir[1] * r2.dir[0];
  if (Math.abs(det) < 1e-9) return correrPromedio();
  const wx = r2.p[0] - r1.p[0], wy = r2.p[1] - r1.p[1];
  const s = (wx * r2.dir[1] - wy * r2.dir[0]) / det;
  const x = [r1.p[0] + r1.dir[0] * s, r1.p[1] + r1.dir[1] * s];
  // Inglete con tope (4 veces el desplazamiento, como el límite de inglete
  // de Illustrator): más allá, la punta no se estira sino que se corre.
  if (Math.hypot(x[0] - original[0], x[1] - original[1]) > 4 * Math.abs(d)) return correrPromedio();
  return x;
}

// El "polígono de control" de una arista, sin puntos repetidos, con el
// índice de cada punto original ('a', 'c1', 'c2', 'b') en su lugar.
function poligonoDeControl(e) {
  const claves = e.tipo === 'C' ? ['a', 'c1', 'c2', 'b'] : ['a', 'b'];
  const distintos = [];
  const lugar = {};
  for (const k of claves) {
    const p = e[k];
    if (distintos.length && iguales(distintos[distintos.length - 1], p)) { lugar[k] = distintos.length - 1; continue; }
    distintos.push(p);
    lugar[k] = distintos.length - 1;
  }
  return { distintos, lugar };
}

/**
 * Desplaza el contorno `d` hacia AFUERA (d < 0: hacia adentro) sin agregar
 * ni quitar nodos: cada nodo se corre a donde se cruzan los bordes vecinos
 * ya desplazados (inglete), y cada manejador sale de su nodo nuevo con la
 * misma dirección, estirado o acortado según la curvatura (el radio R pasa
 * a R ± d), así las tangentes quedan paralelas a las originales. Para el desplazamiento del láser (1 mm sobre piezas de
 * decenas de cm) el resultado no se distingue de un desplazamiento exacto.
 */
export function desplazarTrazado(t, d) {
  if (!t || !d) return t;
  const aristas = aristasDe(t);
  const signo = areaFirmada(aplanarTrazado(t, 8)) >= 0 ? 1 : -1;

  const controles = aristas.map((e) => {
    const { distintos, lugar } = poligonoDeControl(e);
    const rectas = [];
    for (let i = 0; i < distintos.length - 1; i++) rectas.push(rectaDesplazada(distintos[i], distintos[i + 1], d, signo));
    return { distintos, lugar, rectas };
  });
  // Primera y última recta útil de cada arista (para los nodos).
  const primera = (c) => c.rectas.find(Boolean) || null;
  const ultima = (c) => [...c.rectas].reverse().find(Boolean) || null;

  // Nodo k = fin de la arista k-1 = inicio de la arista k.
  const nodos = aristas.map((e, k) => {
    const previa = ultima(controles[(k - 1 + aristas.length) % aristas.length]);
    const siguiente = primera(controles[k]);
    if (previa && siguiente) return cruce(previa, siguiente, e.a, d);
    const r = previa || siguiente;
    return r ? [e.a[0] + r.n[0] * d, e.a[1] + r.n[1] * d] : e.a.slice();
  });

  const nuevas = aristas.map((e, k) => {
    const a = nodos[k], b = nodos[(k + 1) % aristas.length];
    if (e.tipo === 'L') return { tipo: 'L', a, b };
    // Cada manejador conserva su dirección (la tangente no cambia) y se
    // estira o se acorta según la curvatura en su nodo: al desplazar una
    // curva de radio R una distancia d, su radio pasa a R ± d (exacto para
    // un arco de círculo). Un manejador recogido queda recogido.
    // `sentido` -1: en el nodo final la curva se mide recorrida al revés, y
    // ahí el giro cambia de signo.
    const escala = (nodo, h, sigue, sentido) => {
      const vx = h[0] - nodo[0], vy = h[1] - nodo[1];
      const l = Math.hypot(vx, vy);
      if (l < EPS) return 1;
      const wx = sigue[0] - h[0], wy = sigue[1] - h[1];
      const curvatura = (sentido * (2 / 3) * (vx * wy - vy * wx)) / (l * l * l);
      return Math.min(5, Math.max(0.2, 1 + signo * d * curvatura));
    };
    const sa = escala(e.a, e.c1, e.c2, 1);
    const sb = escala(e.b, e.c2, e.c1, -1);
    const c1 = [a[0] + (e.c1[0] - e.a[0]) * sa, a[1] + (e.c1[1] - e.a[1]) * sa];
    const c2 = [b[0] + (e.c2[0] - e.b[0]) * sb, b[1] + (e.c2[1] - e.b[1]) * sb];
    return { tipo: 'C', a, c1, c2, b };
  });
  return trazadoDeAristas(nuevas);
}
