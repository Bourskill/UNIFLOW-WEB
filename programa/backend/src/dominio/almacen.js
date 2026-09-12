// Persistencia real en Supabase (Postgres gratis). Mantiene la misma firma
// que la versión anterior en JSON-a-disco (leerColeccion/escribirColeccion)
// a propósito -- nada del resto del backend (rutas, motor) tuvo que cambiar
// para este swap. Ver claude/DECISIONES-ARQUITECTURA.md: JSON en disco de
// Render no sobrevive un redeploy, por eso el cambio.
//
// Cada colección es una tabla con una fila por registro: id + datos (jsonb
// con el objeto completo, igual forma que antes vivía en el array del
// .json). Ver supabase-schema.sql para crear las tablas la primera vez.

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

export async function escribirColeccion(nombre, registros) {
  // La API vieja (JSON en disco) reemplazaba el archivo entero con el array
  // completo -- para no tocar quien la llama, acá se reproduce lo mismo:
  // upsert de cada registro actual + borrar cualquier fila que ya no esté
  // en el array (ej. tras un "quitar uno y guardar el resto").
  const ids = registros.map((r) => r.id);

  if (registros.length > 0) {
    const filas = registros.map((r) => ({ id: r.id, datos: r }));
    const { error } = await supabase.from(nombre).upsert(filas, { onConflict: 'id' });
    if (error) throw new Error('Supabase (guardar ' + nombre + '): ' + error.message);
  }

  const consultaBorrado = supabase.from(nombre).delete();
  const { error: errorBorrado } =
    ids.length > 0 ? await consultaBorrado.not('id', 'in', `(${ids.join(',')})`) : await consultaBorrado.gte('id', '');
  if (errorBorrado) throw new Error('Supabase (limpiar ' + nombre + '): ' + errorBorrado.message);
}
