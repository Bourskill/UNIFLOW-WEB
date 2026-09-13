// Persistencia real en Supabase (Postgres gratis).
//
// Cada colección es una tabla con una fila por registro: id + datos (jsonb
// con el objeto completo). Ver supabase-schema.sql para crear las tablas la
// primera vez.
//
// Las escrituras son POR REGISTRO (crear/actualizar/borrar UNA fila), no un
// reemplazo del array completo. La primera versión de este archivo (cuando
// Piezas/Diseños todavía no traían archivos embebidos) sí reemplazaba la
// colección entera en cada guardado -- funcionaba con filas chicas, pero en
// cuanto una Pieza o un Diseño empezaron a traer un PDF/imagen en base64
// (varios MB por fila), guardar UN registro reescribía TODOS los existentes
// de paso, y Supabase terminaba cortando esa consulta por "statement
// timeout". Guardar solo la fila que realmente cambió es, además de más
// rápido, lo correcto -- nunca hubo un caso real de reemplazo masivo, cada
// llamada en api.js siempre tocaba un solo registro.

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;

if (!url || !key) {
  throw new Error(
    'Faltan SUPABASE_URL y/o SUPABASE_KEY en las variables de entorno. ' +
    'Copiá programa/backend/.env.example a .env y completá los valores del proyecto de Supabase.'
  );
}

const supabase = createClient(url, key);

export async function leerColeccion(nombre) {
  const { data, error } = await supabase.from(nombre).select('datos').order('creado_en');
  if (error) throw new Error('Supabase (leer ' + nombre + '): ' + error.message);
  return data.map((fila) => fila.datos);
}

// Trae UN registro sin pasar por el resto de la colección -- para un PUT
// que solo necesita el objeto que va a modificar, no tiene sentido bajar
// (ni potencialmente demorarse en) los demás, sobre todo si cargan archivos
// pesados propios.
export async function leerRegistro(nombre, id) {
  const { data, error } = await supabase.from(nombre).select('datos').eq('id', id).maybeSingle();
  if (error) throw new Error('Supabase (leer ' + nombre + '): ' + error.message);
  return data?.datos ?? null;
}

export async function crearRegistro(nombre, registro) {
  const { error } = await supabase.from(nombre).insert({ id: registro.id, datos: registro });
  if (error) throw new Error('Supabase (crear en ' + nombre + '): ' + error.message);
}

export async function actualizarRegistro(nombre, id, registro) {
  const { error } = await supabase.from(nombre).update({ datos: registro }).eq('id', id);
  if (error) throw new Error('Supabase (actualizar en ' + nombre + '): ' + error.message);
}

export async function borrarRegistro(nombre, id) {
  const { error } = await supabase.from(nombre).delete().eq('id', id);
  if (error) throw new Error('Supabase (borrar de ' + nombre + '): ' + error.message);
}
