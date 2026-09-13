// Extrae geometría real de un DXF exportado desde cualquier programa CAD/de
// patronaje. DXF es el ÚNICO formato soportado (se descartó SVG: exports
// reales llegaban sin nombre por forma y sin unidad física declarada, dos
// problemas que DXF no tiene).
//
// REQUISITO del archivo: una CAPA (layer) por talla, nombrada con esa
// talla — así exportan Rhino, Lectra, Gerber, etc. Una capa puede traer más
// de una entidad (el contorno de corte + piquetes/marcas sueltas de esa
// misma talla): todo lo que esté en la capa "S" es parte de la talla S, sin
// importar cuántos trazos separados sean. Esto es lo que hace posible
// distinguir piquetes de tallas sin necesidad de detectarlos por forma o
// color -- contar trazos no serviría (un piquete es un trazo suelto más).
//
// La capa "0" es la que usa AutoCAD/Illustrator por defecto para todo lo que
// no se asignó a mano a otra capa -- si un archivo llega así (típico de un
// export de Illustrator que no preservó capas), NO se toma "0" como si
// fuera el nombre real de una talla: se trata como "sin capa", igual que
// una forma sin nombre.
//
// La escala física sale de la variable de cabecera $INSUNITS del propio
// archivo (mm/cm/in/pie/m). Si el archivo no la declara (o es "sin
// unidades"), se pide a mano: el ancho real en cm de una forma de
// referencia.

import DxfParser from 'dxf-parser';
import { anchoDePuntos, asignarTallasPorNombre, poligonoYBoundingBoxDePuntos } from './geometriaComun.js';

const UNIDAD_INSUNITS_A_MM = { 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000 };

// Capas reservadas que un CAD asigna por defecto, nunca a propósito para
// decir "esta es la talla llamada 0" -- si algo quedó ahí es porque no se
// le asignó capa, no porque de verdad se llame así.
const CAPAS_RESERVADAS = new Set(['0', 'DEFPOINTS']);

// Tessela el arco de una LWPOLYLINE/POLYLINE entre dos vértices con bulge.
// bulge = tan(theta/4), theta > 0 significa arco antihorario de p1 a p2
// (convención DXF). Fórmula verificada a mano con casos conocidos (ej.
// bulge=1 = semicírculo) antes de usarla acá -- ver commit de esta pasada.
function tessellarBulge(p1, p2, bulge, segmentosPorCuartoVuelta = 8) {
  const theta = 4 * Math.atan(bulge);
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const cuerda = Math.hypot(dx, dy);
  if (cuerda === 0 || theta === 0) return [p2];

  const nx = -dy / cuerda;
  const ny = dx / cuerda;
  const radioFirmado = cuerda / (2 * Math.sin(theta / 2));
  const mx = (p1[0] + p2[0]) / 2;
  const my = (p1[1] + p2[1]) / 2;
  const cx = mx + nx * radioFirmado * Math.cos(theta / 2);
  const cy = my + ny * radioFirmado * Math.cos(theta / 2);
  const radio = Math.abs(radioFirmado);

  const anguloInicio = Math.atan2(p1[1] - cy, p1[0] - cx);
  const pasos = Math.max(2, Math.round((segmentosPorCuartoVuelta * Math.abs(theta)) / (Math.PI / 2)));

  const puntos = [];
  for (let i = 1; i <= pasos; i++) {
    const angulo = anguloInicio + (theta * i) / pasos;
    puntos.push([cx + radio * Math.cos(angulo), cy + radio * Math.sin(angulo)]);
  }
  return puntos;
}

function tessellarArco(centro, radio, anguloInicio, anguloFin, segmentosPorCuartoVuelta = 8) {
  const barrido = anguloFin - anguloInicio;
  const pasos = Math.max(3, Math.round((segmentosPorCuartoVuelta * Math.abs(barrido)) / (Math.PI / 2)));
  const puntos = [];
  for (let i = 0; i <= pasos; i++) {
    const angulo = anguloInicio + (barrido * i) / pasos;
    puntos.push([centro.x + radio * Math.cos(angulo), centro.y + radio * Math.sin(angulo)]);
  }
  return puntos;
}

// Devuelve { puntos, cerrado } de una entidad (en unidades crudas del DXF),
// o null si el tipo no está soportado -- una entidad no soportada (ej.
// SPLINE, TEXT) simplemente no aporta puntos, no bloquea el resto de la
// capa. `cerrado` es lo que separa el contorno real de corte de un piquete
// suelto: un piquete se dibuja casi siempre como una LINE recta (abierta),
// mientras que el contorno de una pieza es una forma cerrada. Es una señal
// objetiva del propio DXF (cerrado o no), no una adivinanza sobre qué es
// cada trazo.
function puntosDeEntidad(entidad) {
  switch (entidad.type) {
    case 'LWPOLYLINE':
    case 'POLYLINE': {
      const vertices = entidad.vertices || [];
      if (vertices.length < 2) return null;
      const puntos = [[vertices[0].x, vertices[0].y]];
      for (let i = 0; i < vertices.length - 1; i++) {
        const actual = vertices[i];
        const siguiente = vertices[i + 1];
        if (actual.bulge) puntos.push(...tessellarBulge([actual.x, actual.y], [siguiente.x, siguiente.y], actual.bulge));
        else puntos.push([siguiente.x, siguiente.y]);
      }
      if (entidad.shape) {
        const ultimo = vertices[vertices.length - 1];
        const primero = vertices[0];
        if (ultimo.bulge) puntos.push(...tessellarBulge([ultimo.x, ultimo.y], [primero.x, primero.y], ultimo.bulge));
        else puntos.push([primero.x, primero.y]);
      }
      return { puntos, cerrado: !!entidad.shape };
    }
    case 'LINE':
      return { puntos: (entidad.vertices || []).map((v) => [v.x, v.y]), cerrado: false };
    case 'CIRCLE':
      return { puntos: tessellarArco(entidad.center, entidad.radius, 0, 2 * Math.PI), cerrado: true };
    case 'ARC': {
      let fin = entidad.endAngle;
      if (fin <= entidad.startAngle) fin += 2 * Math.PI;
      return { puntos: tessellarArco(entidad.center, entidad.radius, entidad.startAngle, fin), cerrado: false };
    }
    default:
      return null;
  }
}

