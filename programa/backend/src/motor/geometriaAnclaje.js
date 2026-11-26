// Convierte la geometría real de una Pieza (poligonoMm, en el sistema de
// coordenadas crudo del DXF/PDF -- origen arbitrario, Y hacia arriba) a la
// forma que espera motor/anclaje/referencias.js: cm desde la esquina
// superior izquierda de la pieza, Y hacia abajo. Es la MISMA transformación
// que ya usaba CanvasZonas.jsx en el frontend (trasladar por la esquina
// mínima, invertir Y, escalar mm->cm) -- no se inventó una convención
// nueva, solo se movió al backend para que el motor de anclaje (que corre
// del lado del servidor, para producción real) la use igual que el canvas.
//
// `piquetes` sale de `geometriaPorTalla[talla].piquetesMm` (pasada 19:
// piquetes SUELTOS, trazos aparte; pasada 20: sumados los PEGADOS,
// recortados en el propio contorno -- ver geometriaComun.js·
// contornoYPiquetesDeTrazos y geometriaSalientes.js) -- mismo tratamiento
// de coordenadas que los vértices (trasladar, invertir Y, mm->cm), aplicado
// a su CENTRO. `salientes` sale de `salientesMm` (pasada 20, geometriaSalientes.js
// ·puntosNotablesDe -- esquinas por vértice + "vueltas" del contorno
// muestreadas con ventana real en mm).
//
// Los dos suman `rx`/`ry` (posición relativa 0-1 en la pieza): es lo que
// permite reencontrar el mismo rasgo en otra talla si cambia la cuenta
// (referencias.js·emparejarPorPosicion) -- sin esto, cualquier candidato de
// la talla contra la que se resuelve tenía rx/ry=0, así que "el más
// cercano" a la posición guardada en el ancla salía casi al azar.
//
// `extremos` (los 4 puntos más alto/bajo/izq/der del contorno REAL, no de
// la caja) SÍ se calcula acá: a diferencia de piquetes/salientes, es un
// simple min/max sobre los vértices ya medidos -- ningún dato nuevo que
// extraer del archivo, y a diferencia de vertice/piquete/saliente no
// necesita huella de conteo (referencias.js no la pide para "extremo": el
// punto más alto siempre existe, en cualquier talla, sin ambigüedad).
function calcularExtremos(vertices) {
  let arriba = vertices[0], abajo = vertices[0], izquierda = vertices[0], derecha = vertices[0];
  for (const v of vertices) {
    if (v.y < arriba.y) arriba = v;
    if (v.y > abajo.y) abajo = v;
    if (v.x < izquierda.x) izquierda = v;
    if (v.x > derecha.x) derecha = v;
  }
  return { arriba, abajo, izquierda, derecha };
}

// Extremos empatados: dos lugares distintos igual de altos (los dos hombros
// de un frente). calcularExtremos se queda con el primero del archivo, y ese
// orden cambia de talla a talla: lo anclado ahí saltaba al otro hombro. Acá
// van todos los lugares empatados (a medio milímetro, separados más de 1 cm),
// para que el ancla elija el que se eligió en Diseño (su rx/ry, ver
// referencias.js·"extremo"). Solo cuando hay más de uno.
function extremosEmpatados(vertices, extremos) {
  const EMPATE = 0.05, SEPARADOS = 1;
  const valor = { arriba: (v) => -v.y, abajo: (v) => v.y, izquierda: (v) => -v.x, derecha: (v) => v.x };
  const out = {};
  for (const k of Object.keys(valor)) {
    const tope = valor[k](extremos[k]);
    const lugares = [extremos[k]];
    for (const v of vertices) {
      if (tope - valor[k](v) <= EMPATE && lugares.every((l) => Math.hypot(l.x - v.x, l.y - v.y) > SEPARADOS)) lugares.push(v);
    }
    if (lugares.length > 1) out[k] = lugares;
  }
  return out;
}

import { mapearTrazado, recuperarTrazado } from './trazado.js';

