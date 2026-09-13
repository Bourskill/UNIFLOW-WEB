// Utilidades de geometría usadas por importarDxf.js: una vez que se tienen
// los puntos en "unidades del archivo", matchear el nombre de una capa
// contra "es una talla" y calcular bounding box en mm.
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

// ---- piquetes sueltos ----------------------------------------------------
// Puerto de la regla real de host.jsx (programa/panel/jsx, pareceUnPiquete):
// "un piquete es CORTO. Y punto." -- no importa si el trazo es abierto o
// cerrado (una muesca dibujada como raya, o como una V cerrada, cuentan
// igual), lo único que lo distingue del contorno real es que un contorno
// mide decenas de cm y un piquete no llega a 2.5. El mismo umbral que usaba
// el panel de Illustrator (PIQUETE_LARGO_MAX_CM), portado tal cual.
//
// Ahí se detectaba sobre pathPoints reales de Illustrator (anchors de una
// curva Bézier, pocos puntos); acá se aplica sobre los trazos YA
// TESSELADOS que devuelven dxf-parser/pdfjs-dist (muchos puntos por curva) --
// la fórmula de longitud (sumar segmento a segmento) da el mismo resultado
// real en cm de cualquier forma, tesselada o no, así que el umbral sigue
// siendo válido sin ningún ajuste.
export const PIQUETE_LARGO_MAX_CM = 2.5;

function largoDeTrazoMm(puntosMm, cerrado) {
  let largo = 0;
  for (let i = 0; i < puntosMm.length - 1; i++) {
    largo += Math.hypot(puntosMm[i + 1][0] - puntosMm[i][0], puntosMm[i + 1][1] - puntosMm[i][1]);
  }
  if (cerrado && puntosMm.length > 2) {
    const primero = puntosMm[0];
    const ultimo = puntosMm[puntosMm.length - 1];
    largo += Math.hypot(primero[0] - ultimo[0], primero[1] - ultimo[1]);
  }
  return largo;
}

// `trazos`: los trazos SIN MEZCLAR de una capa/talla ([{puntos, cerrado}],
// en unidades del archivo) -- a diferencia de poligonoYBoundingBoxDePuntos(),
// que ya recibe todo mezclado en una sola lista de puntos y no puede
// distinguir de dónde vino cada uno.
//
// El contorno real es el trazo con la CAJA (ancho × alto) más grande de la
// capa -- mismo criterio que host.jsx (geometriaDeItem: "el contorno: la
// hoja de mayor area", elegida por areaDeCaja(geometricBounds), NO por
// perímetro). Se leyó ese código antes de escribir esto: elegir por
// perímetro (como hacía esta función antes) se rompe con una línea de
// referencia larga y angosta en la misma capa (ej. una marca de hilo o
// doblez) -- puede medir más que el contorno real sin ser el molde, y
// terminaba ganando por longitud. Por área eso no pasa nunca: una línea,
// por larga que sea, tiene una caja casi sin área (uno de sus lados es
// ~0), así que jamás le gana a la caja real de la pieza.
//
// Cualquier otro trazo de menos de PIQUETE_LARGO_MAX_CM reales (por
// PERÍMETRO -- eso sí es fiel a pareceUnPiquete()) es un piquete suelto: se
// guarda por su CENTRO y su caja (ancho/alto), no por sus puntos -- es lo
// que espera motor/anclaje/referencias.js (el mismo convenio que ya usaban
// los piquetes de Illustrator: "la geometría da el piquete por su centro,
// no por su esquina"). Un trazo que no es ni el contorno ni corto (un trazo
// grande de más en la misma capa) no se adivina como ninguna de las dos
// cosas: se ignora, mismo criterio que host.jsx (ahí queda como diagnóstico
// de "trazos de más", no como dato).
export function contornoYPiquetesDeTrazos(trazos, mmPorUnidad) {
  const conMedidas = trazos.map((t) => {
    const puntosMm = t.puntos.map(([x, y]) => [x * mmPorUnidad, y * mmPorUnidad]);
    const xs = puntosMm.map((p) => p[0]);
    const ys = puntosMm.map((p) => p[1]);
    const areaCajaMm2 = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    return { puntosMm, cerrado: t.cerrado, largoCm: largoDeTrazoMm(puntosMm, t.cerrado) / 10, areaCajaMm2 };
  });

  let contorno = conMedidas[0];
  for (const t of conMedidas) if (t.areaCajaMm2 > contorno.areaCajaMm2) contorno = t;

  const piquetesMm = [];
  for (const t of conMedidas) {
    if (t === contorno || t.largoCm >= PIQUETE_LARGO_MAX_CM) continue;
    const xs = t.puntosMm.map((p) => p[0]);
    const ys = t.puntosMm.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    piquetesMm.push({ xMm: (minX + maxX) / 2, yMm: (minY + maxY) / 2, anchoMm: maxX - minX, altoMm: maxY - minY });
  }

  const xs = contorno.puntosMm.map((p) => p[0]);
  const ys = contorno.puntosMm.map((p) => p[1]);
  return {
    poligonoMm: contorno.puntosMm,
    boundingBoxMm: {
      anchoMm: Math.max(...xs) - Math.min(...xs),
      altoMm: Math.max(...ys) - Math.min(...ys),
    },
    piquetesMm,
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
