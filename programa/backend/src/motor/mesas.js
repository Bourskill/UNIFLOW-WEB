// Mesas de trabajo de una producción, como el script "PROCESAR MOLDES" del
// panel de Illustrator: UNA mesa por pieza (Molde_1, Molde_2...), del tamaño
// justo de la pieza más 1 cm de margen alrededor, con su contorno de corte
// láser. Una página del PDF = una mesa. Las piezas van en el orden de la
// prenda, talla por talla (las en par, las dos).
//
// Las piezas llegan como las arma resolverPiezasDePedido (anchoCm/altoCm,
// talla, piezaId...) y salen con `posicion` dentro de su mesa, que es lo que
// dibuja exportarPdf.js.

export const MARGEN_MESA_CM = 1;

// El contorno de corte cuando la producción no tiene uno propio activado:
// los mismos valores del script (offset 1 mm hacia afuera, trazo 0,1 cm).
export const CONTORNO_LASER_POR_DEFECTO = { activo: true, colorHex: '#000000', grosorCm: 0.1, desplazamientoCm: 0.1 };

export function armarMesas(piezas, { margenCm = MARGEN_MESA_CM } = {}) {
  const numeroEnTalla = new Map();
  return piezas.map((p) => {
    const n = (numeroEnTalla.get(p.talla) || 0) + 1;
    numeroEnTalla.set(p.talla, n);
    const bordeContraste = p.bordeContraste?.activo ? p.bordeContraste : CONTORNO_LASER_POR_DEFECTO;
    // Como el script: el margen se mide desde el molde; el contorno (1 mm
    // afuera) queda adentro de ese margen.
    const borde = margenCm;
    return {
      talla: p.talla,
      nombre: String(n).padStart(2, '0') + ' - ' + p.piezaId,
      anchoLienzoCm: redondear(p.anchoCm + borde * 2),
      altoLienzoCm: redondear(p.altoCm + borde * 2),
      piezas: [{ ...p, bordeContraste, marcarPiquetes: true, posicion: { x: borde, y: borde } }],
    };
  });
}

function redondear(n) {
  return Math.round(n * 1000) / 1000;
}
