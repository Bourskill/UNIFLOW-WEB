// Convierte la geometría real de una Pieza (poligonoMm, en el sistema de
// coordenadas crudo del DXF/PDF -- origen arbitrario, Y hacia arriba) a la
// forma que espera motor/anclaje/referencias.js: cm desde la esquina
// superior izquierda de la pieza, Y hacia abajo. Es la MISMA transformación
// que ya usaba CanvasZonas.jsx en el frontend (trasladar por la esquina
// mínima, invertir Y, escalar mm->cm) -- no se inventó una convención
// nueva, solo se movió al backend para que el motor de anclaje (que corre
// del lado del servidor, para producción real) la use igual que el canvas.
//
// `piquetes` sale de `geometriaPorTalla[talla].piquetesMm` (Pasada 19: los
// importadores DXF/PDF ahora separan, por capa/talla, el trazo más largo
// -- el contorno real -- de cualquier otro trazo de menos de 2.5cm reales,
// ver geometriaComun.js·contornoYPiquetesDeTrazos) -- mismo tratamiento de
// coordenadas que los vértices (trasladar, invertir Y, mm->cm), aplicado a
// su CENTRO.
//
// `salientes` (los "giros" del contorno -- esquinas, picos) SIGUE sin
// calcularse: a diferencia de un piquete (un trazo aparte, con posición
// propia) o un extremo (un simple min/max), un saliente pide analizar la
// CURVATURA del contorno para encontrar dónde "da la vuelta" -- un
// algoritmo real, no una consulta sobre datos que ya se tienen, y por eso
// se dejó fuera de esta pasada (ver claude/ESTADO-ACTUAL.md). referencias.js
// ya está preparado para esto: una referencia de tipo "saliente" sin datos
// falla con un mensaje claro, no revienta -- regla 6 del motor.
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

  const piquetes = (geo.piquetesMm || []).map((p) => ({
    x: (p.xMm - minX) / 10,
    y: (maxY - p.yMm) / 10,
    ancho_cm: p.anchoMm / 10,
    alto_cm: p.altoMm / 10,
  }));

  return {
    nombre: pieza.nombre,
    pieza: { ancho_cm: dim.anchoCm, alto_cm: dim.altoCm },
    vertices,
    extremos: calcularExtremos(vertices),
    piquetes,
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
