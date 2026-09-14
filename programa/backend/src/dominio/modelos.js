// Modelo de dominio reinterpretado (no traducido) de UNIFLOW/Illustrator.
// Cada forma documenta el invariante que protege, no solo los campos.

/**
 * Pieza: vive en una BIBLIOTECA, no dentro de un grupo — un Grupo la
 * REFERENCIA (GrupoPieza.piezaId), nunca la copia. Si se resube la geometría
 * de una pieza, todo grupo que la usa ve el cambio al instante (reciclaje
 * real de piezas entre prendas, ej. "misma remera, otro cuello").
 *
 * La geometría real (poligonoMm) es la forma verdadera de la pieza, extraída
 * de un DXF o un PDF con capas (una capa por talla) — nunca se deriva
 * ancho×alto sin ella. dimensionesPorTalla se calcula A PARTIR del bounding
 * box de esa geometría, no al revés; se guarda aparte solo porque
 * motor/anclaje/ y nesting.js ya trabajan con cm planos.
 *
 * @typedef {Object} Pieza
 * @property {string} id
 * @property {string} nombre                          ej. "Espalda", "Manga izquierda"
 * @property {string} [categoria]                     libre (ej. "Delantero", "Manga", "Cuello") -- solo
 *                                                     para filtrar/agrupar en la biblioteca, no un enum
 * @property {number[]} angulosPermitidos              ej. [0, 180] — nunca se asume, lo elige el usuario
 * @property {string} [tela]                           tela por defecto de esta pieza
 * @property {string} [archivoOriginal]                URL en Supabase Storage del DXF/PDF subido -- UNO
 *                                                      por Pieza (todas sus tallas salen del mismo archivo),
 *                                                      nunca el archivo embebido (ver almacen.js)
 * @property {'dxf'|'pdf'} [formatoOriginal]
 * @property {Record<string, {
 *   poligonoMm: [number, number][],
 *   boundingBoxMm: { anchoMm: number, altoMm: number },
 *   piquetesMm?: { xMm: number, yMm: number, anchoMm: number, altoMm: number }[],
 *   salientesMm?: { xMm: number, yMm: number, esquina: boolean }[],
 *   validadoPorUsuario: boolean
 * }>} geometriaPorTalla  piquetesMm: trazos sueltos DE MENOS de 2.5cm reales
 *   en la misma capa que el contorno + muescas PEGADAS al propio contorno
 *   (geometriaComun.js·contornoYPiquetesDeTrazos, geometriaSalientes.js·
 *   piquetesPegadosDe) -- por su CENTRO, no por su esquina. salientesMm: los
 *   "giros" del contorno -- esquinas y vueltas suaves (geometriaSalientes.js·
 *   puntosNotablesDe)
 * @property {Record<string, {anchoCm: number, altoCm: number}>} dimensionesPorTalla  derivado de geometriaPorTalla, en cm
 * @property {number} version                          empieza en 1, sube cada vez que cambia la geometría
 * @property {VersionPieza[]} versiones                 historial COMPLETO (incluida la actual, versiones[length-1])
 * @property {boolean} [tallaUnica]                     marca EXPLÍCITA del usuario (checkbox en Piezas.jsx) --
 *   nunca se infiere de "tiene una sola talla cargada": una pieza a mitad de
 *   cargar sus tallas (PUT /piezas/:id/tallas/:talla de a una) también tiene
 *   una sola talla en ese momento sin ser talla única de verdad. Solo con
 *   esto en true, motor/resolverPedido.js·tallaRealDePieza usa la única
 *   geometría cargada para cualquier talla que pida un pedido.
 */

