// En local, sin variable de entorno, apunta al backend de desarrollo.
// En Netlify, se define VITE_API_URL apuntando al backend real en Render.
// Se normaliza el sufijo /api acá para que dé igual si la variable se cargó
// como el origen solo (https://host) o con el sufijo ya puesto
// (https://host/api) — ambas formas terminan en la misma BASE_URL.
const ORIGEN = (import.meta.env.VITE_API_URL || 'http://localhost:4000')
  .replace(/\/+$/, '')
  .replace(/\/api$/, '');
const BASE_URL = ORIGEN + '/api';

async function pedirJson(ruta, opciones) {
  const respuesta = await fetch(BASE_URL + ruta, {
    headers: { 'Content-Type': 'application/json' },
    ...opciones,
  });
  if (!respuesta.ok) {
    const cuerpo = await respuesta.json().catch(() => ({}));
    throw new Error(cuerpo.error || 'Error de red (' + respuesta.status + ')');
  }
  return respuesta.status === 204 ? null : respuesta.json();
}

// El servidor gratis de Render se duerme tras inactividad; despertarlo puede
// tardar hasta un minuto. Esto es justamente lo que EstadoServidor.jsx
// consulta para avisar en vez de dejar que cada pantalla falle en silencio.
export async function verificarSalud() {
  try {
    const respuesta = await fetch(BASE_URL + '/salud', { signal: AbortSignal.timeout(5000) });
    return respuesta.ok;
  } catch {
    return false;
  }
}

// --- Piezas (biblioteca) ---------------------------------------------------

export function listarPiezas() {
  return pedirJson('/piezas');
}

// Un solo archivo con todas las tallas de la pieza adentro (nombradas
// "S", "M", "L"...) — analizarPieza intenta matchear cada forma contra una
// talla conocida; resolverPieza calcula la geometría real ya con el mapeo
// confirmado (automático + correcciones a mano).
export function analizarPieza(svgTexto) {
  return pedirJson('/piezas/analizar-multitalla', { method: 'POST', body: JSON.stringify({ svgTexto }) });
}

export function resolverPieza(svgTexto, asignaciones, { mmPorUnidad, anchoConocidoCm, indiceReferencia } = {}) {
  return pedirJson('/piezas/resolver-multitalla', {
    method: 'POST',
    body: JSON.stringify({ svgTexto, asignaciones, mmPorUnidad, anchoConocidoCm, indiceReferencia }),
  });
}

export function crearPieza(pieza) {
  return pedirJson('/piezas', { method: 'POST', body: JSON.stringify(pieza) });
}

export function editarPieza(id, cambios) {
  return pedirJson('/piezas/' + id, { method: 'PUT', body: JSON.stringify(cambios) });
}

export function eliminarPieza(id) {
  return pedirJson('/piezas/' + id, { method: 'DELETE' });
}

// --- Grupos (catálogo: una prenda = piezas de biblioteca por rol) ---------

export function listarGrupos() {
  return pedirJson('/grupos');
}

export function crearGrupo(grupo) {
  return pedirJson('/grupos', { method: 'POST', body: JSON.stringify(grupo) });
}

export function eliminarGrupo(id) {
  return pedirJson('/grupos/' + id, { method: 'DELETE' });
}

export function anidarDesdeGrupo(grupoId, lineas, anchoLienzoCm) {
  return pedirJson('/nesting/desde-grupo', {
    method: 'POST',
    body: JSON.stringify({ grupoId, lineas, anchoLienzoCm }),
  });
}

// --- Diseños ----------------------------------------------------------------

export function listarDisenos() {
  return pedirJson('/disenos');
}

export function crearDiseno(diseno) {
  return pedirJson('/disenos', { method: 'POST', body: JSON.stringify(diseno) });
}

export function eliminarDiseno(id) {
  return pedirJson('/disenos/' + id, { method: 'DELETE' });
}

// --- Productos ---------------------------------------------------------------

export function listarProductos() {
  return pedirJson('/productos');
}

export function crearProducto(producto) {
  return pedirJson('/productos', { method: 'POST', body: JSON.stringify(producto) });
}

export function eliminarProducto(id) {
  return pedirJson('/productos/' + id, { method: 'DELETE' });
}

// --- Pedidos -------------------------------------------------------------------

export function listarPedidos() {
  return pedirJson('/pedidos');
}

export function crearPedido(pedido) {
  return pedirJson('/pedidos', { method: 'POST', body: JSON.stringify(pedido) });
}

export function eliminarPedido(id) {
  return pedirJson('/pedidos/' + id, { method: 'DELETE' });
}

export function anidarDesdePedido(pedidoId, anchoLienzoCm) {
  return pedirJson('/nesting/desde-pedido', {
    method: 'POST',
    body: JSON.stringify({ pedidoId, anchoLienzoCm }),
  });
}

export async function generarPdf(resultadoNesting) {
  const respuesta = await fetch(BASE_URL + '/nesting/generar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(resultadoNesting),
  });
  if (!respuesta.ok) throw new Error('Falló la generación del PDF');
  const blob = await respuesta.blob();
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = 'nesting.pdf';
  enlace.click();
  URL.revokeObjectURL(url);
}
