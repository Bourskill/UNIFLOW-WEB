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
import { nanoid } from 'nanoid';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;

if (!url || !key) {
  throw new Error(
    'Faltan SUPABASE_URL y/o SUPABASE_KEY en las variables de entorno. ' +
    'Copiá programa/backend/.env.example a .env y completá los valores del proyecto de Supabase.'
  );
}

// Las tablas usan la service_role cuando está configurada (la de Storage, más
// abajo) y solo caen a SUPABASE_KEY si falta. Así se le pueden revocar los
// permisos de tablas a la clave anon/publishable en Supabase (ver el bloque
// "Endurecer permisos" de supabase-schema.sql): esa clave está pensada para
// ser pública, y con RLS apagado y GRANT completo, cualquiera que la tuviera
// podía leer y borrar todo directo contra Supabase, sin pasar por este backend.
const supabase = createClient(url, process.env.SUPABASE_SERVICE_KEY || key);

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

// Leer una colección ENTERA de una sola consulta dejó de andar con las
// piezas: cada fila trae el contorno de cada talla (y otra vez en su
// historial de versiones), y con suficientes piezas la consulta pasaba el
// límite de tiempo de Supabase ("canceling statement due to statement
// timeout", 2026-11-17, después de importar una moldería). Ahora se lee en
// tandas: cada consulta trae pocas filas y termina rápido. Si aun así una
// tanda se pasa de tiempo, se reintenta con la mitad de filas (hasta de a
// una), y ese tamaño se recuerda para la próxima lectura.
const TANDA_INICIAL = { piezas: 8 };
const tandaAprendida = {};

export async function leerColeccion(nombre, { cliente = supabase } = {}) {
  const filas = [];
  let tanda = tandaAprendida[nombre] || TANDA_INICIAL[nombre] || 100;
  let desde = 0;
  for (;;) {
    const { data, error } = await cliente
      .from(nombre)
      .select('datos')
      .order('creado_en')
      .order('id')
      .range(desde, desde + tanda - 1);
    if (error) {
      if (/statement timeout/i.test(error.message) && tanda > 1) {
        tanda = Math.max(1, Math.floor(tanda / 2));
        tandaAprendida[nombre] = tanda;
        continue;
      }
      throw new Error('Supabase (leer ' + nombre + '): ' + error.message);
    }
    for (const fila of data) filas.push(fila.datos);
    if (data.length < tanda) return filas;
    desde += tanda;
  }
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

async function crearBucket() {
  const { error } = await supabaseStorage.storage.createBucket(NOMBRE_BUCKET, { public: true });
  // "already exists" puede llegar por una carrera entre dos requests casi
  // simultáneos creando el bucket a la vez -- no es un error real.
  if (error && !/already exists/i.test(error.message)) {
    throw new Error('Supabase (crear bucket): ' + error.message);
  }
}

// Se sube directo y el bucket se crea SOLO si Supabase dice que no existe.
// Antes se listaban todos los buckets antes de la primera subida, y ese
// listado devolvió "Internal Server Error" (2026-11-17) aunque el bucket
// existía y Storage andaba -- un paso de más que tumbaba la subida entera.
export async function subirArchivo(ruta, buffer, contentType) {
  if (!supabaseStorage) {
    throw new Error(
      'Falta SUPABASE_SERVICE_KEY en las variables de entorno -- hace falta la clave service_role de ' +
      'Supabase (Project Settings > API) para poder crear el bucket de archivos y subir a él.'
    );
  }
  const subir = () => supabaseStorage.storage.from(NOMBRE_BUCKET).upload(ruta, buffer, { contentType, upsert: true });
  let { error } = await subir();
  if (error && /bucket not found/i.test(error.message)) {
    await crearBucket();
    ({ error } = await subir());
  }
  if (error) throw new Error('Supabase (subir archivo): ' + error.message);
  const { data } = supabaseStorage.storage.from(NOMBRE_BUCKET).getPublicUrl(ruta);
  return data.publicUrl;
}

// --- Eventos (historial de auditoría) --------------------------------------
// Registro append-only de qué se creó/actualizó/borró, cuándo y un resumen
// breve -- para que una tabla vacía o un registro que desapareció se pueda
// chequear acá antes de tratarlo como una falsa alarma de pérdida de datos
// (ver claude/ESTADO-ACTUAL.md: la tabla `piezas` apareció vacía y resultó
// ser un borrado a propósito del usuario, sin nada que lo hubiera dejado
// registrado). Sin login todavía (ver almacen.js más arriba, mismo motivo
// por el que no hay RLS real), no hay un "quién" verificable -- solo
// coleccion/accion/registroId/resumen/cuándo, nunca una identidad.
//
// Registrar un evento NUNCA hace fallar la operación real que describe: si
// Supabase no puede escribir en `eventos` (por ejemplo, la tabla todavía no
// existe porque no se corrió supabase-schema.sql), eso no puede tumbar un
// guardado real de Pieza/Producto/etc -- se loguea a consola y se sigue.
export async function registrarEvento(coleccion, accion, registroId, resumen) {
  const evento = {
    id: nanoid(),
    coleccion,
    accion, // 'crear' | 'actualizar' | 'borrar'
    registroId,
    resumen: resumen || null,
    creadoEn: new Date().toISOString(),
  };
  const { error } = await supabase.from('eventos').insert({ id: evento.id, datos: evento });
  if (error) {
    console.error('No se pudo registrar el evento de auditoría (' + coleccion + '/' + accion + '/' + registroId + '): ' + error.message);
  }
}

export async function leerEventos(limite) {
  let consulta = supabase.from('eventos').select('datos').order('creado_en', { ascending: false });
  if (limite) consulta = consulta.limit(limite);
  const { data, error } = await consulta;
  if (error) throw new Error('Supabase (leer eventos): ' + error.message);
  return data.map((fila) => fila.datos);
}
