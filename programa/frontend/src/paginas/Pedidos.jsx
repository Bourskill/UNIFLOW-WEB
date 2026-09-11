import { useEffect, useState } from 'react';
import {
  listarProductos,
  listarPedidos,
  crearPedido,
  eliminarPedido,
  anidarDesdePedido,
  generarPdf,
} from '../api.js';
import { TALLAS } from '../constantes.js';
import { VistaPreviaNesting } from '../componentes/VistaPreviaNesting.jsx';

function lineaVacia(productoId) {
  return { id: crypto.randomUUID(), productoId, talla: TALLAS[2], nombre: '', numero: '' };
}

export function Pedidos({ recargarSenal }) {
  const [productos, setProductos] = useState([]);
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
    const [ps, peds] = await Promise.all([listarProductos(), listarPedidos()]);
    setProductos(ps);
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

  function agregarLinea() {
    setLineas((prev) => [...prev, lineaVacia(productos[0]?.id)]);
  }

  function quitarLinea(id) {
    setLineas((prev) => prev.filter((l) => l.id !== id));
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
    <div className="pagina">
      <h2>Pedidos</h2>
      <p className="ayuda">
        Un pedido real es talla + nombre + número por prenda — es lo que hace falta para
        personalizar de verdad, no solo cantidad por talla.
      </p>

      {productos.length === 0 ? (
        <p>Creá primero un producto (en la pestaña "Productos").</p>
      ) : (
        <form className="tarjeta" onSubmit={guardar}>
          <label>
            Cliente / equipo
            <input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Club Atlético X" />
          </label>

          <h4>Prendas del pedido</h4>
          {lineas.map((linea) => (
            <div className="fila-linea" key={linea.id}>
              <select
                value={linea.productoId}
                onChange={(e) => actualizarLinea(linea.id, { productoId: e.target.value })}
              >
                {productos.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
              <select value={linea.talla} onChange={(e) => actualizarLinea(linea.id, { talla: e.target.value })}>
                {TALLAS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <input
                placeholder="Nombre"
                value={linea.nombre}
                onChange={(e) => actualizarLinea(linea.id, { nombre: e.target.value.toUpperCase() })}
              />
              <input
                placeholder="N°"
                value={linea.numero}
                onChange={(e) => actualizarLinea(linea.id, { numero: e.target.value })}
              />
              <button type="button" onClick={() => quitarLinea(linea.id)}>Quitar</button>
            </div>
          ))}

          <div className="acciones">
            <button type="button" onClick={agregarLinea}>+ Agregar prenda</button>
            <button type="submit" className="primario">Guardar pedido</button>
          </div>
          {error && <p className="error">{error}</p>}
        </form>
      )}

      <h3>Pedidos cargados</h3>
      {pedidos.length === 0 ? (
        <p>Todavía no hay ninguno.</p>
      ) : (
        <ul className="lista-molderias">
          {pedidos.map((p) => (
            <li key={p.id}>
              <strong>{p.cliente}</strong> — {p.lineas.length} prenda(s):{' '}
              {p.lineas.map((l) => l.talla + ' ' + l.nombre + '/' + l.numero).join(', ')}
              <button type="button" onClick={() => { setPedidoParaGenerar(p.id); setResultado(null); }}>
                Generar
              </button>
              <button type="button" onClick={() => borrar(p.id)}>Eliminar</button>
            </li>
          ))}
        </ul>
      )}

      {pedidoParaGenerar && (
        <div className="tarjeta">
          <h4>Generar: {pedidos.find((p) => p.id === pedidoParaGenerar)?.cliente}</h4>
          <label>
            Ancho del lienzo/rollo (cm)
            <input type="number" value={anchoLienzoCm} onChange={(e) => setAnchoLienzoCm(e.target.value)} />
          </label>
          <div className="acciones">
            <button type="button" className="primario" onClick={anidar} disabled={cargando}>
              {cargando ? 'Anidando…' : 'Anidar'}
            </button>
            <button type="button" onClick={descargarPdf} disabled={!resultado}>Generar PDF</button>
          </div>
          {errorGenerar && <p className="error">{errorGenerar}</p>}
          {resultado && (
            <p className="metricas">
              Lienzo {resultado.anchoLienzoCm}×{resultado.altoLienzoCm} cm · utilización {resultado.utilizacion}%
            </p>
          )}
        </div>
      )}

      {resultado && <VistaPreviaNesting resultado={resultado} />}
    </div>
  );
}
