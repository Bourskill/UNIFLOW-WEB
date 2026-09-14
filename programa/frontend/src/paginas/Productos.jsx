import { useCallback, useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  listarGrupos,
  listarDisenos,
  listarProductos,
  listarPiezas,
  crearDiseno,
  eliminarDiseno,
  crearProducto,
  eliminarProducto,
  crearPlantilla,
  resolverAnclaje,
  subirArchivo,
} from '../api.js';
import { ordenarTallasNatural } from '../constantes.js';
import { Boton, Campo, Input, Select, Tarjeta, Chip, Aviso, Ayuda } from '../componentes/ui.jsx';
import { InputNumero } from '../componentes/InputNumero.jsx';
import { PanelDock } from '../componentes/PanelDock.jsx';
import { LienzoAnclaje, COLOR } from '../componentes/LienzoAnclaje.jsx';
import { SlotImagenDiseno } from '../componentes/SlotImagenDiseno.jsx';
import { geometriaParaAnclaje, describirReferencia } from '../utilidades/geometriaAnclaje.js';

const BORDE_POR_DEFECTO = { activo: false, colorHex: '#000000', grosorCm: 0.03, desplazamientoCm: 0 };
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
  if (zona.campoPedido === 'fijo') return zona.valorFijo || zona.id;
  if (zona.campoPedido === 'numero') return zona.valorEjemplo ? 'N° · ' + zona.valorEjemplo : 'Número';
  return zona.valorEjemplo ? 'Nombre · ' + zona.valorEjemplo : 'Nombre';
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
    zonas: (anclajeOriginal.zonas || []).map((z) => ({ ...z, valorFijo: '', logoRuta: null, valorEjemplo: '' })),
  };
}

