import { useEffect, useState } from 'react';
import {
  listarGrupos,
  listarDisenos,
  listarProductos,
  listarPiezas,
  crearDiseno,
  eliminarDiseno,
  crearProducto,
  eliminarProducto,
  resolverAnclaje,
} from '../api.js';
import { ordenarTallasNatural } from '../constantes.js';
import { Boton, Campo, Input, Select, Tarjeta, Aviso, Ayuda } from '../componentes/ui.jsx';
import { CanvasZonas } from '../componentes/CanvasZonas.jsx';
import { SlotImagenDiseno } from '../componentes/SlotImagenDiseno.jsx';

const BORDE_POR_DEFECTO = { activo: false, colorHex: '#ffffff', grosorCm: 0.03 };

const PARTES_CONTORNO = [
  ['centro', 'Centro'], ['arriba', 'Borde superior'], ['abajo', 'Borde inferior'],
  ['izquierda', 'Borde izquierdo'], ['derecha', 'Borde derecho'],
  ['supIzq', 'Esquina sup. izq.'], ['supDer', 'Esquina sup. der.'],
  ['infIzq', 'Esquina inf. izq.'], ['infDer', 'Esquina inf. der.'],
];
const ORIGENES_ZONA = [
  ['centro', 'Centro'], ['supIzq', 'Sup. izq.'], ['supDer', 'Sup. der.'],
  ['infIzq', 'Inf. izq.'], ['infDer', 'Inf. der.'],
  ['centroArriba', 'Centro arriba'], ['centroAbajo', 'Centro abajo'],
  ['centroIzq', 'Centro izq.'], ['centroDer', 'Centro der.'],
];

// El grafo de anclas/zonas es un puerto FIEL del sistema de Illustrator
// (ver backend/src/motor/anclaje/ -- portado línea por línea desde
// programa/cerebro, con su propia batería de pruebas reusada). Acá solo se
// arma/edita el grafo en estado local (igual que antes se armaban
// `elementos`): nada se guarda hasta "Guardar producto". La posición real
// de cada ancla/zona para la talla de trabajo elegida se pide al backend
// (POST /anclaje/resolver) cada vez que algo cambia -- es aritmética pura,
// no hace falta guardar nada para previsualizarla.
function medida(valor) {
  return { modo: 'fijo', valor: valor ?? 0 };
}

function anclaVacia(rol, ref) {
  return {
    id: crypto.randomUUID(), nombre: '', pieza: rol,
    x: { ref, modo: 'fijo', valor: 0 },
    y: { ref, modo: 'fijo', valor: 0 },
  };
}

function zonaVacia(rol, anclaId) {
  return {
    id: crypto.randomUUID(), pieza: rol, tipo: 'texto',
    anclaX: anclaId, anclaY: anclaId, origen: 'centro', modoCruce: 'esquina',
    ancho: medida(8), alto: medida(4),
    offset: { x: medida(0), y: medida(0) },
    campoPedido: 'nombre', valorFijo: '', valorEjemplo: '', colorHex: '#ffffff',
  };
}

function etiquetaAncla(ancla) {
  return ancla.nombre || 'Ancla ' + ancla.id.slice(0, 4);
}

function etiquetaZona(zona) {
  if (zona.campoPedido === 'fijo') return zona.valorFijo || 'Texto fijo';
  if (zona.campoPedido === 'numero') return zona.valorEjemplo ? 'N° · ' + zona.valorEjemplo : 'Número';
  return zona.valorEjemplo ? 'Nombre · ' + zona.valorEjemplo : 'Nombre';
}

// L por defecto (talla intermedia, buena referencia visual) -- pero varía
// según qué tallas tiene de verdad la pieza (no toda pieza tiene L: podría
// ser numérica de niño o de pantalón). Se cae a la del medio de lo que haya.
function tallaDeTrabajoPorDefecto(pieza) {
  const tallas = ordenarTallasNatural(Object.keys(pieza?.dimensionesPorTalla || {}));
  if (tallas.length === 0) return null;
  const conL = tallas.find((t) => t.toUpperCase() === 'L');
  return conL || tallas[Math.floor((tallas.length - 1) / 2)];
}

