// Modelo de dominio reinterpretado (no traducido) de UNIFLOW/Illustrator.
// Cada forma documenta el invariante que protege, no solo los campos.

/**
 * Pieza: vive en una BIBLIOTECA, no dentro de un grupo — un Grupo la
 * REFERENCIA (GrupoPieza.piezaId), nunca la copia. Si se resube la geometría
 * de una pieza, todo grupo que la usa ve el cambio al instante (reciclaje
 * real de piezas entre prendas, ej. "misma remera, otro cuello").
 *
 * La geometría real (poligonoMm) es la forma verdadera de la pieza, extraída
 * de un SVG — nunca se deriva ancho×alto sin ella. dimensionesPorTalla se
 * calcula A PARTIR del bounding box de esa geometría, no al revés; se guarda
 * aparte solo porque calibracion.js y nesting.js ya trabajan con cm planos.
 *
 * @typedef {Object} Pieza
 * @property {string} id
 * @property {string} nombre                          ej. "Espalda", "Manga izquierda"
 * @property {number[]} angulosPermitidos              ej. [0, 180] — nunca se asume, lo elige el usuario
 * @property {string} [tela]                           tela por defecto de esta pieza
 * @property {Record<string, {
 *   poligonoMm: [number, number][],
 *   boundingBoxMm: { anchoMm: number, altoMm: number },
 *   svgOriginal: string,
 *   validadoPorUsuario: boolean
 * }>} geometriaPorTalla
 * @property {Record<string, {anchoCm: number, altoCm: number}>} dimensionesPorTalla  derivado de geometriaPorTalla, en cm
 */

/**
 * Grupo: un catálogo — una prenda completa armada eligiendo piezas que ya
 * existen en la biblioteca, por rol. No se sube nada acá; cada entrada
 * REFERENCIA una Pieza (nunca la copia), así que reciclar una pieza en otra
 * prenda es elegirla de nuevo, y resubirla en Piezas actualiza todo lo que
 * la usa.
 *
 * @typedef {Object} GrupoPieza
 * @property {string} piezaId
 * @property {string} rol                    nombre de esta pieza DENTRO del grupo (ej. "Manga izquierda")
 *
 * @typedef {Object} Grupo
 * @property {string} id
 * @property {string} nombre
 * @property {GrupoPieza[]} piezas
 */

/**
 * Diseño: la plantilla visual + las zonas de personalización ancladas a ella.
 * El ancla vive en el diseño, NUNCA se deriva de la geometría cruda de la
 * moldería (ver claude/README.md — bug ya pagado en la versión Illustrator).
 *
 * @typedef {Object} Zona
 * @property {string} id
 * @property {string} tipo                  'texto' | 'numero' | 'imagen'
 * @property {string} ancla                 referencia de piquete/posición en el diseño
 * @property {'proporcional'|'porRangos'} modoEscalado
 * @property {{ altoCm: number }} [referenciaProporcional]   base para escalado continuo
 * @property {string} [tallaReferencia]     a qué talla corresponde ese alto de referencia
 * @property {Array<{ desdeTalla: string, hastaTalla: string, anchoCm: number, altoCm: number }>} [rangos]
 */

/**
 * Producto: unión de un grupo (piezas reales), un diseño y overrides de
 * personalización (equivalente a "Elementos" en la referencia externa).
 *
 * @typedef {Object} Producto
 * @property {string} id
 * @property {string} nombre
 * @property {string} grupoId
 * @property {string} disenoId
 */

/**
 * Pedido: líneas individuales por talla + nombre + número. Cada línea es una
 * prenda física real — es la unidad que después se rastrea en generaciones.
 * piezasExcluidas cubre el caso real "esta prenda puntual va sin tal pieza"
 * (ej. sin mangas) sin duplicar el diseño para todo el equipo.
 *
 * @typedef {Object} LineaPedido
 * @property {string} id
 * @property {string} productoId
 * @property {string} talla
 * @property {string} [nombre]
 * @property {string} [numero]
 * @property {string[]} [piezasExcluidas]    roles de GrupoPieza a omitir para esta unidad puntual
 */

/**
 * Generación: el resultado de anidar un conjunto de líneas de pedido en una o
 * más mesas y producir un archivo. Se guarda pieza por pieza (no solo el
 * archivo final) para poder hacer reposición sin rehacer el lote.
 *
 * @typedef {Object} PiezaGenerada
 * @property {string} lineaPedidoId
 * @property {string} piezaId
 * @property {string} talla
 * @property {{ x: number, y: number, rotacionGrados: 0 | 180 }} posicion
 * @property {'pendiente'|'generada'|'repuesta'} estado
 */

export const TALLAS_ORDEN = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

export function compararTallas(a, b) {
  return TALLAS_ORDEN.indexOf(a) - TALLAS_ORDEN.indexOf(b);
}
