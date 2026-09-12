// Convierte un Pedido real (líneas = talla + nombre + número de un jugador)
// en piezas listas para anidar, con su contenido ya resuelto: la imagen de
// fondo (del Diseño) y los textos personalizados (del Producto → Elementos)
// ya calibrados al tamaño que corresponde a la talla de esa línea.
//
// Es el punto donde se juntan las entidades que antes vivían separadas sin
// conectarse: Grupo (piezas reales, por referencia a la biblioteca), Diseño
// (arte por pieza) y Producto (dónde va cada nombre/número y con qué tamaño
// de referencia). piezasExcluidas resuelve el caso real "esta prenda puntual
// va sin tal pieza" (ej. sin mangas) sin duplicar el diseño para todo el
// equipo — se salta esa pieza solo para esta línea, ninguna otra se entera.

import { calibrarZona } from './calibracion.js';
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

    for (const pieza of piezasDelGrupo) {
      if (excluidas.has(pieza.nombre)) continue;

      const dimension = pieza.dimensionesPorTalla?.[linea.talla];
      if (!dimension) {
        throw new Error(
          'La pieza "' + pieza.nombre + '" de "' + grupo.nombre +
            '" no tiene dimensión cargada para la talla ' + linea.talla + '.'
        );
      }

      const elementosDeEstaPieza = (producto.elementos || []).filter(
        (elemento) => elemento.piezaNombre === pieza.nombre
      );

      const textos = elementosDeEstaPieza
        .map((elemento) => {
          const valor =
            elemento.tipo === 'nombre' ? linea.nombre :
            elemento.tipo === 'numero' ? linea.numero :
            elemento.valorFijo;
          if (!valor) return null;

          const tamano = calibrarZona(
            {
              id: elemento.id,
              modoEscalado: elemento.modoEscalado,
              referenciaProporcional: elemento.referenciaProporcional,
              tallaReferencia: elemento.tallaReferencia,
              rangos: elemento.rangos,
            },
            linea.talla,
            pieza.dimensionesPorTalla
          );

          return {
            texto: String(valor),
            xCm: elemento.posicion.xCm,
            yCm: elemento.posicion.yCm,
            altoCm: tamano.altoCm,
            colorHex: elemento.colorHex || '#000000',
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