// El trazado original de una talla: el guardado, o reconstruido del polígono
// tesselado en piezas importadas antes de guardarlo (ver trazado.js·
// recuperarTrazado). Una vez por geometría.
const trazadosRecuperados = new WeakMap();
function trazadoMmDe(geo) {
  if (geo.trazadoMm) return geo.trazadoMm;
  if (!trazadosRecuperados.has(geo)) trazadosRecuperados.set(geo, recuperarTrazado(geo.poligonoMm, 1e-3));
  return trazadosRecuperados.get(geo);
}

function round3(n) { return Math.round(n * 1000) / 1000; }

export function geometriaParaAnclaje(pieza, talla) {
  const dim = pieza.dimensionesPorTalla?.[talla];
  const geo = pieza.geometriaPorTalla?.[talla];
  if (!dim || !geo || !geo.poligonoMm?.length) return null;

  const xs = geo.poligonoMm.map(([x]) => x);
  const ys = geo.poligonoMm.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxY = Math.max(...ys);

  const vertices = geo.poligonoMm.map(([x, y]) => ({
    x: (x - minX) / 10,
    y: (maxY - y) / 10,
  }));

  // rx/ry (posición relativa 0-1 dentro de la pieza) son lo que permite
  // reencontrar un piquete/saliente en otra talla si cambia la cuenta --
  // ver referencias.js·emparejarPorPosicion. Sin esto, cualquier ancla
  // puesta sobre un piquete que sobreviviera a un cambio de cuenta se
  // reemparejaba con rx/ry=0 para TODOS los candidatos por igual (el
  // "más cercano" salía casi al azar) -- un bug real, no solo un dato que
  // faltaba: candidatosDe() (frontend) ya guardaba el rx/ry real en el
  // ancla desde que se crea, pero la geometría de la OTRA talla, contra la
  // que se compara al resolver, nunca lo tuvo.
  const piquetes = (geo.piquetesMm || []).map((p) => {
    const x = (p.xMm - minX) / 10;
    const y = (maxY - p.yMm) / 10;
    return {
      x, y, ancho_cm: p.anchoMm / 10, alto_cm: p.altoMm / 10,
      rx: round3(x / dim.anchoCm), ry: round3(y / dim.altoCm),
      // Su trazo real, si la pieza se importó guardándolo.
      ...(Array.isArray(p.puntosMm) && p.puntosMm.length >= 2
        ? { puntos: p.puntosMm.map(([px, py]) => ({ x: (px - minX) / 10, y: (maxY - py) / 10 })), cerrado: !!p.cerrado } : {}),
    };
  });

  const salientes = (geo.salientesMm || []).map((s) => {
    const x = (s.xMm - minX) / 10;
    const y = (maxY - s.yMm) / 10;
    return { x, y, esquina: !!s.esquina, rx: round3(x / dim.anchoCm), ry: round3(y / dim.altoCm) };
  });

  return {
    nombre: pieza.nombre,
    pieza: { ancho_cm: dim.anchoCm, alto_cm: dim.altoCm },
    vertices,
    // El trazado original del contorno (mismos nodos que el archivo, ver
    // trazado.js), con la misma transformación que los vértices: es lo que
    // se exporta. En piezas importadas antes de guardarlo, reconstruido.
    trazado: mapearTrazado(trazadoMmDe(geo), ([x, y]) => [(x - minX) / 10, (maxY - y) / 10]),
    extremos: calcularExtremos(vertices),
    extremosEmpatados: extremosEmpatados(vertices, calcularExtremos(vertices)),
    piquetes,
    salientes,
  };
}

// Arma el mapa {rol: geo} que pide resolver.resolver(), para TODAS las
// piezas de un grupo a una talla (una talla por rol -- distintas piezas de
// la misma prenda pueden usar tallas de trabajo distintas al editar, igual
// que ya permitía tallaTrabajoPorRol en Productos.jsx).
export function geometriaDelGrupo(piezasDelGrupo, tallaPorRol) {
  const geometria = {};
  for (const pieza of piezasDelGrupo) {
    const talla = tallaPorRol[pieza.nombre];
    if (!talla) continue;
    const geo = geometriaParaAnclaje(pieza, talla);
    if (geo) geometria[pieza.nombre] = geo;
  }
  return geometria;
}
