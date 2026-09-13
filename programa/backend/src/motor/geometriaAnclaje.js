// Convierte la geometría real de una Pieza (poligonoMm, en el sistema de
// coordenadas crudo del DXF/PDF -- origen arbitrario, Y hacia arriba) a la
// forma que espera motor/anclaje/referencias.js: cm desde la esquina
// superior izquierda de la pieza, Y hacia abajo. Es la MISMA transformación
// que ya usaba CanvasZonas.jsx en el frontend (trasladar por la esquina
// mínima, invertir Y, escalar mm->cm) -- no se inventó una convención
// nueva, solo se movió al backend para que el motor de anclaje (que corre
// del lado del servidor, para producción real) la use igual que el canvas.
//
// `extremos`, `piquetes` y `salientes` NO se completan todavía: el
// importador DXF/PDF (motor/importarDxf.js, motor/importarPdf.js) hoy solo
// separa el contorno cerrado del resto para el bounding box (ver Pasada 10
// de claude/ESTADO-ACTUAL.md), no guarda los piquetes sueltos como datos
// aparte. referencias.js ya está preparado para esto: una referencia de
// tipo "piquete"/"extremo"/"saliente" sin datos falla con un mensaje claro
// ("no tiene piquetes reconocibles"), no revienta -- ver la propia regla 6
// del motor. Cuando el importador extraiga esos rasgos, esta función solo
// necesita sumar los campos, sin tocar nada del motor de anclaje.
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

  return {
    nombre: pieza.nombre,
    pieza: { ancho_cm: dim.anchoCm, alto_cm: dim.altoCm },
    vertices,
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
