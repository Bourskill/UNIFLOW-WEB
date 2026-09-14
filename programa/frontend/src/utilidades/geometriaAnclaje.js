// Espejo del backend (programa/backend/src/motor/geometriaAnclaje.js): la
// MISMA transformación (trasladar por la esquina mínima, invertir Y,
// mm->cm) para que el lienzo del editor arme sus "candidatos" en el mismo
// sistema de coordenadas que ya usan las anclas/zonas resueltas por el
// backend -- si las dos usaran una convención distinta, los candidatos y
// los puntos resueltos no coincidirían en el dibujo. No se comparte el
// archivo entre frontend y backend (distintos runtimes/empaquetadores);
// se mantiene igual a propósito, como ya pasaba con el propio recorte del
// diseño en CanvasZonas.jsx.
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
  const dim = pieza?.dimensionesPorTalla?.[talla];
  const geo = pieza?.geometriaPorTalla?.[talla];
  if (!dim || !geo || !geo.poligonoMm?.length) return null;

  const xs = geo.poligonoMm.map(([x]) => x);
  const ys = geo.poligonoMm.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxY = Math.max(...ys);

  const vertices = geo.poligonoMm.map(([x, y]) => ({
    x: (x - minX) / 10,
    y: (maxY - y) / 10,
  }));

  // rx/ry (posición relativa 0-1) -- espejo del backend
  // (motor/geometriaAnclaje.js), mismo motivo: sin esto, reencontrar un
  // piquete/saliente en otra talla con distinta cuenta salía casi al azar.
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

// Texto corto para "Pegado a: …", puerto de referencias.js·describirReferencia
// (backend/src/motor/anclaje/referencias.js) -- mismo texto, para que decir
// a qué está pegada un ancla sea idéntico a lo que ya explica el motor.
const NOMBRES_PARTE = {
  centro: 'centro', arriba: 'borde superior', abajo: 'borde inferior',
  izquierda: 'borde izquierdo', derecha: 'borde derecho',
  supIzq: 'esquina superior izquierda', supDer: 'esquina superior derecha',
  infIzq: 'esquina inferior izquierda', infDer: 'esquina inferior derecha',
};
export function describirReferencia(ref) {
  if (!ref || !ref.tipo) return 'nada todavía';
  const parte = NOMBRES_PARTE[ref.parte] || null;
  switch (ref.tipo) {
    case 'contorno': return 'el contorno de la pieza' + (parte ? ' · ' + parte : '');
    case 'extremo': {
      if (ref.parte === 'arriba') return 'el punto más alto del contorno';
      if (ref.parte === 'abajo') return 'el punto más bajo del contorno';
      if (ref.parte === 'izquierda') return 'el punto más a la izquierda del contorno';
      if (ref.parte === 'derecha') return 'el punto más a la derecha del contorno';
      return 'un extremo del contorno';
    }
    case 'vertice': return 'el vértice ' + ((ref.indice ?? 0) + 1) + (typeof ref.puntos === 'number' ? ' de ' + ref.puntos : '');
    case 'saliente': return 'el extremo ' + ((ref.indice ?? 0) + 1) + (typeof ref.total === 'number' ? ' de ' + ref.total : '');
    case 'piquete': return 'el piquete ' + ((ref.indice ?? 0) + 1) + (typeof ref.total === 'number' ? ' de ' + ref.total : '') + (parte ? ' · ' + parte : '');
    case 'zona': return 'la zona ' + ref.zona + (parte ? ' · ' + parte : '');
    case 'ancla': return 'el ancla ' + ref.ancla;
    default: return ref.tipo;
  }
}
