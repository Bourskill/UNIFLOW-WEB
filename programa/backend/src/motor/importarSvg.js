// Extrae geometría real (no ancho×alto inventado) de un SVG exportado desde
// cualquier programa de diseño. Pipeline: recorrer el árbol acumulando
// transforms de cada <g> ancestro -> normalizar cada forma a un path absoluto
// con svgpath -> aplanar curvas a polígono con points-on-path -> identificar
// cuál path es el CONTORNO DE CORTE (por nombre de capa o por color reservado)
// y, si es ambiguo, devolver los candidatos para que el usuario elija a mano
// -- nunca se adivina en silencio cuál es la pieza real.

import { parse as parseSvg } from 'svgson';
import svgpath from 'svgpath';
import { pointsOnPath } from 'points-on-path';
import { asignarTallasPorNombre, poligonoYBoundingBoxDePuntos } from './geometriaComun.js';

const NOMBRE_CONTORNO = /^(corte|contorno|cut|outline)$/i;
const MAGENTA_RESERVADO = ['#ff00ff', '#f0f', 'magenta', 'rgb(255,0,255)'];

const UNIDAD_A_MM = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: null };

function primitivaAPathD(nodo) {
  const a = nodo.attributes;
  switch (nodo.name) {
    case 'path':
      return a.d || null;
    case 'rect': {
      const x = Number(a.x || 0), y = Number(a.y || 0);
      const w = Number(a.width || 0), h = Number(a.height || 0);
      if (!w || !h) return null;
      return `M${x},${y} H${x + w} V${y + h} H${x} Z`;
    }
    case 'circle': {
      const cx = Number(a.cx || 0), cy = Number(a.cy || 0), r = Number(a.r || 0);
      if (!r) return null;
      return `M${cx - r},${cy} A${r},${r} 0 1,0 ${cx + r},${cy} A${r},${r} 0 1,0 ${cx - r},${cy} Z`;
    }
    case 'ellipse': {
      const cx = Number(a.cx || 0), cy = Number(a.cy || 0), rx = Number(a.rx || 0), ry = Number(a.ry || 0);
      if (!rx || !ry) return null;
      return `M${cx - rx},${cy} A${rx},${ry} 0 1,0 ${cx + rx},${cy} A${rx},${ry} 0 1,0 ${cx - rx},${cy} Z`;
    }
    case 'polygon':
    case 'polyline': {
      const puntos = (a.points || '').trim().split(/\s+|,/).map(Number);
      if (puntos.length < 4) return null;
      let d = `M${puntos[0]},${puntos[1]}`;
      for (let i = 2; i < puntos.length; i += 2) d += ` L${puntos[i]},${puntos[i + 1]}`;
      return d + (nodo.name === 'polygon' ? ' Z' : '');
    }
    case 'line':
      return `M${a.x1 || 0},${a.y1 || 0} L${a.x2 || 0},${a.y2 || 0}`;
    default:
      return null;
  }
}

function normalizarColor(valor) {
  return (valor || '').trim().toLowerCase().replace(/\s+/g, '');
}

function recolectarCandidatos(nodo, pilaTransforms, candidatos) {
  const transformPropio = nodo.attributes && nodo.attributes.transform;
  const pila = transformPropio ? [...pilaTransforms, transformPropio] : pilaTransforms;

  const dCrudo = primitivaAPathD(nodo);
  if (dCrudo) {
    let camino = svgpath(dCrudo);
    for (const t of pila) camino = camino.transform(t);
    camino = camino.abs();

    const stroke = normalizarColor(nodo.attributes.stroke);
    const nombre = nodo.attributes.id || nodo.attributes['inkscape:label'] || null;

    candidatos.push({
      nombre,
      esCandidatoAContorno:
        (nombre && NOMBRE_CONTORNO.test(nombre)) || MAGENTA_RESERVADO.includes(stroke),
      razon: nombre && NOMBRE_CONTORNO.test(nombre) ? 'nombre' : MAGENTA_RESERVADO.includes(stroke) ? 'color' : null,
      pathAbsoluto: camino.toString(),
    });
  }

  for (const hijo of nodo.children || []) recolectarCandidatos(hijo, pila, candidatos);
}

