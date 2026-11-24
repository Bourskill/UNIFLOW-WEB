// Dónde se guardan los datos y los archivos.
//
// - Versión web (Render): en Supabase (tablas + Storage) -- almacenSupabase.js.
// - App de escritorio: en una carpeta de la PC (UNIFLOW_CARPETA), sin
//   servicios de terceros ni sus límites de tamaño -- almacenLocal.js.
//
// Las dos ofrecen exactamente las mismas funciones; el resto del backend no
// sabe (ni le importa) cuál está usando.

const impl = process.env.UNIFLOW_CARPETA
  ? await import('./almacenLocal.js')
  : await import('./almacenSupabase.js');

export const {
  leerColeccion,
  leerRegistro,
  crearRegistro,
  actualizarRegistro,
  borrarRegistro,
  subirArchivo,
  firmarSubida,
  registrarEvento,
  leerEventos,
} = impl;

export const modoEscritorio = !!process.env.UNIFLOW_CARPETA;
