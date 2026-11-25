import { useEffect, useMemo, useRef, useState } from 'react';
import { crearPedido, editarPedido, eliminarPedido, anidarDesdePedido, generarPdf, exportarTallaDePedido } from '../api.js';
import { obtener } from '../datos/index.js';
import { ordenarTallasNatural } from '../constantes.js';
import { conjuntosDe, conjuntoDeLinea } from '../utilidades/conjuntos.js';
import { VistaPreviaNesting } from '../componentes/VistaPreviaNesting.jsx';
import { Boton, Campo, Input, InputMultilinea, Select, Tarjeta, Chip, Aviso, ErrorCarga } from '../componentes/ui.jsx';
import { leerHoja, filasDeTexto, interpretarJugadores } from '../utilidades/hojaDeCalculo.js';

// Producción → Pedidos: el pedido real de un equipo (talla + nombre + número
// por jugador), cargado a mano, desde una planilla o pegado de Excel, y desde
// acá se arma el rollo de impresión (nesting) y su PDF editable.

// --- datos de las prendas ----------------------------------------------------

function gruposDelProducto(producto, grupos) {
  if (!producto) return [];
  const ids = producto.grupoIds || (producto.grupoId ? [producto.grupoId] : []);
  return ids.map((id) => grupos.find((g) => g.id === id)).filter(Boolean);
}

// Las tallas que tienen TODAS las piezas de la producción (las de talla única
// sirven para cualquiera).
function tallasDelProducto(productoId, productos, grupos, piezas, conjuntoId) {
  const producto = productos.find((p) => p.id === productoId);
  // Con conjuntos (dama / caballero...), las del conjunto de la línea.
  const conjunto = conjuntoDeLinea(producto, { conjuntoId });
  const conjuntos = gruposDelProducto(producto, grupos)
    .filter((g) => !conjunto || conjunto.grupoIds.includes(g.id))
    .flatMap((g) => g.piezas)
    .map((x) => piezas.find((p) => p.id === x.piezaId))
    .filter((p) => p && !p.tallaUnica)
    .map((p) => new Set(Object.keys(p.dimensionesPorTalla || {})));
  if (conjuntos.length === 0) return [];
  return ordenarTallasNatural([...conjuntos[0]].filter((t) => conjuntos.every((s) => s.has(t))));
}

// Si un kit de varias prendas no tiene ninguna talla en común, dice qué pieza
// le falta la talla más cercana a estar completa.
function diagnosticoSinTallaComun(productoId, productos, grupos, piezas) {
  const gs = gruposDelProducto(productos.find((p) => p.id === productoId), grupos);
  if (gs.length <= 1) return null;
  const conGrupo = gs.flatMap((g) => g.piezas.map((gp) => ({ g: g.nombre, rol: gp.rol, pieza: piezas.find((p) => p.id === gp.piezaId) })))
    .filter((x) => x.pieza && !x.pieza.tallaUnica);
  const todas = new Set(conGrupo.flatMap((x) => Object.keys(x.pieza.dimensionesPorTalla || {})));
  let mejor = null;
  for (const t of todas) {
    const faltan = conGrupo.filter((x) => !x.pieza.dimensionesPorTalla?.[t]);
    if (!mejor || faltan.length < mejor.faltan.length) mejor = { t, faltan };
  }
  if (!mejor?.faltan.length) return null;
  return 'Por ejemplo, la talla ' + mejor.t.toUpperCase() + ' falta en ' + mejor.faltan.map((x) => x.g + ' · ' + x.rol).join(', ') + '.';
}

// Las piezas que se pueden sacar de una prenda puntual (clave = lo que espera resolverPedido.js).
function rolesDelProducto(productoId, productos, grupos, conjuntoId) {
  const producto = productos.find((p) => p.id === productoId);
  const grupos2 = gruposDelProducto(producto, grupos);
  const varias = grupos2.length > 1;
  const conjunto = conjuntoDeLinea(producto, { conjuntoId });
  return grupos2.filter((g) => !conjunto || conjunto.grupoIds.includes(g.id)).flatMap((g) => g.piezas.map((gp) => ({
    clave: varias ? g.id + '::' + gp.rol : gp.rol,
    etiqueta: varias ? g.nombre + ' · ' + gp.rol : gp.rol,
  })));
}

function nuevaLinea(productoId, talla = '', extra = {}) {
  return { id: crypto.randomUUID(), productoId, talla, nombre: '', numero: '', piezasExcluidas: [], ...extra };
}

