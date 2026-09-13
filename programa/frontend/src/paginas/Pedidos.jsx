import { useEffect, useState } from 'react';
import {
  listarProductos,
  listarGrupos,
  listarPedidos,
  crearPedido,
  eliminarPedido,
  anidarDesdePedido,
  generarPdf,
} from '../api.js';
import { TALLAS } from '../constantes.js';
import { VistaPreviaNesting } from '../componentes/VistaPreviaNesting.jsx';
import { Boton, Campo, Input, Select, Tarjeta, Chip, Aviso } from '../componentes/ui.jsx';

function lineaVacia(productoId) {
  return { id: crypto.randomUUID(), productoId, talla: TALLAS[2], nombre: '', numero: '', piezasExcluidas: [] };
}

export function Pedidos({ recargarSenal }) {
  const [productos, setProductos] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [cliente, setCliente] = useState('');
  const [lineas, setLineas] = useState([]);
  const [error, setError] = useState(null);

  const [pedidoParaGenerar, setPedidoParaGenerar] = useState(null);
  const [anchoLienzoCm, setAnchoLienzoCm] = useState(160);
  const [resultado, setResultado] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [errorGenerar, setErrorGenerar] = useState(null);

  async function recargar() {
    const [ps, gs, peds] = await Promise.all([listarProductos(), listarGrupos(), listarPedidos()]);
    setProductos(ps);
    setGrupos(gs);
    setPedidos(peds);
    if (ps.length > 0 && lineas.length === 0) setLineas([lineaVacia(ps[0].id)]);
  }

  useEffect(() => {
    recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recargarSenal]);

  function actualizarLinea(id, cambios) {
    setLineas((prev) => prev.map((l) => (l.id === id ? { ...l, ...cambios } : l)));
  }

  function alternarPiezaExcluida(id, rol) {
    setLineas((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const excluidas = l.piezasExcluidas.includes(rol)
          ? l.piezasExcluidas.filter((r) => r !== rol)
          : [...l.piezasExcluidas, rol];
        return { ...l, piezasExcluidas: excluidas };
      })
    );
  }

  function agregarLinea() {
    setLineas((prev) => [...prev, lineaVacia(productos[0]?.id)]);
  }

  function quitarLinea(id) {
    setLineas((prev) => prev.filter((l) => l.id !== id));
  }

  function rolesDelProducto(productoId) {
    const producto = productos.find((p) => p.id === productoId);
    const grupo = producto && grupos.find((g) => g.id === producto.grupoId);
    return grupo ? grupo.piezas.map((gp) => gp.rol) : [];
  }

  async function guardar(evento) {
    evento.preventDefault();
    setError(null);
    if (!cliente.trim() || lineas.length === 0) {
      setError('Falta el nombre del cliente/equipo o no hay ninguna prenda cargada.');
      return;
    }
    try {
      await crearPedido({ cliente, lineas });
      setCliente('');
      setLineas(productos.length > 0 ? [lineaVacia(productos[0].id)] : []);
      await recargar();
    } catch (e) {
      setError(e.message);
    }
  }

  async function borrar(id) {
    await eliminarPedido(id);
    if (pedidoParaGenerar === id) setPedidoParaGenerar(null);
    await recargar();
  }

  async function anidar() {
    setErrorGenerar(null);
    setResultado(null);
    setCargando(true);
    try {
      const datos = await anidarDesdePedido(pedidoParaGenerar, Number(anchoLienzoCm));
      setResultado(datos);
    } catch (e) {
      setErrorGenerar(e.message);
    } finally {
      setCargando(false);
    }
  }

  async function descargarPdf() {
    if (resultado) await generarPdf(resultado);
  }

  return (
    <div className="pagina flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Pedidos</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Un pedido real es talla + nombre + número por prenda — es lo que hace falta para
          personalizar de verdad, no solo cantidad por talla.
        </p>
      </div>

      {productos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Creá primero un producto (Diseño → Productos).</p>
      ) : (
        <Tarjeta as="form" onSubmit={guardar} className="flex max-w-2xl flex-col gap-4">
          <Campo etiqueta="Cliente / equipo">
            <Input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Club Atlético X" />
          </Campo>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint-foreground">
              Prendas del pedido
            </h3>
            <div className="flex flex-col gap-2">
              {lineas.map((linea) => {
                const roles = rolesDelProducto(linea.productoId);
                return (
                  <div key={linea.id} className="rounded-lg border border-border bg-surface-muted p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        className="max-w-[160px]"
                        value={linea.productoId}
                        onChange={(e) => actualizarLinea(linea.id, { productoId: e.target.value, piezasExcluidas: [] })}
                      >
                        {productos.map((p) => (
                          <option key={p.id} value={p.id}>{p.nombre}</option>
                        ))}
                      </Select>
                      <Select
                        className="max-w-[80px]"
                        value={linea.talla}
                        onChange={(e) => actualizarLinea(linea.id, { talla: e.target.value })}
                      >
                        {TALLAS.map((t) => <option key={t} value={t}>{t}</option>)}
                      </Select>
                      <Input
                        className="max-w-[140px]"
                        placeholder="Nombre"
                        value={linea.nombre}
                        onChange={(e) => actualizarLinea(linea.id, { nombre: e.target.value.toUpperCase() })}
                      />
                      <Input
                        className="max-w-[70px]"
                        placeholder="N°"
                        value={linea.numero}
                        onChange={(e) => actualizarLinea(linea.id, { numero: e.target.value })}
                      />
                      <Boton variante="fantasma" tamano="sm" type="button" onClick={() => quitarLinea(linea.id)}>
                        Quitar
                      </Boton>
                    </div>

                    {roles.length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-2">
                        <span className="text-xs text-faint-foreground">Excluir piezas de esta prenda puntual:</span>
                        {roles.map((rol) => {
                          const activo = linea.piezasExcluidas.includes(rol);
                          return (
                            <label key={rol} className="cursor-pointer">
                              <input
                                type="checkbox"
                                className="peer sr-only"
                                checked={activo}
                                onChange={() => alternarPiezaExcluida(linea.id, rol)}
                              />
                              <Chip tono={activo ? 'peligro' : 'neutro'}>{rol}</Chip>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2">
            <Boton type="button" onClick={agregarLinea}>+ Agregar prenda</Boton>
            <Boton variante="primario" type="submit">Guardar pedido</Boton>
          </div>
          {error && <Aviso tono="error">{error}</Aviso>}
        </Tarjeta>
      )}

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint-foreground">
          Pedidos cargados
        </h3>
        {pedidos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay ninguno.</p>
        ) : (
          <div className="flex max-w-2xl flex-col gap-2">
            {pedidos.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm">
                <div className="flex-1">
                  <span className="font-medium">{p.cliente}</span>{' '}
                  <span className="text-muted-foreground">
                    — {p.lineas.length} prenda(s):{' '}
                    {p.lineas.map((l) =>
                      l.talla + ' ' + l.nombre + '/' + l.numero + (l.piezasExcluidas?.length ? ' (sin ' + l.piezasExcluidas.join(', ') + ')' : '')
                    ).join(', ')}
                  </span>
                </div>
                <Boton variante="secundario" tamano="sm" onClick={() => { setPedidoParaGenerar(p.id); setResultado(null); }}>
                  Generar
                </Boton>
                <Boton variante="fantasma" tamano="sm" onClick={() => borrar(p.id)}>Eliminar</Boton>
              </div>
            ))}
          </div>
        )}
      </div>

      {pedidoParaGenerar && (
        <Tarjeta className="flex max-w-2xl flex-col gap-3">
          <h4 className="text-sm font-semibold">
            Generar: {pedidos.find((p) => p.id === pedidoParaGenerar)?.cliente}
          </h4>
          <Campo etiqueta="Ancho del lienzo/rollo (cm)" className="max-w-[160px]">
            <Input type="number" value={anchoLienzoCm} onChange={(e) => setAnchoLienzoCm(e.target.value)} />
          </Campo>
          <div className="flex gap-2">
            <Boton variante="primario" onClick={anidar} disabled={cargando}>
              {cargando ? 'Anidando…' : 'Anidar'}
            </Boton>
            <Boton onClick={descargarPdf} disabled={!resultado}>Generar PDF</Boton>
          </div>
          {errorGenerar && <Aviso tono="error">{errorGenerar}</Aviso>}
          {resultado && (
            <p className="text-sm text-muted-foreground">
              Lienzo {resultado.anchoLienzoCm}×{resultado.altoLienzoCm} cm · utilización {resultado.utilizacion}%
            </p>
          )}
        </Tarjeta>
      )}

      {resultado && <VistaPreviaNesting resultado={resultado} />}
    </div>
  );
}
