// Agrupaciones de moldería: un nombre libre en cada pieza (`pieza.agrupacion`,
// ej. "SPARTA VOLEY" o el archivo del que salió) que solo ordena la Biblioteca
// y el selector de piezas al armar una prenda. NO es una prenda: una prenda
// dice qué piezas se cortan juntas y con qué rol; una agrupación solo junta
// la moldería que se subió junta, para no buscar entre todas las piezas.
// Las piezas sin agrupación quedan "sueltas" y se ven igual.

export const SUELTAS = '';

export function agrupacionDe(pieza) {
  return String(pieza?.agrupacion || '').trim();
}

// Nombres de agrupación que ya existen, en orden alfabético.
export function nombresDeAgrupaciones(piezas) {
  return [...new Set(piezas.map(agrupacionDe).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
}

// [{ nombre, piezas }] por agrupación, alfabético; las sueltas al final
// (nombre SUELTAS). Las piezas de cada una quedan en el orden recibido.
export function piezasPorAgrupacion(piezas) {
  const mapa = new Map();
  for (const p of piezas) {
    const n = agrupacionDe(p);
    if (!mapa.has(n)) mapa.set(n, []);
    mapa.get(n).push(p);
  }
  const nombres = [...mapa.keys()].filter(Boolean).sort((a, b) => a.localeCompare(b, 'es'));
  if (mapa.has(SUELTAS)) nombres.push(SUELTAS);
  return nombres.map((nombre) => ({ nombre, piezas: mapa.get(nombre) }));
}

// Nombre sugerido al subir: el del archivo sin extensión.
export function agrupacionSugerida(nombreArchivo) {
  return String(nombreArchivo || '')
    .replace(/\.(pdf|dxf|ai)$/i, '')
    .replace(/[_]+/g, ' ')
    .trim();
}