function extraerEscalaFisica(raiz) {
  const ancho = raiz.attributes.width;
  const viewBox = (raiz.attributes.viewBox || '').trim().split(/\s+/).map(Number);
  const anchoViewBox = viewBox.length === 4 ? viewBox[2] : null;

  const coincidencia = /^([\d.]+)\s*(mm|cm|in|pt|pc|px)?$/i.exec((ancho || '').trim());
  if (!coincidencia) return { mmPorUnidad: null, confirmada: false };

  const valor = Number(coincidencia[1]);
  const unidad = (coincidencia[2] || 'px').toLowerCase();

  if (unidad === 'px' || !UNIDAD_A_MM[unidad]) {
    return { mmPorUnidad: null, confirmada: false };
  }

  const anchoEnMm = valor * UNIDAD_A_MM[unidad];
  const unidadesUsuario = anchoViewBox || valor;
  return { mmPorUnidad: anchoEnMm / unidadesUsuario, confirmada: true };
}

function poligonoYBoundingBox(pathD, mmPorUnidad, tolerancia) {
  // pointsOnPath devuelve un array de subtrazados (uno por subpath
  // desconectado) — para el bounding box y el polígono alcanza con juntar
  // todos los puntos; un contorno de corte normal tiene un solo subtrazado.
  const subtrazados = pointsOnPath(pathD, tolerancia);
  const planos = subtrazados.flat();
  return poligonoYBoundingBoxDePuntos(planos, mmPorUnidad);
}

/**
 * @param {string} svgTexto contenido crudo del archivo .svg subido
 * @param {{escalaManualMmPorUnidad?: number, toleranciaUnidadesUsuario?: number}} opciones
 */
export async function importarGeometriaSvg(svgTexto, opciones = {}) {
  const raiz = await parseSvg(svgTexto);
  const candidatos = [];
  recolectarCandidatos(raiz, [], candidatos);

  if (candidatos.length === 0) {
    throw new Error('No se encontró ninguna forma (path/rect/circle/polygon/...) en el SVG.');
  }

  const escala = opciones.escalaManualMmPorUnidad
    ? { mmPorUnidad: opciones.escalaManualMmPorUnidad, confirmada: true }
    : extraerEscalaFisica(raiz);

  const marcados = candidatos.filter((c) => c.esCandidatoAContorno);
  const contornoUnico = marcados.length === 1 ? marcados[0] : null;

  const base = {
    candidatos: candidatos.map((c, i) => ({ indice: i, nombre: c.nombre, razon: c.razon })),
    escalaConfirmada: escala.confirmada,
    mmPorUnidad: escala.confirmada ? escala.mmPorUnidad : null,
  };

  if (!contornoUnico) {
    return {
      ...base,
      resuelto: false,
      motivo:
        marcados.length === 0
          ? 'Ningún path se llama "corte" ni tiene stroke magenta — no se puede adivinar cuál es el contorno.'
          : 'Más de un path calza con la convención de contorno — elegí cuál es el correcto.',
    };
  }

  if (!escala.confirmada) {
    // Sin escala física, igual se puede dar el bounding box en unidades crudas
    // del SVG — así el frontend puede pedir "¿cuánto mide de ancho en cm?" y
    // calcular mmPorUnidad sin tener que adivinar nada.
    const subtrazados = pointsOnPath(contornoUnico.pathAbsoluto, opciones.toleranciaUnidadesUsuario ?? 0.5);
    const xs = subtrazados.flat().map((p) => p[0]);
    return {
      ...base,
      resuelto: false,
      contornoIndice: candidatos.indexOf(contornoUnico),
      boundingBoxUnidades: { anchoUnidades: Math.max(...xs) - Math.min(...xs) },
      motivo:
        'El SVG no declara una unidad física (mm/cm/in) en su ancho — hace falta confirmar a mano ' +
        'cuántos cm mide esta pieza antes de guardar la geometría (nunca se asume).',
    };
  }

  const tolerancia = opciones.toleranciaUnidadesUsuario ?? 0.5;
  const { poligonoMm, boundingBoxMm } = poligonoYBoundingBox(contornoUnico.pathAbsoluto, escala.mmPorUnidad, tolerancia);

  return {
    ...base,
    resuelto: true,
    contornoIndice: candidatos.indexOf(contornoUnico),
    poligonoMm,
    boundingBoxMm,
  };
}

/**
 * Re-resuelve la geometría cuando el usuario elige a mano el contorno y/o
 * confirma la escala. Acepta `mmPorUnidad` directo, o `anchoConocidoCm` (el
 * ancho real de la pieza que el usuario tipeó) para derivarlo del bounding
 * box crudo del path elegido — lo que sea más fácil de conseguir del lado
 * del frontend según qué faltaba resolver.
 */
