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

// Sube un archivo pesado (imagen de Diseño, PDF/DXF original de Pieza) a
// Supabase Storage y devuelve su URL pública -- nunca se guarda el archivo
// en sí adentro de un registro (ver almacen.js: eso es lo que causaba el
// "statement timeout" al guardar).
export function subirArchivo(base64, contentType, nombre) {
  return pedirJson('/archivos', { method: 'POST', body: JSON.stringify({ base64, contentType, nombre }) }).then(
    (r) => r.url
  );
}

// --- Piezas (biblioteca) ---------------------------------------------------

export function listarPiezas() {
  return pedirJson('/piezas');
}

// Un solo archivo (.dxf o .pdf) con todas las tallas de la pieza adentro
// (una capa por talla, nombrada "S", "M", "L"...) — analizarPieza intenta
// matchear cada capa contra una talla conocida; resolverPieza calcula la
// geometría real ya con el mapeo confirmado (automático + correcciones a
// mano). El DXF viaja como texto plano; el PDF (binario) en base64.
export function analizarPieza(texto, formato) {
  return pedirJson('/piezas/analizar-multitalla', { method: 'POST', body: JSON.stringify({ texto, formato }) });
}

export function resolverPieza(texto, formato, asignaciones, { mmPorUnidad, anchoConocidoCm, indiceReferencia } = {}) {
  return pedirJson('/piezas/resolver-multitalla', {
    method: 'POST',
    body: JSON.stringify({ texto, formato, asignaciones, mmPorUnidad, anchoConocidoCm, indiceReferencia }),
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

// Recalcula la geometría de TODAS las tallas de una pieza ya subida, a
// partir de su archivo original guardado -- sin volver a subirla. Pensado
// para piezas que ya existían antes de que el importador supiera separar
// piquetes sueltos (pasada 19): esto es lo que las pone al día.
export function reprocesarPieza(id) {
  return pedirJson('/piezas/' + id + '/reprocesar', { method: 'POST' });
}

// Reemplaza la geometría de UNA talla puntual sin resubir todo el rango --
// versiona la pieza entera (ver rutas/api.js).
export function reemplazarTallaPieza(id, talla, geometriaResuelta) {
  return pedirJson('/piezas/' + id + '/tallas/' + talla, { method: 'PUT', body: JSON.stringify(geometriaResuelta) });
}

// Reemplaza el archivo original entero de una pieza ya existente (a
// diferencia de crearPieza, que crea una pieza nueva) -- versiona en vez de
// pisar, así un Producto ya guardado puede seguir fijado a la geometría
// vieja (ver Productos.jsx·versionesPiezas).
export function reemplazarArchivoPieza(id, { geometriaPorTalla, archivoOriginal, formatoOriginal }) {
  return pedirJson('/piezas/' + id + '/reemplazar-archivo', {
    method: 'POST',
    body: JSON.stringify({ geometriaPorTalla, archivoOriginal, formatoOriginal }),
  });
}

export function eliminarVersionPieza(id, numeroVersion) {
  return pedirJson('/piezas/' + id + '/versiones/' + numeroVersion, { method: 'DELETE' });
}

// --- Grupos (catálogo: una prenda = piezas de biblioteca por rol) ---------

export function listarGrupos() {
  return pedirJson('/grupos');
}

export function crearGrupo(grupo) {
  return pedirJson('/grupos', { method: 'POST', body: JSON.stringify(grupo) });
}

export function editarGrupo(id, cambios) {
  return pedirJson('/grupos/' + id, { method: 'PUT', body: JSON.stringify(cambios) });
}

export function eliminarGrupo(id) {
  return pedirJson('/grupos/' + id, { method: 'DELETE' });
}

// Resuelve un anclaje (anclas/zonas) TODAVÍA NO GUARDADO contra la
// geometría real de uno o más grupos combinados -- lo llama el canvas de
// Productos.jsx cada vez que el usuario mueve algo o cambia de talla de
// trabajo, para mostrar en vivo dónde cae cada ancla/zona (ver
// motor/anclaje/resolver.js). grupoIds: array -- un solo elemento para un
// producto de una prenda, varios para un kit multi-prenda.
export function resolverAnclaje(grupoIds, tallaPorRol, anclaje) {
  return pedirJson('/anclaje/resolver', {
    method: 'POST',
    body: JSON.stringify({ grupoIds, tallaPorRol, anclaje }),
  });
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

export function editarDiseno(id, cambios) {
  return pedirJson('/disenos/' + id, { method: 'PUT', body: JSON.stringify(cambios) });
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

export function editarProducto(id, cambios) {
  return pedirJson('/productos/' + id, { method: 'PUT', body: JSON.stringify(cambios) });
}

// --- Plantillas (zonas sin contenido, para no rearmar el anclaje cada vez) ---

export function listarPlantillas() {
  return pedirJson('/plantillas');
}

export function crearPlantilla(plantilla) {
  return pedirJson('/plantillas', { method: 'POST', body: JSON.stringify(plantilla) });
}

export function eliminarPlantilla(id) {
  return pedirJson('/plantillas/' + id, { method: 'DELETE' });
}

// --- Pedidos -------------------------------------------------------------------

export function listarPedidos() {
  return pedirJson('/pedidos');
}

export function crearPedido(pedido) {
  return pedirJson('/pedidos', { method: 'POST', body: JSON.stringify(pedido) });
}

export function editarPedido(id, cambios) {
  return pedirJson('/pedidos/' + id, { method: 'PUT', body: JSON.stringify(cambios) });
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

// --- Historial de producción -------------------------------------------------

export function listarGeneraciones() {
  return pedirJson('/generaciones');
}

export async function reponerPieza(generacionId, piezaId) {
  const respuesta = await fetch(BASE_URL + '/nesting/' + generacionId + '/reposicion/' + piezaId, { method: 'POST' });
  if (!respuesta.ok) throw new Error('Falló la reposición');
  const blob = await respuesta.blob();
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = 'reposicion.pdf';
  enlace.click();
  URL.revokeObjectURL(url);
}
