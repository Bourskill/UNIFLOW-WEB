// Validación de cobertura de caracteres antes de escribir texto con una
// fuente. UNIFLOW/Illustrator nunca validó esto — escribía con
// app.textFonts.getByName(...) sin comprobar que la fuente tuviera ñ/acentos.
// Hallazgo de la investigación de un competidor real: catalogan cada fuente
// como "Todos los caracteres" / "Solo números" / "Sin ñ ni acentos".
//
// v0: recibe un objeto de fuente ya cargado con fontkit (o compatible, con
// .hasGlyphForCodePoint / .characterSet) — la carga de archivos de fuente en
// sí se resuelve cuando exista un catálogo real de fuentes en el proyecto.

const CARACTERES_CRITICOS = ['ñ', 'Ñ', 'á', 'é', 'í', 'ó', 'ú', 'Á', 'É', 'Í', 'Ó', 'Ú'];

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