/**
 * VersionPieza: una foto de la geometría de una Pieza en un momento dado.
 * `geometriaPorTalla`/`dimensionesPorTalla` de arriba en Pieza SIEMPRE son
 * los de la última entrada -- ningún lector existente (Grupo, Plantilla,
 * nesting sin Producto) necesita saber que esto existe. Un Producto puede
 * fijarse a propósito a una versión vieja (Producto.versionesPiezas) para no
 * verse afectado cuando la pieza se corrige más adelante -- ver
 * rutas/api.js y dominio/resolverGrupo.js·resolverPiezasDeGrupo().
 *
 * @typedef {Object} VersionPieza
 * @property {number} version
 * @property {Record<string, Object>} geometriaPorTalla
 * @property {Record<string, {anchoCm: number, altoCm: number}>} dimensionesPorTalla
 * @property {string} [archivoOriginal]
 * @property {'dxf'|'pdf'} [formatoOriginal]
 * @property {string} creadoEn      ISO 8601
 * @property {string} [motivo]      libre, ej. "Reprocesado", "Molde reemplazado", "Talla M corregida"
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
 * Anclaje: el grafo de anclas y zonas de un Producto -- puerto FIEL del
 * sistema de zonas/anclajes de UNIFLOW/Illustrator (motor/anclaje/, portado
 * línea por línea desde programa/cerebro/src/anclaje/ del panel; ver los
 * comentarios de esos archivos para el porqué de cada regla). La idea
 * central, tal cual la pedía el enunciado original: "no guardar
 * posiciones, guardar relaciones que permitan reconstruirlas" -- así una
 * zona sigue en el mismo lugar relativo al gradar de talla, en vez de
 * quedar pegada en centímetros fijos.
 *
 * Una Ancla es un punto: cada eje (x, y) tiene su propia Referencia (a qué
 * rasgo real de la pieza se agarra) y un modo fijo/proporcional. Una Zona
 * es una caja anclada a una o dos Anclas (dos = "la X de una, la Y de la
 * otra", la intersección del punto 7 del enunciado original).
 *
 * `campoPedido` y `valorFijo` son la ÚNICA parte de esto que NO viene del
 * puerto: motor/anclaje/resolver.js deliberadamente no sabe qué es un
 * pedido (es aritmética pura), así que qué dato de la línea de pedido llena
 * cada zona ("nombre" | "numero" | "fijo") vive acá, al lado, y
 * resolverPedido.js lo lee del anclaje crudo por id -- nunca se le agregó
 * ese campo al motor portado para no dejar de ser un puerto fiel.
 *
 * @typedef {Object} Referencia
 * @property {'contorno'|'extremo'|'vertice'|'saliente'|'piquete'|'zona'|'ancla'} tipo
 * @property {string} [pieza]      si falta, la propia pieza del nodo que la usa
 * @property {string} [parte]      'centro'|'arriba'|'abajo'|'izquierda'|'derecha'|'supIzq'|'supDer'|'infIzq'|'infDer'
 * @property {number} [indice]     para 'vertice'/'saliente'/'piquete'
 * @property {number} [puntos]     huella: nº de vértices al crear el ancla ('vertice')
 * @property {number} [total]      huella: nº de salientes/piquetes al crear el ancla
 * @property {number} [rx]         posición relativa (0-1) del rasgo en la pieza, para reemparejar si cambia la cuenta
 * @property {number} [ry]
 * @property {string} [zona]       id de la zona referenciada ('zona')
 * @property {string} [ancla]      id del ancla referenciada ('ancla')
 *
 * @typedef {Object} Eje
 * @property {Referencia} ref
 * @property {'fijo'|'proporcional'} modo
 * @property {number} valor        cm si es fijo, fracción (0.2 = 20%) si es proporcional
 * @property {'pieza'|'referencia'} [base]   contra qué dimensión se mide lo proporcional
 *
 * @typedef {Object} Ancla
 * @property {string} id
 * @property {string} [nombre]
 * @property {string} pieza        rol de GrupoPieza al que pertenece
 * @property {Eje} x
 * @property {Eje} y
 *
 * @typedef {Object} Zona
 * @property {string} id
 * @property {string} [nombre]
 * @property {string} [grupo]      id libre, puede repetirse (varias zonas sincronizadas, ej. un sponsor en 2 piezas)
 * @property {string} pieza
 * @property {'texto'|'numero'|'logo'} tipo
 * @property {string} anclaX
 * @property {string} anclaY       igual a anclaX si la zona cuelga de un solo punto
 * @property {'esquina'|'medio'} [modoCruce]   con dos anclas distintas: qué punto se usa
 * @property {number|{modo:'fijo'|'proporcional',valor:number}} [ancho]
 * @property {number|{modo:'fijo'|'proporcional',valor:number}} [alto]
 * @property {number|{modo:'fijo'|'proporcional',valor:number}} [lado]   solo tipo 'logo' con cruz activa
 * @property {boolean} [cruz]      solo tipo 'logo': cruz de 2 medidas vs. rectángulo con ancho/alto propios
 * @property {'centro'|'supIzq'|'supDer'|'infIzq'|'infDer'|'centroArriba'|'centroAbajo'|'centroIzq'|'centroDer'} [origen]
 * @property {{x:number|object, y:number|object}} [offset]   desplazamiento posterior, fijo o proporcional
 * @property {Object} [muestra]    contenido de vista previa al materializar (no se usa en producción)
 * @property {string} [logoRuta]
 * @property {'nombre'|'numero'|'fijo'} [campoPedido]   propio de UNIFLOW WEB, ver arriba
 * @property {string} [valorFijo]  solo si campoPedido === 'fijo'
 * @property {string} [valorEjemplo]  solo para previsualizar en el editor, nunca se produce con esto
 * @property {string} [colorHex]
 *
 * @typedef {Object} Anclaje
 * @property {number} [version]
 * @property {Ancla[]} anclas
 * @property {Zona[]} zonas
 */