// Agrupa todas las entidades por capa -- cada capa es un "candidato" (una
// talla en potencia). Varias entidades en la misma capa (ej. un contorno +
// piquetes sueltos) se juntan en un solo candidato. La geometría/bounding box que se guarda sale de las entidades
// CERRADAS de la capa (el contorno real) cuando hay alguna -- así un
// piquete que sobresale del molde no infla el ancho/alto guardado. Si la
// capa no tiene ninguna entidad cerrada (ej. un contorno armado con LINE/ARC
// sueltos en vez de una sola polilínea), se usa todo -- no hay nada cerrado
// que preferir, así que no hay riesgo de descartar el contorno real.
function extraerCandidatosDxf(dxfTexto) {
  const parser = new DxfParser();
  const dxf = parser.parseSync(dxfTexto);
  if (!dxf || !Array.isArray(dxf.entities)) {
    throw new Error('No se pudo leer el DXF (¿archivo corrupto o no soportado?).');
  }

  const porCapa = new Map();
  for (const entidad of dxf.entities) {
    const resultado = puntosDeEntidad(entidad);
    if (!resultado || resultado.puntos.length === 0) continue;
    const capa = entidad.layer || '0';
    if (!porCapa.has(capa)) porCapa.set(capa, { todos: [], cerrados: [] });
    const grupo = porCapa.get(capa);
    grupo.todos.push(...resultado.puntos);
    if (resultado.cerrado) grupo.cerrados.push(...resultado.puntos);
  }

  const nombres = [...porCapa.keys()];
  if (nombres.length === 0) {
    throw new Error(
      'El DXF no tiene ninguna entidad soportada (LINE/LWPOLYLINE/POLYLINE/CIRCLE/ARC) en ninguna capa.'
    );
  }

  const candidatos = nombres.map((capa, indice) => {
    const grupo = porCapa.get(capa);
    return {
      indice,
      nombre: CAPAS_RESERVADAS.has(capa.toUpperCase()) ? null : capa,
      puntosUnidades: grupo.cerrados.length > 0 ? grupo.cerrados : grupo.todos,
    };
  });
  const insunits = dxf.header && dxf.header.$INSUNITS;
  const mmPorUnidad = UNIDAD_INSUNITS_A_MM[insunits] || null;

  return { candidatos, mmPorUnidad };
}

/**
 * @param {string} dxfTexto  un archivo con una capa por talla, cada capa nombrada
 */
export async function analizarPiezaMultiTalla(dxfTexto) {
  const { candidatos, mmPorUnidad } = extraerCandidatosDxf(dxfTexto);
  const asignaciones = asignarTallasPorNombre(candidatos);

  return {
    candidatos: candidatos.map((c) => ({ indice: c.indice, nombre: c.nombre })),
    asignaciones,
    tallasDetectadas: [...new Set(asignaciones.map((a) => a.tallaAsignada).filter(Boolean))],
    escalaConfirmada: !!mmPorUnidad,
    mmPorUnidad,
  };
}

/**
 * @param {string} dxfTexto
 * @param {Record<string, number>} mapaTallaAIndice
 */
export async function resolverGeometriasPorTalla(
  dxfTexto,
  mapaTallaAIndice,
  { mmPorUnidad, anchoConocidoCm, indiceReferencia } = {}
) {
  const { candidatos } = extraerCandidatosDxf(dxfTexto);

  let mmPorUnidadFinal = mmPorUnidad;
  if (!mmPorUnidadFinal) {
    if (!anchoConocidoCm || indiceReferencia == null) {
      throw new Error('Hace falta mmPorUnidad, o anchoConocidoCm + indiceReferencia, para fijar la escala.');
    }
    const referencia = candidatos[indiceReferencia];
    if (!referencia) throw new Error('El índice de referencia ya no existe en este DXF.');
    const anchoUnidades = anchoDePuntos(referencia.puntosUnidades);
    mmPorUnidadFinal = (anchoConocidoCm * 10) / anchoUnidades;
  }

  const geometriasPorTalla = {};
  for (const [talla, indice] of Object.entries(mapaTallaAIndice)) {
    const candidato = candidatos[indice];
    if (!candidato) throw new Error('El candidato asignado a la talla "' + talla + '" ya no existe en este DXF.');
    geometriasPorTalla[talla] = poligonoYBoundingBoxDePuntos(candidato.puntosUnidades, mmPorUnidadFinal);
  }

  return { geometriasPorTalla, mmPorUnidad: mmPorUnidadFinal };
}
