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
    extremos: calcularExtremos(vertices),
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
