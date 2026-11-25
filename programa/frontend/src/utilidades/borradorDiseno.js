// Guardado del editor de Diseño (Productos.jsx): qué cuenta como "cambios
// sin guardar" y el borrador que queda en este navegador por si se recarga
// la página, se corta la conexión o el servidor pide la clave de nuevo.
// Aparte de la pantalla para poder probarlo sin navegador.

const CLAVE = 'uniflow.borradorDiseno';

/** Lo que define un producto en el editor (lo que se guarda en el servidor). */
export function datosDelEditor({ nombre, grupoIds, disenoId, anclaje, bordeContraste, ladosPropios, conjuntos, moldes }) {
  return {
    nombre: nombre || '', grupoIds: grupoIds || [], disenoId: disenoId || null,
    anclaje: anclaje || { anclas: [], zonas: [] }, bordeContraste: bordeContraste || null,
    // Qué piezas en par llevan diseño propio del otro lado (vacío = ninguna).
    ladosPropios: ladosPropios && Object.keys(ladosPropios).length ? ladosPropios : {},
    // Conjuntos de prendas (dama / caballero...); sin ellos, ni aparece.
    ...(conjuntos?.length ? { conjuntos } : {}),
    // Moldes cambiados en esta producción (MANGA → MANGA LARGA); sin ellos, ni aparece.
    ...(moldes && Object.keys(moldes).length ? { moldes } : {}),
  };
}

/** Huella para comparar dos estados del editor (mismo producto = misma huella). */
export function firmaEditor(estado) {
  return JSON.stringify(datosDelEditor(estado));
}

/** ¿Hay algo hecho que valga la pena no perder? */
export function tieneContenido({ nombre, anclaje }) {
  return !!(nombre && nombre.trim()) || (anclaje?.zonas?.length || 0) > 0 || (anclaje?.anclas?.length || 0) > 0;
}

/**
 * ¿Hay cambios sin guardar? `firmaGuardada` es la huella de lo que está en el
 * servidor; null = producto nuevo que todavía no se guardó nunca.
 */
export function haySinGuardar(estado, firmaGuardada) {
  if (firmaGuardada === null) return tieneContenido(estado);
  return firmaEditor(estado) !== firmaGuardada;
}

/** Se puede guardar solo en el servidor: tiene nombre, prenda y (si es nuevo) al menos una zona. */
export function puedeGuardarseSolo(estado, esNuevo) {
  if (!estado.nombre?.trim() || !(estado.grupoIds?.length > 0)) return false;
  return !esNuevo || (estado.anclaje?.zonas?.length || 0) > 0;
}

function almacen() {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

/** Guarda el borrador en este navegador (nunca tira: sin almacenamiento, no hace nada). */
export function guardarBorrador({ editandoId, ...estado }, ahora = Date.now()) {
  try { almacen()?.setItem(CLAVE, JSON.stringify({ editandoId: editandoId || null, ...datosDelEditor(estado), en: ahora })); } catch { /* lleno o bloqueado */ }
}

export function leerBorrador() {
  try {
    const crudo = almacen()?.getItem(CLAVE);
    const b = crudo ? JSON.parse(crudo) : null;
    return b && typeof b === 'object' && b.anclaje ? b : null;
  } catch { return null; }
}

export function borrarBorrador() {
  try { almacen()?.removeItem(CLAVE); } catch { /* nada que borrar */ }
}

/**
 * Al abrir Diseño: ¿vale la pena ofrecer recuperar el borrador? Solo si trae
 * trabajo y no es igual a lo que ya está guardado de ese producto.
 */
export function borradorParaOfrecer(borrador, productos, comoEnEditor = (p) => p) {
  if (!borrador || !tieneContenido(borrador)) return null;
  const guardado = borrador.editandoId ? productos.find((p) => p.id === borrador.editandoId) : null;
  if (guardado && firmaEditor(comoEnEditor(guardado)) === firmaEditor(borrador)) return null;
  return { ...borrador, productoExiste: !!guardado };
}

/** "hace 5 min", para el aviso. */
export function haceCuanto(ms, ahora = Date.now()) {
  const min = Math.round((ahora - ms) / 60000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return 'hace ' + min + ' min';
  const h = Math.round(min / 60);
  if (h < 24) return 'hace ' + h + ' h';
  return 'hace ' + Math.round(h / 24) + ' días';
}