export function Productos({ recargarSenal, onCambio }) {
  const [grupos, setGrupos] = useState([]);
  const [disenos, setDisenos] = useState([]);
  const [productos, setProductos] = useState([]);
  const [piezas, setPiezas] = useState([]);
  const [nombre, setNombre] = useState('');
  const [grupoId, setGrupoId] = useState('');
  const [disenoId, setDisenoId] = useState('');
  const [anclaje, setAnclaje] = useState({ anclas: [], zonas: [] });
  const [tallaTrabajoPorRol, setTallaTrabajoPorRol] = useState({});
  const [bordeContraste, setBordeContraste] = useState(BORDE_POR_DEFECTO);
  const [anclaActivaId, setAnclaActivaId] = useState(null);
  const [zonaActivaId, setZonaActivaId] = useState(null);
  const [verticeParaRol, setVerticeParaRol] = useState(null);
  const [resuelto, setResuelto] = useState(null);
  const [error, setError] = useState(null);

  // Crear un diseño nuevo sin salir de esta pantalla -- antes había que ir a
  // una pestaña aparte, guardarlo ahí, y volver a elegir el grupo acá para
  // encontrarlo en un dropdown por nombre. Un paso menos, y con vista previa
  // en el momento (el canvas de abajo ya muestra la imagen apenas se sube).
  const [creandoDiseno, setCreandoDiseno] = useState(false);
  const [nombreNuevoDiseno, setNombreNuevoDiseno] = useState('');
  const [imagenesNuevoDiseno, setImagenesNuevoDiseno] = useState({});
  const [errorDiseno, setErrorDiseno] = useState(null);

  async function recargar() {
    const [gs, ds, ps, pzs] = await Promise.all([listarGrupos(), listarDisenos(), listarProductos(), listarPiezas()]);
    setGrupos(gs);
    setDisenos(ds);
    setProductos(ps);
    setPiezas(pzs);
    if (gs.length > 0 && !grupoId) setGrupoId(gs[0].id);
  }

  useEffect(() => {
    recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recargarSenal]);

  const grupoSeleccionado = grupos.find((g) => g.id === grupoId);
  const disenosDeEsteGrupo = disenos.filter((d) => d.grupoId === grupoId);
  const disenoSeleccionado = disenos.find((d) => d.id === disenoId);

  function piezaDelRol(gp) {
    return piezas.find((p) => p.id === gp.piezaId);
  }

  function tallaTrabajoDe(gp) {
    return tallaTrabajoPorRol[gp.rol] ?? tallaDeTrabajoPorDefecto(piezaDelRol(gp));
  }

  // El backend resuelve el grafo entero (todas las piezas del grupo, a la
  // talla de trabajo que tenga elegida cada una) cada vez que algo cambia
  // -- es una función pura sobre datos (ver motor/anclaje/resolver.js), no
  // hace falta guardar nada para ver dónde cae cada ancla/zona.
  useEffect(() => {
    if (!grupoId || !grupoSeleccionado) { setResuelto(null); return; }
    const tallaPorRol = {};
    for (const gp of grupoSeleccionado.piezas) {
      const t = tallaTrabajoDe(gp);
      if (t) tallaPorRol[gp.rol] = t;
    }
    if (Object.keys(tallaPorRol).length === 0) { setResuelto(null); return; }
    let cancelado = false;
    resolverAnclaje(grupoId, tallaPorRol, anclaje)
      .then((r) => { if (!cancelado) setResuelto(r); })
      .catch((e) => { if (!cancelado) setResuelto({ errores: [e.message], avisos: [], lista: { anclas: [], zonas: [] } }); });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grupoId, JSON.stringify(tallaTrabajoPorRol), JSON.stringify(anclaje), piezas.length]);

  function alCambiarGrupo(id) {
    setGrupoId(id);
    setAnclaje({ anclas: [], zonas: [] });
    setAnclaActivaId(null);
    setZonaActivaId(null);
    setVerticeParaRol(null);
    setDisenoId('');
    setTallaTrabajoPorRol({});
    setCreandoDiseno(false);
    setNombreNuevoDiseno('');
    setImagenesNuevoDiseno({});
  }

  async function guardarDisenoNuevo() {
    setErrorDiseno(null);
    if (!nombreNuevoDiseno.trim()) {
      setErrorDiseno('Falta el nombre del diseño.');
      return;
    }
    try {
      const creado = await crearDiseno({ nombre: nombreNuevoDiseno, grupoId, imagenesPorPieza: imagenesNuevoDiseno });
      setDisenos((prev) => [...prev, creado]);
      setDisenoId(creado.id);
      setCreandoDiseno(false);
      setNombreNuevoDiseno('');
      setImagenesNuevoDiseno({});
    } catch (e) {
      setErrorDiseno(e.message);
    }
  }

  async function eliminarDisenoActual() {
    if (!disenoId) return;
    await eliminarDiseno(disenoId);
    setDisenoId('');
    await recargar();
  }

  function seleccionarAncla(id) { setAnclaActivaId(id); setZonaActivaId(null); }
  function seleccionarZona(id) { setZonaActivaId(id); setAnclaActivaId(null); }

  function agregarAnclaEnPunto(rol, xCm, yCm) {
    const nueva = anclaVacia(rol, { tipo: 'contorno', parte: 'supIzq' });
    nueva.x.valor = Math.round(xCm * 10) / 10;
    nueva.y.valor = Math.round(yCm * 10) / 10;
    setAnclaje((prev) => ({ ...prev, anclas: [...prev.anclas, nueva] }));
    seleccionarAncla(nueva.id);
  }

  function agregarAnclaEnVertice(rol, indice, total) {
    const nueva = anclaVacia(rol, { tipo: 'vertice', indice, puntos: total });
    setAnclaje((prev) => ({ ...prev, anclas: [...prev.anclas, nueva] }));
    seleccionarAncla(nueva.id);
    setVerticeParaRol(null);
  }

  function actualizarAncla(id, cambios) {
    setAnclaje((prev) => ({ ...prev, anclas: prev.anclas.map((a) => (a.id === id ? { ...a, ...cambios } : a)) }));
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

  function quitarAncla(id) {
    setAnclaje((prev) => ({
      anclas: prev.anclas.filter((a) => a.id !== id),
      zonas: prev.zonas.filter((z) => z.anclaX !== id && z.anclaY !== id),
    }));
    setAnclaActivaId((actual) => (actual === id ? null : actual));
  }

  function agregarZona(rol, anclaId) {
    const nueva = zonaVacia(rol, anclaId);
    setAnclaje((prev) => ({ ...prev, zonas: [...prev.zonas, nueva] }));
    seleccionarZona(nueva.id);
  }

  function actualizarZona(id, cambios) {
    setAnclaje((prev) => ({ ...prev, zonas: prev.zonas.map((z) => (z.id === id ? { ...z, ...cambios } : z)) }));
  }

  function moverZona(id, dxCm, dyCm) {
    setAnclaje((prev) => ({
      ...prev,
      zonas: prev.zonas.map((z) => {
        if (z.id !== id) return z;
        const offX = z.offset.x.modo === 'fijo' ? { ...z.offset.x, valor: Math.round((z.offset.x.valor + dxCm) * 10) / 10 } : z.offset.x;
        const offY = z.offset.y.modo === 'fijo' ? { ...z.offset.y, valor: Math.round((z.offset.y.valor + dyCm) * 10) / 10 } : z.offset.y;
        return { ...z, offset: { x: offX, y: offY } };
      }),
    }));
  }

  function quitarZona(id) {
    setAnclaje((prev) => ({ ...prev, zonas: prev.zonas.filter((z) => z.id !== id) }));
    setZonaActivaId((actual) => (actual === id ? null : actual));
  }

  async function guardar(evento) {
    evento.preventDefault();
    setError(null);
    if (!nombre.trim() || !grupoId) {
      setError('Falta el nombre del producto o el grupo.');
      return;
    }
    try {
      await crearProducto({ nombre, grupoId, disenoId: disenoId || null, anclaje, bordeContraste });
      setNombre('');
      setAnclaje({ anclas: [], zonas: [] });
      setAnclaActivaId(null);
      setZonaActivaId(null);
      await recargar();
      onCambio?.();
    } catch (e) {
      setError(e.message);
    }
  }

  async function borrar(id) {
    await eliminarProducto(id);
    await recargar();
    onCambio?.();
  }

  const anclaActiva = anclaje.anclas.find((a) => a.id === anclaActivaId) || null;
  const zonaActiva = anclaje.zonas.find((z) => z.id === zonaActivaId) || null;

  return (
    <div className="pagina flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Producto</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Una prenda real, el diseño que lleva encima y dónde va cada nombre/número — todo en una
          sola pantalla, sobre el molde real de cada pieza, no a ciegas con números sueltos.
        </p>
      </div>

      {grupos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Creá primero una prenda (Piezas → Prendas).</p>
      ) : (
        <Tarjeta as="form" onSubmit={guardar} className="flex max-w-3xl flex-col gap-4">
          <Campo etiqueta="Nombre del producto">
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Camiseta titular" />
          </Campo>

          <Campo etiqueta="Grupo">
            <Select value={grupoId} onChange={(e) => alCambiarGrupo(e.target.value)}>
              {grupos.map((g) => (
                <option key={g.id} value={g.id}>{g.nombre}</option>
              ))}
            </Select>
          </Campo>

          <div>
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
                {disenosDeEsteGrupo.map((d) => (
                  <option key={d.id} value={d.id}>{d.nombre}</option>
                ))}
              </Select>
              {disenoId && (
                <Boton variante="fantasma" tamano="sm" type="button" onClick={eliminarDisenoActual}>
                  Eliminar este diseño
                </Boton>
              )}
              <Boton
                variante="fantasma"
                tamano="sm"
                type="button"
                onClick={() => setCreandoDiseno((v) => !v)}
              >
                {creandoDiseno ? 'Cancelar' : '+ Crear diseño nuevo'}
              </Boton>
            </div>

            {creandoDiseno && (
              <div className="mt-3 flex flex-col gap-3 rounded-lg border border-dashed border-border p-3">
                <Campo etiqueta="Nombre del diseño">
                  <Input
                    value={nombreNuevoDiseno}
                    onChange={(e) => setNombreNuevoDiseno(e.target.value)}
                    placeholder="Kit titular 2026"
                  />
                </Campo>
                <div className="flex flex-wrap gap-3">
                  {grupoSeleccionado?.piezas.map((gp) => (
                    <SlotImagenDiseno
                      key={gp.rol}
                      rol={gp.rol}
                      url={imagenesNuevoDiseno[gp.rol]}
                      onElegir={(rol, url) => setImagenesNuevoDiseno((prev) => ({ ...prev, [rol]: url }))}
                    />
                  ))}
                </div>
                {errorDiseno && <Aviso tono="error">{errorDiseno}</Aviso>}
                <div>
                  <Boton variante="secundario" tamano="sm" type="button" onClick={guardarDisenoNuevo}>
                    Guardar diseño
                  </Boton>
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={bordeContraste.activo}
                  onChange={(e) => setBordeContraste((prev) => ({ ...prev, activo: e.target.checked }))}
                />
                Borde de contraste sobre el diseño
              </label>
              <Ayuda>
                Dibuja el contorno del molde encima del diseño recortado, en un color que
                contraste, para no perder de vista los piquetes que suele traer la moldería.
                Grosor real de producción — a este zoom se muestra un poco más grueso para poder
                verlo y ajustarlo.
              </Ayuda>
            </div>
            {bordeContraste.activo && (
              <div className="flex flex-wrap items-end gap-3">
                <Campo etiqueta="Color">
                  <input
                    type="color"
                    className="h-9 w-9 rounded border border-border"
                    value={bordeContraste.colorHex}
                    onChange={(e) => setBordeContraste((prev) => ({ ...prev, colorHex: e.target.value }))}
                  />
                </Campo>
                <Campo etiqueta="Grosor (cm)">
                  <Input
                    className="w-20"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={bordeContraste.grosorCm}
                    onChange={(e) => setBordeContraste((prev) => ({ ...prev, grosorCm: Number(e.target.value) }))}
                  />
                </Campo>
              </div>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-faint-foreground">
                Anclas y zonas (nombre, número, texto por pieza)
              </h3>
              <Ayuda>
                Fiel al sistema de Illustrator: no se guarda una posición suelta, se guarda una
                RELACIÓN (a qué punto del molde se agarra, fijo en cm o proporcional al tamaño de
                la pieza). Por eso una zona sigue en su lugar real al cambiar de talla, en vez de
                quedar pegada en un mismo número de centímetros. Primero se ponen anclas (puntos);
                las zonas (nombre/número/texto) cuelgan de una o dos anclas.
              </Ayuda>
            </div>
            <div className="flex flex-col gap-4">
              {grupoSeleccionado?.piezas.map((gp) => {
                const pieza = piezaDelRol(gp);
                const tallasDePieza = ordenarTallasNatural(Object.keys(pieza?.dimensionesPorTalla || {}));
                const tallaTrabajo = tallaTrabajoDe(gp);
                const geo = tallaTrabajo ? pieza?.geometriaPorTalla?.[tallaTrabajo] : null;
                const dim = tallaTrabajo ? pieza?.dimensionesPorTalla?.[tallaTrabajo] : null;
                const anclasDelRol = anclaje.anclas.filter((a) => a.pieza === gp.rol);
                const zonasDelRol = anclaje.zonas.filter((z) => z.pieza === gp.rol);
                const anclasResueltas = (resuelto?.lista.anclas || []).filter((a) => a.pieza === gp.rol);
                const zonasResueltas = (resuelto?.lista.zonas || []).filter((z) => z.pieza === gp.rol).map((z) => {
                  const cruda = anclaje.zonas.find((zz) => zz.id === z.id);
                  return { ...z, campoPedido: cruda?.campoPedido, valorFijo: cruda?.valorFijo, valorEjemplo: cruda?.valorEjemplo };
                });

                return (
                  <div key={gp.rol} className="rounded-lg border border-border bg-surface-muted p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <strong className="text-sm">{gp.rol}</strong>
                      {!pieza ? (
                        <span className="text-xs text-danger">pieza eliminada de la biblioteca</span>
                      ) : (
                        <>
                          <span className="text-xs text-faint-foreground">· molde de referencia:</span>
                          <Select
                            className="max-w-[100px]"
                            value={tallaTrabajo || ''}
                            onChange={(e) => setTallaTrabajoPorRol((prev) => ({ ...prev, [gp.rol]: e.target.value }))}
                          >
                            {tallasDePieza.map((t) => <option key={t} value={t}>{t}</option>)}
                          </Select>
                        </>
                      )}
                      <Boton variante="fantasma" tamano="sm" type="button" onClick={() => agregarAnclaEnPunto(gp.rol, dim ? dim.anchoCm / 2 : 5, dim ? dim.altoCm / 2 : 15)}>
                        + Ancla en el molde
                      </Boton>
                      <Boton
                        variante={verticeParaRol === gp.rol ? 'secundario' : 'fantasma'}
                        tamano="sm"
                        type="button"
                        onClick={() => setVerticeParaRol((actual) => (actual === gp.rol ? null : gp.rol))}
                      >
                        {verticeParaRol === gp.rol ? 'Elegí un punto del contorno…' : '+ Ancla en el contorno'}
                      </Boton>
                    </div>

                    {pieza && geo && dim && (
                      <CanvasZonas
                        poligonoMm={geo.poligonoMm}
                        anchoCm={dim.anchoCm}
                        altoCm={dim.altoCm}
                        imagenUrl={disenoSeleccionado?.imagenesPorPieza?.[gp.rol]}
                        borde={bordeContraste}
                        anclas={anclasResueltas}
                        zonas={zonasResueltas}
                        anclaActivaId={anclaActivaId}
                        zonaActivaId={zonaActivaId}
                        onSeleccionarAncla={seleccionarAncla}
                        onSeleccionarZona={seleccionarZona}
                        modoElegirVertice={verticeParaRol === gp.rol}
                        onElegirVertice={(indice, total) => agregarAnclaEnVertice(gp.rol, indice, total)}
                        onCrearAncla={(xCm, yCm) => agregarAnclaEnPunto(gp.rol, xCm, yCm)}
                        onMoverAncla={moverAncla}
                        onMoverZona={moverZona}
                      />
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-faint-foreground">Anclas:</span>
                      {anclasDelRol.length === 0 && (
                        <span className="text-xs text-faint-foreground">ninguna — clic en el molde o "+ Ancla en el contorno"</span>
                      )}
                      {anclasDelRol.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => seleccionarAncla(a.id)}
                          className={
                            'rounded-full border px-3 py-1 text-xs transition-colors ' +
                            (a.id === anclaActivaId
                              ? 'border-[#f5a623] bg-[#f5a62333] text-[#f5a623]'
                              : 'border-border bg-surface text-muted-foreground hover:border-[#f5a623]')
                          }
                        >
                          {etiquetaAncla(a)}
                        </button>
                      ))}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-faint-foreground">Zonas:</span>
                      {zonasDelRol.length === 0 && (
                        <span className="text-xs text-faint-foreground">ninguna todavía</span>
                      )}
                      {zonasDelRol.map((z) => (
                        <button
                          key={z.id}
                          type="button"
                          onClick={() => seleccionarZona(z.id)}
                          className={
                            'rounded-full border px-3 py-1 text-xs transition-colors ' +
                            (z.id === zonaActivaId
                              ? 'border-primary bg-primary-soft text-primary'
                              : 'border-border bg-surface text-muted-foreground hover:border-primary')
                          }
                        >
                          {etiquetaZona(z)}
                        </button>
                      ))}
                      {anclasDelRol.length > 0 && (
                        <Boton
                          variante="fantasma"
                          tamano="sm"
                          type="button"
                          onClick={() => agregarZona(gp.rol, anclaActiva?.pieza === gp.rol ? anclaActiva.id : anclasDelRol[0].id)}
                        >
                          + Agregar zona
                        </Boton>
                      )}
                    </div>

                    {anclaActiva && anclaActiva.pieza === gp.rol && (
                      <PropiedadesAncla
                        ancla={anclaActiva}
                        actualizar={(cambios) => actualizarAncla(anclaActiva.id, cambios)}
                        quitar={() => quitarAncla(anclaActiva.id)}
                        totalVertices={geo?.poligonoMm?.length || 0}
                      />
                    )}

                    {zonaActiva && zonaActiva.pieza === gp.rol && (
                      <PropiedadesZona
                        zona={zonaActiva}
                        anclasDisponibles={anclasDelRol}
                        actualizar={(cambios) => actualizarZona(zonaActiva.id, cambios)}
                        quitar={() => quitarZona(zonaActiva.id)}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {((resuelto?.errores.length || 0) > 0 || (resuelto?.avisos.length || 0) > 0) && (
              <div className="mt-2 flex flex-col gap-2">
                {resuelto.errores.map((e, i) => <Aviso key={'e' + i} tono="error">{e}</Aviso>)}
                {resuelto.avisos.map((a, i) => <Aviso key={'a' + i} tono="info">{a}</Aviso>)}
              </div>
            )}
          </div>

          <div>
            <Boton variante="primario" type="submit">Guardar producto</Boton>
          </div>
          {error && <Aviso tono="error">{error}</Aviso>}
        </Tarjeta>
      )}

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint-foreground">
          Productos cargados
        </h3>
        {productos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay ninguno.</p>
        ) : (
          <div className="flex max-w-2xl flex-col gap-2">
            {productos.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm">
                <div className="flex-1">
                  <span className="font-medium">{p.nombre}</span>{' '}
                  <span className="text-muted-foreground">
                    — {disenos.find((d) => d.id === p.disenoId)?.nombre || 'sin diseño'} ·{' '}
                    {p.anclaje?.zonas?.length || 0} zona(s)
                  </span>
                </div>
                <Boton variante="fantasma" tamano="sm" onClick={() => borrar(p.id)}>Eliminar</Boton>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PropiedadesAncla({ ancla, actualizar, quitar, totalVertices }) {
  function actualizarEje(eje, cambios) {
    actualizar({ [eje]: { ...ancla[eje], ...cambios } });
  }
  function actualizarRef(eje, cambiosRef) {
    actualizarEje(eje, { ref: { ...ancla[eje].ref, ...cambiosRef } });
  }

  return (
    <div className="mt-3 rounded-lg border border-[#f5a62355] bg-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[#f5a623]">Propiedades del ancla</h4>
        <Boton variante="fantasma" tamano="sm" type="button" onClick={quitar}>Quitar</Boton>
      </div>
      <Campo etiqueta="Nombre (opcional, para identificarla)" className="mb-3">
        <Input value={ancla.nombre} onChange={(e) => actualizar({ nombre: e.target.value })} placeholder="Sisa izquierda" />
      </Campo>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {['x', 'y'].map((eje) => (
          <div key={eje} className="flex flex-col gap-2 rounded-md border border-border p-2">
            <span className="text-xs font-semibold text-faint-foreground">Eje {eje.toUpperCase()}</span>
            <Campo etiqueta="Se agarra a">
              <Select
                value={ancla[eje].ref.tipo}
                onChange={(e) => actualizarRef(eje, e.target.value === 'vertice' ? { tipo: 'vertice', indice: 0, puntos: totalVertices } : { tipo: 'contorno', parte: 'centro' })}
              >
                <option value="contorno">El contorno de la pieza</option>
                <option value="vertice">Un vértice del contorno</option>
              </Select>
            </Campo>
            {ancla[eje].ref.tipo === 'contorno' ? (
              <Campo etiqueta="Parte">
                <Select value={ancla[eje].ref.parte} onChange={(e) => actualizarRef(eje, { parte: e.target.value })}>
                  {PARTES_CONTORNO.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
              </Campo>
            ) : (
              <Campo etiqueta={'Vértice (de ' + (ancla[eje].ref.puntos ?? totalVertices) + ')'}>
                <Input
                  type="number"
                  min="0"
                  value={ancla[eje].ref.indice}
                  onChange={(e) => actualizarRef(eje, { indice: Number(e.target.value), puntos: ancla[eje].ref.puntos ?? totalVertices })}
                />
              </Campo>
            )}
            <div className="flex gap-2">
              <Campo etiqueta="Modo" className="flex-1">
                <Select value={ancla[eje].modo} onChange={(e) => actualizarEje(eje, { modo: e.target.value })}>
                  <option value="fijo">Fijo (cm)</option>
                  <option value="proporcional">Proporcional (%)</option>
                </Select>
              </Campo>
              <Campo etiqueta={ancla[eje].modo === 'fijo' ? 'Valor (cm)' : 'Valor (%)'} className="w-24">
                <Input
                  type="number"
                  step={ancla[eje].modo === 'fijo' ? '0.1' : '1'}
                  value={ancla[eje].modo === 'fijo' ? ancla[eje].valor : Math.round(ancla[eje].valor * 100)}
                  onChange={(e) => actualizarEje(eje, { valor: ancla[eje].modo === 'fijo' ? Number(e.target.value) : Number(e.target.value) / 100 })}
                />
              </Campo>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CampoMedida({ etiqueta, medida, onCambiar, unidadFija }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{etiqueta}</span>
      <div className="flex gap-1">
        <Select className="w-20" value={medida.modo} onChange={(e) => onCambiar({ ...medida, modo: e.target.value })}>
          <option value="fijo">{unidadFija || 'cm'}</option>
          <option value="proporcional">%</option>
        </Select>
        <Input
          className="w-20"
          type="number"
          step={medida.modo === 'fijo' ? '0.1' : '1'}
          value={medida.modo === 'fijo' ? medida.valor : Math.round(medida.valor * 100)}
          onChange={(e) => onCambiar({ ...medida, valor: medida.modo === 'fijo' ? Number(e.target.value) : Number(e.target.value) / 100 })}
        />
      </div>
    </div>
  );
}

function PropiedadesZona({ zona, anclasDisponibles, actualizar, quitar }) {
  return (
    <div className="mt-3 rounded-lg border border-border bg-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-faint-foreground">Propiedades de la zona</h4>
        <Boton variante="fantasma" tamano="sm" type="button" onClick={quitar}>Quitar</Boton>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Campo etiqueta="Contenido">
          <Select
            className="max-w-[160px]"
            value={zona.campoPedido}
            onChange={(e) => {
              const campo = e.target.value;
              actualizar({ campoPedido: campo, tipo: campo === 'numero' ? 'numero' : 'texto' });
            }}
          >
            <option value="nombre">Nombre del jugador</option>
            <option value="numero">Número</option>
            <option value="fijo">Texto fijo</option>
          </Select>
        </Campo>

        {zona.campoPedido === 'fijo' ? (
          <Campo etiqueta="Texto">
            <Input className="max-w-[140px]" value={zona.valorFijo || ''} onChange={(e) => actualizar({ valorFijo: e.target.value })} />
          </Campo>
        ) : (
          <Campo etiqueta="Ejemplo (solo vista previa)">
            <Input
              className="max-w-[140px]"
              placeholder={zona.campoPedido === 'nombre' ? 'PEÑA' : '7'}
              value={zona.valorEjemplo || ''}
              onChange={(e) => actualizar({ valorEjemplo: e.target.value })}
            />
          </Campo>
        )}

        <Campo etiqueta="Ancla X">
          <Select className="max-w-[120px]" value={zona.anclaX} onChange={(e) => actualizar({ anclaX: e.target.value })}>
            {anclasDisponibles.map((a) => <option key={a.id} value={a.id}>{etiquetaAncla(a)}</option>)}
          </Select>
        </Campo>
        <Campo etiqueta="Ancla Y">
          <Select className="max-w-[120px]" value={zona.anclaY} onChange={(e) => actualizar({ anclaY: e.target.value })}>
            {anclasDisponibles.map((a) => <option key={a.id} value={a.id}>{etiquetaAncla(a)}</option>)}
          </Select>
        </Campo>
        {zona.anclaX !== zona.anclaY && (
          <Campo etiqueta="Con dos anclas">
            <Select className="max-w-[130px]" value={zona.modoCruce} onChange={(e) => actualizar({ modoCruce: e.target.value })}>
              <option value="esquina">Esquina (X de una, Y de otra)</option>
              <option value="medio">Punto medio</option>
            </Select>
          </Campo>
        )}
        <Campo etiqueta="Origen de la caja">
          <Select className="max-w-[130px]" value={zona.origen} onChange={(e) => actualizar({ origen: e.target.value })}>
            {ORIGENES_ZONA.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Campo>

        <CampoMedida etiqueta="Ancho" medida={zona.ancho} onCambiar={(m) => actualizar({ ancho: m })} />
        <CampoMedida etiqueta="Alto" medida={zona.alto} onCambiar={(m) => actualizar({ alto: m })} />
        <CampoMedida etiqueta="Desplaz. X" medida={zona.offset.x} onCambiar={(m) => actualizar({ offset: { ...zona.offset, x: m } })} />
        <CampoMedida etiqueta="Desplaz. Y" medida={zona.offset.y} onCambiar={(m) => actualizar({ offset: { ...zona.offset, y: m } })} />

        <Campo etiqueta="Color">
          <input
            type="color"
            className="h-9 w-9 rounded border border-border"
            value={zona.colorHex}
            onChange={(e) => actualizar({ colorHex: e.target.value })}
          />
        </Campo>
      </div>
    </div>
  );
}
