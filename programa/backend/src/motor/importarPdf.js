// Extrae geometría real de un PDF exportado desde Illustrator con "Crear
// capas de Acrobat" activado al exportar (Archivo > Exportar > Exportar
// como... > Adobe PDF, u "Guardar como PDF" con esa opción tildada) — así
// cada capa de nivel superior de Illustrator se preserva como una capa real
// de PDF (un "Optional Content Group", OCG), con su nombre intacto. Es la
// alternativa a DXF para quien arma las molderías en Illustrator: DXF exige
// software de patronaje dedicado para exportar capas limpias, cosa que el
// export nativo de Illustrator a DXF no hace bien.
//
// REQUISITO del archivo: igual que en DXF, una CAPA por talla, nombrada con
// esa talla. Una capa puede traer más de un trazo (contorno + piquetes
// sueltos de esa misma talla) sin confundirse con otra — todo lo que esté
// en la capa "S" es parte de la talla S. Las subcapas de una capa de nivel
// superior heredan la capa/OCG de esa capa madre, así que agrupar contorno
// y piquetes en subcapas dentro de "S" también funciona.
//
// La escala física en PDF NUNCA hace falta confirmarla a mano: el formato
// siempre mide en puntos (1/72 pulgada) por definición del estándar, a
// diferencia de SVG (unidad a veces no declarada) o DXF ($INSUNITS a veces
// ausente).

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { asignarTallasPorNombre, contornoYPiquetesDeTrazos } from './geometriaComun.js';

const PT_A_MM = 25.4 / 72;

// Códigos de segmento de path que usa el operador interno de pdfjs-dist
// (constructPath) -- verificados leyendo su código fuente instalado, no
// adivinados de la documentación (ver commit de esta pasada).
const SEG_MOVE_TO = 0;
const SEG_LINE_TO = 1;
const SEG_CURVE_TO = 2;
const SEG_CLOSE_PATH = 4;

// Solo los operadores de PINTAR (stroke/fill) cuentan como geometría real.
// Un path que termina en "endPath" (el operador PDF `n`, incluido el caso
// `W n` que solo define un clip) no se pinta ni se corta -- no es parte de
// la pieza, es construcción invisible o una máscara de recorte.
const OPS_PINTAN = new Set([
  pdfjsLib.OPS.stroke,
  pdfjsLib.OPS.closeStroke,
  pdfjsLib.OPS.fill,
  pdfjsLib.OPS.eoFill,
  pdfjsLib.OPS.fillStroke,
  pdfjsLib.OPS.eoFillStroke,
  pdfjsLib.OPS.closeFillStroke,
  pdfjsLib.OPS.closeEOFillStroke,
]);
// Un fill siempre cierra el área para rellenarla, aunque el trazo no traiga
// un cierre explícito -- cuenta como "cerrado" igual que closePath.
const OPS_RELLENAN = new Set([
  pdfjsLib.OPS.fill,
  pdfjsLib.OPS.eoFill,
  pdfjsLib.OPS.fillStroke,
  pdfjsLib.OPS.eoFillStroke,
  pdfjsLib.OPS.closeFillStroke,
  pdfjsLib.OPS.closeEOFillStroke,
]);