export async function resolverGeometriaSvgManual(
  svgTexto,
  indiceElegido,
  { mmPorUnidad, anchoConocidoCm, toleranciaUnidadesUsuario } = {}
) {
  const raiz = await parseSvg(svgTexto);
  const candidatos = [];
  recolectarCandidatos(raiz, [], candidatos);
  const elegido = candidatos[indiceElegido];
  if (!elegido) throw new Error('Ese índice de candidato ya no existe en este SVG.');

  const tolerancia = toleranciaUnidadesUsuario ?? 0.5;

  let mmPorUnidadFinal = mmPorUnidad;
  if (!mmPorUnidadFinal) {
    if (!anchoConocidoCm) {
      throw new Error('Hace falta mmPorUnidad o anchoConocidoCm para calcular la escala.');
    }
    const subtrazados = pointsOnPath(elegido.pathAbsoluto, tolerancia);
    const xs = subtrazados.flat().map((p) => p[0]);
    const anchoUnidades = Math.max(...xs) - Math.min(...xs);
    mmPorUnidadFinal = (anchoConocidoCm * 10) / anchoUnidades;
  }

  const { poligonoMm, boundingBoxMm } = poligonoYBoundingBox(elegido.pathAbsoluto, mmPorUnidadFinal, tolerancia);
  return { poligonoMm, boundingBoxMm, mmPorUnidad: mmPorUnidadFinal };
}

// --- Un solo archivo con TODAS las tallas de una pieza adentro -------------
// Así se manejan de verdad los patrones graduados (nesting de tallas): un
// archivo con una forma por talla, cada una nombrada ("S", "M", "L"...) —
// subir un archivo separado por talla era el enfoque tedioso que se quería
// evitar. Esto detecta automáticamente qué forma es cada talla por nombre, y
// deja lo que no matchea para asignar a mano — nunca se adivina.

/**
 * @param {string} svgTexto  un archivo con una forma por talla, cada una nombrada
 */
export async function analizarPiezaMultiTalla(svgTexto) {
  const raiz = await parseSvg(svgTexto);
  const candidatos = [];
  recolectarCandidatos(raiz, [], candidatos);

  if (candidatos.length === 0) {
    throw new Error('No se encontró ninguna forma (path/rect/circle/polygon/...) en el SVG.');
  }

  const escala = extraerEscalaFisica(raiz);
  const asignaciones = asignarTallasPorNombre(candidatos.map((c, indice) => ({ indice, nombre: c.nombre })));

  return {
    candidatos: candidatos.map((c, i) => ({ indice: i, nombre: c.nombre })),
    asignaciones,
    tallasDetectadas: [...new Set(asignaciones.map((a) => a.tallaAsignada).filter(Boolean))],
    escalaConfirmada: escala.confirmada,
    mmPorUnidad: escala.confirmada ? escala.mmPorUnidad : null,
  };
}

/**
 * Segundo paso: con el mapeo talla -> índice de candidato ya confirmado
 * (automático + correcciones a mano), calcula la geometría real de cada
 * talla. La escala es UNA sola para todo el archivo — si no viene declarada,
 * se deriva del ancho conocido de UNA forma de referencia que el usuario
 * elige.
 *
 * @param {string} svgTexto
 * @param {Record<string, number>} mapaTallaAIndice
 */
export async function resolverGeometriasPorTalla(
  svgTexto,
  mapaTallaAIndice,
  { mmPorUnidad, anchoConocidoCm, indiceReferencia, toleranciaUnidadesUsuario } = {}
) {
  const raiz = await parseSvg(svgTexto);
  const candidatos = [];
  recolectarCandidatos(raiz, [], candidatos);
  const tolerancia = toleranciaUnidadesUsuario ?? 0.5;

  let mmPorUnidadFinal = mmPorUnidad;
  if (!mmPorUnidadFinal) {
    if (!anchoConocidoCm || indiceReferencia == null) {
      throw new Error('Hace falta mmPorUnidad, o anchoConocidoCm + indiceReferencia, para fijar la escala.');
    }
    const referencia = candidatos[indiceReferencia];
    if (!referencia) throw new Error('El índice de referencia ya no existe en este SVG.');
    const subtrazados = pointsOnPath(referencia.pathAbsoluto, tolerancia);
    const xs = subtrazados.flat().map((p) => p[0]);
    const anchoUnidades = Math.max(...xs) - Math.min(...xs);
    mmPorUnidadFinal = (anchoConocidoCm * 10) / anchoUnidades;
  }

  const geometriasPorTalla = {};
  for (const [talla, indice] of Object.entries(mapaTallaAIndice)) {
    const candidato = candidatos[indice];
    if (!candidato) throw new Error('El candidato asignado a la talla "' + talla + '" ya no existe en este SVG.');
    geometriasPorTalla[talla] = poligonoYBoundingBox(candidato.pathAbsoluto, mmPorUnidadFinal, tolerancia);
  }

  return { geometriasPorTalla, mmPorUnidad: mmPorUnidadFinal };
}
