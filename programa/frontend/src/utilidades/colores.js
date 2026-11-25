// Colores para los selectores (componentes/SelectorColor.jsx): leer lo que
// se pegue o escriba en cualquier formato común y recordar los últimos
// colores usados (en este navegador, compartidos por todos los selectores).

const CLAVE_RECIENTES = 'uniflow.coloresRecientes';
export const MAX_RECIENTES = 12;
const EVENTO = 'uniflow-colores-recientes';

const dos = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

/**
 * "#FF0000", "ff0000", "#f00", "F00", " #ff0000; ", "rgb(255, 0, 0)",
 * "255,0,0" → "#ff0000". null si no es un color.
 */
export function leerColor(texto) {
  if (texto == null) return null;
  const t = String(texto).trim().replace(/[;,.]+$/, '').trim();
  let m = t.match(/^#?([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (m) return '#' + m[1].toLowerCase();
  m = t.match(/^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (m) return ('#' + m[1] + m[1] + m[2] + m[2] + m[3] + m[3]).toLowerCase();
  m = t.match(/^(?:rgba?\s*\()?\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*(?:[,\s/]\s*[\d.]+%?\s*)?\)?$/i);
  if (m && [m[1], m[2], m[3]].every((v) => Number(v) <= 255)) return '#' + dos(m[1]) + dos(m[2]) + dos(m[3]);
  return null;
}

function almacen() {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

/** Los últimos colores usados, el más nuevo primero. */
export function coloresRecientes() {
  try {
    const lista = JSON.parse(almacen()?.getItem(CLAVE_RECIENTES) || '[]');
    return Array.isArray(lista) ? lista.map(leerColor).filter(Boolean).slice(0, MAX_RECIENTES) : [];
  } catch { return []; }
}

/** El color pasa adelante de los recientes (sin repetirse). */
export function recordarColor(color, lista = coloresRecientes()) {
  const c = leerColor(color);
  if (!c) return lista;
  const nueva = [c, ...lista.filter((x) => x !== c)].slice(0, MAX_RECIENTES);
  try { almacen()?.setItem(CLAVE_RECIENTES, JSON.stringify(nueva)); } catch { /* lleno o bloqueado */ }
  try { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENTO)); } catch { /* sin ventana */ }
  return nueva;
}

/** Avisa cuando cambian los recientes (desde cualquier selector). Devuelve cómo dejar de escuchar. */
export function alCambiarRecientes(fn) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(EVENTO, fn);
  return () => window.removeEventListener(EVENTO, fn);
}
