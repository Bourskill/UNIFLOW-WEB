// En local, sin variable de entorno, apunta al backend de desarrollo.
// En Netlify, se define VITE_API_URL apuntando al backend real en Render.
// Se normaliza el sufijo /api acá para que dé igual si la variable se cargó
// como el origen solo (https://host) o con el sufijo ya puesto
// (https://host/api) — ambas formas terminan en la misma BASE_URL.
// La app de escritorio (programa/escritorio) sirve la página desde el mismo
// servidor local: VITE_MISMO_ORIGEN=1 al armarla, y la API queda en /api.
const ORIGEN = (import.meta.env.VITE_MISMO_ORIGEN === '1' ? '' : import.meta.env.VITE_API_URL || 'http://localhost:4000')
  .replace(/\/+$/, '')
  .replace(/\/api$/, '');
const BASE_URL = ORIGEN + '/api';

// --- Clave de acceso -----------------------------------------------------------
// El backend exige una clave compartida del taller (ver backend/src/acceso.js).
// Se pide una vez en la pantalla de inicio (componentes/Arranque.jsx) y queda
// guardada en este navegador. Si el servidor la rechaza (401), se borra y se
// avisa con un evento para que Arranque.jsx vuelva a pedirla.
const CLAVE_STORAGE = 'uniflow.claveAcceso';
export const EVENTO_SIN_CLAVE = 'uniflow:sin-clave';

export function leerClaveGuardada() {
  try {
    return localStorage.getItem(CLAVE_STORAGE) || '';
  } catch {
    return '';
  }
}

export function olvidarClave() {
  try {
    localStorage.removeItem(CLAVE_STORAGE);
  } catch {
    // sin almacenamiento disponible: no hay nada que borrar
  }
}

// Comprueba la clave contra el servidor y, si sirve, la guarda.
// Devuelve true/false; tira solo si el servidor no responde.
export async function entrarConClave(clave) {
  const respuesta = await fetch(BASE_URL + '/acceso', { headers: { Authorization: 'Bearer ' + clave } });
  if (respuesta.status === 401) return false;
  if (!respuesta.ok) {
    const cuerpo = await respuesta.json().catch(() => ({}));
    throw new Error(cuerpo.error || 'Error de red (' + respuesta.status + ')');
  }
  try {
    localStorage.setItem(CLAVE_STORAGE, clave);
  } catch {
    // sin almacenamiento: la clave no se recuerda, pero esta sesión sigue sirviendo
    claveEnMemoria = clave;
  }
  return true;
}

let claveEnMemoria = '';

function encabezadosConClave(extra = {}) {
  const clave = leerClaveGuardada() || claveEnMemoria;
  return clave ? { ...extra, Authorization: 'Bearer ' + clave } : extra;
}

// Avisa que algo se guardó o se borró en el servidor -- la caché de
// datos/index.js lo escucha para no seguir mostrando lo anterior.
export const EVENTO_ESCRITURA = 'uniflow:escritura';

// POST que solo CALCULAN (no guardan nada): no invalidan la caché. Algunos
// corren en vivo mientras se edita (el anclaje), así que invalidar con
// ellos pediría todo de nuevo una y otra vez.
const RUTAS_SOLO_CALCULO = [
  '/piezas/analizar', '/piezas/resolver-multitalla', '/piezas/detectar-pdf',
  '/anclaje/', '/texto/', '/nesting/desde-', '/archivos', '/acceso', '/exportar-mesas/', '/exportar-pedido/',
];

function cambiaDatos(ruta, metodo) {
  if (!metodo || metodo === 'GET') return false;
  return !RUTAS_SOLO_CALCULO.some((prefijo) => ruta.startsWith(prefijo));
}

// Qué colección de la caché toca una escritura, por su ruta: "/piezas/x/..."
// -> piezas; generar un lote (nesting) crea una generación. Así se vuelve a
// pedir SOLO esa, no las ocho (la de piezas pesa mucho: trae la geometría
// de todo). null = no se sabe -> se invalida todo, por las dudas.
const COLECCIONES = ['piezas', 'grupos', 'disenos', 'productos', 'plantillas', 'pedidos', 'fuentes'];
function coleccionDe(ruta) {
  const primera = ruta.split('/')[1];
  if (COLECCIONES.includes(primera)) return primera;
  if (primera === 'nesting') return 'generaciones';
  return null;
}

// fetch con la clave puesta; un 401 dispara la pantalla de entrada.
async function pedir(ruta, opciones = {}) {
  const respuesta = await fetch(BASE_URL + ruta, {
    ...opciones,
    headers: encabezadosConClave(opciones.headers),
  });
  if (respuesta.ok && cambiaDatos(ruta, opciones.method) && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENTO_ESCRITURA, { detail: { coleccion: coleccionDe(ruta) } }));
  }
  if (respuesta.status === 401) {
    olvidarClave();
    claveEnMemoria = '';
    window.dispatchEvent(new Event(EVENTO_SIN_CLAVE));
  }
  return respuesta;
}