// Para el selector de zonas del panel: el nombre asignado + qué tipo de
// contenido lleva -- nunca el nombre del archivo del logo (a veces larguísimo,
// y ya se ve en el propio selector de logo cuando la zona está abierta).
function tipoCortoDeZona(z) {
  if (z.tipo === 'logo') return 'Logo';
  if (z.campoPedido === 'fijo') return 'Texto fijo';
  if (z.campoPedido === 'numero') return 'Número';
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

export function Productos({ recargarSenal, onCambio, plantillaParaUsar, onConsumirPlantilla }) {
  const [grupos, setGrupos] = useState([]);
  const [disenos, setDisenos] = useState([]);
  const [productos, setProductos] = useState([]);
  const [piezas, setPiezas] = useState([]);
  const [nombre, setNombre] = useState('');
  // grupoIds: uno o más -- productos multi-prenda ("kit": camiseta + short
  // + medias en un solo armado). Un solo elemento es el caso de siempre.
  const [grupoIds, setGrupoIds] = useState([]);
  const [disenoId, setDisenoId] = useState('');
  const [anclaje, setAnclaje] = useState({ anclas: [], zonas: [] });
  const [piezaActiva, setPiezaActiva] = useState(null);
  const [tallaTrabajoPorRol, setTallaTrabajoPorRol] = useState({});
  const [bordeContraste, setBordeContraste] = useState(BORDE_POR_DEFECTO);
  const [leyenda, setLeyenda] = useState(LEYENDA_POR_DEFECTO);
  const [seleccion, setSeleccion] = useState(null); // { tipo: 'ancla'|'zona', id }
  const [modo, setModo] = useState(null); // null | 'zona' | 'cruzar' | 'recolocar'
  const [cruzandoZonaId, setCruzandoZonaId] = useState(null);
  const [recolocarInfo, setRecolocarInfo] = useState(null); // { anclaId, eje }
  const [resuelto, setResuelto] = useState(null);
  const [error, setError] = useState(null);

  const [creandoDiseno, setCreandoDiseno] = useState(false);
  const [nombreNuevoDiseno, setNombreNuevoDiseno] = useState('');
  const [imagenesNuevoDiseno, setImagenesNuevoDiseno] = useState({});
  const [errorDiseno, setErrorDiseno] = useState(null);
  // Ver el comentario igual en Piezas.jsx -- acá el caso era el peor de
  // los cinco: sin esto, la primera visita mostraba "Creá primero una
  // prenda (Piezas → Prendas)" mientras el fetch seguía en vuelo, aunque
  // el usuario YA tuviera prendas armadas -- le decía que le faltaba algo
  // que en realidad ya tenía.
  const [cargando, setCargando] = useState(true);

  async function recargar() {
    setCargando(true);
    try {
      const [gs, ds, ps, pzs] = await Promise.all([listarGrupos(), listarDisenos(), listarProductos(), listarPiezas()]);
      setGrupos(gs);
      setDisenos(ds);
      setProductos(ps);
      setPiezas(pzs);
      if (gs.length > 0 && grupoIds.length === 0) setGrupoIds([gs[0].id]);
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
    setGrupoIds(plantillaParaUsar.grupoIds || (plantillaParaUsar.grupoId ? [plantillaParaUsar.grupoId] : []));
    setAnclaje(plantillaParaUsar.anclaje || { anclas: [], zonas: [] });
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
    g.piezas.map((gp) => ({
      clave: namespacear ? g.id + '::' + gp.rol : gp.rol,
      rol: gp.rol,
      grupoId: g.id,
      grupoNombre: g.nombre,
      piezaId: gp.piezaId,
    }))
  );
  const disenosDeEstaCombinacion = disenos.filter((d) => mismoConjunto(d.grupoIds || (d.grupoId ? [d.grupoId] : []), grupoIds));
  const disenoSeleccionado = disenos.find((d) => d.id === disenoId);

  function piezaDeClave(clave) {
    const pd = piezasDisponibles.find((x) => x.clave === clave);
    return pd && piezas.find((p) => p.id === pd.piezaId);
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
  }, [JSON.stringify(grupoIds), JSON.stringify(tallaTrabajoPorRol), JSON.stringify(anclaje), piezas.length]);

  // Elegir/sacar una prenda de la combinación reinicia el anclaje en curso
  // -- combinar otras prendas cambia qué claves existen (namespace incluido),
  // así que cualquier ancla/zona ya armada quedaría apuntando a algo que ya
  // no es lo mismo. Mismo criterio que ya tenía el selector simple de antes.
  function alternarGrupo(id) {
    setGrupoIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setAnclaje({ anclas: [], zonas: [] });
    setSeleccion(null);
    setModo(null);
    setDisenoId('');
    setTallaTrabajoPorRol({});
    setCreandoDiseno(false);
    setNombreNuevoDiseno('');
    setImagenesNuevoDiseno({});
  }

  async function guardarDisenoNuevo() {
    setErrorDiseno(null);
    if (!nombreNuevoDiseno.trim()) { setErrorDiseno('Falta el nombre del diseño.'); return; }
    try {
      const creado = await crearDiseno({ nombre: nombreNuevoDiseno, grupoIds, imagenesPorPieza: imagenesNuevoDiseno });
      setDisenos((prev) => [...prev, creado]);
      setDisenoId(creado.id);
      setCreandoDiseno(false);
      setNombreNuevoDiseno('');
      setImagenesNuevoDiseno({});
    } catch (e) { setErrorDiseno(e.message); }
  }

  async function eliminarDisenoActual() {
    if (!disenoId) return;
    await eliminarDiseno(disenoId);
    setDisenoId('');
    await recargar();
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

  function elegirCandidato(cand) {
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
                logoRuta: cambios.logoRuta ?? zona.logoRuta }
            : z)),
        }));
      }
    }
  }
  function cambiarGrupoDeZona(zona, grupo) {
    const hermanas = grupo ? anclaje.zonas.filter((z) => z.id !== zona.id && z.grupo === grupo) : [];
    if (hermanas.length) {
      const modelo = hermanas[0];
      actualizarZona(zona.id, { grupo, tipo: modelo.tipo, campoPedido: modelo.campoPedido, valorFijo: modelo.valorFijo, valorEjemplo: modelo.valorEjemplo, logoRuta: modelo.logoRuta });
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

  async function guardar(evento) {
    evento.preventDefault();
    setError(null);
    if (!nombre.trim() || grupoIds.length === 0) { setError('Falta el nombre del producto o la prenda.'); return; }
    try {
      await crearProducto({ nombre, grupoIds, disenoId: disenoId || null, anclaje, bordeContraste });
      setNombre('');
      setAnclaje({ anclas: [], zonas: [] });
      setSeleccion(null);
      await recargar();
      onCambio?.();
    } catch (e) { setError(e.message); }
  }
  async function borrar(id) { await eliminarProducto(id); await recargar(); onCambio?.(); }

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
    return {
      ...z, etiqueta: cruda ? etiquetaZona(cruda) : z.id, campoPedido: cruda?.campoPedido, rotacion: cruda?.rotacion || 0,
      // El lienzo los necesita para poder mostrar el contenido real (no un
      // marcador genérico) cuando el toggle "zona" oculta el cuadrito.
      valorFijo: cruda?.valorFijo, valorEjemplo: cruda?.valorEjemplo,
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
        <h2 className="text-lg font-semibold">Producto</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Una prenda real, el diseño que lleva encima y dónde va cada nombre/número — todo en una
          sola pantalla, sobre el molde real de cada pieza, no a ciegas con números sueltos.
        </p>
      </div>

      {cargando ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : grupos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Creá primero una prenda (Moldería → Prendas).</p>
      ) : (
        <Tarjeta as="form" onSubmit={guardar} className="flex flex-col gap-4">
          <Campo etiqueta="Nombre del producto" className="max-w-3xl">
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
                El diseño es el arte real de esta prenda (una imagen por pieza). Podés reusar uno ya
                cargado o crear uno nuevo sin salir de esta pantalla. Sin diseño, la pieza sale en
                blanco en la vista previa y el PDF.
              </Ayuda>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select className="max-w-xs" value={disenoId} onChange={(e) => setDisenoId(e.target.value)}>
                <option value="">— Sin diseño —</option>
                {disenosDeEstaCombinacion.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
              </Select>
              {disenoId && <Boton variante="fantasma" tamano="sm" type="button" onClick={eliminarDisenoActual}>Eliminar este diseño</Boton>}
              <Boton variante="fantasma" tamano="sm" type="button" onClick={() => setCreandoDiseno((v) => !v)}>
                {creandoDiseno ? 'Cancelar' : '+ Crear diseño nuevo'}
              </Boton>
            </div>
            {creandoDiseno && (
              <div className="mt-3 flex flex-col gap-3 rounded-lg border border-dashed border-border p-3">
                <Campo etiqueta="Nombre del diseño">
                  <Input value={nombreNuevoDiseno} onChange={(e) => setNombreNuevoDiseno(e.target.value)} placeholder="Kit titular 2026" />
                </Campo>
                <div className="flex flex-wrap gap-3">
                  {piezasDisponibles.map((pd) => (
                    <SlotImagenDiseno key={pd.clave} rol={pd.clave} etiqueta={namespacear ? pd.grupoNombre + ' · ' + pd.rol : pd.rol}
                      url={imagenesNuevoDiseno[pd.clave]}
                      onElegir={(clave, url) => setImagenesNuevoDiseno((prev) => ({ ...prev, [clave]: url }))} />
                  ))}
                </div>
                {errorDiseno && <Aviso tono="error">{errorDiseno}</Aviso>}
                <div><Boton variante="secundario" tamano="sm" type="button" onClick={guardarDisenoNuevo}>Guardar diseño</Boton></div>
              </div>
            )}
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
                  {g.piezas.map((gp) => {
                    const clave = namespacear ? g.id + '::' + gp.rol : gp.rol;
                    const n = contarEnPieza(clave);
                    return (
                      <button key={clave} type="button" onClick={() => { setPiezaActiva(clave); setSeleccion(null); setModo(null); }}
                        className={'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ' +
                          (clave === piezaActiva ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-surface text-muted-foreground hover:border-primary')}>
                        {gp.rol}
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
              </div>

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
                imagenUrl={disenoSeleccionado?.imagenesPorPieza?.[piezaActiva]}
                borde={bordeContraste}
              />
              <p className="mt-1 text-xs text-faint-foreground">
                {modo === 'zona' && 'Hacé clic sobre la pieza: ahí nace la zona, enganchada al rasgo más cercano.'}
                {modo === 'cruzar' && 'Hacé clic en el segundo punto: entre los dos vas a poder elegir la esquina del cruce, o el punto medio.'}
                {modo === 'recolocar' && 'Hacé clic en el punto al que querés pegar ' + (recolocarInfo?.eje === 'x' ? 'la posición horizontal' : 'la posición vertical') + '.'}
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

          <div className="flex items-center gap-2">
            <Boton variante="primario" type="submit">Guardar producto</Boton>
            <Boton
              variante="fantasma" type="button"
              disabled={grupoIds.length === 0 || anclaje.zonas.length === 0}
              onClick={guardarComoPlantilla}
              title={anclaje.zonas.length === 0 ? 'Armá al menos una zona primero' : undefined}
            >
              Guardar como plantilla
            </Boton>
          </div>
          {error && <Aviso tono="error">{error}</Aviso>}
        </Tarjeta>
      )}

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint-foreground">Productos cargados</h3>
        {productos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay ninguno.</p>
        ) : (
          <div className="flex max-w-2xl flex-col gap-2">
            {productos.map((p) => {
              const idsPrendas = p.grupoIds || (p.grupoId ? [p.grupoId] : []);
              const nombresPrendas = idsPrendas.map((id) => grupos.find((g) => g.id === id)?.nombre).filter(Boolean).join(' + ');
              return (
                <div key={p.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm">
                  <div className="flex-1">
                    <span className="font-medium">{p.nombre}</span>{' '}
                    <span className="text-muted-foreground">
                      — {nombresPrendas || 'prenda eliminada'} · {disenos.find((d) => d.id === p.disenoId)?.nombre || 'sin diseño'} · {p.anclaje?.zonas?.length || 0} zona(s)
                    </span>
                  </div>
                  <Boton variante="fantasma" tamano="sm" onClick={() => borrar(p.id)}>Eliminar</Boton>
                </div>
              );
            })}
          </div>
        )}
      </div>
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
                {seleccionado && seleccion.tipo === 'zona' && (
                  <PanelZona
                    zona={seleccionado}
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
// SlotImagenDiseno.jsx) y guarda solo su URL en la zona -- el archivo real
// nunca viaja dentro del anclaje.
function SelectorLogo({ url, onElegir }) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState(null);
  const onDrop = useCallback(async (archivos) => {
    const archivo = archivos[0];
    if (!archivo) return;
    setSubiendo(true);
    setError(null);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const lector = new FileReader();
        lector.onload = () => resolve(lector.result);
        lector.onerror = reject;
        lector.readAsDataURL(archivo);
      });
      const urlSubida = await subirArchivo(dataUrl.slice(dataUrl.indexOf(',') + 1), archivo.type, 'logo');
      onElegir(urlSubida);
    } catch (e) { setError(e.message); }
    finally { setSubiendo(false); }
  }, [onElegir]);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'] }, multiple: false,
  });

  return (
    <div>
      <div {...getRootProps()}
        className={'cursor-pointer rounded-lg border-2 border-dashed px-3 py-2 text-center text-xs ' +
          (isDragActive ? 'border-primary bg-primary-soft text-primary' : 'border-border text-faint-foreground')}>
        <input {...getInputProps()} />
        {subiendo ? 'Subiendo…' : url ? 'Reemplazar archivo' : 'Arrastrar o elegir el logo (PNG/JPG)'}
      </div>
      {error && <Aviso tono="error">{error}</Aviso>}
      {url && <img className="mt-2 max-h-16 rounded-md border border-border" src={url} alt="Logo" />}
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
function PanelZona({ zona, anclasDisponibles, anclasResueltas, onRenombrar, onActualizar, onCambiarGrupo, hermanas, onQuitar, onDuplicar, onCruzar, onVolverAUnPunto }) {
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
        <Select value={zona.tipo === 'logo' ? 'logo' : zona.campoPedido} onChange={(e) => {
          const valor = e.target.value;
          if (valor === 'logo') onActualizar({ tipo: 'logo', campoPedido: null });
          else onActualizar({ campoPedido: valor, tipo: valor === 'numero' ? 'numero' : 'texto' });
        }}>
          <option value="nombre">un texto: el nombre del jugador</option>
          <option value="numero">un número (dorsal)</option>
          <option value="fijo">un texto fijo</option>
          <option value="logo">un logo o escudo</option>
        </Select>
        {zona.tipo === 'logo' ? (
          <SelectorLogo url={zona.logoRuta} onElegir={(url) => onActualizar({ logoRuta: url })} />
        ) : zona.campoPedido === 'fijo' ? (
          <Input placeholder="Texto fijo" value={zona.valorFijo || ''} onChange={(e) => onActualizar({ valorFijo: e.target.value })} />
        ) : (
          <Input placeholder={zona.campoPedido === 'nombre' ? 'Ejemplo: PEÑA' : 'Ejemplo: 7'} value={zona.valorEjemplo || ''} onChange={(e) => onActualizar({ valorEjemplo: e.target.value })} />
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-faint-foreground">Repetir en otra zona</span>
          <Ayuda>Si dos zonas tienen el mismo grupo, el contenido de una se copia a la otra automáticamente (un escudo, número o nombre repetido en varias piezas). La posición y el tamaño siguen siendo de cada una.</Ayuda>
        </div>
        <Input placeholder="ej. SPONSOR_PRINCIPAL" value={zona.grupo || ''} onChange={(e) => onCambiarGrupo(e.target.value || null)} />
        {hermanas.length > 0 && <p className="text-xs text-faint-foreground">Vinculada con: {hermanas.map((h) => h.id).join(', ')}</p>}
      </div>

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
          <span className="w-24 flex-none text-xs text-muted-foreground">Girar</span>
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

      {zona.tipo !== 'logo' && (
        <div className="flex items-center gap-2 border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">Color del texto</span>
          <input type="color" className="h-8 w-8 rounded border border-border" value={zona.colorHex} onChange={(e) => onActualizar({ colorHex: e.target.value })} />
          <Ayuda>Con qué color se imprime este nombre/número/texto de verdad, en el PDF final (sublimación).</Ayuda>
        </div>
      )}
    </div>
  );
}

