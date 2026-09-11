// Persistencia mínima en JSON. No es la base de datos definitiva del proyecto
// (ver claude/DECISIONES-ARQUITECTURA.md) — es suficiente para iterar el dominio
// y el motor sin levantar infraestructura todavía.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirActual = path.dirname(fileURLToPath(import.meta.url));
const carpetaDatos = path.join(dirActual, '..', '..', 'data');

const coleccionesIniciales = {
  molderias: [],
  disenos: [],
  productos: [],
  pedidos: [],
  generaciones: [],
};

async function rutaColeccion(nombre) {
  await mkdir(carpetaDatos, { recursive: true });
  return path.join(carpetaDatos, nombre + '.json');
}

export async function leerColeccion(nombre) {
  const ruta = await rutaColeccion(nombre);
  try {
    const contenido = await readFile(ruta, 'utf-8');
    return JSON.parse(contenido);
  } catch (error) {
    if (error.code === 'ENOENT') {
      const vacia = coleccionesIniciales[nombre] ?? [];
      await writeFile(ruta, JSON.stringify(vacia, null, 2));
      return vacia;
    }
    throw error;
  }
}

export async function escribirColeccion(nombre, datos) {
  const ruta = await rutaColeccion(nombre);
  await writeFile(ruta, JSON.stringify(datos, null, 2));
}