async function pedirJson(ruta, opciones = {}) {
  const respuesta = await pedir(ruta, {
    ...opciones,
    headers: { 'Content-Type': 'application/json', ...opciones.headers },
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
let escritorio = import.meta.env.VITE_MISMO_ORIGEN === '1';
/** ¿Es la app de escritorio (datos en una carpeta, sin clave)? Lo dice el servidor. */
export function esEscritorio() {
  return escritorio;
}

export async function verificarSalud() {
  try {
    const respuesta = await fetch(BASE_URL + '/salud', { signal: AbortSignal.timeout(5000) });
    if (respuesta.ok) escritorio = !!(await respuesta.json().catch(() => ({}))).escritorio;
    return respuesta.ok;
  } catch {
    return false;
  }
}

// --- App de escritorio: la carpeta de datos y traerse la versión web ---------
export function datosDeEscritorio() {
  return pedirJson('/escritorio');
}
export function resumenDeEscritorio() {
  return pedirJson('/escritorio/resumen');
}
export function importarDesdeWeb(origen, clave) {
  return pedirJson('/escritorio/importar', { method: 'POST', body: JSON.stringify({ origen, clave }) });
}
export function estadoImportacion() {
  return pedirJson('/escritorio/importar');
}

// Sube un archivo pesado (imagen de Diseño, PDF/DXF original de Pieza) a
// Supabase Storage y devuelve su URL pública -- nunca se guarda el archivo
// en sí adentro de un registro (ver almacen.js: eso es lo que causaba el
// "statement timeout" al guardar).
//
// El archivo va DIRECTO del navegador a Storage (el backend solo firma el
// permiso): así no hay tope de tamaño del lado del servidor ni se le llena la
// memoria con producciones grandes. `datos`: un Blob/File o el base64 de antes.
export async function subirArchivo(datos, contentType, nombre) {
  const blob = typeof datos === 'string' ? base64ABlob(datos, contentType) : datos;
  const pedido = await pedir('/archivos/firma', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contentType, nombre }),
  });
  if (pedido.status === 404) {
    // Un servidor sin la ruta nueva: la subida de siempre (base64 por el servidor).
    const base64 = typeof datos === 'string' ? datos : await blobABase64(blob);
    return (await pedirJson('/archivos', { method: 'POST', body: JSON.stringify({ base64, contentType, nombre }) })).url;
  }
  const firma = await pedido.json().catch(() => ({}));
  if (!pedido.ok) throw new Error(firma.error || 'No se pudo preparar la subida (' + pedido.status + ')');
  let respuesta;
  try {
    // En la app de escritorio la dirección es relativa (/api/archivos-locales/…).
    respuesta = await fetch(new URL(firma.urlSubida, ORIGEN || window.location.origin), {
      method: 'PUT',
      headers: { 'content-type': contentType, 'x-upsert': 'true', 'cache-control': 'max-age=3600' },
      body: blob,
    });
  } catch {
    throw new Error('Se cortó la conexión mientras se subía el archivo (' + megas(blob.size) + '). Probá de nuevo.');
  }
  if (!respuesta.ok) {
    const detalle = await respuesta.text().catch(() => '');
    if (respuesta.status === 413 || /exceeded the maximum|too large/i.test(detalle)) {
      throw new Error('El archivo pesa ' + megas(blob.size) + ' y el almacenamiento no acepta archivos tan grandes ' +
        '(el plan gratis de Supabase llega a 50 MB por archivo). Guardalo más liviano o subí el límite en Supabase.');
    }
    throw new Error('No se pudo subir el archivo (' + respuesta.status + '): ' + detalle.slice(0, 200));
  }
  return firma.url;
}

function megas(bytes) {
  return (bytes / 1048576).toFixed(1).replace('.', ',') + ' MB';
}

function base64ABlob(base64, contentType) {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return new Blob([bytes], { type: contentType });
}

function blobABase64(blob) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result).split(',')[1]);
    lector.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    lector.readAsDataURL(blob);
  });
}

// --- Fuentes (catálogo de tipografías propias) ------------------------------
// A diferencia de subirArchivo (que sube y listo), acá el backend además
// parsea el archivo y calcula la cobertura de ñ/acentos UNA vez (ver
// rutas/api.js·POST /fuentes) -- por eso no es simplemente subirArchivo +
// crearRegistro por separado.

export function listarFuentes() {
  return pedirJson('/fuentes');
}

export function crearFuente({ nombre, base64, contentType }) {
  return pedirJson('/fuentes', { method: 'POST', body: JSON.stringify({ nombre, base64, contentType }) });
}

export function eliminarFuente(id) {
  return pedirJson('/fuentes/' + id, { method: 'DELETE' });
}

// La fuente que se usa cuando una zona no elige ninguna -- el navegador la
// carga de acá para dibujar la vista previa con la misma letra que el PDF.
export const URL_FUENTE_BASE = BASE_URL + '/fuentes/base';