function multiplicarMatrices(m1, m2) {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

function aplicarMatriz(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

// Tessela una curva cúbica de Bézier (P0 ya está en el buffer como punto
// anterior) en N puntos intermedios + el punto final, en el espacio del
// PATH (todavía sin transformar por el CTM -- eso se aplica afuera).
//
// 48, no 12: geometriaSalientes.js·vueltasDeMuestreo busca "vueltas" del
// contorno con una ventana de ~2% del tamaño de la pieza -- con solo 12
// segmentos, una curva real (radio de garment típico) quedaba
// sub-muestreada para esa ventana y una vuelta suave podía no detectarse
// nunca (mismo ajuste hecho del lado DXF, ver importarDxf.js).
function tessellarCurva(p0, x1, y1, x2, y2, x3, y3, segmentos = 48) {
  const puntos = [];
  for (let i = 1; i <= segmentos; i++) {
    const t = i / segmentos;
    const mt = 1 - t;
    const x = mt * mt * mt * p0[0] + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3;
    const y = mt * mt * mt * p0[1] + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3;
    puntos.push([x, y]);
  }
  return puntos;
}

// Decodifica el buffer plano de constructPath a puntos absolutos (ya
// pasados por el CTM vigente). Devuelve también si el trazo quedó cerrado.
function decodificarPath(buffer, fn, ctm) {
  const puntos = [];
  let actual = [0, 0];
  let cerrado = OPS_RELLENAN.has(fn);
  let i = 0;
  while (i < buffer.length) {
    const codigo = buffer[i++];
    if (codigo === SEG_MOVE_TO || codigo === SEG_LINE_TO) {
      actual = [buffer[i], buffer[i + 1]];
      puntos.push(aplicarMatriz(ctm, actual[0], actual[1]));
      i += 2;
    } else if (codigo === SEG_CURVE_TO) {
      const [x1, y1, x2, y2, x3, y3] = [buffer[i], buffer[i + 1], buffer[i + 2], buffer[i + 3], buffer[i + 4], buffer[i + 5]];
      for (const [px, py] of tessellarCurva(actual, x1, y1, x2, y2, x3, y3)) puntos.push(aplicarMatriz(ctm, px, py));
      actual = [x3, y3];
      i += 6;
    } else if (codigo === SEG_CLOSE_PATH) {
      cerrado = true;
    } else {
      break; // código desconocido -- no debería pasar con lo que emite pdfjs-dist hoy
    }
  }
  return { puntos, cerrado };
}

// Recorre el PDF completo (todas las páginas) juntando, por capa/OCG, los
// puntos de todo lo que se pinta -- separados en "cerrados" (el contorno
// real) y "todos" (contorno + piquetes sueltos), igual que en importarDxf.js
// y por la misma razón: un piquete no debe inflar el bounding box guardado.
async function extraerCandidatosPdf(bufferPdf) {
  let doc;
  try {
    doc = await pdfjsLib.getDocument({ data: new Uint8Array(bufferPdf), useSystemFonts: true }).promise;
  } catch (error) {
    throw new Error('No se pudo leer el PDF (¿archivo corrupto o no soportado?): ' + error.message);
  }

  const config = await doc.getOptionalContentConfig();
  const nombrePorId = new Map();
  for (const [id, grupo] of config) nombrePorId.set(id, grupo.name);

  const porCapa = new Map(); // nombre -> { todos: [...], cerrados: [...], trazos: [...] }
  function agregar(nombre, puntos, cerrado) {
    if (!nombre || puntos.length === 0) return;
    if (!porCapa.has(nombre)) porCapa.set(nombre, { todos: [], cerrados: [], trazos: [] });
    const grupo = porCapa.get(nombre);
    grupo.todos.push(...puntos);
    if (cerrado) grupo.cerrados.push(...puntos);
    // Sin mezclar -- ver el mismo comentario en importarDxf.js: hace falta
    // cada trazo por separado para distinguir después el contorno real de
    // los piquetes sueltos (contornoYPiquetesDeTrazos).
    grupo.trazos.push({ puntos, cerrado });
  }

  for (let numeroPagina = 1; numeroPagina <= doc.numPages; numeroPagina++) {
    const pagina = await doc.getPage(numeroPagina);
    const opList = await pagina.getOperatorList();

    let ctm = [1, 0, 0, 1, 0, 0];
    const pilaCtm = [];
    const pilaCapas = []; // cada entrada: nombre de capa (string) o undefined si no es un bloque /OC

    const capaVigente = () => {
      for (let i = pilaCapas.length - 1; i >= 0; i--) {
        if (pilaCapas[i] !== undefined) return pilaCapas[i];
      }
      return null;
    };

    for (let i = 0; i < opList.fnArray.length; i++) {
      const fn = opList.fnArray[i];
      const args = opList.argsArray[i];
      switch (fn) {
        case pdfjsLib.OPS.save:
        case pdfjsLib.OPS.paintFormXObjectBegin:
          pilaCtm.push(ctm);
          if (fn === pdfjsLib.OPS.paintFormXObjectBegin && Array.isArray(args?.[0])) {
            ctm = multiplicarMatrices(ctm, args[0]);
          }
          break;
        case pdfjsLib.OPS.restore:
        case pdfjsLib.OPS.paintFormXObjectEnd:
          ctm = pilaCtm.pop() ?? ctm;
          break;
        case pdfjsLib.OPS.transform:
          ctm = multiplicarMatrices(ctm, args);
          break;
        case pdfjsLib.OPS.beginMarkedContentProps:
          pilaCapas.push(args[0] === 'OC' ? nombrePorId.get(args[1]?.id) ?? null : undefined);
          break;
        case pdfjsLib.OPS.beginMarkedContent:
          pilaCapas.push(undefined);
          break;
        case pdfjsLib.OPS.endMarkedContent:
          pilaCapas.pop();
          break;
        case pdfjsLib.OPS.constructPath: {
          if (!OPS_PINTAN.has(args[0])) break; // clip o construcción invisible, no es geometría real
          const buffer = args[1]?.[0];
          if (!buffer) break;
          const { puntos, cerrado } = decodificarPath(buffer, args[0], ctm);
          agregar(capaVigente(), puntos, cerrado);
          break;
        }
      }
    }
  }

  const nombres = [...porCapa.keys()];
  if (nombres.length === 0) {
    throw new Error(
      'No se encontró geometría dentro de ninguna capa de PDF (¿el archivo se exportó con ' +
        '"Crear capas de Acrobat" activado?).'
    );
  }

  const candidatos = nombres.map((nombre, indice) => {
    const grupo = porCapa.get(nombre);
    return {
      indice, nombre,
      puntosUnidades: grupo.cerrados.length > 0 ? grupo.cerrados : grupo.todos,
      trazos: grupo.trazos,
    };
  });

  return candidatos;
}

/**
 * @param {Buffer} bufferPdf  un archivo con una capa de PDF (OCG) por talla
 */
export async function analizarPiezaMultiTalla(bufferPdf) {
  const candidatos = await extraerCandidatosPdf(bufferPdf);
  const asignaciones = asignarTallasPorNombre(candidatos);

  return {
    candidatos: candidatos.map((c) => ({ indice: c.indice, nombre: c.nombre })),
    asignaciones,
    tallasDetectadas: [...new Set(asignaciones.map((a) => a.tallaAsignada).filter(Boolean))],
    escalaConfirmada: true, // PDF siempre mide en puntos (1/72"), nunca hace falta confirmarlo a mano
    mmPorUnidad: PT_A_MM,
  };
}

/**
 * @param {Buffer} bufferPdf
 * @param {Record<string, number>} mapaTallaAIndice
 *
 * No recibe opciones de escala (a diferencia de la versión DXF): en PDF
 * nunca hace falta confirmarla a mano, así que no hay nada que pasarle.
 */
export async function resolverGeometriasPorTalla(bufferPdf, mapaTallaAIndice) {
  const candidatos = await extraerCandidatosPdf(bufferPdf);

  const geometriasPorTalla = {};
  for (const [talla, indice] of Object.entries(mapaTallaAIndice)) {
    const candidato = candidatos[indice];
    if (!candidato) throw new Error('El candidato asignado a la talla "' + talla + '" ya no existe en este PDF.');
    geometriasPorTalla[talla] = contornoYPiquetesDeTrazos(candidato.trazos, PT_A_MM);
  }

  return { geometriasPorTalla, mmPorUnidad: PT_A_MM };
}
