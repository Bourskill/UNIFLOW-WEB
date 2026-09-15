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
import { resolverPiezasDeGrupos } from '../dominio/resolverGrupo.js';

// Un Producto de un solo grupo sigue guardando `grupoId` (nunca se migró
// data existente); uno multi-prenda ("kit") guarda `grupoIds`. Normalizar
// acá, en un solo lugar, es lo que le permite a TODO lo demás de este
// archivo tratar cualquier Producto como "una lista de grupos", sin volver
// a distinguir el caso viejo del nuevo en cada sitio.
function gruposIdsDe(producto) {
  return producto.grupoIds || (producto.grupoId ? [producto.grupoId] : []);
}

// Piezas "talla única" (no escalan -- la misma moldería sirve para
// cualquier talla del pedido, ej. una vela/refuerzo que es igual en S que
// en XL): usan su única geometría cargada sin importar qué talla pida el
// pedido, bajo cualquier nombre de talla (ver motor/geometriaComun.js -- la
// talla es el nombre de capa tal cual, nunca se valida contra una lista).
//
// OJO -- esto SOLO se activa con `pieza.tallaUnica === true`, una marca
// EXPLÍCITA del usuario (checkbox en Piezas.jsx). NO alcanza con mirar
// "tiene una sola talla cargada": una pieza a mitad de cargar sus tallas
// (PUT /piezas/:id/tallas/:talla, de a una por vez) TAMBIÉN tiene una sola
// talla en ese momento sin ser talla única de verdad -- inferirlo solo por
// la cuenta hubiera podido sustituir en silencio una talla real que
// simplemente todavía no se terminó de cargar, exactamente el error que
// este proyecto trata como el único sin vuelta atrás.
export function tallaRealDePieza(pieza, tallaPedida) {
  if (pieza.dimensionesPorTalla?.[tallaPedida]) return tallaPedida;
  if (!pieza.tallaUnica) return tallaPedida; // no marcada -- nunca inventar, que falle explícito más abajo
  const tallasDisponibles = Object.keys(pieza.dimensionesPorTalla || {});
  return tallasDisponibles.length === 1 ? tallasDisponibles[0] : tallaPedida;
}

