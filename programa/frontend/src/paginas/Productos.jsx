import { campoDeZona } from '../utilidades/campoDeZona.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  crearDiseno,
  editarDiseno,
  eliminarDiseno,
  crearProducto,
  editarProducto,
  eliminarProducto,
  crearPlantilla,
  eliminarPlantilla,
  resolverAnclaje,
  subirArchivo,
  editarGrupo,
} from '../api.js';
import { obtener, confirmarGuardado, borrarRegistro } from '../datos/index.js';
import { conjuntoDeZona, importarConjunto } from '../utilidades/conjuntosZonas.js';
import { ordenarTallasNatural } from '../constantes.js';
import { Boton, Campo, Input, Select, Tarjeta, Chip, Aviso, Ayuda, ErrorCarga } from '../componentes/ui.jsx';
import { InputNumero } from '../componentes/InputNumero.jsx';
import { textoDeTalla, COLOR_TALLA, escalaDentroDelMolde } from '../utilidades/capsulaTalla.js';
import { PanelDock } from '../componentes/PanelDock.jsx';
import { PanelTexto } from '../componentes/PanelTexto.jsx';
import { PanelAjusteArte } from '../componentes/PanelAjusteArte.jsx';
import { PanelFondo } from '../componentes/PanelFondo.jsx';
import { PanelLadoPar } from '../componentes/PanelLadoPar.jsx';
import { espejarGeometriaPorTalla, claveDelOtroLado } from '../utilidades/espejoPieza.js';
import { TarjetaProduccion } from '../componentes/TarjetaProduccion.jsx';
import { ordenarPorReciente } from '../utilidades/producciones.js';

// Diseño muestra solo las producciones más recientes; todas están en
// Producción → Producciones (Producciones.jsx).
const RECIENTES = 6;
import { normalizarAjusteArte, anclasDeCalce, conCalceResuelto, idAnclaDeCalce } from '../utilidades/colocarArte.js';
import {
  firmaEditor, haySinGuardar, puedeGuardarseSolo, guardarBorrador, leerBorrador, borrarBorrador, borradorParaOfrecer, haceCuanto,
} from '../utilidades/borradorDiseno.js';
import { LienzoAnclaje, COLOR, candidatosDe } from '../componentes/LienzoAnclaje.jsx';
import { geometriaParaAnclaje, describirReferencia } from '../utilidades/geometriaAnclaje.js';

const BORDE_POR_DEFECTO = { activo: false, colorHex: '#000000', grosorCm: 0.03, desplazamientoCm: 0 };
// Un producto guardado tal como lo pone el editor al abrirlo (prenda vieja
// suelta, sin borde guardado...): así abrirlo no cuenta como un cambio.
function estadoDeProducto(p) {
  return {
    nombre: p.nombre || '',
    grupoIds: p.grupoIds || (p.grupoId ? [p.grupoId] : []),
    disenoId: p.disenoId || '',
    anclaje: p.anclaje || { anclas: [], zonas: [] },
    bordeContraste: p.bordeContraste || BORDE_POR_DEFECTO,
    ladosPropios: p.ladosPropios || {},
  };
}
const LEYENDA_POR_DEFECTO = { piquetes: true, extremos: true, bordes: true, vertices: false, zonas: true };
const ORIGENES_ZONA = [
  ['centro', 'el centro de la zona'], ['supIzq', 'su esquina de arriba a la izquierda'],
  ['supDer', 'su esquina de arriba a la derecha'], ['infIzq', 'su esquina de abajo a la izquierda'],
  ['infDer', 'su esquina de abajo a la derecha'], ['centroArriba', 'el centro de su borde de arriba'],
  ['centroAbajo', 'el centro de su borde de abajo'], ['centroIzq', 'el centro de su borde izquierdo'],
  ['centroDer', 'el centro de su borde derecho'],
];

// ============================================================
// EL APARTADO DE ANCLAJE -- puerto fiel de programa/panel (Illustrator)
// ============================================================
// El usuario fue explícito: esto tiene que funcionar IGUAL que el panel de
// Illustrator (programa/panel/index.html "Anclajes" + js/main.js), no una
// reinterpretación -- se leyó ese código real antes de escribir esto. Lo
// único que cambia a propósito es la disposición: el panel CEP es angosto
// (420px) y todo va apilado; acá hay espacio de sobra, así que es lienzo a
// un lado y el panel de propiedades al otro, en vez de uno debajo del otro.
//
// La idea central, tal cual la explica el propio "?" del panel real: NO se
// guarda dónde está cada cosa, se guarda POR QUÉ está ahí. Un ancla es un
// punto pegado a un rasgo real de la pieza (un piquete, un vértice, el
// contorno, u otra zona ya resuelta); una zona cuelga de una o dos anclas.
// El backend (motor/anclaje/) resuelve esas relaciones contra la geometría
// real de la talla que se esté mirando.

function medida(valor) {
  return { modo: 'fijo', valor: valor ?? 0 };
}

// Mismos nombres cortos que el panel real (A1, A2… / ZONA_1, ZONA_2…) en
// vez de un UUID: son lo que el usuario lee al elegir "Ancla X" en una zona,
// o al ver el punto en el lienzo.
function idLibre(prefijo, lista) {
  for (let n = 1; n < 999; n++) {
    const candidato = prefijo + n;
    if (!lista.some((x) => x.id === candidato)) return candidato;
  }
  return prefijo + Date.now();
}

function tallaDeTrabajoPorDefecto(pieza) {
  const tallas = ordenarTallasNatural(Object.keys(pieza?.dimensionesPorTalla || {}));
  if (tallas.length === 0) return null;
  const conL = tallas.find((t) => t.toUpperCase() === 'L');
  return conL || tallas[Math.floor((tallas.length - 1) / 2)];
}

function etiquetaZona(zona) {
  if (zona.tipo === 'logo') return zona.logoRuta ? 'Logo · ' + nombreDeArchivo(zona.logoRuta) : 'Logo (sin elegir)';
  const campo = campoDeZona(zona);
  if (campo === 'fijo') return zona.valorFijo || zona.id;
  if (campo === 'talla') return 'Talla';
  // Con ejemplo cargado, el rótulo ES el ejemplo (sin prefijo "Nombre · ");
  // sin él, queda el nombre del campo para identificar la zona vacía.
  if (campo === 'numero') return zona.valorEjemplo || 'Número';
  return zona.valorEjemplo || 'Nombre';
}

function nombreDeArchivo(url) {
  try { return decodeURIComponent(url.split('/').pop()); } catch { return url; }
}

// Lo único que una Plantilla NO guarda: el contenido real de cada zona
// (dominio/modelos.js·Plantilla). campoPedido/tipo/tamaño/posición quedan
// intactos -- es justamente eso lo que ahorra rearmar la próxima vez.
function anclajeSinContenido(anclajeOriginal) {
  return {
    ...anclajeOriginal,
    zonas: (anclajeOriginal.zonas || []).map((z) => ({ ...z, valorFijo: '', logoRuta: null, logoVista: null, valorEjemplo: '' })),
  };
}

// Para el selector de zonas del panel: el nombre asignado + qué tipo de
// contenido lleva -- nunca el nombre del archivo del logo (a veces larguísimo,
// y ya se ve en el propio selector de logo cuando la zona está abierta).
function tipoCortoDeZona(z) {
  if (z.tipo === 'logo') return 'Logo';
  const campo = campoDeZona(z);
  if (campo === 'fijo') return 'Texto fijo';
  if (campo === 'talla') return 'Talla';
  if (campo === 'numero') return 'Número';
  return 'Nombre';
}

// Un Diseño solo es elegible para un producto si combina EXACTO las mismas
// prendas (mismo conjunto de grupoIds, sin importar el orden) -- un diseño
// armado para "camiseta + short" no le sirve a un producto de solo
// "camiseta", ni a uno de "camiseta + medias".
function mismoConjunto(a, b) {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((x) => setB.has(x));
}

// Mismo color que usan los candidatos en el lienzo (LienzoAnclaje·COLOR) --
// que el texto de "se pega a" sea del mismo color que el punto real en el
// lienzo es lo que reemplaza a la lista desplegable: se entiende de un
// vistazo sin tener que leer.
function colorDeReferencia(ref) {
  if (!ref) return undefined;
  switch (ref.tipo) {
    case 'piquete': return COLOR.piquete;
    case 'extremo': case 'saliente': return COLOR.extremo;
    case 'zona': return COLOR.zona;
    case 'vertice': return COLOR.vertice;
    case 'contorno': return COLOR.caja;
    default: return undefined;
  }
}

