// Validación de cobertura de caracteres antes de escribir texto con una
// fuente. UNIFLOW/Illustrator nunca validó esto — escribía con
// app.textFonts.getByName(...) sin comprobar que la fuente tuviera ñ/acentos.
// Hallazgo de la investigación de un competidor real: catalogan cada fuente
// como "Todos los caracteres" / "Solo números" / "Sin ñ ni acentos".
//
// v0: recibe un objeto de fuente ya cargado con fontkit (o compatible, con
// .hasGlyphForCodePoint / .characterSet) — la carga de archivos de fuente en
// sí se resuelve cuando exista un catálogo real de fuentes en el proyecto
// (pasada 34, rutas/api.js·POST /fuentes, ya conectado).
//
// Límite real, probado a mano: esto confirma que existe UN GLIFO en esa
// posición Unicode, no que se vea como la letra esperada -- una fuente de
// íconos (probado con Wingdings real) también "soporta" ñ/acentos según
// este chequeo, porque su cmap sí mapea algo a esos codepoints (un dingbat,
// no la letra). Mismo enfoque que usan herramientas conocidas de cobertura
// de fuentes (cmap, no verificación visual) -- para el caso real que este
// chequeo existe (una fuente de letras real que le faltan LOS ACENTOS
// puntuales), funciona bien; una fuente de símbolos subida por error se
// nota a simple vista en la vista previa del PDF, no hace falta que este
// chequeo también lo agarre.

export const CARACTERES_CRITICOS = ['ñ', 'Ñ', 'á', 'é', 'í', 'ó', 'ú', 'Á', 'É', 'Í', 'Ó', 'Ú'];

/**
 * @param {{ hasGlyphForCodePoint?: (cp: number) => boolean, characterSet?: number[] }} fuente
 * @param {string} texto
 * @returns {{ soportado: boolean, faltantes: string[] }}
 */
export function verificarCobertura(fuente, texto) {
  const caracteres = new Set([...texto].filter((c) => CARACTERES_CRITICOS.includes(c)));
  const faltantes = [];

  for (const caracter of caracteres) {
    const codigo = caracter.codePointAt(0);
    const soportado = fuente.hasGlyphForCodePoint
      ? fuente.hasGlyphForCodePoint(codigo)
      : fuente.characterSet?.includes(codigo);
    if (!soportado) faltantes.push(caracter);
  }

  return { soportado: faltantes.length === 0, faltantes };
}
