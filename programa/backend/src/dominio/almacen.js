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

// Storage necesita su PROPIA clave: la de arriba (anon/publishable) puede
// leer y escribir las tablas porque se le dieron permisos explícitos por
// GRANT (ver supabase-schema.sql), pero el bucket de Storage no tiene ese
// mismo permiso abierto -- crear un bucket o subir un archivo con la clave
// anon da "new row violates row-level security policy". La service_role
// (Project Settings > API > "service_role"/"secret" en Supabase) salta esa
// RLS -- coherente con la decisión ya tomada de no montar RLS real todavía
// (sin login no hay a quién distinguir); sigue viviendo solo en el backend,
// nunca llega al navegador.
const claveStorage = process.env.SUPABASE_SERVICE_KEY;
const supabaseStorage = claveStorage ? createClient(url, claveStorage) : null;

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

// --- Archivos pesados (imágenes de Diseño, PDF/DXF original de Pieza) -----
// Guardar un PDF o una imagen como texto/base64 DENTRO de una columna jsonb
// tiene el mismo problema que el reemplazo de colección completa (ver
// arriba), solo que ahora afecta a un ÚNICO registro: Postgres tarda en
// escribir un valor de varios MB adentro de un jsonb y Supabase corta la
// consulta por "statement timeout" -- pasó de verdad con una sola imagen de
// Diseño. Un archivo pesado no es un DATO de la fila, es un ARCHIVO: va a
// Supabase Storage (pensado justo para esto, sin el límite de una consulta
// SQL) y la fila en la tabla solo guarda la URL pública, que sí es liviana.

const NOMBRE_BUCKET = 'archivos';
let bucketAsegurado = false;

async function asegurarBucket() {
  if (bucketAsegurado) return;
  if (!supabaseStorage) {
    throw new Error(
      'Falta SUPABASE_SERVICE_KEY en las variables de entorno -- hace falta la clave service_role de ' +
      'Supabase (Project Settings > API) para poder crear el bucket de archivos y subir a él.'
    );
  }
  const { data: buckets, error } = await supabaseStorage.storage.listBuckets();
  if (error) throw new Error('Supabase (listar buckets): ' + error.message);
  if (!buckets.some((b) => b.name === NOMBRE_BUCKET)) {
    const { error: errorCrear } = await supabaseStorage.storage.createBucket(NOMBRE_BUCKET, { public: true });
    // "already exists" puede llegar por una carrera entre dos requests casi
    // simultáneos creando el bucket a la vez -- no es un error real.
    if (errorCrear && !/already exists/i.test(errorCrear.message)) {
      throw new Error('Supabase (crear bucket): ' + errorCrear.message);
    }
  }
  bucketAsegurado = true;
}

export async function subirArchivo(ruta, buffer, contentType) {
  await asegurarBucket();
  const { error } = await supabaseStorage.storage.from(NOMBRE_BUCKET).upload(ruta, buffer, { contentType, upsert: true });
  if (error) throw new Error('Supabase (subir archivo): ' + error.message);
  const { data } = supabaseStorage.storage.from(NOMBRE_BUCKET).getPublicUrl(ruta);
  return data.publicUrl;
}