function resumenPorTalla(lineas) {
  const cuenta = new Map();
  for (const l of lineas) cuenta.set(l.talla || '?', (cuenta.get(l.talla || '?') || 0) + 1);
  return ordenarTallasNatural([...cuenta.keys()].filter((t) => t !== '?')).map((t) => [t, cuenta.get(t)])
    .concat(cuenta.has('?') ? [['?', cuenta.get('?')]] : []);
}

// --- página -----------------------------------------------------------------

export function Pedidos({ recargarSenal }) {
  const [datos, setDatos] = useState({ productos: [], grupos: [], piezas: [], pedidos: [] });
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  // El pedido abierto: { id (null = nuevo), cliente, productoId, lineas }.
  const [abierto, setAbierto] = useState(null);
  const [imprimiendo, setImprimiendo] = useState(null); // id del pedido en "Imprimir"
  const [porTalla, setPorTalla] = useState(null); // id del pedido en "Archivos por talla"

  async function recargar() {
    setErrorCarga(null);
    try {
      const [productos, grupos, piezas, pedidos] = await Promise.all(['productos', 'grupos', 'piezas', 'pedidos'].map((c) => obtener(c)));
      setDatos({ productos, grupos, piezas, pedidos });
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

  const { productos, pedidos } = datos;
  const lista = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const todos = pedidos.slice().reverse();
    if (!q) return todos;
    return todos.filter((p) => (p.cliente || '').toLowerCase().includes(q) ||
      (p.lineas || []).some((l) => (l.nombre || '').toLowerCase().includes(q)));
  }, [pedidos, busqueda]);

  function nuevo() {
    const productoId = productos[0]?.id || '';
    setAbierto({ id: null, cliente: '', productoId, lineas: [] });
    setImprimiendo(null);
  }
  function abrir(pedido) {
    const productoId = pedido.lineas?.[0]?.productoId || productos[0]?.id || '';
    setAbierto({ id: pedido.id, cliente: pedido.cliente, productoId, lineas: pedido.lineas || [] });
    setImprimiendo(null);
  }
  async function borrar(pedido) {
    if (!window.confirm('¿Eliminar el pedido de «' + pedido.cliente + '»? No se puede deshacer.')) return;
    await eliminarPedido(pedido.id);
    if (abierto?.id === pedido.id) setAbierto(null);
    if (imprimiendo === pedido.id) setImprimiendo(null);
    await recargar();
  }

  if (cargando) return <p className="text-sm text-muted-foreground">Cargando…</p>;
  if (errorCarga) return <ErrorCarga mensaje={errorCarga} onReintentar={recargar} />;
  if (productos.length === 0) return <p className="text-sm text-muted-foreground">Primero armá una producción en Diseño.</p>;

  return (
    <div className="pagina flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h2 className="text-lg font-semibold">Pedidos</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Cada pedido es la lista de jugadores de un equipo: talla, nombre y número. Cargala a mano, desde una
            planilla o pegándola de Excel, y después armá el rollo de impresión.
          </p>
        </div>
        <Boton variante="primario" onClick={nuevo}>+ Nuevo pedido</Boton>
      </div>

      {abierto && (
        <EditorPedido
          key={abierto.id || 'nuevo'}
          inicial={abierto}
          datos={datos}
          onCerrar={() => setAbierto(null)}
          onGuardado={async (id, { imprimir }) => {
            await recargar();
            setAbierto(null);
            if (imprimir) setImprimiendo(id);
          }}
        />
      )}

      {porTalla && pedidos.find((p) => p.id === porTalla) && (
        <Tarjeta className="flex flex-col gap-3 border-primary/40">
          <div className="flex items-start gap-3">
            <h3 className="mr-auto text-sm font-semibold">Archivos por talla · «{pedidos.find((p) => p.id === porTalla).cliente}»</h3>
            <Boton variante="fantasma" tamano="sm" onClick={() => setPorTalla(null)}>Cerrar</Boton>
          </div>
          <ArchivosPorTalla key={porTalla} pedido={pedidos.find((p) => p.id === porTalla)} sinTitulo />
        </Tarjeta>
      )}

      {imprimiendo && (
        <PanelImprimir
          key={imprimiendo}
          pedido={pedidos.find((p) => p.id === imprimiendo)}
          onCerrar={() => setImprimiendo(null)}
        />
      )}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-faint-foreground">
            {pedidos.length === 0 ? 'Sin pedidos todavía' : pedidos.length + (pedidos.length === 1 ? ' pedido' : ' pedidos')}
          </h3>
          {pedidos.length > 0 && (
            <Input className="ml-auto w-64" placeholder="Buscar equipo o jugador" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          )}
        </div>
        {pedidos.length === 0 ? (
          <Tarjeta className="flex flex-col items-start gap-2 text-sm text-muted-foreground">
            Todavía no cargaste ningún pedido.
            <Boton variante="acento" onClick={nuevo}>Cargar el primero</Boton>
          </Tarjeta>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
            {lista.map((p) => (
              <TarjetaPedido key={p.id} pedido={p} productos={productos} activo={abierto?.id === p.id || imprimiendo === p.id}
                onEditar={() => abrir(p)} onImprimir={() => { setImprimiendo(p.id); setAbierto(null); setPorTalla(null); }}
                onPorTalla={() => { setPorTalla(p.id); setAbierto(null); setImprimiendo(null); }} onEliminar={() => borrar(p)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function TarjetaPedido({ pedido, productos, activo, onEditar, onImprimir, onPorTalla, onEliminar }) {
  const lineas = pedido.lineas || [];
  const nombresProd = [...new Set(lineas.map((l) => productos.find((p) => p.id === l.productoId)?.nombre).filter(Boolean))];
  return (
    <Tarjeta className={'flex flex-col gap-3 ' + (activo ? 'border-primary' : '')}>
      <div>
        <div className="font-semibold">{pedido.cliente || 'Sin nombre'}</div>
        <div className="text-xs text-faint-foreground">
          {lineas.length} {lineas.length === 1 ? 'prenda' : 'prendas'}{nombresProd.length ? ' · ' + nombresProd.join(', ') : ''}
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {resumenPorTalla(lineas).map(([t, n]) => (
          <Chip key={t} tono={t === '?' ? 'peligro' : 'neutro'} className="uppercase">{t} × {n}</Chip>
        ))}
      </div>
      <div className="mt-auto flex items-center gap-2 border-t border-border pt-2">
        <Boton variante="acento" tamano="sm" onClick={onImprimir} disabled={lineas.length === 0}>Imprimir</Boton>
        <Boton variante="primario" tamano="sm" onClick={onPorTalla} disabled={lineas.length === 0} title="Un PDF por talla (o por jugador) con cada prenda completa">Por talla</Boton>
        <Boton tamano="sm" onClick={onEditar}>Editar</Boton>
        <Boton variante="fantasma" tamano="sm" className="ml-auto" onClick={onEliminar}>Eliminar</Boton>
      </div>
    </Tarjeta>
  );
}

// --- editor -------------------------------------------------------------------

function EditorPedido({ inicial, datos, onCerrar, onGuardado }) {
  const { productos, grupos, piezas } = datos;
  const [cliente, setCliente] = useState(inicial.cliente);
  const [productoId, setProductoId] = useState(inicial.productoId);
  const [lineas, setLineas] = useState(inicial.lineas);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [importando, setImportando] = useState(null); // { jugadores, avisos, origen }
  const [pegando, setPegando] = useState(false);
  const entradaArchivo = useRef(null);
  const tablaFinal = useRef(null);

  const tallasDe = (id, conjuntoId) => tallasDelProducto(id, productos, grupos, piezas, conjuntoId);
  const conjuntosDeProduccion = (id) => conjuntosDe(productos.find((p) => p.id === id));
  const conConjuntos = lineas.some((l) => conjuntosDeProduccion(l.productoId).length > 1) || conjuntosDeProduccion(productoId).length > 1;
  const columnas = 4 + (variosProductos ? 1 : 0) + (conConjuntos ? 1 : 0);
  const tallasPorDefecto = tallasDe(productoId);
  const variosProductos = productos.length > 1;
  const conPiezasExcluibles = lineas.some((l) => l.piezasExcluidas?.length);
  const [verPiezas, setVerPiezas] = useState(conPiezasExcluibles);

  const actualizar = (id, cambios) => setLineas((prev) => prev.map((l) => (l.id === id ? { ...l, ...cambios } : l)));
  function agregar() {
    setLineas((prev) => {
      const ultima = prev[prev.length - 1];
      return [...prev, nuevaLinea(productoId, ultima?.talla || tallasPorDefecto[0] || '', ultima?.conjuntoId ? { conjuntoId: ultima.conjuntoId } : {})];
    });
    setTimeout(() => tablaFinal.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 30);
  }
  function cambiarProductoDelPedido(id) {
    // Las líneas que usaban la producción anterior pasan a la nueva (con su talla, si existe ahí).
    const nuevas = tallasDe(id);
    setLineas((prev) => prev.map((l) => (l.productoId === productoId
      ? { ...l, productoId: id, piezasExcluidas: [], talla: nuevas.includes(l.talla) ? l.talla : '' }
      : l)));
    setProductoId(id);
  }

  async function leerArchivo(archivo) {
    setError(null);
    try {
      const filas = await leerHoja(archivo.name, new Uint8Array(await archivo.arrayBuffer()));
      const r = interpretarJugadores(filas, tallasPorDefecto);
      if (r.jugadores.length === 0) throw new Error('La planilla no tiene jugadores (revisá que tenga columnas de nombre, talla y número).');
      setImportando({ ...r, origen: archivo.name });
    } catch (e) {
      setError(e.message);
    }
  }
  function leerPegado(texto) {
    const r = interpretarJugadores(filasDeTexto(texto), tallasPorDefecto);
    if (r.jugadores.length === 0) { setError('No encontré jugadores en lo que pegaste.'); return; }
    setPegando(false);
    setImportando({ ...r, origen: 'lo que pegaste' });
  }
  function sumarImportados(reemplazar) {
    const nuevas = importando.jugadores.map((j) => nuevaLinea(productoId, j.talla, { nombre: j.nombre, numero: j.numero }));
    setLineas((prev) => (reemplazar ? nuevas : [...prev, ...nuevas]));
    setImportando(null);
  }

  const sinTalla = lineas.filter((l) => !l.talla).length;
  async function guardar(imprimir) {
    setError(null);
    if (!cliente.trim()) { setError('Poné el nombre del equipo o cliente.'); return; }
    if (lineas.length === 0) { setError('El pedido no tiene ningún jugador.'); return; }
    if (sinTalla) { setError(sinTalla === 1 ? 'Hay 1 jugador sin talla.' : 'Hay ' + sinTalla + ' jugadores sin talla.'); return; }
    setGuardando(true);
    try {
      const datosPedido = { cliente: cliente.trim(), lineas };
      const r = inicial.id ? await editarPedido(inicial.id, datosPedido) : await crearPedido(datosPedido);
      await onGuardado(r?.id || inicial.id, { imprimir });
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Tarjeta className="flex flex-col gap-4 border-primary/40">
      <div className="flex flex-wrap items-start gap-3">
        <h3 className="mr-auto text-sm font-semibold">{inicial.id ? 'Editando el pedido' : 'Nuevo pedido'}</h3>
        <Boton variante="fantasma" tamano="sm" onClick={onCerrar}>Cerrar</Boton>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Equipo / cliente">
          <Input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Club Atlético X" autoFocus={!inicial.id} />
        </Campo>
        <Campo etiqueta="Producción">
          <Select value={productoId} onChange={(e) => cambiarProductoDelPedido(e.target.value)}>
            {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </Select>
        </Campo>
      </div>
      {tallasPorDefecto.length === 0 && (
        <Aviso tono="error">
          Esa producción no tiene ninguna talla con todas sus piezas cargadas (revisá la prenda en Moldería).{' '}
          {diagnosticoSinTallaComun(productoId, productos, grupos, piezas)}
        </Aviso>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Boton onClick={agregar}>+ Jugador</Boton>
        <Boton onClick={() => entradaArchivo.current?.click()}>Cargar planilla…</Boton>
        <Boton variante="fantasma" onClick={() => setPegando((v) => !v)}>Pegar desde Excel</Boton>
        <input ref={entradaArchivo} type="file" className="hidden"
          accept=".csv,.tsv,.txt,.xlsx,.xlsm,.ods,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.oasis.opendocument.spreadsheet"
          onChange={(e) => { const a = e.target.files?.[0]; e.target.value = ''; if (a) leerArchivo(a); }} />
        <label className="ml-auto flex items-center gap-1.5 text-xs text-faint-foreground">
          <input type="checkbox" checked={verPiezas} onChange={(e) => setVerPiezas(e.target.checked)} />
          Sacar piezas por jugador
        </label>
      </div>
      <p className="-mt-2 text-xs text-faint-foreground">
        La planilla puede ser .xlsx, .ods o .csv, con columnas <b>Nombre</b>, <b>Talla</b> y <b>Número</b> (en cualquier orden;
        sin títulos se toman en ese orden). Prendas sin nombre o sin número: dejá esa celda vacía.
      </p>

      {pegando && <PegarLista onListo={leerPegado} onCancelar={() => setPegando(false)} />}
      {importando && (
        <VistaImportacion importacion={importando} hayLineas={lineas.length > 0} onSumar={sumarImportados} onCancelar={() => setImportando(null)} />
      )}

      {lineas.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-surface-muted text-left text-xs text-faint-foreground">
              <tr>
                <th className="w-10 px-3 py-2 font-medium">#</th>
                {variosProductos && <th className="px-2 py-2 font-medium">Producción</th>}
                {conConjuntos && <th className="w-32 px-2 py-2 font-medium">Conjunto</th>}
                <th className="w-24 px-2 py-2 font-medium">Talla</th>
                <th className="px-2 py-2 font-medium">Nombre</th>
                <th className="w-24 px-2 py-2 font-medium">Número</th>
                <th className="w-10 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {lineas.map((l, i) => {
                const tallas = tallasDe(l.productoId, l.conjuntoId);
                const roles = verPiezas ? rolesDelProducto(l.productoId, productos, grupos, l.conjuntoId) : [];
                const conjuntosLinea = conjuntosDeProduccion(l.productoId);
                const conjuntoLinea = conjuntoDeLinea(productos.find((p) => p.id === l.productoId), l);
                return [
                  <tr key={l.id} className="border-t border-border">
                    <td className="px-3 py-1.5 text-xs text-faint-foreground">{i + 1}</td>
                    {variosProductos && (
                      <td className="px-2 py-1.5">
                        <Select className="h-8 text-xs" value={l.productoId} onChange={(e) => {
                          const nuevas = tallasDe(e.target.value);
                          actualizar(l.id, { productoId: e.target.value, piezasExcluidas: [], talla: nuevas.includes(l.talla) ? l.talla : '' });
                        }}>
                          {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                        </Select>
                      </td>
                    )}
                    {conConjuntos && (
                      <td className="px-2 py-1.5">
                        {conjuntosLinea.length > 1 ? (
                          <Select className="h-8 text-xs" value={conjuntoLinea?.id || ''} onChange={(e) => {
                            const nuevas = tallasDe(l.productoId, e.target.value);
                            actualizar(l.id, { conjuntoId: e.target.value, piezasExcluidas: [], talla: nuevas.includes(l.talla) ? l.talla : '' });
                          }}>
                            {conjuntosLinea.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                          </Select>
                        ) : <span className="text-xs text-faint-foreground">{conjuntosLinea[0]?.nombre || '—'}</span>}
                      </td>
                    )}
                    <td className="px-2 py-1.5">
                      <Select className={'h-8 ' + (l.talla ? '' : 'border-danger text-danger')} value={l.talla} onChange={(e) => actualizar(l.id, { talla: e.target.value })}>
                        {!l.talla && <option value="">—</option>}
                        {tallas.map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                      </Select>
                    </td>
                    <td className="px-2 py-1.5">
                      {/* Enter: otro renglón (el nombre sale en varias líneas, una encima de la otra). */}
                      <InputMultilinea className="min-h-8 py-1" placeholder="(sin nombre)" value={l.nombre} title="Enter para otro renglón"
                        onChange={(e) => actualizar(l.id, { nombre: e.target.value.toUpperCase() })} />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input className="h-8" placeholder="(sin n°)" value={l.numero} onChange={(e) => actualizar(l.id, { numero: e.target.value })} />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <button type="button" aria-label={'Quitar la fila ' + (i + 1)} className="rounded px-1.5 text-faint-foreground hover:bg-danger-soft hover:text-danger"
                        onClick={() => setLineas((prev) => prev.filter((x) => x.id !== l.id))}>×</button>
                    </td>
                  </tr>,
                  roles.length > 0 && (
                    <tr key={l.id + '-p'} className="bg-surface-muted/40">
                      <td />
                      <td colSpan={columnas} className="px-2 pb-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-faint-foreground">No lleva:</span>
                          {roles.map(({ clave, etiqueta }) => {
                            const fuera = (l.piezasExcluidas || []).includes(clave);
                            return (
                              <button key={clave} type="button" aria-pressed={fuera} onClick={() => actualizar(l.id, {
                                piezasExcluidas: fuera ? l.piezasExcluidas.filter((r) => r !== clave) : [...(l.piezasExcluidas || []), clave],
                              })}>
                                <Chip tono={fuera ? 'peligro' : 'neutro'}>{etiqueta}</Chip>
                              </button>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
          <div ref={tablaFinal} />
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Todavía no hay jugadores. Agregalos de a uno, cargá una planilla o pegalos desde Excel.
        </p>
      )}

      {lineas.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-faint-foreground">
          <span className="font-semibold">{lineas.length} {lineas.length === 1 ? 'prenda' : 'prendas'}:</span>
          {resumenPorTalla(lineas).map(([t, n]) => (
            <Chip key={t} tono={t === '?' ? 'peligro' : 'neutro'} className="uppercase">{t === '?' ? 'sin talla' : t} × {n}</Chip>
          ))}
        </div>
      )}

      {error && <Aviso tono="error">{error}</Aviso>}
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Boton variante="primario" disabled={guardando} onClick={() => guardar(false)}>{guardando ? 'Guardando…' : 'Guardar pedido'}</Boton>
        <Boton variante="acento" disabled={guardando} onClick={() => guardar(true)}>Guardar e imprimir</Boton>
        <Boton variante="fantasma" className="ml-auto" onClick={onCerrar}>Cancelar</Boton>
      </div>
    </Tarjeta>
  );
}

function PegarLista({ onListo, onCancelar }) {
  const [texto, setTexto] = useState('');
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-muted p-3">
      <span className="text-xs text-faint-foreground">
        Copiá las celdas en Excel o Google Sheets (con o sin la fila de títulos) y pegalas acá.
      </span>
      <textarea className="min-h-[120px] rounded-md border border-border bg-surface p-2 font-mono text-xs" autoFocus
        placeholder={'Nombre\tTalla\tNúmero\nPEÑA\tM\t10'} value={texto} onChange={(e) => setTexto(e.target.value)} />
      <div className="flex gap-2">
        <Boton variante="primario" tamano="sm" disabled={!texto.trim()} onClick={() => onListo(texto)}>Revisar</Boton>
        <Boton variante="fantasma" tamano="sm" onClick={onCancelar}>Cancelar</Boton>
      </div>
    </div>
  );
}

function VistaImportacion({ importacion, hayLineas, onSumar, onCancelar }) {
  const { jugadores, avisos, origen } = importacion;
  const sinTalla = jugadores.filter((j) => !j.talla).length;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary/40 bg-primary-soft/20 p-3">
      <div className="text-sm">
        <b>{jugadores.length}</b> {jugadores.length === 1 ? 'jugador' : 'jugadores'} en {origen}
        {sinTalla > 0 && <span className="text-danger"> · {sinTalla} sin talla válida (se agregan igual, para que la elijas)</span>}
      </div>
      <div className="flex flex-wrap gap-1">
        {resumenPorTalla(jugadores).map(([t, n]) => <Chip key={t} tono={t === '?' ? 'peligro' : 'neutro'} className="uppercase">{t === '?' ? 'sin talla' : t} × {n}</Chip>)}
      </div>
      <div className="max-h-48 overflow-y-auto rounded border border-border bg-surface text-xs">
        <table className="w-full">
          <tbody>
            {jugadores.map((j) => (
              <tr key={j.fila} className="border-t border-border first:border-t-0">
                <td className="w-12 px-2 py-1 text-faint-foreground">fila {j.fila}</td>
                <td className={'w-16 px-2 py-1 uppercase ' + (j.talla ? '' : 'text-danger')}>{j.talla || j.tallaLeida || '—'}</td>
                <td className="px-2 py-1">{j.nombre || <span className="text-faint-foreground">(sin nombre)</span>}</td>
                <td className="w-16 px-2 py-1">{j.numero || <span className="text-faint-foreground">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {avisos.length > 0 && (
        <details className="text-xs text-danger">
          <summary className="cursor-pointer">{avisos.length === 1 ? '1 aviso' : avisos.length + ' avisos'}</summary>
          <ul className="mt-1 list-disc pl-5">{avisos.map((a, i) => <li key={i}>{a.mensaje}</li>)}</ul>
        </details>
      )}
      <div className="flex flex-wrap gap-2">
        {hayLineas ? (
          <>
            <Boton variante="primario" tamano="sm" onClick={() => onSumar(false)}>Agregar al final</Boton>
            <Boton tamano="sm" onClick={() => onSumar(true)}>Reemplazar la lista</Boton>
          </>
        ) : (
          <Boton variante="primario" tamano="sm" onClick={() => onSumar(true)}>Cargar estos jugadores</Boton>
        )}
        <Boton variante="fantasma" tamano="sm" onClick={onCancelar}>Descartar</Boton>
      </div>
    </div>
  );
}

// --- imprimir -------------------------------------------------------------------

const ANCHOS_COMUNES = [150, 160, 180];

function PanelImprimir({ pedido, onCerrar }) {
  const [ancho, setAncho] = useState(160);
  const [resultado, setResultado] = useState(null);
  const [armando, setArmando] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [error, setError] = useState(null);
  if (!pedido) return null;

  async function armar() {
    setError(null);
    setResultado(null);
    setArmando(true);
    try {
      const r = await anidarDesdePedido(pedido.id, Number(ancho));
      setResultado({ ...r, ancho: Number(ancho) });
    } catch (e) {
      setError(e.message);
    } finally {
      setArmando(false);
    }
  }
  async function descargar() {
    setError(null);
    setDescargando(true);
    try {
      // El servidor vuelve a armar el rollo con el MISMO ancho (no lo que haya en el campo ahora).
      await generarPdf(pedido.id, resultado.ancho);
    } catch (e) {
      setError(e.message === 'Failed to fetch'
        ? 'Se cortó la conexión con el servidor mientras armaba el PDF (puede ser un rollo muy pesado). Probá de nuevo; si sigue, probá con menos prendas.'
        : e.message);
    } finally {
      setDescargando(false);
    }
  }

  const avisos = resultado?.advertencias || [];
  return (
    <Tarjeta className="flex flex-col gap-4 border-primary/40">
      <div className="flex items-start gap-3">
        <div className="mr-auto">
          <h3 className="text-sm font-semibold">Imprimir «{pedido.cliente}»</h3>
          <p className="text-xs text-faint-foreground">{pedido.lineas.length} prendas · todas las piezas acomodadas en un rollo, listo para sublimar.</p>
        </div>
        <Boton variante="fantasma" tamano="sm" onClick={onCerrar}>Cerrar</Boton>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-faint-foreground">1 · Ancho del rollo</span>
        <div className="flex flex-wrap items-center gap-2">
          {ANCHOS_COMUNES.map((a) => (
            <button key={a} type="button" aria-pressed={Number(ancho) === a} onClick={() => { setAncho(a); setResultado(null); }}
              className={'rounded-lg border px-3 py-1.5 text-sm font-medium ' + (Number(ancho) === a ? 'border-primary bg-primary-soft text-primary' : 'border-border text-muted-foreground hover:border-primary/50')}>
              {a} cm
            </button>
          ))}
          <Input type="number" className="w-24" min={20} value={ancho} onChange={(e) => { setAncho(e.target.value); setResultado(null); }} aria-label="Otro ancho en cm" />
          <span className="text-xs text-faint-foreground">cm</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-faint-foreground">2 · Armar el rollo</span>
        <div className="flex flex-wrap items-center gap-3">
          <Boton variante="primario" disabled={armando || !(Number(ancho) > 0)} onClick={armar}>{armando ? 'Acomodando las piezas…' : resultado ? 'Volver a armar' : 'Armar el rollo'}</Boton>
          {resultado && (
            <span className="text-sm text-muted-foreground">
              {resultado.anchoLienzoCm} × {resultado.altoLienzoCm} cm · aprovechamiento {resultado.utilizacion}%
            </span>
          )}
        </div>
        {avisos.length > 0 && (
          <details className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
            <summary className="cursor-pointer text-amber-300">
              {avisos.length === 1 ? '1 cosa para revisar' : avisos.length + ' cosas para revisar'} antes de imprimir (no frenan nada)
            </summary>
            <ul className="mt-2 list-disc pl-5 text-foreground/90">{avisos.map((a, i) => <li key={i}>{a.mensaje}</li>)}</ul>
          </details>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-faint-foreground">3 · PDF de impresión</span>
        <div className="flex flex-wrap items-center gap-3">
          <Boton variante="acento" disabled={!resultado || descargando} onClick={descargar}>
            {descargando ? 'Armando el PDF…' : 'Descargar PDF'}
          </Boton>
          <span className="text-xs text-faint-foreground">
            {resultado ? 'Se abre en Illustrator como documento propio: texto editable y efectos vivos.' : 'Primero armá el rollo.'}
          </span>
        </div>
      </div>

      {error && <Aviso tono="error">{error}</Aviso>}
      {resultado && <VistaPreviaNesting resultado={resultado} />}

      <ArchivosPorTalla pedido={pedido} />
    </Tarjeta>
  );
}

// Un PDF por talla, con los jugadores: cada uno con su prenda completa y una
// mesa por pieza (su nombre, número, logos y estilo). Para producir sin el
// rollo de impresión.
function ArchivosPorTalla({ pedido, sinTitulo }) {
  const [bajando, setBajando] = useState(null); // talla, o '*' para todas
  const [actual, setActual] = useState(null); // la talla que se está armando ahora
  const [hechas, setHechas] = useState([]);
  const [error, setError] = useState(null);
  const tallas = ordenarTallasNatural([...new Set(pedido.lineas.map((l) => l.talla).filter(Boolean))]);
  const cuantas = (t) => pedido.lineas.filter((l) => l.talla === t).length;
  const base = String(pedido.cliente || 'pedido').replace(/[^a-z0-9_-]+/gi, '_');

  async function bajar(lista, marca) {
    setError(null);
    setBajando(marca);
    try {
      for (const t of lista) {
        setActual(t);
        await exportarTallaDePedido(pedido.id, t, base + '_talla_' + t + '.pdf');
        setHechas((h) => [...new Set([...h, t])]);
      }
    } catch (e) {
      setError(e.message === 'Failed to fetch' ? 'Se cortó la conexión mientras se armaba el archivo. Probá de nuevo esa talla.' : e.message);
    } finally {
      setBajando(null);
      setActual(null);
    }
  }

  async function bajarJugador(linea, quien) {
    setError(null);
    setBajando(linea.id);
    setActual(linea.id);
    try {
      await exportarTallaDePedido(pedido.id, linea.talla, base + '_' + linea.talla + '_' + quien.replace(/[^a-z0-9_-]+/gi, '_') + '.pdf', linea.id);
      setHechas((h) => [...new Set([...h, linea.id])]);
    } catch (e) {
      setError(e.message === 'Failed to fetch' ? 'Se cortó la conexión mientras se armaba el archivo. Probá de nuevo.' : e.message);
    } finally {
      setBajando(null);
      setActual(null);
    }
  }

  return (
    <div className={'flex flex-col gap-2 ' + (sinTitulo ? '' : 'border-t border-border pt-3')}>
      {!sinTitulo && <span className="text-xs font-semibold text-faint-foreground">Archivos por talla (con los jugadores)</span>}
      <p className="text-xs text-faint-foreground">
        Un PDF por talla: cada jugador con su prenda completa, una mesa por pieza, con su nombre, número, logos y estilo. Se abre en Illustrator como documento propio.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {tallas.map((t) => (
          <Boton key={t} tamano="sm" variante={hechas.includes(t) ? 'secundario' : 'primario'} disabled={!!bajando} onClick={() => bajar([t], t)}>
            {actual === t ? 'Armando ' + t.toUpperCase() + '…' : (hechas.includes(t) ? '✓ ' : '') + t.toUpperCase() + ' · ' + cuantas(t)}
          </Boton>
        ))}
        {tallas.length > 1 && (
          <Boton tamano="sm" variante="acento" disabled={!!bajando} onClick={() => bajar(tallas, '*')}>
            {bajando === '*' ? 'Bajando todas…' : 'Todas las tallas (' + tallas.length + ' archivos)'}
          </Boton>
        )}
      </div>
      <details className="rounded-lg border border-border px-3 py-2 text-xs">
        <summary className="cursor-pointer text-muted-foreground">Un archivo por jugador</summary>
        <div className="mt-2 flex flex-col gap-2">
          {tallas.map((t) => (
            <div key={t} className="flex flex-wrap items-center gap-1.5">
              <span className="w-10 flex-none font-semibold uppercase text-faint-foreground">{t}</span>
              {pedido.lineas.filter((l) => l.talla === t).map((l, i) => {
                const quien = [String(l.nombre || '').replace(/\s+/g, ' ').trim(), l.numero].filter(Boolean).join(' ') || 'Prenda ' + (i + 1);
                return (
                  <Boton key={l.id} tamano="sm" variante={hechas.includes(l.id) ? 'secundario' : 'fantasma'} disabled={!!bajando}
                    onClick={() => bajarJugador(l, quien)}>
                    {actual === l.id ? 'Armando…' : (hechas.includes(l.id) ? '✓ ' : '') + quien}
                  </Boton>
                );
              })}
            </div>
          ))}
        </div>
      </details>
      {error && <Aviso tono="error">{error}</Aviso>}
    </div>
  );
}
