import { useEffect, useState } from 'react';
import { listarMolderias, listarDisenos, listarProductos, crearProducto, eliminarProducto } from '../api.js';
import { TALLAS } from '../constantes.js';

function elementoVacio(piezaNombre) {
  return {
    id: crypto.randomUUID(),
    piezaNombre,
    tipo: 'nombre',
    posicion: { xCm: 5, yCm: 15 },
    modoEscalado: 'proporcional',
    // "A esta talla, la letra mide referenciaProporcional.altoCm" — sin esto
    // no hay contra qué comparar el crecimiento de la pieza en otras tallas.
    tallaReferencia: 'M',
    referenciaProporcional: { altoCm: 5 },
    colorHex: '#ffffff',
  };
}

export function Productos({ recargarSenal, onCambio }) {
  const [molderias, setMolderias] = useState([]);
  const [disenos, setDisenos] = useState([]);
  const [productos, setProductos] = useState([]);
  const [nombre, setNombre] = useState('');
  const [molderiaId, setMolderiaId] = useState('');
  const [disenoId, setDisenoId] = useState('');
  const [elementos, setElementos] = useState([]);
  const [error, setError] = useState(null);

  async function recargar() {
    const [ms, ds, ps] = await Promise.all([listarMolderias(), listarDisenos(), listarProductos()]);
    setMolderias(ms);
    setDisenos(ds);
    setProductos(ps);
    if (ms.length > 0 && !molderiaId) setMolderiaId(ms[0].id);
  }

  useEffect(() => {
    recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recargarSenal]);

  const molderiaSeleccionada = molderias.find((m) => m.id === molderiaId);
  const disenosDeEstaMolderia = disenos.filter((d) => d.molderiaId === molderiaId);

  function agregarElemento(piezaNombre) {
    setElementos((prev) => [...prev, elementoVacio(piezaNombre)]);
  }

  function actualizarElemento(id, cambios) {
    setElementos((prev) => prev.map((el) => (el.id === id ? { ...el, ...cambios } : el)));
  }

  function quitarElemento(id) {
    setElementos((prev) => prev.filter((el) => el.id !== id));
  }

  async function guardar(evento) {
    evento.preventDefault();
    setError(null);
    if (!nombre.trim() || !molderiaId) {
      setError('Falta el nombre del producto o la moldería.');
      return;
    }
    try {
      await crearProducto({ nombre, molderiaId, disenoId: disenoId || null, elementos });
      setNombre('');
      setElementos([]);
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

  return (
    <div className="pagina">
      <h2>Productos</h2>
      <p className="ayuda">
        Une una moldería con un diseño y define dónde va cada nombre/número — el equivalente a
        "Elementos" en la referencia que usamos.
      </p>

      {molderias.length === 0 ? (
        <p>Creá primero una moldería.</p>
      ) : (
        <form className="tarjeta" onSubmit={guardar}>
          <label>
            Nombre del producto
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Camiseta titular" />
          </label>

          <label>
            Moldería
            <select value={molderiaId} onChange={(e) => { setMolderiaId(e.target.value); setElementos([]); setDisenoId(''); }}>
              {molderias.map((m) => (
                <option key={m.id} value={m.id}>{m.nombre}</option>
              ))}
            </select>
          </label>

          <label>
            Diseño (opcional — sin diseño, la pieza sale en blanco)
            <select value={disenoId} onChange={(e) => setDisenoId(e.target.value)}>
              <option value="">— Sin diseño —</option>
              {disenosDeEstaMolderia.map((d) => (
                <option key={d.id} value={d.id}>{d.nombre}</option>
              ))}
            </select>
          </label>

          <h4>Elementos (nombre, número, texto por pieza)</h4>
          {molderiaSeleccionada?.piezas.map((pieza) => (
            <div className="fila-pieza" key={pieza.nombre}>
              <div className="fila-pieza-cabecera">
                <strong>{pieza.nombre}</strong>
                <button type="button" onClick={() => agregarElemento(pieza.nombre)}>
                  + Agregar elemento en esta pieza
                </button>
              </div>

              {elementos.filter((el) => el.piezaNombre === pieza.nombre).map((elemento) => (
                <div className="fila-elemento" key={elemento.id}>
                  <select
                    value={elemento.tipo}
                    onChange={(e) => actualizarElemento(elemento.id, { tipo: e.target.value })}
                  >
                    <option value="nombre">Nombre del jugador</option>
                    <option value="numero">Número</option>
                    <option value="texto">Texto fijo</option>
                  </select>

                  {elemento.tipo === 'texto' && (
                    <input
                      placeholder="Texto fijo"
                      value={elemento.valorFijo || ''}
                      onChange={(e) => actualizarElemento(elemento.id, { valorFijo: e.target.value })}
                    />
                  )}

                  <span>X</span>
                  <input
                    type="number"
                    value={elemento.posicion.xCm}
                    onChange={(e) =>
                      actualizarElemento(elemento.id, { posicion: { ...elemento.posicion, xCm: Number(e.target.value) } })
                    }
                  />
                  <span>Y</span>
                  <input
                    type="number"
                    value={elemento.posicion.yCm}
                    onChange={(e) =>
                      actualizarElemento(elemento.id, { posicion: { ...elemento.posicion, yCm: Number(e.target.value) } })
                    }
                  />
                  <span>Alto letra (cm) en talla</span>
                  <input
                    type="number"
                    step="0.5"
                    title="Alto de la letra, medido a la talla de referencia elegida al lado"
                    value={elemento.referenciaProporcional.altoCm}
                    onChange={(e) =>
                      actualizarElemento(elemento.id, {
                        referenciaProporcional: { altoCm: Number(e.target.value) },
                      })
                    }
                  />
                  <select
                    value={elemento.tallaReferencia}
                    title="A esta talla corresponde el alto de letra de al lado; en otras tallas se escala en la misma proporción que crece la pieza"
                    onChange={(e) => actualizarElemento(elemento.id, { tallaReferencia: e.target.value })}
                  >
                    {TALLAS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input
                    type="color"
                    value={elemento.colorHex}
                    onChange={(e) => actualizarElemento(elemento.id, { colorHex: e.target.value })}
                  />
                  <button type="button" onClick={() => quitarElemento(elemento.id)}>Quitar</button>
                </div>
              ))}
            </div>
          ))}

          <div className="acciones">
            <button type="submit" className="primario">Guardar producto</button>
          </div>
          {error && <p className="error">{error}</p>}
        </form>
      )}

      <h3>Productos cargados</h3>
      {productos.length === 0 ? (
        <p>Todavía no hay ninguno.</p>
      ) : (
        <ul className="lista-molderias">
          {productos.map((p) => (
            <li key={p.id}>
              <strong>{p.nombre}</strong> — {p.elementos?.length || 0} elemento(s)
              <button type="button" onClick={() => borrar(p.id)}>Eliminar</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