export function Productos({ recargarSenal, onCambio, plantillaParaUsar, onConsumirPlantilla, produccionParaEditar, onConsumirProduccion, onVerTodas }) {
  const [grupos, setGrupos] = useState([]);
  const [disenos, setDisenos] = useState([]);
  const [productos, setProductos] = useState([]);
  const [piezas, setPiezas] = useState([]);
  const [fuentes, setFuentes] = useState([]);
  const [nombre, setNombre] = useState('');
  // grupoIds: uno o más -- productos multi-prenda ("kit": camiseta + short
  // + medias en un solo armado). Un solo elemento es el caso de siempre.
  const [grupoIds, setGrupoIds] = useState([]);
  const [disenoId, setDisenoId] = useState('');
  const [anclaje, setAnclaje] = useState({ anclas: [], zonas: [] });
  // Piezas "en par" (marcadas en la prenda) cuyo OTRO LADO lleva diseño
  // propio en esta producción: clave del rol -> true. Sin marca, el otro
  // lado lleva lo mismo que su par. Ver PanelLadoPar.
  const [ladosPropios, setLadosPropios] = useState({});
  const [piezaActiva, setPiezaActiva] = useState(null);
  const [tallaTrabajoPorRol, setTallaTrabajoPorRol] = useState({});
  const [bordeContraste, setBordeContraste] = useState(BORDE_POR_DEFECTO);
  const [leyenda, setLeyenda] = useState(LEYENDA_POR_DEFECTO);
  const [seleccion, setSeleccion] = useState(null); // { tipo: 'ancla'|'zona', id }
  const [modo, setModo] = useState(null); // null | 'zona' | 'cruzar' | 'recolocar' | 'calceArte' | 'calceDestino'
  // Puntos de calce del arte: cuál se está enganchando al molde, y si al marcar uno se crea su espejo.
  const [calceDestinoId, setCalceDestinoId] = useState(null);
  const [calceEspejo, setCalceEspejo] = useState(true);
  const [calceResuelto, setCalceResuelto] = useState({}); // id de ancla de calce -> {x, y}
  const [cruzandoZonaId, setCruzandoZonaId] = useState(null);
  const [recolocarInfo, setRecolocarInfo] = useState(null); // { anclaId, eje }
  const [resuelto, setResuelto] = useState(null);
  const [error, setError] = useState(null);
  // Con id, el formulario de arriba (el mismo que arma uno nuevo) está
  // editando ESE producto -- ver cargarParaEditar()/guardar(). Mismo
  // mecanismo que ya existía para "Usar esta plantilla" (el useEffect de
  // plantillaParaUsar más abajo): hidratar grupoIds/anclaje/disenoId en el
  // mismo estado que ya maneja el lienzo, no un editor aparte.
  const [editandoId, setEditandoId] = useState(null);
  // Guardado (ver más abajo, "Guardado automático"): huella de lo que está
  // en el servidor (null = producto nuevo que nunca se guardó) y cómo va.
  const [firmaGuardada, setFirmaGuardada] = useState(null);
  const [estadoGuardado, setEstadoGuardado] = useState(null); // null | 'pendiente' | 'guardando' | 'guardado' | 'error'
  const [guardadoEn, setGuardadoEn] = useState(null);
  const [borradorOfrecido, setBorradorOfrecido] = useState(null);

  // El diseño ya no se arma en un panel aparte: se suelta la imagen sobre el
  // molde (LienzoAnclaje·onSoltarImagen) y queda en el diseño de este
  // producto -- ver ponerImagenEnPieza().
  const [subiendoImagen, setSubiendoImagen] = useState(false);
  const [errorDiseno, setErrorDiseno] = useState(null);
  const [nombreDiseno, setNombreDiseno] = useState('');
  // Conjuntos de zonas guardados (plantillas con tipo 'conjuntoZonas', ver
  // utilidades/conjuntosZonas.js) y el que se está por pegar en la pieza.
  const [conjuntos, setConjuntos] = useState([]);
  const [mostrandoConjuntos, setMostrandoConjuntos] = useState(false);
  const [conjuntoAImportar, setConjuntoAImportar] = useState(null);
  // Ver el comentario igual en Piezas.jsx -- acá el caso era el peor de
  // los cinco: sin esto, la primera visita mostraba "Creá primero una
  // prenda (Piezas → Prendas)" mientras el fetch seguía en vuelo, aunque
  // el usuario YA tuviera prendas armadas -- le decía que le faltaba algo
  // que en realidad ya tenía.
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(null);

  async function recargar() {
    setCargando(true);
    setErrorCarga(null);
    try {
      const [gs, ds, ps, pzs] = await Promise.all([obtener('grupos'), obtener('disenos'), obtener('productos'), obtener('piezas')]);
      setGrupos(gs);
      setDisenos(ds);
      setProductos(ps);
      setPiezas(pzs);
      if (gs.length > 0 && grupoIds.length === 0) setGrupoIds([gs[0].id]);
      // Nunca puede tumbar la carga de esta pantalla entera por faltar la
      // tabla `fuentes` (recién agregada) -- sin ella, el selector de
      // fuente de cada zona simplemente no tiene más opción que la de base.
      setFuentes(await obtener('fuentes').catch(() => []));
      const plantillas = await obtener('plantillas').catch(() => []);
      setConjuntos(plantillas.filter((p) => p.tipo === 'conjuntoZonas'));
    } catch (e) {
      setErrorCarga(e.message);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recargarSenal]);

  // "Usar esta plantilla" (Plantillas.jsx, vía App.jsx) precarga esta
  // pantalla con una configuración de zonas ya armada -- se consume UNA
  // sola vez (se avisa a App.jsx apenas se aplica, que limpia el dato
  // compartido) para no volver a pisar lo que el usuario esté armando si
  // reentra a Diseño más tarde sin haber elegido otra plantilla.
  useEffect(() => {
    if (!plantillaParaUsar) return;
    setEditandoId(null);
    setFirmaGuardada(null);
    setNombre('');
    setGrupoIds(plantillaParaUsar.grupoIds || (plantillaParaUsar.grupoId ? [plantillaParaUsar.grupoId] : []));
    setAnclaje(plantillaParaUsar.anclaje || { anclas: [], zonas: [] });
    setLadosPropios(plantillaParaUsar.ladosPropios || {});
    if (plantillaParaUsar.bordeContraste) setBordeContraste(plantillaParaUsar.bordeContraste);
    setDisenoId('');
    setSeleccion(null);
    setModo(null);
    setTallaTrabajoPorRol({});
    onConsumirPlantilla?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plantillaParaUsar]);

  const gruposSeleccionados = grupoIds.map((id) => grupos.find((g) => g.id === id)).filter(Boolean);
  // Namespacear la clave de pieza (grupoId::rol) SOLO con más de una prenda
  // combinada -- con una sola, la clave sigue siendo el rol crudo, igual
  // que siempre (mismo criterio que dominio/resolverGrupo.js·
  // resolverPiezasDeGrupos, así el anclaje que arma este editor coincide
  // exacto con cómo lo va a leer producción).
  const namespacear = gruposSeleccionados.length > 1;
  const piezasDisponibles = gruposSeleccionados.flatMap((g) =>
    g.piezas.flatMap((gp) => {
      const clave = namespacear ? g.id + '::' + gp.rol : gp.rol;
      const base = { clave, rol: gp.rol, grupoId: g.id, grupoNombre: g.nombre, piezaId: gp.piezaId, par: !!gp.par };
      if (!gp.par || !ladosPropios[clave]) return [base];
      // El otro lado de una pieza en par, con diseño propio: no existe en la
      // Biblioteca -- es la misma pieza reflejada (mismo cálculo que el servidor).
      return [base, { ...base, clave: claveDelOtroLado(clave), rol: gp.rol + ' (otro lado)', ladoDe: clave, rolOriginal: gp.rol }];
    })
  );
  const disenosDeEstaCombinacion = disenos.filter((d) => mismoConjunto(d.grupoIds || (d.grupoId ? [d.grupoId] : []), grupoIds));
  const disenoSeleccionado = disenos.find((d) => d.id === disenoId);

  const espejadasRef = useRef(new WeakMap());
  function piezaDeClave(clave) {
    const pd = piezasDisponibles.find((x) => x.clave === clave);
    const pieza = pd && piezas.find((p) => p.id === pd.piezaId);
    if (!pieza || !pd.ladoDe) return pieza;
    if (!espejadasRef.current.has(pieza)) {
      espejadasRef.current.set(pieza, { ...pieza, geometriaPorTalla: espejarGeometriaPorTalla(pieza.geometriaPorTalla) });
    }
    return espejadasRef.current.get(pieza);
  }
  function tallaTrabajoDe(clave) {
    return tallaTrabajoPorRol[clave] ?? tallaDeTrabajoPorDefecto(piezaDeClave(clave));
  }

  // Elige la primera pieza sola cuando cambia la combinación de prendas (o al entrar).
  useEffect(() => {
    if (piezasDisponibles.length === 0) { setPiezaActiva(null); return; }
    if (!piezasDisponibles.some((pd) => pd.clave === piezaActiva)) {
      setPiezaActiva(piezasDisponibles[0].clave);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(grupoIds), piezasDisponibles.length]);

  // Qué pieza usa cada rol (ej. un rol que pasó a usar su espejo): si cambia, se resuelve de nuevo.
  const firmaPiezasDeGrupos = JSON.stringify(gruposSeleccionados.map((g) => g.piezas)) + JSON.stringify(ladosPropios);
  // Resuelve el grafo entero contra la geometría real -- aritmética pura,
  // se pide de nuevo cada vez que algo cambia, nada se guarda para verlo.
  useEffect(() => {
    if (grupoIds.length === 0 || piezasDisponibles.length === 0) { setResuelto(null); return; }
    const tallaPorRol = {};
    for (const pd of piezasDisponibles) {
      const t = tallaTrabajoDe(pd.clave);
      if (t) tallaPorRol[pd.clave] = t;
    }
    if (Object.keys(tallaPorRol).length === 0) { setResuelto(null); return; }
    let cancelado = false;
    resolverAnclaje(grupoIds, tallaPorRol, anclaje)
      .then((r) => { if (!cancelado) setResuelto(r); })
      .catch((e) => { if (!cancelado) setResuelto({ errores: [e.message], avisos: [], sinResolver: [], lista: { anclas: [], zonas: [] } }); });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(grupoIds), JSON.stringify(tallaTrabajoPorRol), JSON.stringify(anclaje), piezas.length,
    firmaPiezasDeGrupos]);


  // Elegir/sacar una prenda de la combinación reinicia el anclaje en curso
  // -- combinar otras prendas cambia qué claves existen (namespace incluido),
  // así que cualquier ancla/zona ya armada quedaría apuntando a algo que ya
  // no es lo mismo. Mismo criterio que ya tenía el selector simple de antes.
  function alternarGrupo(id) {
    if ((anclaje.zonas.length > 0 || anclaje.anclas.length > 0) &&
        !window.confirm('Cambiar las prendas de la producción borra las ' + anclaje.zonas.length + ' zona(s) que armaste (quedan apuntando a otras piezas). ¿Seguir?')) {
      return;
    }
    setGrupoIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setAnclaje({ anclas: [], zonas: [] });
    setLadosPropios({});
    setSeleccion(null);
    setModo(null);
    setDisenoId('');
    setTallaTrabajoPorRol({});
  }

  // El nombre del diseño se edita en su campo y se guarda al salir de él.
  useEffect(() => { setNombreDiseno(disenoSeleccionado?.nombre || ''); }, [disenoSeleccionado?.id, disenoSeleccionado?.nombre]);

  function guardarDisenoLocal(diseno) {
    confirmarGuardado('disenos', diseno);
    setDisenos((prev) => (prev.some((d) => d.id === diseno.id) ? prev.map((d) => (d.id === diseno.id ? diseno : d)) : [...prev, diseno]));
  }

  // Soltar una imagen sobre el molde: se sube a Storage y queda como el arte
  // de ESTA pieza en el diseño del producto. Sin diseño elegido, se crea uno
  // nuevo para esta combinación de prendas (con un nombre que se puede
  // cambiar después); con uno elegido, se le suma o reemplaza esta pieza.
  async function ponerImagenEnPieza(archivo, motivoRechazo) {
    setErrorDiseno(null);
    if (!archivo) { setErrorDiseno(motivoRechazo || 'Ese archivo no es una imagen PNG, JPG ni un PDF.'); return; }
    if (!piezaActiva) return;
    const clave = piezaActiva;
    setSubiendoImagen(true);
    try {
      // Un PDF (vectorial) se guarda TAL CUAL -- es lo que va al PDF de
      // producción -- y además una vista en PNG para poder verlo acá.
      const esPdf = archivo.type === 'application/pdf';
      let urlVista = null;
      if (esPdf) {
        const { vistaDePdf } = await import('../utilidades/vistaPdf.js');
        let vista;
        try { vista = await vistaDePdf(archivo); }
        catch (e) { throw new Error('No se pudo leer el PDF (' + e.message + '). ¿Está protegido o dañado?'); }
        urlVista = await subirArchivo(vista.blob, 'image/png', 'diseno-vista-' + clave);
        if (vista.paginas > 1) setErrorDiseno('El PDF tiene ' + vista.paginas + ' páginas: se usa solo la primera.');
      }
      const url = await subirArchivo(archivo, archivo.type, 'diseno-' + clave);
      const vistasNuevas = (vistas) => {
        const r = { ...(vistas || {}) };
        if (urlVista) r[clave] = urlVista; else delete r[clave];
        return r;
      };
      if (disenoSeleccionado) {
        const actualizado = await editarDiseno(disenoSeleccionado.id, {
          imagenesPorPieza: { ...(disenoSeleccionado.imagenesPorPieza || {}), [clave]: url },
          vistasPorPieza: vistasNuevas(disenoSeleccionado.vistasPorPieza),
        });
        guardarDisenoLocal(actualizado);
      } else {
        const nombrePrendas = gruposSeleccionados.map((g) => g.nombre).join(' + ');
        const creado = await crearDiseno({
          nombre: 'Diseño ' + (nombre.trim() || nombrePrendas || 'nuevo'),
          grupoIds,
          imagenesPorPieza: { [clave]: url },
          vistasPorPieza: vistasNuevas(null),
        });
        guardarDisenoLocal(creado);
        setDisenoId(creado.id);
      }
    } catch (e) {
      setErrorDiseno(e.message);
    } finally {
      setSubiendoImagen(false);
    }
  }

  // "⇋ Espejo": la pieza activa va en par (x2, ella y su espejo) y su otro
  // lado lleva el mismo diseño o uno propio -- sin crear piezas. Ver PanelLadoPar.
  const [espejando, setEspejando] = useState(false);
  useEffect(() => { setEspejando(false); }, [piezaActiva]);

  async function marcarParEnPrenda(grupoId, rol, par) {
    const grupo = grupos.find((g) => g.id === grupoId);
    if (!grupo) return;
    const piezasNuevas = grupo.piezas.map((gp) => (gp.rol === rol ? { ...gp, par } : gp));
    const actualizado = confirmarGuardado('grupos', await editarGrupo(grupo.id, { piezas: piezasNuevas }));
    setGrupos((prev) => prev.map((g) => (g.id === actualizado.id ? actualizado : g)));
    onCambio?.();
  }
  // `pd` = la pieza original (no el otro lado). propio: el otro lado lleva diseño propio.
  async function elegirOtroLado(pd, propio) {
    if (!pd.par) await marcarParEnPrenda(pd.grupoId, pd.rol, true);
    setLadosPropios((prev) => {
      const r = { ...prev };
      if (propio) r[pd.clave] = true; else delete r[pd.clave];
      return r;
    });
    if (propio) setPiezaActiva(claveDelOtroLado(pd.clave));
    else if (piezaActiva === claveDelOtroLado(pd.clave)) setPiezaActiva(pd.clave);
    setEspejando(false);
  }
  async function quitarPar(pd) {
    await marcarParEnPrenda(pd.grupoId, pd.rol, false);
    setLadosPropios((prev) => { const r = { ...prev }; delete r[pd.clave]; return r; });
    setPiezaActiva(pd.clave);
    setEspejando(false);
  }

  async function quitarImagenDePieza(clave) {
    if (!disenoSeleccionado) return;
    const { [clave]: _quitada, ...resto } = disenoSeleccionado.imagenesPorPieza || {};
    const { [clave]: _ajuste, ...restoAjustes } = disenoSeleccionado.ajusteArtePorPieza || {};
    const { [clave]: _vista, ...restoVistas } = disenoSeleccionado.vistasPorPieza || {};
    try {
      guardarDisenoLocal(await editarDiseno(disenoSeleccionado.id, { imagenesPorPieza: resto, ajusteArtePorPieza: restoAjustes, vistasPorPieza: restoVistas }));
      setAjusteArteLocal((prev) => { const { [clave]: _x, ...r } = prev; return r; });
    } catch (e) { setErrorDiseno(e.message); }
  }

  // ---- Ajuste del arte (escala/alineación/corrimiento) --------------------
  // Se ve al instante (estado local) y se guarda en el diseño medio segundo
  // después del último cambio, para no mandar una petición por cada paso
  // del deslizador.
  const [ajusteArteLocal, setAjusteArteLocal] = useState({}); // clave -> ajuste | null, aún sin guardar
  const [editandoArte, setEditandoArte] = useState(false);
  const pendientesArteRef = useRef({ disenoId: null, cambios: {} });
  const temporizadorArteRef = useRef(null);
  const disenosRef = useRef(disenos);
  disenosRef.current = disenos;
  const disenoRef = useRef(disenoSeleccionado);
  disenoRef.current = disenoSeleccionado;
  // Al cambiar de diseño, lo pendiente del anterior se guarda EN ESE diseño.
  useEffect(() => {
    if (temporizadorArteRef.current) guardarAjustesArteRef.current();
    setAjusteArteLocal({});
  }, [disenoId]);

  function ajusteArteDe(clave) {
    return clave in ajusteArteLocal ? ajusteArteLocal[clave] : disenoSeleccionado?.ajusteArtePorPieza?.[clave] || null;
  }
  // Los destinos de los puntos de calce de la pieza que se mira, resueltos
  // como anclas en su talla de trabajo (aparte: un destino que no sale no
  // ensucia los errores de las zonas).
  const anclasCalceActivas = piezaActiva ? anclasDeCalce(piezaActiva, ajusteArteDe(piezaActiva)) : [];
  const firmaCalce = JSON.stringify(anclasCalceActivas);
  useEffect(() => {
    if (anclasCalceActivas.length === 0 || grupoIds.length === 0) { setCalceResuelto({}); return; }
    const tallaPorRol = {};
    for (const pd of piezasDisponibles) {
      const t = tallaTrabajoDe(pd.clave);
      if (t) tallaPorRol[pd.clave] = t;
    }
    let cancelado = false;
    resolverAnclaje(grupoIds, tallaPorRol, { ...anclaje, anclas: [...anclaje.anclas, ...anclasCalceActivas] })
      .then((r) => { if (!cancelado) setCalceResuelto(r.anclas || {}); })
      .catch(() => { if (!cancelado) setCalceResuelto({}); });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaCalce, JSON.stringify(grupoIds), JSON.stringify(tallaTrabajoPorRol), JSON.stringify(anclaje), firmaPiezasDeGrupos]);

  async function guardarAjustesArte() {
    clearTimeout(temporizadorArteRef.current);
    temporizadorArteRef.current = null;
    const { disenoId: idDiseno, cambios: pendientes } = pendientesArteRef.current;
    pendientesArteRef.current = { disenoId: null, cambios: {} };
    const diseno = disenosRef.current.find((d) => d.id === idDiseno);
    if (!diseno || Object.keys(pendientes).length === 0) return;
    const mapa = { ...(diseno.ajusteArtePorPieza || {}) };
    for (const [clave, ajuste] of Object.entries(pendientes)) {
      if (ajuste) mapa[clave] = ajuste; else delete mapa[clave];
    }
    try {
      guardarDisenoLocal(await editarDiseno(diseno.id, { ajusteArtePorPieza: mapa }));
      // Lo ya guardado deja de ser "local" (salvo que haya cambiado otra vez mientras tanto).
      setAjusteArteLocal((prev) => {
        if (disenoRef.current?.id !== idDiseno) return prev;
        const r = { ...prev };
        for (const clave of Object.keys(pendientes)) if (r[clave] === pendientes[clave]) delete r[clave];
        return r;
      });
    } catch (e) { setErrorDiseno('No se pudo guardar el ajuste del diseño: ' + e.message); }
  }
  const guardarAjustesArteRef = useRef(guardarAjustesArte);
  guardarAjustesArteRef.current = guardarAjustesArte;
  // Al salir de la pantalla, lo pendiente se guarda igual.
  useEffect(() => () => { if (temporizadorArteRef.current) guardarAjustesArteRef.current(); }, []);

  function cambiarAjusteArte(clave, ajuste) {
    if (!disenoSeleccionado) return;
    setAjusteArteLocal((prev) => ({ ...prev, [clave]: ajuste }));
    pendientesArteRef.current = {
      disenoId: disenoSeleccionado.id,
      cambios: { ...pendientesArteRef.current.cambios, [clave]: ajuste },
    };
    clearTimeout(temporizadorArteRef.current);
    temporizadorArteRef.current = setTimeout(() => guardarAjustesArteRef.current(), 500);
  }
  // ---- Fondo de color de todas las piezas (sólido/degradado) ----------------
  // Igual que el ajuste del arte: se ve al instante y se guarda en el diseño
  // un rato después del último cambio (el selector de color dispara muchos).
  // Sin diseño todavía, el primer cambio crea uno.
  //
  // Hay un fondo GENERAL (todas las piezas) y, encima, el PROPIO de cada
  // pieza que lo pida (fondoPorPieza). Cambios sin guardar, por clave:
  // GENERAL para el general; la clave de la pieza para el suyo (null = vuelve
  // a usar el general).
  const GENERAL = '*';
  const [fondosLocales, setFondosLocales] = useState({});
  const [creandoDisenoFondo, setCreandoDisenoFondo] = useState(false);
  const pendienteFondoRef = useRef({ disenoId: null, cambios: {} });
  const temporizadorFondoRef = useRef(null);
  const fondoVigente = GENERAL in fondosLocales ? fondosLocales[GENERAL] : disenoSeleccionado?.fondo || null;
  function fondoPropioDe(clave) {
    if (clave in fondosLocales) return fondosLocales[clave];
    const propios = disenoSeleccionado?.fondoPorPieza || {};
    return Object.prototype.hasOwnProperty.call(propios, clave) ? propios[clave] : null;
  }
  // Lo que de verdad lleva la pieza (lo que se ve en el lienzo).
  function fondoEfectivoDe(clave) {
    const propio = fondoPropioDe(clave);
    return propio !== null ? propio : fondoVigente;
  }
  function cambiosAlDiseno(diseno, cambios) {
    const datos = {};
    if (GENERAL in cambios) datos.fondo = cambios[GENERAL];
    const dePiezas = Object.entries(cambios).filter(([k]) => k !== GENERAL);
    if (dePiezas.length) {
      const mapa = { ...(diseno?.fondoPorPieza || {}) };
      for (const [clave, fondo] of dePiezas) { if (fondo) mapa[clave] = fondo; else delete mapa[clave]; }
      datos.fondoPorPieza = mapa;
    }
    return datos;
  }
  async function guardarFondo() {
    clearTimeout(temporizadorFondoRef.current);
    temporizadorFondoRef.current = null;
    const { disenoId: idDiseno, cambios } = pendienteFondoRef.current;
    pendienteFondoRef.current = { disenoId: null, cambios: {} };
    const diseno = disenosRef.current.find((d) => d.id === idDiseno);
    if (!diseno || Object.keys(cambios).length === 0) return;
    try {
      guardarDisenoLocal(await editarDiseno(diseno.id, cambiosAlDiseno(diseno, cambios)));
      // Lo ya guardado deja de ser "local" (salvo que haya cambiado otra vez mientras tanto).
      if (disenoRef.current?.id === idDiseno) {
        setFondosLocales((prev) => {
          const r = { ...prev };
          for (const k of Object.keys(cambios)) if (r[k] === cambios[k]) delete r[k];
          return r;
        });
      }
    } catch (e) { setErrorDiseno('No se pudo guardar el fondo: ' + e.message); }
  }
  const guardarFondoRef = useRef(guardarFondo);
  guardarFondoRef.current = guardarFondo;
  useEffect(() => () => { if (temporizadorFondoRef.current) guardarFondoRef.current(); }, []);
  useEffect(() => {
    if (temporizadorFondoRef.current) guardarFondoRef.current();
    setFondosLocales({});
  }, [disenoId]);

  // `clave` = GENERAL o la de una pieza; `fondo` null en una pieza = usar el general.
  async function cambiarFondo(clave, fondo) {
    setErrorDiseno(null);
    if (!disenoSeleccionado) {
      if (fondo === null) return;
      setCreandoDisenoFondo(true);
      try {
        const nombrePrendas = gruposSeleccionados.map((g) => g.nombre).join(' + ');
        const creado = await crearDiseno({
          nombre: 'Diseño ' + (nombre.trim() || nombrePrendas || 'nuevo'),
          grupoIds,
          imagenesPorPieza: {},
          ...cambiosAlDiseno(null, { [clave]: fondo }),
        });
        guardarDisenoLocal(creado);
        setDisenoId(creado.id);
      } catch (e) { setErrorDiseno(e.message); }
      finally { setCreandoDisenoFondo(false); }
      return;
    }
    setFondosLocales((prev) => ({ ...prev, [clave]: fondo }));
    pendienteFondoRef.current = {
      disenoId: disenoSeleccionado.id,
      cambios: { ...pendienteFondoRef.current.cambios, [clave]: fondo },
    };
    clearTimeout(temporizadorFondoRef.current);
    temporizadorFondoRef.current = setTimeout(() => guardarFondoRef.current(), 400);
  }

  // ---- puntos de calce ------------------------------------------------------
  function puntosCalceDe(clave) { return normalizarAjusteArte(ajusteArteDe(clave)).calce; }
  function ponerPuntosCalce(clave, calce) {
    cambiarAjusteArte(clave, { ...normalizarAjusteArte(ajusteArteDe(clave)), calce });
  }
  function empezarCalce() { setSeleccion(null); setCalceDestinoId(null); setModo('calceArte'); }
  function marcarCalceEnArte({ u, v, uEspejo }) {
    const actuales = puntosCalceDe(piezaActiva);
    const idNuevo = () => { let n = 1; while (actuales.some((p) => p.id === 'c' + n) || nuevos.some((p) => p.id === 'c' + n)) n++; return 'c' + n; };
    const nuevos = [];
    nuevos.push({ id: idNuevo(), u, v, destino: null });
    if (calceEspejo && Math.abs(uEspejo - u) > 0.01) {
      nuevos.push({ id: idNuevo(), u: uEspejo, v, destino: null, par: nuevos[0].id });
      nuevos[0].par = nuevos[1].id;
    }
    ponerPuntosCalce(piezaActiva, [...actuales, ...nuevos]);
    setCalceDestinoId(nuevos[0].id);
    setModo('calceDestino');
  }
  // Cambiar un punto a mano (coordenadas en el diseño o corrimiento en el
  // molde). Su espejo lo sigue: misma altura, X reflejada.
  function cambiarPuntoCalce(id, cambios) {
    const lista = puntosCalceDe(piezaActiva);
    const antes = lista.find((p) => p.id === id);
    if (!antes) return;
    const despues = { ...antes, ...cambios };
    ponerPuntosCalce(piezaActiva, lista.map((p) => {
      if (p.id === id) return despues;
      if (p.id !== antes.par || p.par !== id) return p;
      const q = { ...p };
      if ('u' in cambios) q.u = Math.min(Math.max(p.u - (despues.u - antes.u), 0), 1);
      if ('v' in cambios) q.v = despues.v;
      if (cambios.destino && p.destino && antes.destino) {
        const dx = cambios.destino.x, dy = cambios.destino.y;
        q.destino = {
          x: dx.modo === p.destino.x.modo ? { ...p.destino.x, valor: p.destino.x.valor - (dx.valor - antes.destino.x.valor) } : { ...p.destino.x, modo: dx.modo, valor: -dx.valor },
          y: { ...p.destino.y, modo: dy.modo, valor: dy.valor },
        };
      }
      return q;
    }));
  }
  function engancharCalce(id) { setSeleccion(null); setCalceDestinoId(id); setModo('calceDestino'); }
  function quitarCalce(id) {
    ponerPuntosCalce(piezaActiva, puntosCalceDe(piezaActiva).filter((p) => p.id !== id));
    if (calceDestinoId === id) { setCalceDestinoId(null); setModo(null); }
  }

  function moverArte(clave, dx, dy) {
    const a = normalizarAjusteArte(ajusteArteDe(clave));
    cambiarAjusteArte(clave, { ...a, dxCm: Math.round((a.dxCm + dx) * 100) / 100, dyCm: Math.round((a.dyCm + dy) * 100) / 100 });
  }

  async function renombrarDiseno() {
    const limpio = nombreDiseno.trim();
    if (!disenoSeleccionado || !limpio || limpio === disenoSeleccionado.nombre) return;
    try {
      guardarDisenoLocal(await editarDiseno(disenoSeleccionado.id, { nombre: limpio }));
    } catch (e) { setErrorDiseno(e.message); }
  }

  async function eliminarDisenoActual() {
    if (!disenoId) return;
    const usadoPor = productos.filter((p) => p.disenoId === disenoId && p.id !== editandoId);
    const aviso = usadoPor.length
      ? '¿Eliminar el diseño «' + disenoSeleccionado?.nombre + '»? Lo usan también: ' + usadoPor.map((p) => p.nombre).join(', ') + '.'
      : '¿Eliminar el diseño «' + disenoSeleccionado?.nombre + '»?';
    if (!window.confirm(aviso)) return;
    await eliminarDiseno(disenoId);
    setDisenos((prev) => prev.filter((d) => d.id !== disenoId));
    setDisenoId('');
  }

  function nodoDe(tipo, id) {
    const lista = tipo === 'ancla' ? anclaje.anclas : anclaje.zonas;
    return lista.find((n) => n.id === id) || null;
  }

  // Clicar el mismo ancla/zona que ya está seleccionada la cierra, clicar
  // otra distinta la selecciona -- pedido explícito ("si yo quiero salirme
  // presiono el nombre de la zona y ya"). Un solo lugar para esto: estaba
  // repetido en tres sitios (lienzo·ancla, lienzo·zona, chip de zona), y el
  // chip había quedado sin comparar `tipo`, solo `id` -- inofensivo hoy
  // porque los ids de ancla ("A1"…) y zona ("ZONA_1"…) nunca chocan
  // (`idLibre` los arma con prefijos distintos, y `renombrarNodo` exige
  // unicidad cruzada), pero un futuro cambio en cómo se arman los ids no
  // tendría por qué preservar esa distancia.
  function toggleSeleccion(tipo, id) {
    setSeleccion((s) => (s?.tipo === tipo && s.id === id ? null : { tipo, id }));
  }

  // ---- crear: un solo gesto ("+ Zona") crea el ancla Y la zona juntas --
  function crearAncla(cand) {
    const nuevaId = idLibre('A', anclaje.anclas);
    const nueva = { id: nuevaId, nombre: nuevaId, pieza: piezaActiva,
      x: { ref: cand.ref, modo: 'fijo', valor: 0 }, y: { ref: cand.ref, modo: 'fijo', valor: 0 } };
    setAnclaje((prev) => ({ ...prev, anclas: [...prev.anclas, nueva] }));
    return nueva;
  }
  function crearZonaDesde(anclaId) {
    const id = idLibre('ZONA_', anclaje.zonas);
    const nueva = { id, nombre: id, pieza: piezaActiva, tipo: 'texto',
      anclaX: anclaId, anclaY: anclaId, origen: 'centro', modoCruce: 'esquina',
      ancho: medida(24), alto: medida(6), lado: medida(8), cruz: true, logoRuta: null,
      offset: { x: medida(0), y: medida(0) }, rotacion: 0,
      campoPedido: 'nombre', valorFijo: '', valorEjemplo: '', colorHex: '#ffffff', grupo: null };
    setAnclaje((prev) => ({ ...prev, zonas: [...prev.zonas, nueva] }));
    return id;
  }

  // El nodo del molde que queda en el lugar simétrico de `cand` (reflejado
  // respecto del centro de la pieza), si hay uno ahí; si no, null.
  function nodoSimetrico(cand) {
    if (!geoActiva) return null;
    const W = geoActiva.pieza.ancho_cm;
    const objetivo = { x: W - cand.x, y: cand.y };
    if (Math.abs(objetivo.x - cand.x) < 0.5) return null; // está sobre el centro: es su propio espejo
    const tolerancia = Math.max(0.5, W * 0.02);
    let mejor = null, distancia = Infinity;
    for (const c of candidatosDe(geoActiva, [], null, { piquetes: true, extremos: true, bordes: true, vertices: true, zonas: false })) {
      // A igual distancia, uno de la misma clase (piquete con piquete, vértice con vértice).
      const d = Math.hypot(c.x - objetivo.x, c.y - objetivo.y) + (c.clase === cand.clase ? 0 : 0.05);
      if (d < distancia) { distancia = d; mejor = c; }
    }
    return mejor && distancia <= tolerancia ? mejor : null;
  }

  function elegirCandidato(cand) {
    if (modo === 'calceDestino' && calceDestinoId) {
      const destino = { x: { ref: cand.ref, modo: 'fijo', valor: 0 }, y: { ref: cand.ref, modo: 'fijo', valor: 0 } };
      let lista = puntosCalceDe(piezaActiva).map((p) => (p.id === calceDestinoId ? { ...p, destino } : p));
      // Los moldes son simétricos: el espejo de este punto se engancha solo
      // al nodo del otro lado (así el arte no se corre y queda centrado).
      const punto = lista.find((p) => p.id === calceDestinoId);
      const espejo = nodoSimetrico(cand);
      if (punto?.par && espejo) {
        const destinoEspejo = { x: { ref: espejo.ref, modo: 'fijo', valor: 0 }, y: { ref: espejo.ref, modo: 'fijo', valor: 0 } };
        lista = lista.map((p) => (p.id === punto.par && p.par === punto.id ? { ...p, destino: destinoEspejo } : p));
      }
      ponerPuntosCalce(piezaActiva, lista);
      // Sigue con el próximo punto sin enganchar (el espejo recién creado).
      const siguiente = lista.find((p) => !p.destino);
      if (siguiente) setCalceDestinoId(siguiente.id);
      else { setCalceDestinoId(null); setModo(null); }
      return;
    }
    if (modo === 'recolocar' && recolocarInfo) {
      const { anclaId, eje } = recolocarInfo;
      setAnclaje((prev) => ({
        ...prev,
        anclas: prev.anclas.map((a) => (a.id !== anclaId ? a : { ...a, [eje]: { ...a[eje], ref: cand.ref } })),
      }));
      setSeleccion({ tipo: 'ancla', id: anclaId });
      setModo(null);
      setRecolocarInfo(null);
      return;
    }
    if (modo === 'zona') {
      const anclaNueva = crearAncla(cand);
      const idZona = crearZonaDesde(anclaNueva.id);
      setSeleccion({ tipo: 'zona', id: idZona });
      setModo(null);
      return;
    }
    if (modo === 'importar' && conjuntoAImportar) {
      // El conjunto se pega con su raíz en el punto elegido; el resto de
      // sus zonas, colgando de ella como estaban (utilidades/conjuntosZonas.js).
      const { anclaje: nuevo, idsZonasNuevas } = importarConjunto(anclaje, conjuntoAImportar.anclaje, piezaActiva, cand.ref);
      setAnclaje(nuevo);
      if (idsZonasNuevas.length) setSeleccion({ tipo: 'zona', id: idsZonasNuevas[0] });
      setModo(null);
      setConjuntoAImportar(null);
      return;
    }
    if (modo === 'cruzar' && cruzandoZonaId) {
      const anclaCruce = crearAncla(cand);
      setAnclaje((prev) => ({
        ...prev,
        zonas: prev.zonas.map((z) => (z.id === cruzandoZonaId ? { ...z, anclaY: anclaCruce.id } : z)),
      }));
      setSeleccion({ tipo: 'zona', id: cruzandoZonaId });
      setModo(null);
      setCruzandoZonaId(null);
      return;
    }
  }

  // ---- borrar, con herencia de referencia (no dejar nada huérfano) -----
  function borrarNodo(tipo, id) {
    const dependen = [];
    const dependenAnclas = [];
    if (tipo === 'ancla') {
      for (const z of anclaje.zonas) if (z.anclaX === id || z.anclaY === id) dependen.push('zona ' + z.id);
    } else {
      for (const a of anclaje.anclas) {
        const usaX = a.x?.ref?.tipo === 'zona' && a.x.ref.zona === id;
        const usaY = a.y?.ref?.tipo === 'zona' && a.y.ref.zona === id;
        if (usaX || usaY) { dependen.push('ancla ' + a.id); dependenAnclas.push({ ancla: a, x: usaX, y: usaY }); }
      }
    }

    function ejecutar() {
      setAnclaje((prev) => {
        let { anclas, zonas } = prev;
        const zonaBorrada = tipo === 'zona' ? zonas.find((z) => z.id === id) : null;

        // Heredar: el ancla dependiente adopta la MISMA referencia a la que
        // colgaba la zona borrada, sumando la distancia que ya había --
        // como si la zona intermedia nunca hubiera existido (sigue
        // gradando con el piquete/vértice real, no queda pegada en cm
        // fijos al punto resuelto de HOY). Ver la prueba homónima en
        // pruebas/prueba-anclaje.js.
        if (tipo === 'zona' && dependenAnclas.length && resuelto && zonaBorrada) {
          const anclaOrigenX = anclas.find((a) => a.id === zonaBorrada.anclaX);
          const anclaOrigenY = anclas.find((a) => a.id === zonaBorrada.anclaY);
          const geoPza = piezaActiva ? geometriaParaAnclaje(piezaDeClave(piezaActiva), tallaTrabajoDe(piezaActiva)) : null;
          const heredarEje = (ejeOrigen, idOrigen, puntoDependiente, cual) => {
            const puntoOrigen = resuelto.anclas[idOrigen];
            if (!ejeOrigen?.ref || !puntoOrigen) return null;
            const delta = puntoDependiente[cual] - puntoOrigen[cual];
            if (ejeOrigen.modo === 'proporcional') {
              const base = geoPza ? (cual === 'x' ? geoPza.pieza.ancho_cm : geoPza.pieza.alto_cm) : 0;
              return { ref: ejeOrigen.ref, modo: 'proporcional', valor: ejeOrigen.valor + (base ? delta / base : 0) };
            }
            return { ref: ejeOrigen.ref, modo: 'fijo', valor: (ejeOrigen.valor || 0) + delta };
          };
          anclas = anclas.map((a) => {
            const dep = dependenAnclas.find((d) => d.ancla.id === a.id);
            if (!dep) return a;
            const puntoDep = resuelto.anclas[a.id];
            if (!puntoDep) return a;
            const cambios = {};
            if (dep.x && anclaOrigenX) { const n = heredarEje(anclaOrigenX.x, anclaOrigenX.id, puntoDep, 'x'); if (n) cambios.x = n; }
            if (dep.y && anclaOrigenY) { const n = heredarEje(anclaOrigenY.y, anclaOrigenY.id, puntoDep, 'y'); if (n) cambios.y = n; }
            return Object.keys(cambios).length ? { ...a, ...cambios } : a;
          });
        }

        if (tipo === 'ancla') anclas = anclas.filter((a) => a.id !== id);
        else zonas = zonas.filter((z) => z.id !== id);

        // El ancla es plumbing de su zona: si nadie más la usa, se va con
        // ella (no queda un punto suelto dibujándose sin ninguna zona).
        if (zonaBorrada) {
          for (const anclaId of [zonaBorrada.anclaX, zonaBorrada.anclaY]) {
            const usada = zonas.some((z) => z.anclaX === anclaId || z.anclaY === anclaId);
            if (!usada) anclas = anclas.filter((a) => a.id !== anclaId);
          }
        }
        return { anclas, zonas };
      });
      setSeleccion((s) => (s && s.id === id ? null : s));
    }

    if (!dependen.length) { ejecutar(); return; }
    const texto = tipo === 'zona' && dependenAnclas.length
      ? 'Heredan la referencia de «' + id + '» en vez de perderla: ' + dependen.join(', ') +
        '. Quedan en el mismo sitio de ahora, y siguen gradando con esa referencia. ¿Quitarlo igual?'
      : 'Se quedan sin referencia: ' + dependen.join(', ') + '. ¿Quitarlo igual?';
    if (window.confirm(texto)) ejecutar();
  }

  function renombrarNodo(tipo, viejo, nuevo) {
    nuevo = (nuevo || '').trim();
    if (!nuevo || nuevo === viejo) return;
    const todos = [...anclaje.anclas, ...anclaje.zonas];
    if (todos.some((n) => n.id === nuevo)) {
      window.alert('Ya hay un elemento llamado «' + nuevo + '». Los nombres tienen que ser únicos.');
      return;
    }
    setAnclaje((prev) => ({
      anclas: prev.anclas.map((a) => {
        let cambiado = a.id === viejo ? { ...a, id: nuevo, nombre: nuevo } : a;
        if (tipo === 'zona') {
          if (a.x?.ref?.tipo === 'zona' && a.x.ref.zona === viejo) cambiado = { ...cambiado, x: { ...cambiado.x, ref: { ...cambiado.x.ref, zona: nuevo } } };
          if (a.y?.ref?.tipo === 'zona' && a.y.ref.zona === viejo) cambiado = { ...cambiado, y: { ...cambiado.y, ref: { ...cambiado.y.ref, zona: nuevo } } };
        }
        return cambiado;
      }),
      zonas: prev.zonas.map((z) => {
        if (tipo === 'ancla') {
          return { ...z, id: z.id === viejo ? nuevo : z.id, nombre: z.id === viejo ? nuevo : z.nombre,
                   anclaX: z.anclaX === viejo ? nuevo : z.anclaX, anclaY: z.anclaY === viejo ? nuevo : z.anclaY };
        }
        return z.id === viejo ? { ...z, id: nuevo, nombre: nuevo } : z;
      }),
    }));
    setSeleccion({ tipo, id: nuevo });
  }

  function duplicarZona(zona) {
    const id = idLibre(zona.id + '_', anclaje.zonas);
    const copia = { ...JSON.parse(JSON.stringify(zona)), id, nombre: id };
    setAnclaje((prev) => ({ ...prev, zonas: [...prev.zonas, copia] }));
    setSeleccion({ tipo: 'zona', id });
  }

  function zonasDelMismoGrupo(zona) {
    if (!zona.grupo) return [];
    return anclaje.zonas.filter((z) => z.id !== zona.id && z.grupo === zona.grupo);
  }
  function actualizarZona(id, cambios) {
    setAnclaje((prev) => ({ ...prev, zonas: prev.zonas.map((z) => (z.id === id ? { ...z, ...cambios } : z)) }));
  }
  function actualizarZonaConSincronia(zona, cambios) {
    actualizarZona(zona.id, cambios);
    // PUSH: tipo/contenido/logo de esta zona se copian a sus hermanas del
    // mismo grupo (posición y tamaño -- incluida "cruz" -- siguen siendo de
    // cada una: el mismo logo puede necesitar otro tamaño en otra pieza).
    if ('tipo' in cambios || 'campoPedido' in cambios || 'valorFijo' in cambios || 'valorEjemplo' in cambios || 'logoRuta' in cambios) {
      const hermanas = zonasDelMismoGrupo(zona);
      if (hermanas.length) {
        setAnclaje((prev) => ({
          ...prev,
          zonas: prev.zonas.map((z) => (hermanas.some((h) => h.id === z.id)
            ? { ...z, tipo: cambios.tipo ?? zona.tipo, campoPedido: cambios.campoPedido ?? zona.campoPedido,
                valorFijo: cambios.valorFijo ?? zona.valorFijo, valorEjemplo: cambios.valorEjemplo ?? zona.valorEjemplo,
                logoRuta: cambios.logoRuta ?? zona.logoRuta,
                logoVista: 'logoRuta' in cambios ? (cambios.logoVista || null) : (zona.logoVista || null) }
            : z)),
        }));
      }
    }
  }
  function cambiarGrupoDeZona(zona, grupo) {
    const hermanas = grupo ? anclaje.zonas.filter((z) => z.id !== zona.id && z.grupo === grupo) : [];
    if (hermanas.length) {
      const modelo = hermanas[0];
      actualizarZona(zona.id, { grupo, tipo: modelo.tipo, campoPedido: modelo.campoPedido, valorFijo: modelo.valorFijo, valorEjemplo: modelo.valorEjemplo, logoRuta: modelo.logoRuta, logoVista: modelo.logoVista || null });
    } else {
      actualizarZona(zona.id, { grupo });
    }
  }

  function moverAncla(id, dxCm, dyCm) {
    setAnclaje((prev) => ({
      ...prev,
      anclas: prev.anclas.map((a) => {
        if (a.id !== id) return a;
        const x = a.x.modo === 'fijo' ? { ...a.x, valor: Math.round((a.x.valor + dxCm) * 10) / 10 } : a.x;
        const y = a.y.modo === 'fijo' ? { ...a.y, valor: Math.round((a.y.valor + dyCm) * 10) / 10 } : a.y;
        return { ...a, x, y };
      }),
    }));
  }

  // Arrastrar una zona sobre el lienzo (LienzoAnclaje·onArrastrarZona) --
  // pedido explícito del usuario, además de "Mover X/Y" a mano: mismo
  // resultado (suma al offset), solo que a ojo. La relación con el ancla
  // no cambia -- sigue siendo "offset", no una posición absoluta nueva. En
  // cm (modo fijo) redondea a 1 decimal, como pidió; en % de la pieza
  // (modo proporcional) redondea a la décima de punto porcentual.
  function moverZona(id, dxCm, dyCm) {
    setAnclaje((prev) => {
      const zona = prev.zonas.find((z) => z.id === id);
      if (!zona) return prev;
      const geoPza = geometriaParaAnclaje(piezaDeClave(zona.pieza), tallaTrabajoDe(zona.pieza));
      const anchoPza = geoPza?.pieza.ancho_cm || 0;
      const altoPza = geoPza?.pieza.alto_cm || 0;
      function mover(eje, deltaCm, basePza) {
        if (eje.modo === 'proporcional') {
          const deltaFrac = basePza ? deltaCm / basePza : 0;
          return { ...eje, valor: Math.round((eje.valor + deltaFrac) * 1000) / 1000 };
        }
        return { ...eje, valor: Math.round((eje.valor + deltaCm) * 10) / 10 };
      }
      return {
        ...prev,
        zonas: prev.zonas.map((z) => (z.id === id
          ? { ...z, offset: { x: mover(z.offset.x, dxCm, anchoPza), y: mover(z.offset.y, dyCm, altoPza) } }
          : z)),
      };
    });
  }

  // ---- Guardado automático ---------------------------------------------
  // Antes, "Guardar producto" vaciaba el editor (las zonas desaparecían de
  // la pantalla aunque se hubieran guardado) y nada se guardaba hasta ese
  // clic: una recarga, un corte o tocar otra prenda se llevaba el trabajo.
  // Ahora:
  //  - un producto con nombre y prenda (y, si es nuevo, al menos una zona)
  //    se guarda SOLO en el servidor ~1,5 s después del último cambio;
  //  - todo lo que no está en el servidor queda además como borrador en
  //    este navegador, y al volver se ofrece recuperarlo;
  //  - guardar NO vacía el editor: se sigue con el mismo producto.
  const estadoEditor = { nombre, grupoIds, disenoId, anclaje, bordeContraste, ladosPropios };
  const firmaActual = firmaEditor(estadoEditor);
  const sinGuardar = haySinGuardar(estadoEditor, firmaGuardada);
  const autoguardable = puedeGuardarseSolo(estadoEditor, !editandoId);
  const guardandoRef = useRef(false);
  const estadoRef = useRef({});
  estadoRef.current = { estadoEditor, editandoId, firmaActual };

  async function guardarEnServidor() {
    if (guardandoRef.current) return false;
    const { estadoEditor: datosAhora, editandoId: idAhora, firmaActual: firmaAhora } = estadoRef.current;
    guardandoRef.current = true;
    setEstadoGuardado('guardando');
    try {
      const datos = {
        nombre: datosAhora.nombre, grupoIds: datosAhora.grupoIds, disenoId: datosAhora.disenoId || null,
        anclaje: datosAhora.anclaje, bordeContraste: datosAhora.bordeContraste, ladosPropios: datosAhora.ladosPropios,
      };
      const r = idAhora ? await editarProducto(idAhora, datos) : await crearProducto(datos);
      confirmarGuardado('productos', r);
      setProductos((prev) => (prev.some((x) => x.id === r.id) ? prev.map((x) => (x.id === r.id ? r : x)) : [...prev, r]));
      setEditandoId(r.id);
      setFirmaGuardada(firmaAhora);
      setGuardadoEn(Date.now());
      setEstadoGuardado('guardado');
      setError(null);
      if (estadoRef.current.firmaActual === firmaAhora) borrarBorrador();
      return true;
    } catch (e) {
      setEstadoGuardado('error');
      setError('No se pudo guardar: ' + e.message + '. Tus cambios siguen acá y en este navegador; se reintenta solo.');
      return false;
    } finally {
      guardandoRef.current = false;
    }
  }

  // Guardar solo en el servidor, un rato después del último cambio (y
  // reintentar si falló). Si se cambia algo mientras guarda, al terminar
  // la huella no coincide y vuelve a correr.
  const guardandoAhora = estadoGuardado === 'guardando';
  useEffect(() => {
    if (!sinGuardar || !autoguardable || guardandoAhora) return undefined;
    setEstadoGuardado((e) => (e === 'error' ? e : 'pendiente'));
    const t = setTimeout(() => { guardarEnServidor(); }, estadoGuardado === 'error' ? 8000 : 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaActual, firmaGuardada, autoguardable, guardandoAhora]);

  // Al abrir Diseño: si quedó un borrador de antes (recarga, corte...), ofrecer recuperarlo.
  // Hasta revisarlo, el borrador de abajo no se toca (el editor recién
  // abierto está vacío y lo borraría antes de poder ofrecerlo).
  const [borradorRevisado, setBorradorRevisado] = useState(false);
  useEffect(() => {
    if (cargando || borradorRevisado) return;
    const b = borradorParaOfrecer(leerBorrador(), productos, estadoDeProducto);
    if (b) setBorradorOfrecido(b); else borrarBorrador();
    setBorradorRevisado(true);
  }, [cargando, productos, borradorRevisado]);

  // Borrador en este navegador de todo lo que todavía no está en el servidor.
  useEffect(() => {
    if (!borradorRevisado || borradorOfrecido) return undefined; // no pisar el que se está ofreciendo recuperar
    if (!sinGuardar) { borrarBorrador(); return undefined; }
    const t = setTimeout(() => guardarBorrador({ editandoId, ...estadoRef.current.estadoEditor }), 400);
    return () => clearTimeout(t);
  }, [firmaActual, sinGuardar, editandoId, borradorOfrecido, borradorRevisado]);

  function recuperarBorrador() {
    const b = borradorOfrecido;
    const guardado = b.productoExiste ? productos.find((x) => x.id === b.editandoId) : null;
    setEditandoId(guardado ? guardado.id : null);
    setFirmaGuardada(guardado ? firmaEditor(estadoDeProducto(guardado)) : null);
    setEstadoGuardado(null);
    setNombre(b.nombre);
    setGrupoIds(b.grupoIds);
    setDisenoId(b.disenoId || '');
    setAnclaje(b.anclaje);
    setLadosPropios(b.ladosPropios || {});
    setBordeContraste(b.bordeContraste || BORDE_POR_DEFECTO);
    setSeleccion(null);
    setModo(null);
    setTallaTrabajoPorRol({});
    setBorradorOfrecido(null);
  }
  function descartarBorrador() {
    borrarBorrador();
    setBorradorOfrecido(null);
  }

  // Avisar antes de cerrar o recargar la pestaña con cambios que no llegaron al servidor.
  useEffect(() => {
    if (!sinGuardar) return undefined;
    const alSalir = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', alSalir);
    return () => window.removeEventListener('beforeunload', alSalir);
  }, [sinGuardar]);

  // Antes de cambiar de producto: lo pendiente se guarda (o se pregunta si no se puede).
  async function dejarProductoActual() {
    if (!sinGuardar) return true;
    if (autoguardable) return guardarEnServidor();
    return window.confirm('Esta producción tiene cambios que todavía no se guardaron (le falta nombre, prenda o una zona). ¿Descartarlos?');
  }

  async function guardar(evento) {
    evento.preventDefault();
    setError(null);
    if (!nombre.trim() || grupoIds.length === 0) { setError('Falta el nombre de la producción o la prenda.'); return; }
    if (await guardarEnServidor()) onCambio?.();
  }

  // Carga un producto ya guardado de vuelta al mismo formulario/lienzo que
  // arma uno nuevo -- no reconstruye nada por separado, así el editor que
  // ya está probado (resolverAnclaje en vivo, PanelDock, etc.) se comporta
  // exactamente igual para editar que para crear.
  async function cargarParaEditar(producto) {
    if (producto.id === editandoId) return;
    if (!(await dejarProductoActual())) return;
    setEditandoId(producto.id);
    setFirmaGuardada(firmaEditor(estadoDeProducto(producto)));
    setEstadoGuardado(null);
    setNombre(producto.nombre);
    setGrupoIds(producto.grupoIds || (producto.grupoId ? [producto.grupoId] : []));
    setDisenoId(producto.disenoId || '');
    setAnclaje(producto.anclaje || { anclas: [], zonas: [] });
    setLadosPropios(producto.ladosPropios || {});
    setBordeContraste(producto.bordeContraste || BORDE_POR_DEFECTO);
    setSeleccion(null);
    setModo(null);
    setTallaTrabajoPorRol({});
    setError(null);
  }

  // Empieza un producto nuevo (lo del actual, guardado antes si se puede).
  async function nuevoProducto() {
    if (!(await dejarProductoActual())) return;
    cancelarEdicionProducto();
  }

  function cancelarEdicionProducto() {
    setEditandoId(null);
    setFirmaGuardada(null);
    setEstadoGuardado(null);
    borrarBorrador();
    setNombre('');
    setAnclaje({ anclas: [], zonas: [] });
    setLadosPropios({});
    setSeleccion(null);
    setModo(null);
    setError(null);
  }

  const editorRef = useRef(null);
  const produccionesRecientes = (() => {
    const orden = ordenarPorReciente(productos);
    const top = orden.slice(0, RECIENTES);
    const abierta = editandoId && !top.some((p) => p.id === editandoId) ? orden.find((p) => p.id === editandoId) : null;
    return abierta ? [abierta, ...top.slice(0, RECIENTES - 1)] : top;
  })();

  async function editarDesdeTarjeta(producto) {
    await cargarParaEditar(producto);
    editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  // "Editar" desde Producción → Producciones (vía App.jsx): se abre acá en
  // el editor, una sola vez (App limpia el dato apenas se consume).
  useEffect(() => {
    if (!produccionParaEditar || cargando) return;
    const p = productos.find((x) => x.id === produccionParaEditar.id) || produccionParaEditar;
    onConsumirProduccion?.();
    editarDesdeTarjeta(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produccionParaEditar, cargando]);

  async function nuevaDesdeTarjetas() {
    await nuevoProducto();
    editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function borrar(id) {
    const p = productos.find((x) => x.id === id);
    if (!window.confirm('¿Eliminar la producción «' + (p?.nombre || '') + '»? Se borran sus zonas; el diseño y las prendas no se tocan.')) return;
    await eliminarProducto(id);
    if (editandoId === id) cancelarEdicionProducto();
    await recargar();
    onCambio?.();
  }

  // Guarda el conjunto al que pertenece la zona elegida (ella + las zonas
  // encadenadas con ella) para pegarlo después en otra pieza u otro
  // producto. Se guarda con su contenido (logo, textos) -- es lo que se
  // quiere repetir. Vive junto a las plantillas, marcado con su tipo.
  async function guardarConjunto(zonaId) {
    const conjunto = conjuntoDeZona(anclaje, zonaId);
    if (!conjunto) return;
    const nombreConjunto = window.prompt(
      'Nombre del conjunto (' + conjunto.zonas.length + ' zonas: ' + conjunto.zonas.map((z) => z.nombre || z.id).join(', ') + '):'
    );
    if (!nombreConjunto || !nombreConjunto.trim()) return;
    setError(null);
    try {
      const creado = await crearPlantilla({
        tipo: 'conjuntoZonas', nombre: nombreConjunto.trim(), anclaje: conjunto, creadoEn: new Date().toISOString(),
      });
      confirmarGuardado('plantillas', creado);
      setConjuntos((prev) => [...prev, creado]);
      setMostrandoConjuntos(true);
    } catch (e) { setError(e.message); }
  }

  async function borrarConjunto(conjunto) {
    if (!window.confirm('¿Eliminar el conjunto «' + conjunto.nombre + '»? Las zonas ya pegadas en producciones no se tocan.')) return;
    setConjuntos((prev) => prev.filter((c) => c.id !== conjunto.id));
    if (conjuntoAImportar?.id === conjunto.id) { setConjuntoAImportar(null); setModo(null); }
    await borrarRegistro('plantillas', conjunto.id, () => eliminarPlantilla(conjunto.id), 'el conjunto "' + conjunto.nombre + '"');
  }

  function empezarImportacion(conjunto) {
    setConjuntoAImportar(conjunto);
    setSeleccion(null);
    setModo('importar');
  }

  async function guardarComoPlantilla() {
    setError(null);
    const nombrePlantilla = window.prompt('¿Cómo se llama esta plantilla?');
    if (!nombrePlantilla || !nombrePlantilla.trim()) return;
    try {
      await crearPlantilla({
        nombre: nombrePlantilla.trim(),
        grupoIds,
        anclaje: anclajeSinContenido(anclaje),
        bordeContraste,
      });
      onCambio?.();
    } catch (e) { setError(e.message); }
  }

  const piezaObj = piezaActiva ? piezaDeClave(piezaActiva) : null;
  const tallaTrabajo = piezaActiva ? tallaTrabajoDe(piezaActiva) : null;
  const geoActiva = piezaObj && tallaTrabajo ? geometriaParaAnclaje(piezaObj, tallaTrabajo) : null;
  const tallasDePieza = ordenarTallasNatural(Object.keys(piezaObj?.dimensionesPorTalla || {}));
  const zonasDeEstaPieza = (resuelto?.lista.zonas || []).filter((z) => z.pieza === piezaActiva);
  const anclasResueltasDeEstaPieza = (resuelto?.lista.anclas || []).filter((a) => a.pieza === piezaActiva);
  const zonasDeEstaPiezaConDatos = zonasDeEstaPieza.map((z) => {
    const cruda = anclaje.zonas.find((zz) => zz.id === z.id);
    const esTallaZ = z.tipo !== 'logo' && !!cruda && campoDeZona(cruda) === 'talla';
    return {
      ...z, etiqueta: cruda ? etiquetaZona(cruda) : z.id, campoPedido: cruda && z.tipo !== 'logo' ? campoDeZona(cruda) : cruda?.campoPedido, rotacion: cruda?.rotacion || 0,
      // El lienzo los necesita para poder mostrar el contenido real (no un
      // marcador genérico) cuando el toggle "zona" oculta el cuadrito.
      valorFijo: cruda?.valorFijo, valorEjemplo: cruda?.valorEjemplo,
      // Lo que se escribe en la zona (el lienzo lo ajusta a su espacio) y la
      // tipografía elegida -- sin ninguna, el lienzo usa la de base.
      // La talla se ve con la talla que se está mirando en el lienzo.
      contenidoTexto: z.tipo === 'logo' ? null : campoDeZona(cruda) === 'talla' ? textoDeTalla(tallaTrabajo || 'M', cruda?.generoTalla)
        : ((campoDeZona(cruda) === 'fijo' ? cruda?.valorFijo : cruda?.valorEjemplo) || null),
      fuenteUrl: cruda?.fuenteId ? (fuentes.find((f) => f.id === cruda.fuenteId)?.archivoUrl || null) : null,
      // Estilo del texto, para verlo en el lienzo igual que en el PDF.
      // La talla: siempre negra, sin espaciado ni borde (como en el PDF).
      colorHex: esTallaZ ? COLOR_TALLA : cruda?.colorHex || '#ffffff',
      // La talla no se sale del molde (igual que en el PDF): cuánto se achica.
      escalaMolde: esTallaZ ? escalaDentroDelMolde({ cx: z.cx, cy: z.cy, ancho: z.ancho, alto: z.alto, rotacionGrados: cruda?.rotacion || 0 }, geoActiva?.vertices) : 1,
      espaciadoMil: esTallaZ ? 0 : Number(cruda?.espaciadoMil) || 0,
      alineacion: cruda?.alineacion || 'centro',
      contorno: !esTallaZ && cruda?.contorno?.activo && Number(cruda.contorno.grosorCm) > 0 ? cruda.contorno : null,
    };
  });

  const seleccionado = seleccion ? nodoDe(seleccion.tipo, seleccion.id) : null;

  function contarEnPieza(rol) {
    return anclaje.anclas.filter((a) => a.pieza === rol).length + anclaje.zonas.filter((z) => z.pieza === rol).length;
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Panel izquierdo: todo el formulario, con SU PROPIO scroll -- el
          panel de zona/ancla (a la derecha, PanelDock) es un hermano flex de
          alto completo, no un bloque más de este flujo, así que crece o
          encoge sin reacomodar nunca el lienzo (pedido explícito: "marea un
          poco que el lienzo se mueva en base al panel de zona"). */}
      <div className="pagina flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto p-8">
      <div>
        <h2 className="text-lg font-semibold">Producciones</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Cada producción es una prenda real, el diseño que lleva encima y dónde va cada nombre/número —
          sobre el molde real de cada pieza. Se guarda sola mientras la armás, y la podés volver a abrir
          y seguir editando cuando quieras.
        </p>
      </div>

      {!cargando && !errorCarga && productos.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-faint-foreground">
              {productos.length > RECIENTES ? 'Recientes · ' + RECIENTES + ' de ' + productos.length : 'Producciones · ' + productos.length}
            </h3>
            {onVerTodas && (
              <Boton type="button" variante="fantasma" tamano="sm" onClick={onVerTodas} title="Producción → Producciones: todas, y exportar por tallas">
                Ver todas en Producción →
              </Boton>
            )}
            <Boton type="button" variante="acento" tamano="sm" className="ml-auto" onClick={nuevaDesdeTarjetas}>+ Nueva producción</Boton>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4">
            {produccionesRecientes.map((p) => (
              <TarjetaProduccion
                key={p.id}
                produccion={p}
                grupos={grupos}
                piezas={piezas}
                disenos={disenos}
                editando={p.id === editandoId}
                onEditar={() => editarDesdeTarjeta(p)}
                onEliminar={() => borrar(p.id)}
              />
            ))}
          </div>
        </section>
      )}

      {cargando ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : errorCarga ? (
        <ErrorCarga mensaje={errorCarga} onReintentar={recargar} />
      ) : grupos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Creá primero una prenda (Moldería → Biblioteca → + Nueva prenda).</p>
      ) : (
        <Tarjeta as="form" onSubmit={guardar} className="flex scroll-mt-4 flex-col gap-4">
          <div ref={editorRef} className="-mb-1 flex items-center gap-2">
            <h3 className="text-sm font-semibold">
              {editandoId ? 'Editando «' + (nombre.trim() || 'sin nombre') + '»' : 'Nueva producción'}
            </h3>
          </div>
          {borradorOfrecido && (
            <Aviso tono="info">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex-1">
                  Quedaron cambios sin guardar de «{borradorOfrecido.nombre || 'producción sin nombre'}» ({borradorOfrecido.anclaje.zonas.length} zona(s),
                  {' '}{haceCuanto(borradorOfrecido.en)}){borradorOfrecido.productoExiste ? '' : ', de una producción que todavía no estaba guardada'}.
                </span>
                <Boton tamano="sm" variante="primario" type="button" onClick={recuperarBorrador}>Recuperar</Boton>
                <Boton tamano="sm" variante="fantasma" type="button" onClick={descartarBorrador}>Descartar</Boton>
              </div>
            </Aviso>
          )}
          <Campo etiqueta="Nombre de la producción" className="max-w-3xl">
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Camiseta titular" />
          </Campo>

          <div className="max-w-3xl">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">Prendas</span>
              <Ayuda>
                Un producto puede juntar varias prendas en un solo armado (ej. camiseta + short +
                medias, como un kit). Elegí una para el caso de siempre, o varias para un kit --
                las piezas de cada prenda quedan divididas más abajo, y las tallas disponibles son
                las que tienen en común TODAS las prendas elegidas.
              </Ayuda>
            </div>
            <div className="flex flex-wrap gap-2">
              {grupos.map((g) => {
                const activo = grupoIds.includes(g.id);
                return (
                  <label key={g.id} className="cursor-pointer">
                    <input type="checkbox" className="peer sr-only" checked={activo} onChange={() => alternarGrupo(g.id)} />
                    <Chip tono={activo ? 'activo' : 'neutro'}>{g.nombre}</Chip>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="max-w-3xl">
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-faint-foreground">Diseño</h3>
              <Ayuda>
                El diseño es el arte real de esta prenda: una imagen por pieza. Para ponerla,
                arrastrá la imagen (PNG o JPG) o un PDF con vectores desde tu carpeta y soltala sobre el molde de la pieza
                en el lienzo de abajo. Si el producto no tiene diseño, se crea uno solo. También
                podés reusar un diseño ya cargado de estas mismas prendas. Sin diseño, la pieza
                sale en blanco en la vista previa y el PDF.
              </Ayuda>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select className="max-w-xs" value={disenoId} onChange={(e) => setDisenoId(e.target.value)}>
                <option value="">{disenosDeEstaCombinacion.length ? '— Sin diseño (o elegí uno) —' : '— Sin diseño —'}</option>
                {disenosDeEstaCombinacion.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
              </Select>
              {disenoSeleccionado && (
                <>
                  <Input
                    className="max-w-[240px]"
                    value={nombreDiseno}
                    onChange={(e) => setNombreDiseno(e.target.value)}
                    onBlur={renombrarDiseno}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
                    aria-label="Nombre del diseño"
                    title="Nombre del diseño (se guarda al salir del campo)"
                  />
                  <Boton variante="fantasma" tamano="sm" type="button" className="text-danger" onClick={eliminarDisenoActual}>Eliminar diseño</Boton>
                </>
              )}
            </div>
            <p className="mt-1.5 text-xs text-faint-foreground">
              {disenoSeleccionado
                ? 'Con imagen: ' + (Object.keys(disenoSeleccionado.imagenesPorPieza || {}).length
                    ? piezasDisponibles.filter((pd) => disenoSeleccionado.imagenesPorPieza?.[pd.clave]).map((pd) => pd.rol).join(', ')
                    : 'ninguna pieza todavía') + ' — arrastrá una imagen sobre el molde para sumar o cambiar la de esa pieza.'
                : 'Arrastrá una imagen PNG o JPG, o un PDF vectorial, sobre el molde de abajo para ponerle diseño a esa pieza.'}
            </p>
            {grupoIds.length > 0 && (
              <PanelFondo fondo={fondoVigente} onCambiar={(f) => cambiarFondo(GENERAL, f)} deshabilitado={creandoDisenoFondo} />
            )}
            {errorDiseno && <div className="mt-2"><Aviso tono="error">{errorDiseno}</Aviso></div>}
          </div>

          {/* ============ 1. PIEZA ============ */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-faint-foreground"><span className="mr-1 text-primary">1</span>Pieza</h3>
              <Ayuda>
                No se guarda dónde está cada cosa: se guarda POR QUÉ está ahí. Pulsá «Zona» y hacé
                clic sobre el molde: ahí nace la zona, pegada al piquete/vértice/borde más cercano.
                Si ese punto se mueve en otra talla, la zona va detrás.
              </Ayuda>
            </div>
            {/* Con más de una prenda combinada, las piezas quedan divididas
                por prenda (encabezado chico con su nombre) -- pedido
                explícito, para no mezclar roles de distintas prendas en una
                sola fila sin distinción. */}
            <div className="flex flex-col gap-2">
              {gruposSeleccionados.map((g) => (
                <div key={g.id} className="flex flex-wrap items-center gap-2">
                  {namespacear && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-faint-foreground">{g.nombre}</span>
                  )}
                  {piezasDisponibles.filter((pd) => pd.grupoId === g.id).map((pd) => {
                    const clave = pd.clave;
                    const n = contarEnPieza(clave);
                    return (
                      <button key={clave} type="button" onClick={() => { setPiezaActiva(clave); setSeleccion(null); setModo(null); }}
                        className={'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ' +
                          (clave === piezaActiva ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-surface text-muted-foreground hover:border-primary')}>
                        {disenoSeleccionado?.imagenesPorPieza?.[clave] && (
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" title="Tiene imagen de diseño" />
                        )}
                        {pd.ladoDe && <span aria-hidden="true">⇋</span>}
                        {pd.rol}
                        {pd.par && !pd.ladoDe && (
                          <span className="rounded bg-surface-muted px-1 text-[10px] text-faint-foreground"
                            title={ladosPropios[clave] ? 'Va en par: el otro lado lleva su propio diseño' : 'Va en par: se corta x2 con el mismo diseño'}>
                            ×2
                          </span>
                        )}
                        {n > 0 && <span className="rounded-full bg-primary/20 px-1.5 text-[10px]">{n}</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {piezaActiva && (
            <div className="min-w-0">
              {/* ============ 2. LIENZO ============ */}
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-faint-foreground"><span className="mr-1 text-primary">2</span>Lienzo</h3>
                {piezaObj && (() => {
                  // Nunca la clave cruda (puede traer el id de un grupo
                  // namespaceado, grupoId::rol) -- siempre el rol legible,
                  // con la prenda dueña adelante si hay más de una combinada.
                  const pd = piezasDisponibles.find((x) => x.clave === piezaActiva);
                  const etiqueta = pd ? (namespacear ? pd.grupoNombre + ' · ' + pd.rol : pd.rol) : piezaActiva;
                  return (
                    <span className="text-xs text-faint-foreground">
                      {etiqueta} · {geoActiva ? (geoActiva.pieza.ancho_cm + ' × ' + geoActiva.pieza.alto_cm + ' cm') : ''}
                    </span>
                  );
                })()}
                <span className="text-xs text-faint-foreground">· molde de referencia:</span>
                <Select className="max-w-[100px]" value={tallaTrabajo || ''}
                  onChange={(e) => setTallaTrabajoPorRol((prev) => ({ ...prev, [piezaActiva]: e.target.value }))}>
                  {tallasDePieza.map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                </Select>
                <div className="ml-auto flex flex-wrap items-center gap-1">
                  {piezaObj && (
                    <Boton variante={espejando ? 'acento' : 'fantasma'} tamano="sm" type="button" onClick={() => setEspejando((v) => !v)}
                      title="El otro lado de esta pieza (izquierda ↔ derecha): se corta x2, con el mismo diseño o uno propio, sin crear piezas nuevas.">
                      {espejando ? 'Cerrar' : '⇋ Espejo'}
                    </Boton>
                  )}
                  {disenoSeleccionado?.imagenesPorPieza?.[piezaActiva] && (
                    <Boton variante="fantasma" tamano="sm" type="button" onClick={() => quitarImagenDePieza(piezaActiva)}>
                      Quitar imagen de esta pieza
                    </Boton>
                  )}
                </div>
              </div>
              {espejando && piezaObj && (() => {
                const actual = piezasDisponibles.find((x) => x.clave === piezaActiva);
                // Desde el otro lado, el panel habla de la pieza original.
                const pd = actual?.ladoDe ? piezasDisponibles.find((x) => x.clave === actual.ladoDe) : actual;
                const original = pd && piezas.find((p) => p.id === pd.piezaId);
                if (!pd || !original) return null;
                const claveOtro = claveDelOtroLado(pd.clave);
                return (
                  <PanelLadoPar
                    rol={pd.rol} nombrePrenda={pd.grupoNombre} pieza={original}
                    enPar={pd.par} propio={!!ladosPropios[pd.clave]}
                    zonasDelOtroLado={anclaje.zonas.filter((z) => z.pieza === claveOtro).length}
                    onElegir={(propio) => elegirOtroLado(pd, propio)}
                    onQuitarPar={() => quitarPar(pd)}
                    onCancelar={() => setEspejando(false)}
                  />
                );
              })()}

              <div className="mb-2 flex flex-wrap items-center gap-3 text-xs">
                {[['piquetes', '#f5a623'], ['extremos', '#4ade80'], ['bordes', '#6b7389'], ['vertices', '#6b7389'], ['zonas', COLOR.zona]].map(([campo, color]) => (
                  <button key={campo} type="button" onClick={() => setLeyenda((prev) => ({ ...prev, [campo]: !prev[campo] }))}
                    className={'flex items-center gap-1.5 ' + (leyenda[campo] ? 'text-foreground' : 'text-faint-foreground opacity-50')}>
                    <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                    {campo === 'zonas' ? 'zona' : campo}
                  </button>
                ))}
              </div>

              <LienzoAnclaje
                geo={geoActiva}
                anclasResueltas={anclasResueltasDeEstaPieza}
                zonasResueltas={zonasDeEstaPiezaConDatos}
                anclaSeleccionadaId={seleccion?.tipo === 'ancla' ? seleccion.id : null}
                zonaSeleccionadaId={seleccion?.tipo === 'zona' ? seleccion.id : null}
                onSeleccionarAncla={(id) => toggleSeleccion('ancla', id)}
                onSeleccionarZona={(id) => toggleSeleccion('zona', id)}
                leyenda={leyenda}
                modo={modo}
                onElegirCandidato={elegirCandidato}
                onArrastrarZona={moverZona}
                senalServidor={resuelto}
                imagenUrl={disenoSeleccionado?.vistasPorPieza?.[piezaActiva] || disenoSeleccionado?.imagenesPorPieza?.[piezaActiva]}
                borde={bordeContraste}
                onSoltarImagen={ponerImagenEnPieza}
                subiendoImagen={subiendoImagen}
                idVista={piezaActiva}
                ajusteArte={conCalceResuelto(piezaActiva, ajusteArteDe(piezaActiva), calceResuelto)}
                editandoArte={editandoArte && !!disenoSeleccionado?.imagenesPorPieza?.[piezaActiva] && !puntosCalceDe(piezaActiva).some((p) => p.destino)}
                puntosCalce={disenoSeleccionado?.imagenesPorPieza?.[piezaActiva] ? puntosCalceDe(piezaActiva).map((p) => ({
                  ...p, enMolde: p.destino ? calceResuelto[idAnclaDeCalce(piezaActiva, p)] || null : null, activo: p.id === calceDestinoId,
                })) : []}
                onMarcarEnArte={marcarCalceEnArte}
                onMoverArte={(dx, dy) => moverArte(piezaActiva, dx, dy)}
                fondo={fondoEfectivoDe(piezaActiva)}
              />
              {disenoSeleccionado?.imagenesPorPieza?.[piezaActiva] && (
                <PanelAjusteArte
                  ajuste={ajusteArteDe(piezaActiva)}
                  onCambiar={(a) => cambiarAjusteArte(piezaActiva, a)}
                  editando={editandoArte}
                  onEditando={setEditandoArte}
                  calce={{
                    puntos: puntosCalceDe(piezaActiva).map((p) => ({
                      ...p,
                      descripcion: p.destino ? describirReferencia(p.destino.x.ref) : null,
                      resuelto: !!(p.destino && calceResuelto[idAnclaDeCalce(piezaActiva, p)]),
                    })),
                    espejo: calceEspejo, onEspejo: setCalceEspejo,
                    marcando: modo === 'calceArte', enganchandoId: modo === 'calceDestino' ? calceDestinoId : null,
                    onMarcar: empezarCalce, onEnganchar: engancharCalce, onQuitar: quitarCalce,
                    onCambiarPunto: cambiarPuntoCalce, Medida: LineaMedida,
                    onCancelar: () => { setModo(null); setCalceDestinoId(null); },
                  }}
                />
              )}
              <PanelFondo
                titulo="Fondo de esta pieza"
                fondo={fondoPropioDe(piezaActiva)}
                base={fondoVigente}
                heredable
                onCambiar={(f) => cambiarFondo(piezaActiva, f)}
                deshabilitado={creandoDisenoFondo}
              />
              <p className="mt-1 text-xs text-faint-foreground">
                {modo === 'zona' && 'Hacé clic sobre la pieza: ahí nace la zona, enganchada al rasgo más cercano.'}
                {modo === 'cruzar' && 'Hacé clic en el segundo punto: entre los dos vas a poder elegir la esquina del cruce, o el punto medio.'}
                {modo === 'recolocar' && 'Hacé clic en el punto al que querés pegar ' + (recolocarInfo?.eje === 'x' ? 'la posición horizontal' : 'la posición vertical') + '.'}
                {modo === 'importar' && 'Hacé clic en el punto de la pieza donde va a quedar «' + (conjuntoAImportar?.nombre || '') + '»: su primera zona se pega ahí y las demás la siguen.'}
                {modo === 'calceArte' && 'Hacé clic sobre el diseño, en el punto que tiene que tocar la costura' + (calceEspejo ? ' (se crea también su espejo del otro lado).' : '.')}
                {modo === 'calceDestino' && 'Hacé clic en el punto del molde (piquete, extremo o vértice) donde tiene que caer el punto de calce ' + (calceDestinoId || '').replace('c', '') + '.'}
                {!modo && 'Elegí «+ Nueva zona» (panel de la derecha) y hacé clic sobre la pieza para crear una.'}
              </p>

              {(() => {
                const ciclos = Math.max((resuelto?.errores.length || 0) - (resuelto?.sinResolver.length || 0), 0);
                const erroresPieza = resuelto ? resuelto.errores.slice(0, ciclos) : [];
                (resuelto?.sinResolver || []).forEach((s, i) => { if (s.pieza === piezaActiva) erroresPieza.push(resuelto.errores[ciclos + i]); });
                return (
                  <div className="mt-2 flex flex-col gap-2">
                    {erroresPieza.map((e, i) => <Aviso key={'e' + i} tono="error">{e}</Aviso>)}
                    {(resuelto?.avisos || []).slice(0, 6).map((a, i) => <Aviso key={'a' + i} tono="info">{a}</Aviso>)}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Contorno para láser -- pedido explícito varias veces: DEBAJO del
              lienzo donde se editan las zonas, no arriba (antes vivía junto a
              "Diseño", antes de siquiera elegir una pieza). */}
          <div className="max-w-3xl">
            <div className={
              'flex flex-col gap-3 rounded-xl border p-3.5 transition-colors ' +
              (bordeContraste.activo ? 'border-primary/30 bg-primary-soft/40' : 'border-border bg-surface-muted')
            }>
              <div className="flex items-center gap-2.5">
                <button
                  type="button" role="switch" aria-checked={bordeContraste.activo}
                  onClick={() => setBordeContraste((prev) => ({ ...prev, activo: !prev.activo }))}
                  className={'relative h-5 w-9 flex-none rounded-full transition-colors ' + (bordeContraste.activo ? 'bg-primary' : 'bg-surface border border-border')}
                >
                  {/* La perilla necesita `left` explícito -- sin él, el
                      "static position" de un absolute sin offset horizontal
                      cae bajo el text-align:center que el navegador le pone
                      a <button> por defecto, y la perilla arrancaba pegada a
                      la derecha aunque el estado fuera "apagado" (el bug
                      real: "ese botón está malo"). */}
                  <span className={'absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ' + (bordeContraste.activo ? 'translate-x-4' : 'translate-x-0')} />
                </button>
                {/* Clickeable también en el texto -- antes era un <label> nativo
                    alrededor del checkbox (cualquier parte de la frase
                    activaba el toggle); al pasar a un switch propio con
                    role="switch" se perdió ese área grande sin querer, y
                    solo el interruptor de 36×20px seguía respondiendo. */}
                <span
                  className="cursor-pointer select-none text-sm font-medium text-foreground"
                  onClick={() => setBordeContraste((prev) => ({ ...prev, activo: !prev.activo }))}
                >
                  Contorno para láser
                </span>
                <Ayuda>
                  El mismo contorno sirve para dos cosas: se ve en el editor y en el PDF encima del
                  diseño recortado (para no perder de vista los piquetes) y es el que se corta de
                  verdad. Desplazamiento: cuánto se empuja hacia AFUERA del molde real antes de
                  cortar (compensa el grosor del corte del láser -- 0.1cm es un valor típico). Grosor:
                  el ancho de la línea, real de producción.
                </Ayuda>
              </div>
              {bordeContraste.activo && (
                <div className="flex flex-wrap items-center gap-5 border-t border-border/60 pt-3">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input type="color" className="h-9 w-9 cursor-pointer rounded-lg border border-border bg-transparent p-0.5" value={bordeContraste.colorHex}
                      onChange={(e) => setBordeContraste((prev) => ({ ...prev, colorHex: e.target.value }))} />
                    <span className="text-xs text-muted-foreground">Color</span>
                  </label>
                  <Campo etiqueta="Desplazamiento (cm)" className="w-32">
                    <InputNumero step={0.1} min={0} value={bordeContraste.desplazamientoCm ?? 0}
                      onChange={(n) => setBordeContraste((prev) => ({ ...prev, desplazamientoCm: n }))} />
                  </Campo>
                  <Campo etiqueta="Grosor (cm)" className="w-28">
                    <InputNumero step={0.1} min={0.01} value={bordeContraste.grosorCm}
                      onChange={(n) => setBordeContraste((prev) => ({ ...prev, grosorCm: n }))} />
                  </Campo>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Boton variante="primario" type="submit" disabled={estadoGuardado === 'guardando'}>
              {estadoGuardado === 'guardando' ? 'Guardando…' : editandoId ? 'Guardar cambios' : 'Guardar producción'}
            </Boton>
            <EstadoDeGuardado estado={estadoGuardado} sinGuardar={sinGuardar} autoguardable={autoguardable} guardadoEn={guardadoEn} esNuevo={!editandoId} />
            <Boton
              variante="fantasma" type="button"
              disabled={grupoIds.length === 0 || anclaje.zonas.length === 0}
              onClick={guardarComoPlantilla}
              title={anclaje.zonas.length === 0 ? 'Armá al menos una zona primero' : undefined}
            >
              Guardar como plantilla
            </Boton>
            {editandoId && (
              <Boton variante="fantasma" type="button" onClick={nuevaDesdeTarjetas}>+ Nueva producción</Boton>
            )}
          </div>
          {error && <Aviso tono="error">{error}</Aviso>}
        </Tarjeta>
      )}

      </div>

      {/* Panel derecho: anclado, redimensionable y colapsable a íconos
          (PanelDock) -- mismo lenguaje visual que el nav de apartados. Acá
          viven "+ Nueva zona" y el selector de zonas (antes debajo del
          lienzo) más la ficha de edición del ancla/zona elegida. */}
      {piezaActiva && (
        <PanelDock storageKey="zona" lado="derecha" anchoPorDefecto={384} anchoMinimo={300} anchoMaximo={560}>
          {(colapsado) => colapsado ? null : (
            <div className="flex flex-col gap-3 p-3">
              <Boton
                variante={modo === 'zona' ? 'primario' : 'acento'}
                type="button"
                className="w-full justify-center gap-1.5 py-2.5 text-sm font-semibold"
                onClick={() => setModo((m) => (m === 'zona' ? null : 'zona'))}
              >
                <span className="text-base leading-none">+</span> Nueva zona
              </Boton>

              {/* Conjuntos de zonas: guardados desde una zona encadenada,
                  se pegan en esta pieza eligiendo el punto en el lienzo. */}
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => setMostrandoConjuntos((v) => !v)}
                  className="flex items-center justify-between rounded-lg px-1 py-1 text-xs font-semibold uppercase tracking-wide text-faint-foreground hover:text-foreground"
                >
                  <span>Conjuntos guardados · {conjuntos.length}</span>
                  <span>{mostrandoConjuntos ? '▾' : '▸'}</span>
                </button>
                {modo === 'importar' && conjuntoAImportar && (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/40 bg-primary-soft px-3 py-2 text-xs text-primary">
                    <span>Clic en la pieza para pegar «{conjuntoAImportar.nombre}»</span>
                    <button type="button" className="font-medium hover:underline" onClick={() => { setModo(null); setConjuntoAImportar(null); }}>Cancelar</button>
                  </div>
                )}
                {mostrandoConjuntos && (
                  conjuntos.length === 0 ? (
                    <p className="px-1 text-xs text-faint-foreground">
                      Todavía no hay. Elegí una zona que esté pegada a otra y usá «Guardar conjunto».
                    </p>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {conjuntos.map((c) => (
                        <div key={c.id} className={'flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs ' + (conjuntoAImportar?.id === c.id ? 'border-primary bg-primary-soft/50' : 'border-border')}>
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium text-foreground">{c.nombre}</div>
                            <div className="truncate text-faint-foreground">{(c.anclaje?.zonas || []).map((z) => z.nombre || z.id).join(' · ')}</div>
                          </div>
                          <Boton variante="acento" tamano="sm" type="button" onClick={() => empezarImportacion(c)}>Pegar</Boton>
                          <button type="button" className="text-faint-foreground hover:text-danger" title="Eliminar conjunto" onClick={() => borrarConjunto(c)}>×</button>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>

              <div className="flex flex-col gap-1.5 border-t border-border pt-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-faint-foreground">Zonas de esta pieza</span>
                {zonasDeEstaPieza.length === 0 ? (
                  <span className="text-xs text-faint-foreground">Sin zonas todavía en esta pieza.</span>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {anclaje.zonas.filter((z) => z.pieza === piezaActiva).map((z) => (
                      <button key={z.id} type="button" onClick={() => toggleSeleccion('zona', z.id)}
                        className={'group flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ' +
                          (seleccion?.id === z.id ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-surface text-muted-foreground hover:border-primary')}>
                        {(z.nombre || z.id) + ' · ' + tipoCortoDeZona(z)}
                        <span onClick={(e) => { e.stopPropagation(); borrarNodo('zona', z.id); }} className="text-faint-foreground hover:text-danger" title="Quitar esta zona">×</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-border pt-3">
                {!seleccionado && (
                  <div className="flex items-center justify-center rounded-lg border border-dashed border-border p-6 text-center text-sm text-faint-foreground">
                    Elegí un ancla o una zona en el lienzo para editarla acá.
                  </div>
                )}
                {seleccionado && seleccion.tipo === 'ancla' && (
                  <PanelAncla
                    ancla={seleccionado}
                    onCerrar={() => toggleSeleccion('ancla', seleccionado.id)}
                    onRenombrar={(v) => renombrarNodo('ancla', seleccionado.id, v)}
                    onRecolocar={(eje) => { setModo('recolocar'); setRecolocarInfo({ anclaId: seleccionado.id, eje }); }}
                    onCambiarEje={(eje, cambios) => setAnclaje((prev) => ({ ...prev, anclas: prev.anclas.map((a) => (a.id === seleccionado.id ? { ...a, [eje]: { ...a[eje], ...cambios } } : a)) }))}
                    onQuitar={() => borrarNodo('ancla', seleccionado.id)}
                    resueltoAncla={resuelto?.anclas[seleccionado.id]}
                    motivo={resuelto?.sinResolver.find((s) => s.id === seleccionado.id)?.motivo}
                  />
                )}
                {seleccionado && seleccion.tipo === 'zona' && (() => {
                  const conjunto = conjuntoDeZona(anclaje, seleccionado.id);
                  return (
                    <div className="mb-3">
                      <Boton
                        variante="secundario" tamano="sm" type="button" className="w-full"
                        disabled={!conjunto}
                        onClick={() => guardarConjunto(seleccionado.id)}
                        title={conjunto ? undefined : 'Para guardar un conjunto, esta zona tiene que estar pegada a otra (o tener otra pegada a ella).'}
                      >
                        {conjunto ? 'Guardar conjunto (' + conjunto.zonas.length + ' zonas)' : 'Guardar conjunto'}
                      </Boton>
                      {!conjunto && (
                        <p className="mt-1 text-[11px] text-faint-foreground">
                          Solo zonas encadenadas: pegá otra zona a esta (o esta a otra) para poder guardarlas juntas.
                        </p>
                      )}
                    </div>
                  );
                })()}
                {seleccionado && seleccion.tipo === 'zona' && (
                  <PanelZona
                    zona={seleccionado}
                    fuentes={fuentes}
                    onFuenteAgregada={(f) => setFuentes((prev) => (prev.some((x) => x.id === f.id) ? prev : [...prev, f]))}
                    anclasDisponibles={anclaje.anclas.filter((a) => a.pieza === piezaActiva)}
                    anclasResueltas={resuelto?.anclas || {}}
                    onRenombrar={(v) => renombrarNodo('zona', seleccionado.id, v)}
                    onActualizar={(cambios) => actualizarZonaConSincronia(seleccionado, cambios)}
                    onCambiarGrupo={(g) => cambiarGrupoDeZona(seleccionado, g)}
                    hermanas={zonasDelMismoGrupo(seleccionado)}
                    onQuitar={() => borrarNodo('zona', seleccionado.id)}
                    onDuplicar={() => duplicarZona(seleccionado)}
                    onCruzar={() => { setModo('cruzar'); setCruzandoZonaId(seleccionado.id); }}
                    onVolverAUnPunto={() => {
                      const sobra = seleccionado.anclaY;
                      actualizarZona(seleccionado.id, { anclaY: seleccionado.anclaX, modoCruce: 'esquina' });
                      if (!anclaje.zonas.some((z) => z.id !== seleccionado.id && (z.anclaX === sobra || z.anclaY === sobra))) {
                        setAnclaje((prev) => ({ ...prev, anclas: prev.anclas.filter((a) => a.id !== sobra) }));
                      }
                    }}
                  />
                )}
              </div>
            </div>
          )}
        </PanelDock>
      )}
    </div>
  );
}

// ============ panel: ancla ============
// "Pegado a" es un DATO, no un campo a rellenar -- el punto se señala
// clicando en el lienzo (Recolocar), no eligiendo de un desplegable "el
// piquete 2 de 5" sin ver dónde está. Puerto de bloqueEje() (main.js).
function PanelAncla({ ancla, onCerrar, onRenombrar, onRecolocar, onCambiarEje, onQuitar, resueltoAncla, motivo }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3">
      <div className="flex items-center justify-between">
        {/* Clickeable para cerrar, mismo gesto que el nombre de una zona --
            necesario acá porque el punto en el lienzo puede quedar oculto
            (toggle "zona" apagado) sin otra forma de deseleccionarlo. */}
        <h4
          className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-faint-foreground hover:text-foreground"
          onClick={onCerrar}
          title="Cerrar"
        >
          Punto de ancla
        </h4>
        <Boton variante="fantasma" tamano="sm" type="button" onClick={onQuitar}>Quitar</Boton>
      </div>
      <Campo etiqueta="Se llama">
        <Input defaultValue={ancla.id} onBlur={(e) => onRenombrar(e.target.value)} />
      </Campo>
      {['x', 'y'].map((eje) => {
        const e = ancla[eje];
        const esProp = e.modo === 'proporcional';
        return (
          <div key={eje} className="flex flex-col gap-1.5 border-t border-border pt-2">
            <span className="text-xs font-semibold text-faint-foreground">{eje === 'x' ? 'De lado (horizontal)' : 'De alto (vertical)'}</span>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Pegado a:</span>
              <span className={'flex-1 truncate ' + (e.ref ? 'text-foreground' : 'text-danger')}>{describirReferencia(e.ref)}</span>
              <Boton variante="fantasma" tamano="sm" type="button" onClick={() => onRecolocar(eje)}>Recolocar</Boton>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Lo separo</span>
              <InputNumero className="w-20" step={esProp ? 1 : 0.1}
                value={esProp ? Math.round(e.valor * 100) : e.valor}
                onChange={(n) => onCambiarEje(eje, { valor: esProp ? n / 100 : n })} />
              <Select className="max-w-[150px]" value={e.modo} onChange={(ev) => onCambiarEje(eje, { modo: ev.target.value, valor: 0 })}>
                <option value="fijo">cm fijos</option>
                <option value="proporcional">% de la pieza</option>
              </Select>
            </div>
            {!e.ref && <p className="text-xs text-danger">Todavía no está pegado a ningún punto: tocá «Recolocar» y hacé clic sobre la pieza.</p>}
            {e.ref && !resueltoAncla && <p className="text-xs text-danger">{motivo || 'No se puede calcular en esta talla.'}</p>}
          </div>
        );
      })}
      {resueltoAncla && <p className="text-xs text-faint-foreground">→ {resueltoAncla.x}, {resueltoAncla.y} cm en esta talla</p>}
    </div>
  );
}

function LineaMedida({ etiqueta, valor, onCambiar }) {
  const esProp = valor.modo === 'proporcional';
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 flex-none text-xs text-muted-foreground">{etiqueta}</span>
      <Select className="w-28" value={valor.modo} onChange={(e) => onCambiar({ modo: e.target.value, valor: 0 })}>
        <option value="fijo">cm</option>
        <option value="proporcional">% de la pieza</option>
      </Select>
      <InputNumero className="w-20" step={esProp ? 1 : 0.1}
        value={esProp ? Math.round(valor.valor * 100) : valor.valor}
        onChange={(n) => onCambiar({ modo: valor.modo, valor: esProp ? n / 100 : n })} />
    </div>
  );
}

// Sube el archivo del logo a Storage apenas se suelta (mismo mecanismo que
// soltar una imagen en el lienzo) y guarda solo su URL en la zona -- el archivo real
// nunca viaja dentro del anclaje.
// Logo de una zona: PNG/JPG, o PDF (vectorial). Del PDF se guarda el archivo
// tal cual (lo que va al PDF de producción) y una vista en PNG para verlo acá,
// igual que el arte del diseño (ver vistaPdf.js).
function SelectorLogo({ url, vista, onElegir }) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState(null);
  const onDrop = useCallback(async (archivos) => {
    const archivo = archivos[0];
    if (!archivo) return;
    setSubiendo(true);
    setError(null);
    try {
      let urlVista = null;
      if (archivo.type === 'application/pdf') {
        const { vistaDePdf } = await import('../utilidades/vistaPdf.js');
        let v;
        try { v = await vistaDePdf(archivo, { ladoMaxPx: 1200 }); }
        catch (e) { throw new Error('No se pudo leer el PDF (' + e.message + '). ¿Está protegido o dañado?'); }
        urlVista = await subirArchivo(v.blob, 'image/png', 'logo-vista');
        if (v.paginas > 1) setError('El PDF tiene ' + v.paginas + ' páginas: se usa solo la primera.');
      }
      const urlSubida = await subirArchivo(archivo, archivo.type, 'logo');
      onElegir({ logoRuta: urlSubida, logoVista: urlVista });
    } catch (e) { setError(e.message); }
    finally { setSubiendo(false); }
  }, [onElegir]);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'], 'application/pdf': ['.pdf'] }, multiple: false,
  });

  return (
    <div>
      <div {...getRootProps()}
        className={'cursor-pointer rounded-lg border-2 border-dashed px-3 py-2 text-center text-xs ' +
          (isDragActive ? 'border-primary bg-primary-soft text-primary' : 'border-border text-faint-foreground')}>
        <input {...getInputProps()} />
        {subiendo ? 'Subiendo…' : url ? 'Reemplazar archivo' : 'Arrastrar o elegir el logo (PNG, JPG o PDF)'}
      </div>
      {error && <Aviso tono="error">{error}</Aviso>}
      {url && (vista || !/\.pdf(\?|$)/i.test(url)) && <img className="mt-2 max-h-16 rounded-md border border-border" src={vista || url} alt="Logo" />}
      {url && vista && <p className="mt-1 text-[11px] text-faint-foreground">PDF vectorial: se imprime en vectores.</p>}
    </div>
  );
}

const ORIGEN_POS = {
  centro: [0.5, 0.5], centroArriba: [0.5, 0], centroAbajo: [0.5, 1],
  centroIzq: [0, 0.5], centroDer: [1, 0.5],
  supIzq: [0, 0], supDer: [1, 0], infIzq: [0, 1], infDer: [1, 1],
};

// Reemplaza la lista desplegable de "Punto de ancla" -- en vez de leer 9
// nombres de texto para entender cuál está activo, un cubo con los 9 puntos
// reales (mismo layout que la caja de una zona) y el punto activo resaltado
// se entiende con un vistazo. Pedido explícito: "una solución comunicativa
// sin necesidad de demasiado texto".
function SelectorOrigen({ valor, onCambiar }) {
  const activo = valor || 'centro';
  const LADO = 72, M = 12;
  const punto = (fx, fy) => [M + fx * (LADO - M * 2), M + fy * (LADO - M * 2)];
  const etiquetaActiva = ORIGENES_ZONA.find(([v]) => v === activo)?.[1] || 'centro';
  return (
    <div className="flex items-center gap-3">
      <svg width={LADO} height={LADO} viewBox={'0 0 ' + LADO + ' ' + LADO} className="flex-none">
        <rect x={M} y={M} width={LADO - M * 2} height={LADO - M * 2} rx="6" fill="rgba(76,141,255,0.08)" stroke="#2b303d" strokeWidth="1.5" />
        {ORIGENES_ZONA.map(([v, etiqueta]) => {
          const [fx, fy] = ORIGEN_POS[v];
          const [cx, cy] = punto(fx, fy);
          const esActivo = v === activo;
          return (
            <g key={v} onClick={() => onCambiar(v)} className="cursor-pointer">
              <circle cx={cx} cy={cy} r={9} fill="transparent" />
              <circle cx={cx} cy={cy} r={esActivo ? 5.5 : 3.5}
                fill={esActivo ? '#4c8dff' : '#3a4051'}
                stroke={esActivo ? '#e6e9f0' : 'none'} strokeWidth={esActivo ? 1.5 : 0}
                className="transition-all" />
              <title>{etiqueta}</title>
            </g>
          );
        })}
      </svg>
      <span className="text-xs text-muted-foreground">{etiquetaActiva}</span>
    </div>
  );
}

// Reemplaza la lista desplegable de "Cruce" -- mismo espíritu que
// SelectorOrigen: un rectángulo entre las dos anclas del cruce, con sus dos
// esquinas reales + el punto medio marcados, y el que está activo resaltado.
// El diagrama respeta la geometría real (horiz/vert, ya calculada arriba en
// PanelZona a partir de dónde resuelven de verdad las dos anclas) en vez de
// mostrar siempre "arriba-izquierda" fijo.
function SelectorCruce({ zona, etiquetaActual, etiquetaOtra, horiz, vert, onElegirEsquina, onElegirOtra, onElegirMedio }) {
  const LADO = 76, M = 14;
  const fxActual = horiz === 'derecha' ? 1 : 0;
  const fyActual = vert === 'abajo' ? 1 : 0;
  const punto = (fx, fy) => [M + fx * (LADO - M * 2), M + fy * (LADO - M * 2)];
  const [axA, ayA] = punto(fxActual, fyActual);
  const [axB, ayB] = punto(1 - fxActual, 1 - fyActual);
  const [cx, cy] = punto(0.5, 0.5);
  const enMedio = zona.modoCruce === 'medio';
  return (
    <div className="flex items-center gap-3">
      <svg width={LADO} height={LADO} viewBox={'0 0 ' + LADO + ' ' + LADO} className="flex-none">
        <rect x={M} y={M} width={LADO - M * 2} height={LADO - M * 2} rx="6" fill="rgba(76,141,255,0.06)" stroke="#2b303d" strokeWidth="1.5" strokeDasharray="3 3" />
        <line x1={axA} y1={ayA} x2={axB} y2={ayB} stroke="#2b303d" strokeWidth="1.5" />
        <g onClick={onElegirEsquina} className="cursor-pointer">
          <circle cx={axA} cy={ayA} r={9} fill="transparent" />
          <circle cx={axA} cy={ayA} r={!enMedio ? 6 : 4} fill={!enMedio ? '#4c8dff' : '#3a4051'} stroke={!enMedio ? '#e6e9f0' : 'none'} strokeWidth={!enMedio ? 1.5 : 0} className="transition-all" />
          <title>{etiquetaActual}</title>
        </g>
        <g onClick={onElegirOtra} className="cursor-pointer">
          <circle cx={axB} cy={ayB} r={9} fill="transparent" />
          <circle cx={axB} cy={ayB} r={4} fill="#3a4051" />
          <title>{etiquetaOtra}</title>
        </g>
        <g onClick={onElegirMedio} className="cursor-pointer">
          <circle cx={cx} cy={cy} r={9} fill="transparent" />
          <circle cx={cx} cy={cy} r={enMedio ? 6 : 4} fill={enMedio ? '#4c8dff' : '#3a4051'} stroke={enMedio ? '#e6e9f0' : 'none'} strokeWidth={enMedio ? 1.5 : 0} className="transition-all" />
          <title>{'a medio camino entre «' + zona.anclaX + '» y «' + zona.anclaY + '»'}</title>
        </g>
      </svg>
      <span className="text-xs text-muted-foreground">{enMedio ? 'A medio camino' : etiquetaActual}</span>
    </div>
  );
}

// ============ panel: zona ============
function PanelZona({ zona, fuentes, onFuenteAgregada, anclasDisponibles, anclasResueltas, onRenombrar, onActualizar, onCambiarGrupo, hermanas, onQuitar, onDuplicar, onCruzar, onVolverAUnPunto }) {
  const cruzada = !!(zona.anclaX && zona.anclaY && zona.anclaX !== zona.anclaY);
  const rxA = anclasResueltas[zona.anclaX], ryA = anclasResueltas[zona.anclaY];
  let etiquetaEsquinaActual = 'esquina', etiquetaEsquinaOtra = 'la otra esquina';
  let horiz = null, vert = null;
  if (cruzada && rxA && ryA) {
    horiz = rxA.x < ryA.x ? 'izquierda' : rxA.x > ryA.x ? 'derecha' : null;
    vert = ryA.y < rxA.y ? 'arriba' : ryA.y > rxA.y ? 'abajo' : null;
    const nombrar = (v, h) => (v && h ? 'esquina de ' + v + ' a la ' + h : v ? 'esquina de ' + v : h ? 'esquina de la ' + h : 'esquina');
    etiquetaEsquinaActual = nombrar(vert, horiz);
    etiquetaEsquinaOtra = nombrar(vert === 'arriba' ? 'abajo' : vert === 'abajo' ? 'arriba' : null, horiz === 'izquierda' ? 'derecha' : horiz === 'derecha' ? 'izquierda' : null);
  }
  const anclaActual = anclasDisponibles.find((a) => a.id === zona.anclaX);

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-faint-foreground">Zona</h4>
        <div className="flex gap-2">
          <Boton variante="fantasma" tamano="sm" type="button" onClick={onDuplicar}>Duplicar</Boton>
          <Boton variante="fantasma" tamano="sm" type="button" onClick={onQuitar}>Quitar</Boton>
        </div>
      </div>
      <Campo etiqueta="Se llama">
        <Input defaultValue={zona.id} onBlur={(e) => onRenombrar(e.target.value)} />
      </Campo>

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <span className="text-xs font-semibold text-faint-foreground">Qué va aquí</span>
        <Select value={zona.tipo === 'logo' ? 'logo' : campoDeZona(zona)} onChange={(e) => {
          const valor = e.target.value;
          if (valor === 'logo') onActualizar({ tipo: 'logo', campoPedido: null });
          // La talla: en negro y centrada, sobre su cápsula blanca.
          else if (valor === 'talla') onActualizar({ campoPedido: 'talla', tipo: 'texto', colorHex: '#000000', alineacion: 'centro' });
          else onActualizar({ campoPedido: valor, tipo: valor === 'numero' ? 'numero' : 'texto' });
        }}>
          <option value="nombre">un texto: el nombre del jugador</option>
          <option value="numero">un número (dorsal)</option>
          <option value="fijo">un texto fijo</option>
          <option value="talla">la talla de la prenda</option>
          <option value="logo">un logo o escudo</option>
        </Select>
        {zona.tipo === 'logo' ? (
          <SelectorLogo url={zona.logoRuta} vista={zona.logoVista} onElegir={(logo) => onActualizar(logo)} />
        ) : campoDeZona(zona) === 'talla' ? (
          <>
            <div className="flex gap-1" role="group" aria-label="Línea de la talla">
              {[['masculino', 'Masculino', 'M'], ['femenino', 'Femenino', 'M-']].map(([valor, etiqueta, ej]) => {
                const activa = (zona.generoTalla || 'masculino') === valor;
                return (
                  <button key={valor} type="button" aria-pressed={activa} onClick={() => onActualizar({ generoTalla: valor })}
                    className={'flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium ' + (activa ? 'border-primary bg-primary-soft text-primary' : 'border-border text-muted-foreground hover:border-primary/50')}>
                    {etiqueta} <span className="ml-1 font-mono opacity-70">{ej}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-faint-foreground">
              Se pone sola: la talla de cada prenda en mayúscula, negra dentro de su círculo blanco
              {(zona.generoTalla || 'masculino') === 'femenino' ? ', con el guion de la línea femenina (XS-, S-, M-…)' : ''}.
              La zona es su tamaño máximo.
            </p>
          </>
        ) : campoDeZona(zona) === 'fijo' ? (
          <Input placeholder="Texto fijo" value={zona.valorFijo || ''} onChange={(e) => onActualizar({ valorFijo: e.target.value })} />
        ) : (
          <Input placeholder={campoDeZona(zona) === 'nombre' ? 'Ejemplo: PEÑA' : 'Ejemplo: 7'} value={zona.valorEjemplo || ''} onChange={(e) => onActualizar({ valorEjemplo: e.target.value })} />
        )}
      </div>

      {/* Fuente, color, espaciado, orientación y borde -- todo el estilo del
          texto junto, justo debajo de qué texto lleva la zona. */}
      {zona.tipo !== 'logo' && campoDeZona(zona) !== 'talla' && <PanelTexto zona={zona} fuentes={fuentes} onActualizar={onActualizar} onFuenteAgregada={onFuenteAgregada} />}

      {campoDeZona(zona) !== 'talla' && <div className="flex flex-col gap-2 border-t border-border pt-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-faint-foreground">Repetir en otra zona</span>
          <Ayuda>Si dos zonas tienen el mismo grupo, el contenido de una se copia a la otra automáticamente (un escudo, número o nombre repetido en varias piezas). La posición y el tamaño siguen siendo de cada una.</Ayuda>
        </div>
        <Input placeholder="ej. SPONSOR_PRINCIPAL" value={zona.grupo || ''} onChange={(e) => onCambiarGrupo(e.target.value || null)} />
        {hermanas.length > 0 && <p className="text-xs text-faint-foreground">Vinculada con: {hermanas.map((h) => h.id).join(', ')}</p>}
      </div>}

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <span className="text-xs font-semibold text-faint-foreground">Tamaño</span>
        {zona.tipo === 'logo' && (
          <div className="flex items-center gap-1.5">
            <label className="flex items-center gap-1.5 text-xs text-foreground">
              <input type="checkbox" checked={zona.cruz !== false} onChange={(e) => onActualizar({ cruz: e.target.checked })} />
              Zona en cruz
            </label>
            <Ayuda>
              Con la cruz activada, el logo tiene un cuadro central garantizado más dos brazos
              (uno para logos anchos, otro para altos), sin deformarlo ni recortarlo -- "Cabe en"
              es el lado de ese cuadro. Sin cruz, es un rectángulo normal de ancho y alto propios:
              para un logo con tamaño ya decidido de antemano (ej. un sponsor), sin ese margen
              extra.
            </Ayuda>
          </div>
        )}
        {zona.tipo === 'logo' && zona.cruz !== false ? (
          <LineaMedida etiqueta="Cabe en" valor={zona.lado} onCambiar={(m) => onActualizar({ lado: m })} />
        ) : (
          <>
            <LineaMedida etiqueta="Ancho" valor={zona.ancho} onCambiar={(m) => onActualizar({ ancho: m })} />
            <LineaMedida etiqueta="Alto" valor={zona.alto} onCambiar={(m) => onActualizar({ alto: m })} />
          </>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-3">
        <span className="text-xs font-semibold text-faint-foreground">Posición</span>
        {!cruzada ? (
          <div className="flex items-center gap-2">
            <span className="w-20 flex-none text-xs text-muted-foreground">Se pega a</span>
            <span className="text-xs font-medium" style={{ color: colorDeReferencia(anclaActual?.x?.ref) }}>
              {describirReferencia(anclaActual?.x?.ref)}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="w-20 flex-none text-xs text-muted-foreground">Cruce</span>
            <SelectorCruce
              zona={zona} etiquetaActual={etiquetaEsquinaActual} etiquetaOtra={etiquetaEsquinaOtra} horiz={horiz} vert={vert}
              onElegirEsquina={() => onActualizar({ modoCruce: 'esquina' })}
              onElegirOtra={() => onActualizar({ anclaX: zona.anclaY, anclaY: zona.anclaX, modoCruce: 'esquina' })}
              onElegirMedio={() => onActualizar({ modoCruce: 'medio' })}
            />
          </div>
        )}
        <div className="flex items-center gap-3">
          <span className="w-20 flex-none text-xs text-muted-foreground">Punto de ancla</span>
          <SelectorOrigen valor={zona.origen} onCambiar={(v) => onActualizar({ origen: v })} />
        </div>
        {cruzada ? (
          <button type="button" onClick={onVolverAUnPunto} className="self-start text-xs text-primary hover:underline">Volver a un solo punto de ancla</button>
        ) : (
          <button type="button" onClick={onCruzar} className="self-start text-xs text-primary hover:underline">+ Agregar otro punto de ancla</button>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <span className="text-xs font-semibold text-faint-foreground">Corrección</span>
        <LineaMedida etiqueta="Mover X" valor={zona.offset.x} onCambiar={(m) => onActualizar({ offset: { ...zona.offset, x: m } })} />
        <LineaMedida etiqueta="Mover Y" valor={zona.offset.y} onCambiar={(m) => onActualizar({ offset: { ...zona.offset, y: m } })} />
        <div className="flex items-center gap-2">
          <span className="w-24 flex-none text-xs text-muted-foreground" title="Grados positivos giran en sentido antihorario, igual que en Illustrator y en el PDF">Girar ↺</span>
          <InputNumero className="w-20" step={1} value={zona.rotacion || 0}
            onChange={(n) => onActualizar({ rotacion: n })} />
          <span className="text-xs text-muted-foreground">°</span>
          {[0, 90, 180, 270].map((g) => (
            <button key={g} type="button" onClick={() => onActualizar({ rotacion: g })}
              className={'rounded-full border px-2 py-0.5 text-[10px] ' + ((zona.rotacion || 0) === g ? 'border-primary bg-primary-soft text-primary' : 'border-border text-faint-foreground hover:border-primary')}>
              {g}°
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}

// Cómo va el guardado del producto, al lado del botón Guardar.
function EstadoDeGuardado({ estado, sinGuardar, autoguardable, guardadoEn, esNuevo }) {
  let texto, color = 'text-faint-foreground';
  if (estado === 'guardando') texto = 'Guardando…';
  else if (estado === 'error') { texto = 'No se pudo guardar: se reintenta solo'; color = 'text-danger'; }
  else if (sinGuardar && autoguardable) texto = 'Cambios sin guardar · se guarda solo en un momento';
  else if (sinGuardar) {
    texto = esNuevo ? 'Sin guardar · con nombre, prenda y una zona se guarda solo' : 'Sin guardar · falta el nombre o la prenda';
    color = 'text-amber-400';
  } else if (guardadoEn) {
    texto = '✓ Guardado ' + new Date(guardadoEn).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
    color = 'text-emerald-400';
  } else if (!esNuevo) texto = '✓ Todo guardado';
  if (!texto) return null;
  return <span className={'text-xs ' + color} role="status" aria-live="polite">{texto}</span>;
}
