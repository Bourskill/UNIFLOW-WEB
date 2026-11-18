// Cuentas de la barra de progreso del inicio (componentes/Arranque.jsx),
// aparte para poder probarlas sin navegador.
//
// La barra se reparte entre lo que de verdad tarda al abrir la app:
//  - despertar el servidor (Render gratis se duerme; puede tardar ~1 min),
//  - traer cada colección a la caché (las piezas son lo más pesado),
//  - bajar al navegador las imágenes de los diseños.

export const PESO_SERVIDOR = 25;
export const PESO_IMAGENES = 10;
// Cuánto pesa cada colección (suman 65): las piezas traen el contorno de cada talla.
export const PESO_COLECCION = {
  piezas: 30, grupos: 5, disenos: 8, productos: 5, plantillas: 3, pedidos: 5, fuentes: 3, generaciones: 6,
};

// Los pasos que se le muestran al usuario, con las colecciones de cada uno.
export const GRUPOS_DE_DATOS = [
  { id: 'moldes', titulo: 'Moldes y prendas', colecciones: ['piezas', 'grupos'] },
  { id: 'disenos', titulo: 'Diseños, productos y fuentes', colecciones: ['disenos', 'productos', 'plantillas', 'fuentes'] },
  { id: 'produccion', titulo: 'Pedidos e historial', colecciones: ['pedidos', 'generaciones'] },
];

/**
 * Mientras el servidor no responde no hay forma de saber cuánto falta: la
 * barra avanza con el tiempo, cada vez más despacio, sin llegar nunca al
 * final de su tramo (así no "miente" que ya terminó). A los ~15 s va por la
 * mitad del tramo; a los ~45 s, casi completo.
 */
export function avanceDespertando(ms) {
  const fraccion = 1 - Math.exp(-ms / 22000);
  return Math.min(fraccion, 0.95) * PESO_SERVIDOR;
}

/**
 * @param {object} estado
 * @param {boolean} estado.servidorListo
 * @param {number} estado.msDespertando  tiempo esperando al servidor
 * @param {Record<string, 'pendiente'|'cargando'|'listo'|'error'>} estado.colecciones
 * @param {{total: number, listas: number}|null} estado.imagenes  null = todavía no se sabe cuántas
 * @returns {number} de 0 a 100
 */
export function progresoTotal({ servidorListo, msDespertando = 0, colecciones = {}, imagenes = null }) {
  let total = servidorListo ? PESO_SERVIDOR : avanceDespertando(msDespertando);
  for (const [nombre, peso] of Object.entries(PESO_COLECCION)) {
    const e = colecciones[nombre];
    if (e === 'listo' || e === 'error') total += peso; // un error también "termina" ese tramo
  }
  if (imagenes) total += imagenes.total === 0 ? PESO_IMAGENES : (PESO_IMAGENES * imagenes.listas) / imagenes.total;
  return Math.max(0, Math.min(100, Math.round(total)));
}

/** Las imágenes de los diseños que vale la pena bajar antes (no los PDF: de esos se baja su vista PNG). */
export function imagenesDeDisenos(disenos, tope = 40) {
  const urls = new Set();
  for (const d of disenos || []) {
    const vistas = d.vistasPorPieza || {};
    for (const [clave, url] of Object.entries(d.imagenesPorPieza || {})) {
      const ver = vistas[clave] || url;
      if (typeof ver === 'string' && /^https?:/.test(ver) && !/\.pdf(\?|$)/i.test(ver)) urls.add(ver);
    }
  }
  return [...urls].slice(0, tope);
}