export function resolverPiezasDePedido({ pedido, productos, grupos, piezas, disenos, fuentes }) {
  const piezasParaAnidar = [];
  let contador = 0;

  for (const linea of pedido.lineas) {
    const producto = productos.find((p) => p.id === linea.productoId);
    if (!producto) {
      throw new Error('Una línea del pedido no tiene un producto válido.');
    }
    const idsGrupos = gruposIdsDe(producto);
    const gruposDelProducto = idsGrupos.map((id) => grupos.find((g) => g.id === id)).filter(Boolean);
    if (gruposDelProducto.length === 0) {
      throw new Error('El producto "' + producto.nombre + '" no tiene grupo (moldería) asociado.');
    }
    if (gruposDelProducto.length < idsGrupos.length) {
      throw new Error(
        'El producto "' + producto.nombre + '" combina varias prendas y al menos una ya no existe -- hay que revisar este producto.'
      );
    }
    const diseno = disenos.find((d) => d.id === producto.disenoId);
    // versionesPiezas: producción respeta el pin de versión de cada pieza
    // (ver rutas/api.js) -- es el ÚNICO camino que de verdad genera el
    // corte/PDF final, así que es el que tiene que ver exactamente lo que
    // el producto tenía cuando se guardó, no lo último que haya en Biblioteca.
    const piezasDelGrupo = resolverPiezasDeGrupos(gruposDelProducto, piezas, producto.versionesPiezas);
    const excluidas = new Set(linea.piezasExcluidas || []);

    // Todas las piezas del grupo a la MISMA talla de esta línea -- a
    // diferencia del editor (Productos.jsx), que permite una "talla de
    // trabajo" distinta por rol solo para poder mirar cada pieza cómoda
    // mientras se arma el anclaje, producción siempre resuelve la prenda
    // completa a UNA sola talla real.
    const tallaPorRol = {};
    for (const pieza of piezasDelGrupo) tallaPorRol[pieza.nombre] = tallaRealDePieza(pieza, linea.talla);
    const geometria = geometriaDelGrupo(piezasDelGrupo, tallaPorRol);

    const anclajeVacio = { anclas: [], zonas: [] };
    const resuelto = resolverAnclaje(producto.anclaje || anclajeVacio, geometria, { talla: linea.talla });
    if (resuelto.errores.length > 0) {
      throw new Error(
        'Producto "' + producto.nombre + '" en talla ' + linea.talla + ': ' + resuelto.errores.join(' | ')
      );
    }

    // campoPedido/valorFijo/rotacion son propios de UNIFLOW WEB -- no
    // existen en el motor de anclaje portado de Illustrator, que
    // deliberadamente no sabe qué es un pedido ni de rotar contenido (ver
    // motor/anclaje/resolver.js). Se leen del anclaje CRUDO (antes de
    // normalizar), buscando por id, en vez de intentar que el resolutor
    // los cargue -- así el puerto queda fiel, sin agregarle campos que no
    // son suyos.
    const zonaCruda = {};
    for (const z of producto.anclaje?.zonas || []) zonaCruda[z.id] = z;

    for (const pieza of piezasDelGrupo) {
      if (excluidas.has(pieza.nombre)) continue;

      // tallaPorRol[pieza.nombre] ya resolvió el caso "talla única" arriba
      // -- para esa pieza puntual puede ser distinta de linea.talla a
      // propósito, nunca al revés (nunca se inventa una talla que la pieza
      // no tiene cargada).
      const dimension = pieza.dimensionesPorTalla?.[tallaPorRol[pieza.nombre]];
      if (!dimension) {
        throw new Error(
          'La pieza "' + pieza.rol + '" de "' + pieza.grupoNombre +
            '" no tiene dimensión cargada para la talla ' + linea.talla + '.'
        );
      }

      const zonasDeEstaPieza = resuelto.lista.zonas.filter((z) => z.pieza === pieza.nombre);
      const textos = zonasDeEstaPieza
        .filter((zona) => zona.tipo !== 'logo')
        .map((zona) => {
          const cruda = zonaCruda[zona.id];
          const campo = cruda?.campoPedido || 'fijo';
          const valor =
            campo === 'nombre' ? linea.nombre :
            campo === 'numero' ? linea.numero :
            cruda?.valorFijo;
          if (!valor) return null;

          // fuenteId (elegida en el panel de la zona, Productos.jsx) apunta
          // al catálogo de fuentes propias (pasada 34) -- sin elegir
          // ninguna, o si la fuente elegida se borró de la biblioteca,
          // fuenteUrl queda null y exportarPdf.js cae a la Helvetica
          // estándar de siempre (nunca falla por esto).
          const fuente = cruda?.fuenteId ? fuentes?.find((f) => f.id === cruda.fuenteId) : null;

          return {
            texto: String(valor),
            xCm: zona.x,
            yCm: zona.y,
            cxCm: zona.cx,
            cyCm: zona.cy,
            altoCm: zona.alto,
            colorHex: cruda?.colorHex || '#000000',
            rotacionGrados: cruda?.rotacion || 0,
            fuenteUrl: fuente?.archivoUrl || null,
          };
        })
        .filter(Boolean);

      // Un logo no lleva texto de pedido -- se coloca tal cual, ajustado
      // (sin deformar) dentro de su zona. Con cruz activa, zona.ancho ===
      // zona.alto === "lado" (ver resolverZona, motor/anclaje/resolver.js);
      // exportarPdf.js hace el mismo cálculo de brazos que
      // colocarLogoEnZonaCruz() de host.jsx para decidir el tamaño final.
      const imagenes = zonasDeEstaPieza
        .filter((zona) => zona.tipo === 'logo' && zona.logoRuta)
        .map((zona) => ({
          url: zona.logoRuta,
          cxCm: zona.cx,
          cyCm: zona.cy,
          ladoCm: zona.ancho,
          anchoCm: zona.ancho,
          altoCm: zona.alto,
          cruz: !!zona.cruz,
          rotacionGrados: zonaCruda[zona.id]?.rotacion || 0,
        }));

      piezasParaAnidar.push({
        id: 'p' + contador++,
        // Etiqueta LEGIBLE -- nunca la clave interna namespaced
        // (pieza.nombre puede ser "grupoId::Delantero" en un kit
        // multi-prenda). Esto se imprime tal cual en el PDF real
        // (exportarPdf.js), en la vista previa de nesting y en Historial --
        // mostrarle al usuario un id de grupo en crudo ahí sería justo el
        // tipo de fuga de detalle interno que este proyecto evita en todos
        // lados. Con una sola prenda en el producto, es igual que siempre.
        piezaId: gruposDelProducto.length > 1 ? (pieza.grupoNombre + ' · ' + pieza.rol) : pieza.rol,
        lineaPedidoId: linea.id,
        talla: linea.talla,
        anchoCm: dimension.anchoCm,
        altoCm: dimension.altoCm,
        rotable: !!pieza.rotable,
        imagenDataUrl: diseno?.imagenesPorPieza?.[pieza.nombre] || null,
        textos,
        imagenes,
        // El contorno REAL de la pieza (no el rectángulo del bounding box)
        // -- mismas coordenadas cm que ya usan zonas/textos (geometriaDelGrupo
        // ya lo trae). Junto con bordeContraste, exportarPdf.js lo dibuja
        // como el contorno de corte para láser, desplazado hacia afuera lo
        // que pida el producto (compensación real de grosor de corte).
        contornoCm: geometria[pieza.nombre]?.vertices || null,
        bordeContraste: producto.bordeContraste || null,
      });
    }
  }

  return piezasParaAnidar;
}