// Banco de fuentes gratuitas (Fontsource, ~2000 familias de licencia libre).
export function buscarEnBancoDeFuentes({ q = '', categoria = '', pagina = 0 }) {
  const parametros = new URLSearchParams({ q, categoria, pagina: String(pagina) });
  return pedirJson('/fuentes/banco?' + parametros.toString());
}

export function agregarFuenteDelBanco({ id, peso }) {
  return pedirJson('/fuentes/banco', { method: 'POST', body: JSON.stringify({ id, peso }) });
}

// Ajuste de texto al espacio de su zona (mismo cálculo que usa el PDF). Cada
// zona: { id, texto, anchoCm, altoCm, modo: 'llenar'|'calibrado', fuenteUrl }.
export function ajustarTextos(zonas) {
  return pedirJson('/texto/ajustar', { method: 'POST', body: JSON.stringify({ zonas }) });
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

// ¿El PDF es una pieza (una capa por talla) o una prenda completa (una
// capa por pieza)? -> { tipo: 'pieza' | 'prenda', capas }
export function detectarTipoPdf(textoBase64) {
  return pedirJson('/piezas/detectar-pdf', { method: 'POST', body: JSON.stringify({ texto: textoBase64 }) });
}

// Prenda completa en un solo PDF (una capa por pieza, todas las tallas
// anidadas adentro): devuelve cada pieza con sus tallas de MAYOR a MENOR,
// sin nombre -- los pone ImportarPrenda.jsx con la lista del usuario.
export function analizarPrenda(textoBase64) {
  return pedirJson('/piezas/analizar-prenda', { method: 'POST', body: JSON.stringify({ texto: textoBase64 }) });
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

// Duplica la pieza en espejo (izquierda ↔ derecha): devuelve la pieza NUEVA.
export function espejarPieza(id, nombre) {
  return pedirJson('/piezas/' + id + '/espejo', { method: 'POST', body: JSON.stringify({ nombre }) });
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

// Pide un archivo al servidor (POST) y lo descarga en el navegador.
async function bajar(ruta, cuerpo, mensajeError) {
  const respuesta = await pedir(ruta, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  if (!respuesta.ok) {
    const datos = await respuesta.json().catch(() => ({}));
    throw new Error(datos.error || mensajeError);
  }
  return respuesta.blob();
}

async function descargar(ruta, cuerpo, nombreArchivo, mensajeError) {
  guardarArchivo(await bajar(ruta, cuerpo, mensajeError), nombreArchivo);
}

/** Guarda un archivo (Blob) en las descargas del navegador. */
export function guardarArchivo(blob, nombreArchivo) {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  enlace.click();
  // Revocar en el acto puede cortar la descarga en algunos navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// El PDF se arma en el servidor desde el pedido guardado (mismos datos que
// la vista previa de anidarDesdePedido) -- ya no se manda el layout.
export function generarPdf(pedidoId, anchoLienzoCm) {
  return descargar('/nesting/generar', { pedidoId, anchoLienzoCm }, 'nesting.pdf', 'Falló la generación del PDF');
}

// Corte láser: moldería + talla + cantidad, SIN personalización -- ver
// rutas/api.js·POST /nesting/generar-dxf. Igual que el PDF, el servidor
// vuelve a armar el layout con los mismos datos de anidarDesdeGrupo.
export function generarDxf(grupoId, lineas, anchoLienzoCm) {
  return descargar('/nesting/generar-dxf', { grupoId, lineas, anchoLienzoCm }, 'corte-laser.dxf', 'Falló la generación del DXF');
}

// Una producción por tallas: la prenda completa de cada talla, una mesa
// (página del PDF) por pieza -- ver rutas/api.js·POST /exportar-mesas/:id.
export function exportarMesas(produccionId, { tallas, conEjemplo }, nombreArchivo) {
  return descargar('/exportar-mesas/' + encodeURIComponent(produccionId), { tallas, conEjemplo: !!conEjemplo },
    nombreArchivo || 'produccion.pdf', 'No se pudo exportar la producción');
}

/** Lo mismo, pero devuelve el PDF (Blob) en vez de descargarlo: para juntar varias tallas en un .zip. */
export function exportarMesasArchivo(produccionId, { tallas, conEjemplo }) {
  return bajar('/exportar-mesas/' + encodeURIComponent(produccionId), { tallas, conEjemplo: !!conEjemplo }, 'No se pudo exportar la producción');
}

// Una talla de un pedido, con los jugadores: cada uno con su prenda completa,
// una mesa por pieza -- ver rutas/api.js·POST /exportar-pedido/:id.
export function exportarTallaDePedido(pedidoId, talla, nombreArchivo) {
  return descargar('/exportar-pedido/' + encodeURIComponent(pedidoId), { talla },
    nombreArchivo || 'talla-' + talla + '.pdf', 'No se pudo exportar la talla ' + talla);
}

// --- Historial de producción -------------------------------------------------

export function listarGeneraciones() {
  return pedirJson('/generaciones');
}

export function reponerPieza(generacionId, piezaId) {
  return descargar('/nesting/' + generacionId + '/reposicion/' + piezaId, undefined, 'reposicion.pdf', 'Falló la reposición');
}
