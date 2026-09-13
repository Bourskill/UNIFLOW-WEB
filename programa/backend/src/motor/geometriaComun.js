// Lo que comparten los importadores de SVG y DXF: una vez que cada formato
// entrega sus puntos ya en "unidades del archivo" (sin importar de dónde
// salieron), matchear el nombre de una forma/capa contra "es una talla" y
// calcular bounding box en mm es exactamente el mismo cálculo.
//
// La talla NO se valida contra una lista fija (XS/S/M/.../XL) -- eso
// forzaba una sola escala (ropa de adulto unisex) y dejaba afuera tallas de
// niño (2, 4, 6...), de pantalón (30, 32, 34...) o cualquier nomenclatura
// propia de marca. El nombre que trae el archivo ES la talla, tal cual; solo
// se descarta si está vacío (una forma sin nombre no puede ser una talla).

export function normalizarTalla(nombre) {
  const limpio = (nombre || '').trim();
  return limpio || null;
}

export function anchoDePuntos(puntosUnidades) {
  const xs = puntosUnidades.map((p) => p[0]);
  return Math.max(...xs) - Math.min(...xs);
}

export function poligonoYBoundingBoxDePuntos(puntosUnidades, mmPorUnidad) {
  const puntosMm = puntosUnidades.map(([x, y]) => [x * mmPorUnidad, y * mmPorUnidad]);
  const xs = puntosMm.map((p) => p[0]);
  const ys = puntosMm.map((p) => p[1]);
  return {
    poligonoMm: puntosMm,
    boundingBoxMm: {
      anchoMm: Math.max(...xs) - Math.min(...xs),
      altoMm: Math.max(...ys) - Math.min(...ys),
    },
  };
}

// Dado el conjunto crudo de "candidatos" (una forma/capa por índice, cada uno
// con nombre y sus puntos en unidades del archivo), arma las asignaciones
// automáticas talla->índice: el nombre de cada forma ES su talla. Si dos
// formas comparten nombre (comparando sin importar mayúsculas -- "M" y "m"
// son la misma talla escrita distinto, no dos tallas), ninguna se asigna
// sola: queda ambiguo para resolver a mano en vez de guardar cualquiera de
// las dos por adivinar.
export function asignarTallasPorNombre(candidatos) {
  const asignacionesCrudas = candidatos.map((c) => ({
    indice: c.indice,
    nombreDetectado: c.nombre,
    tallaAsignada: normalizarTalla(c.nombre),
  }));
  const conteoPorTallaClave = {};
  for (const a of asignacionesCrudas) {
    if (a.tallaAsignada) {
      const clave = a.tallaAsignada.toUpperCase();
      conteoPorTallaClave[clave] = (conteoPorTallaClave[clave] || 0) + 1;
    }
  }
  return asignacionesCrudas.map((a) =>
    a.tallaAsignada && conteoPorTallaClave[a.tallaAsignada.toUpperCase()] > 1 ? { ...a, tallaAsignada: null } : a
  );
}