/**
 * Producto: unión de uno o más grupos (piezas reales), un diseño y el
 * Anclaje (dónde va cada nombre/número/logo y con qué tamaño, gradando por
 * talla) -- todo editado en una sola pantalla (`paginas/Productos.jsx`), no
 * en dos pasos separados.
 *
 * `grupoIds` (Entrega 2, productos multi-prenda -- "kit": camiseta + short
 * + medias en un solo armado) reemplaza al viejo `grupoId` singular. Los
 * Productos guardados ANTES de esta entrega solo tienen `grupoId` -- nunca
 * se migró data, así que todo lector real normaliza con
 * `producto.grupoIds || [producto.grupoId]` (ver motor/resolverPedido.js).
 * Con más de un grupo, el rol de cada pieza se namespacea internamente
 * como `grupoId::rol` (dominio/resolverGrupo.js·resolverPiezasDeGrupos) --
 * necesario porque dos prendas distintas pueden compartir un nombre de rol
 * por casualidad (dos "Delantero"), y el resto del motor de anclaje usa ese
 * nombre como clave plana. Con UN solo grupo (el caso de siempre) el rol
 * queda crudo, sin namespace, IDÉNTICO a como lo grabó cualquier Producto
 * ya guardado -- por eso ese caso nunca namespacea.
 *
 * @typedef {Object} Producto
 * @property {string} id
 * @property {string} nombre
 * @property {string} [grupoId]    LEGACY -- un producto de una sola prenda, de antes de grupoIds
 * @property {string[]} [grupoIds] uno o más grupos combinados -- ver el comentario de arriba
 * @property {string} disenoId
 * @property {Anclaje} anclaje
 * @property {{activo: boolean, colorHex: string, grosorCm: number}} [bordeContraste]
 *   contorno del molde por encima del diseño recortado, para no perder los
 *   piquetes bajo el arte -- opcional, grosor real en cm (default 0.03)
 * @property {Record<string, number>} [versionesPiezas]  piezaId -> número de
 *   VersionPieza al que este producto queda fijado. Sin entrada para una
 *   pieza = sigue la versión ACTUAL de esa pieza (comportamiento de
 *   siempre). Se llena por decisión explícita del usuario cuando una pieza
 *   que este producto usa se actualiza en Biblioteca -- nunca automático.
 */

/**
 * Diseño: el arte real de una prenda (o de un kit combinado), una imagen
 * por pieza -- se reusa entre varios Productos de la misma prenda/kit
 * (ej. el mismo diseño para varios clientes de un mismo equipo).
 *
 * `grupoIds` sigue el mismo namespacing que Producto.grupoIds: con más de
 * un grupo, las claves de `imagenesPorPieza` son `grupoId::rol`; con uno
 * solo, el rol queda crudo. Un Diseño solo es elegible para un Producto si
 * sus `grupoIds` coinciden EXACTO con los del producto (mismo conjunto,
 * mismo kit) -- un diseño armado para "camiseta + short" no le sirve a un
 * producto de solo "camiseta".
 *
 * @typedef {Object} Diseno
 * @property {string} id
 * @property {string} nombre
 * @property {string} [grupoId]     LEGACY, igual que Producto.grupoId
 * @property {string[]} [grupoIds]  ver el comentario de arriba
 * @property {Record<string, string>} imagenesPorPieza  rol (o grupoId::rol) -> URL de Storage
 */

/**
 * Plantilla: la configuración de zonas de un Producto SIN contenido real
 * (valorFijo/logoRuta/valorEjemplo vacíos) más la prenda a la que está
 * atada -- para arrancar un Producto nuevo con el anclaje ya armado en vez
 * de rehacerlo cada vez, en prendas que se repiten mucho. A diferencia de un
 * Producto guardado, una Plantilla NO fija versión de pieza: siempre usa la
 * geometría actual (mismo comportamiento que un Grupo), a propósito -- son
 * los Productos ya entregados a un cliente puntual los que necesitan
 * quedarse quietos, no las plantillas para los próximos.
 *
 * @typedef {Object} Plantilla
 * @property {string} id
 * @property {string} nombre
 * @property {string} [grupoId]     LEGACY, igual que Producto.grupoId
 * @property {string[]} [grupoIds]  ver el comentario en Producto
 * @property {Anclaje} anclaje
 * @property {{activo: boolean, colorHex: string, grosorCm: number}} [bordeContraste]
 * @property {string} creadoEn   ISO 8601
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
