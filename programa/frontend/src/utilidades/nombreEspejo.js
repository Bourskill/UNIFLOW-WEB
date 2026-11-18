// Nombre propuesto para la pieza en espejo ("MANGA IZQ" → "MANGA DER"), para
// mostrarlo ya escrito en la Biblioteca antes de crearla.
// ESPEJO de programa/backend/src/motor/espejoPieza.js·nombreDeEspejo (lo
// comprueba backend/pruebas/prueba-espejo.js).

// Pares izquierda/derecha que se reconocen en el nombre, para proponer el
// nombre del espejo ("MANGA IZQ" → "MANGA DER"). Respeta mayúsculas.
const PARES = [
  ['izquierda', 'derecha'], ['izquierdo', 'derecho'], ['izq', 'der'], ['izda', 'dcha'],
];

function conMismaCaja(modelo, palabra) {
  if (modelo === modelo.toUpperCase()) return palabra.toUpperCase();
  if (modelo[0] === modelo[0].toUpperCase()) return palabra[0].toUpperCase() + palabra.slice(1);
  return palabra;
}

/** Nombre propuesto para el espejo de `nombre`. */
export function nombreDeEspejo(nombre) {
  const texto = String(nombre || '').trim();
  for (const [a, b] of PARES) {
    const patron = new RegExp('(^|[^a-záéíóúñ])(' + a + '|' + b + ')(?=$|[^a-záéíóúñ])', 'i');
    const m = texto.match(patron);
    if (m) {
      const encontrada = m[2];
      const otra = encontrada.toLowerCase() === a ? b : a;
      const inicio = m.index + m[1].length;
      return texto.slice(0, inicio) + conMismaCaja(encontrada, otra) + texto.slice(inicio + encontrada.length);
    }
  }
  return texto + ' (espejo)';
}
