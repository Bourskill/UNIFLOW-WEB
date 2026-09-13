// v0: preset de tallas comunes para los formularios de Pedidos/Productos
// (elegir una talla ya cargada). No es una lista cerrada: Piezas acepta
// cualquier nombre de talla que traiga el archivo subido (numérica de niño,
// de pantalón, de marca propia...), esto es solo el atajo de estos dos
// formularios puntuales.
export const TALLAS = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

// Orden conocido de las tallas de letra más comunes, solo para mostrar
// chips en un orden que se lea bien (no valida ni restringe nada: una talla
// que no está acá simplemente no tiene una posición "conocida").
const ORDEN_LETRA_CONOCIDO = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', 'XXXL', '3XL', '4XL', '5XL', '6XL'];

// Ordena un conjunto de tallas detectadas para mostrarlas: numéricas puras
// (niño, pantalón) de menor a mayor, letras conocidas en su orden real
// (alfabético NO sirve: "L" < "M" < "S" alfabéticamente, pero L es más
// grande), y cualquier otra cosa con un orden razonable de respaldo. Es solo
// para que los chips se lean bien — nunca decide qué es o no una talla.
export function ordenarTallasNatural(tallas) {
  const esNumerica = (t) => /^\d+$/.test(t);
  const posicionConocida = (t) => ORDEN_LETRA_CONOCIDO.indexOf(t.toUpperCase());

  return [...tallas].sort((a, b) => {
    if (esNumerica(a) && esNumerica(b)) return Number(a) - Number(b);
    const posA = posicionConocida(a);
    const posB = posicionConocida(b);
    if (posA !== -1 && posB !== -1) return posA - posB;
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  });
}

// Presets de rotación permitida por pieza — nunca se asume 0°/180° por
// defecto sin que el usuario lo confirme (ver plan técnico, Paso 1).
export const PRESETS_ANGULOS = [
  { id: '0-180', etiqueta: '0° y 180° (flip — lo más común)', valores: [0, 180] },
  { id: 'cuatro', etiqueta: '0° / 90° / 180° / 270°', valores: [0, 90, 180, 270] },
  { id: 'libre', etiqueta: 'Libre (cualquier ángulo)', valores: 'libre' },
  { id: 'fija', etiqueta: 'Fija (solo 0°, ej. logo direccional)', valores: [0] },
];
