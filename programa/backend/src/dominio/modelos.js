// Modelo de dominio reinterpretado (no traducido) de UNIFLOW/Illustrator.
// Cada forma documenta el invariante que protege, no solo los campos.

/**
 * Moldería: un patrón con sus piezas y, para cada pieza, su dimensión POR TALLA.
 * No existe una "talla del molde" única — cada pieza tiene su propia tabla de
 * tallas, porque una remera y su manga no necesariamente escalan igual.
 *
 * @typedef {Object} Pieza
 * @property {string} id
 * @property {string} nombre               ej. "Espalda", "Manga izquierda"
 * @property {boolean} rotable              si se puede voltear 180° al anidar
 * @property {string} tela                  tela por defecto de esta pieza
 * @property {Record<string, {anchoCm: number, altoCm: number}>} dimensionesPorTalla
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
 * @property {Array<{ desdeTalla: string, hastaTalla: string, anchoCm: number, altoCm: number }>} [rangos]
 */

/**
 * Producto: unión de una moldería, un diseño y overrides de personalización
 * (equivalente a "Elementos" en la referencia externa).
 *
 * @typedef {Object} Producto
 * @property {string} id
 * @property {string} nombre
 * @property {string} molderiaId
 * @property {string} disenoId
 */

/**
 * Pedido: líneas individuales por talla + nombre + número. Cada línea es una
 * prenda física real — es la unidad que después se rastrea en generaciones.
 *
 * @typedef {Object} LineaPedido
 * @property {string} id
 * @property {string} productoId
 * @property {string} talla
 * @property {string} [nombre]
 * @property {string} [numero]
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
