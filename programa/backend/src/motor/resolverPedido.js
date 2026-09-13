// Convierte un Pedido real (líneas = talla + nombre + número de un jugador)
// en piezas listas para anidar, con su contenido ya resuelto: la imagen de
// fondo (del Diseño) y los textos personalizados (del Producto → Anclaje)
// ya calibrados al tamaño y posición que corresponde a la talla de esa
// línea.
//
// Es el punto donde se juntan las entidades que antes vivían separadas sin
// conectarse: Grupo (piezas reales, por referencia a la biblioteca), Diseño
// (arte por pieza) y Producto (el grafo de anclas/zonas -- puerto fiel del
// sistema de Illustrator, ver motor/anclaje/). piezasExcluidas resuelve el
// caso real "esta prenda puntual va sin tal pieza" (ej. sin mangas) sin
// duplicar el diseño para todo el equipo — se salta esa pieza solo para
// esta línea, ninguna otra se entera.

import { resolver as resolverAnclaje } from './anclaje/resolver.js';
import { geometriaDelGrupo } from './geometriaAnclaje.js';
import { resolverPiezasDeGrupo } from '../dominio/resolverGrupo.js';

export function resolverPiezasDePedido({ pedido, productos, grupos, piezas, disenos }) {
  const piezasParaAnidar = [];
  let contador = 0;

  for (const linea of pedido.lineas) {
    const producto = productos.find((p) => p.id === linea.productoId);
    if (!producto) {
      throw new Error('Una línea del pedido no tiene un producto válido.');
    }
    const grupo = grupos.find((g) => g.id === producto.grupoId);
    if (!grupo) {
      throw new Error('El producto "' + producto.nombre + '" no tiene grupo (moldería) asociado.');
    }
    const diseno = disenos.find((d) => d.id === producto.disenoId);
    const piezasDelGrupo = resolverPiezasDeGrupo(grupo, piezas);
    const excluidas = new Set(linea.piezasExcluidas || []);

    // Todas las piezas del grupo a la MISMA talla de esta línea -- a
    // diferencia del editor (Productos.jsx), que permite una "talla de
    // trabajo" distinta por rol solo para poder mirar cada pieza cómoda
    // mientras se arma el anclaje, producción siempre resuelve la prenda
    // completa a UNA sola talla real.
    const tallaPorRol = {};
    for (const pieza of piezasDelGrupo) tallaPorRol[pieza.nombre] = linea.talla;
    const geometria = geometriaDelGrupo(piezasDelGrupo, tallaPorRol);

    const anclajeVacio = { anclas: [], zonas: [] };
    const resuelto = resolverAnclaje(producto.anclaje || anclajeVacio, geometria, { talla: linea.talla });
    if (resuelto.errores.length > 0) {
      throw new Error(
        'Producto "' + producto.nombre + '" en talla ' + linea.talla + ': ' + resuelto.errores.join(' | ')
      );
    }

    // campoPedido/valorFijo son propios de UNIFLOW WEB (qué dato del pedido
    // llena cada zona) -- no existen en el motor de anclaje portado de
    // Illustrator, que deliberadamente no sabe qué es un pedido (ver
    // motor/anclaje/resolver.js). Se leen del anclaje CRUDO (antes de
        // normalizar), buscando por id, en vez de intentar que el resolutor
    // los cargue -- así el puerto queda fiel, sin agregarle campos que no
    // son suyos.
    const zonaCruda = {};
    for (const z of producto.anclaje?.zonas || []) zonaCruda[z.id] = z;

    for (const pieza of piezasDelGrupo) {
      if (excluidas.has(pieza.nombre)) continue;

      const dimension = pieza.dimensionesPorTalla?.[linea.talla];
      if (!dimension) {
        throw new Error(
          'La pieza "' + pieza.nombre + '" de "' + grupo.nombre +
            '" no tiene dimensión cargada para la talla ' + linea.talla + '.'
        );
      }

      const zonasDeEstaPieza = resuelto.lista.zonas.filter((z) => z.pieza === pieza.nombre);
      const textos = zonasDeEstaPieza
        .map((zona) => {
          const cruda = zonaCruda[zona.id];
          const campo = cruda?.campoPedido || 'fijo';
          const valor =
            campo === 'nombre' ? linea.nombre :
            campo === 'numero' ? linea.numero :
            cruda?.valorFijo;
          if (!valor) return null;

          return {
            texto: String(valor),
            xCm: zona.x,
            yCm: zona.y,
            altoCm: zona.alto,
            colorHex: cruda?.colorHex || '#000000',
          };
        })
        .filter(Boolean);

      piezasParaAnidar.push({
        id: 'p' + contador++,
        piezaId: pieza.nombre,
        lineaPedidoId: linea.id,
        talla: linea.talla,
        anchoCm: dimension.anchoCm,
        altoCm: dimension.altoCm,
        rotable: !!pieza.rotable,
        imagenDataUrl: diseno?.imagenesPorPieza?.[pieza.nombre] || null,
        textos,
      });
    }
  }

  return piezasParaAnidar;
}
