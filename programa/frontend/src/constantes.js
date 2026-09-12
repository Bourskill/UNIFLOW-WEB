// v0: set fijo de tallas comunes. Cuando haga falta una talla fuera de esta
// lista, se amplía acá — no es una limitación del motor (nesting.js y
// calibracion.js no asumen ninguna lista fija), solo de este formulario.
export const TALLAS = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

// Presets de rotación permitida por pieza — nunca se asume 0°/180° por
// defecto sin que el usuario lo confirme (ver plan técnico, Paso 1).
export const PRESETS_ANGULOS = [
  { id: '0-180', etiqueta: '0° y 180° (flip — lo más común)', valores: [0, 180] },
  { id: 'cuatro', etiqueta: '0° / 90° / 180° / 270°', valores: [0, 90, 180, 270] },
  { id: 'libre', etiqueta: 'Libre (cualquier ángulo)', valores: 'libre' },
  { id: 'fija', etiqueta: 'Fija (solo 0°, ej. logo direccional)', valores: [0] },
];
