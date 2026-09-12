// Extrae geometría real de un DXF exportado desde cualquier programa CAD/de
// patronaje. A diferencia del SVG (que identifica cada talla por el nombre
// de una forma), en DXF la convención estándar es una CAPA (layer) por
// talla — así exportan Rhino, Lectra, Gerber, etc. Cada entidad se agrupa
// por su capa; el nombre de la capa se matchea contra una talla conocida
// igual que en importarSvg.js (mismo criterio: nunca se adivina lo ambiguo).
//
// La escala física sale de la variable de cabecera $INSUNITS del propio
// archivo (mm/cm/in/pie/m) — más confiable que el SVG, que no siempre
// declara una unidad real. Si el DXF no la declara (o es "sin unidades"),
// se cae al mismo mecanismo manual que el SVG: pedir el ancho real en cm de
// una forma de referencia.

import DxfParser from 'dxf-parser';
import { anchoDePuntos, asignarTallasPorNombre, poligonoYBoundingBoxDePuntos } from './geometriaComun.js';

const UNIDAD_INSUNITS_A_MM = { 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000 };

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

// Devuelve los puntos (en unidades crudas del DXF) de una entidad, o null si
// el tipo no está soportado -- una entidad no soportada (ej. SPLINE, TEXT)
// simplemente no aporta puntos, no bloquea el resto de la capa.
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
      return puntos;
    }
    case 'LINE':
      return (entidad.vertices || []).map((v) => [v.x, v.y]);
    case 'CIRCLE':
      return tessellarArco(entidad.center, entidad.radius, 0, 2 * Math.PI);
    case 'ARC': {
      let fin = entidad.endAngle;
      if (fin <= entidad.startAngle) fin += 2 * Math.PI;
      return tessellarArco(entidad.center, entidad.radius, entidad.startAngle, fin);
    }
    default:
      return null;
  }
}

// Agrupa todas las entidades por capa -- cada capa es un "candidato" (el
// equivalente DXF de una forma nombrada en el SVG). Varias entidades en la
// misma capa (ej. un contorno + una pinza suelta) se juntan en un solo
// candidato; el bounding box se calcula sobre todos sus puntos juntos.
function extraerCandidatosDxf(dxfTexto) {
  const parser = new DxfParser();
  const dxf = parser.parseSync(dxfTexto);
  if (!dxf || !Array.isArray(dxf.entities)) {
    throw new Error('No se pudo leer el DXF (¿archivo corrupto o no soportado?).');
  }

  const porCapa = new Map();
  for (const entidad of dxf.entities) {
    const puntos = puntosDeEntidad(entidad);
    if (!puntos || puntos.length === 0) continue;
    const capa = entidad.layer || '0';
    if (!porCapa.has(capa)) porCapa.set(capa, []);
    porCapa.get(capa).push(...puntos);
  }

  const nombres = [...porCapa.keys()];
  if (nombres.length === 0) {
    throw new Error(
      'El DXF no tiene ninguna entidad soportada (LINE/LWPOLYLINE/POLYLINE/CIRCLE/ARC) en ninguna capa.'
    );
  }

  const candidatos = nombres.map((nombre, indice) => ({ indice, nombre, puntosUnidades: porCapa.get(nombre) }));
  const insunits = dxf.header && dxf.header.$INSUNITS;
  const mmPorUnidad = UNIDAD_INSUNITS_A_MM[insunits] || null;

  return { candidatos, mmPorUnidad };
}

/**
 * @param {string} dxfTexto  un archivo con una capa por talla, cada capa nombrada
 */
export async function analizarPiezaMultiTallaDxf(dxfTexto) {
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
export async function resolverGeometriasPorTallaDxf(
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
