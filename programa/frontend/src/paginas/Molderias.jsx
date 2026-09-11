import { useEffect, useState } from 'react';
import { listarMolderias, crearMolderia, eliminarMolderia } from '../api.js';
import { TALLAS } from '../constantes.js';

function piezaVacia() {
  return { nombre: '', rotable: true, tela: '', dimensionesPorTalla: {} };
}

export function Molderias({ onCambio }) {
  const [molderias, setMolderias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [nombre, setNombre] = useState('');
  const [piezas, setPiezas] = useState([piezaVacia()]);

  async function recargar() {
    setCargando(true);
    try {
      setMolderias(await listarMolderias());
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    recargar();
  }, []);

  function actualizarPieza(indice, cambios) {
    setPiezas((prev) => prev.map((p, i) => (i === indice ? { ...p, ...cambios } : p)));
  }

  function actualizarDimension(indice, talla, campo, valor) {
    setPiezas((prev) =>
      prev.map((p, i) => {
        if (i !== indice) return p;
        const dimensionActual = p.dimensionesPorTalla[talla] || { anchoCm: '', altoCm: '' };
        return {
          ...p,
          dimensionesPorTalla: {
            ...p.dimensionesPorTalla,
            [talla]: { ...dimensionActual, [campo]: valor },
          },
        };
      })
    );
  }

  function agregarPieza() {
    setPiezas((prev) => [...prev, piezaVacia()]);
  }

  function quitarPieza(indice) {
    setPiezas((prev) => prev.filter((_, i) => i !== indice));
  }

  async function guardar(evento) {
    evento.preventDefault();
    setError(null);

    const piezasLimpias = piezas
      .filter((p) => p.nombre.trim())
      .map((p) => ({
        ...p,
        dimensionesPorTalla: Object.fromEntries(
          Object.entries(p.dimensionesPorTalla)
            .filter(([, d]) => d.anchoCm && d.altoCm)
            .map(([talla, d]) => [talla, { anchoCm: Number(d.anchoCm), altoCm: Number(d.altoCm) }])
        ),
      }));

    if (!nombre.trim() || piezasLimpias.length === 0) {
      setError('Falta el nombre de la moldería o no hay ninguna pieza con nombre cargado.');
      return;
    }

    try {
      await crearMolderia({ nombre, piezas: piezasLimpias });
      setNombre('');
      setPiezas([piezaVacia()]);
      await recargar();
      onCambio?.();
    } catch (e) {
      setError(e.message);
    }
  }

  async function borrar(id) {
    await eliminarMolderia(id);
    await recargar();
    onCambio?.();
  }

  return (
    <div className="pagina">
      <h2>Molderías</h2>

      <form className="tarjeta" onSubmit={guardar}>
        <label>
          Nombre de la moldería
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Remera básica" />
        </label>

        {piezas.map((pieza, indice) => (
          <div className="fila-pieza" key={indice}>
            <div className="fila-pieza-cabecera">
              <input
                placeholder="Nombre de la pieza (ej. Espalda)"
                value={pieza.nombre}
                onChange={(e) => actualizarPieza(indice, { nombre: e.target.value })}
              />
              <input
                placeholder="Tela"
                value={pieza.tela}
                onChange={(e) => actualizarPieza(indice, { tela: e.target.value })}
              />
              <label className="check">
                <input
                  type="checkbox"
                  checked={pieza.rotable}
                  onChange={(e) => actualizarPieza(indice, { rotable: e.target.checked })}
                />
                Rotable (flip 180°)
              </label>
              {piezas.length > 1 && (
                <button type="button" onClick={() => quitarPieza(indice)}>
                  Quitar pieza
                </button>
              )}
            </div>

            <div className="tabla-tallas">
              {TALLAS.map((talla) => (
                <div className="celda-talla" key={talla}>
                  <span>{talla}</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="ancho cm"
                    value={pieza.dimensionesPorTalla[talla]?.anchoCm ?? ''}
                    onChange={(e) => actualizarDimension(indice, talla, 'anchoCm', e.target.value)}
                  />
                  <input
                    type="number"
                    min="0"
                    placeholder="alto cm"
                    value={pieza.dimensionesPorTalla[talla]?.altoCm ?? ''}
                    onChange={(e) => actualizarDimension(indice, talla, 'altoCm', e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="acciones">
          <button type="button" onClick={agregarPieza}>
            + Agregar pieza
          </button>
          <button type="submit" className="primario">
            Guardar moldería
          </button>
        </div>

        {error && <p className="error">{error}</p>}
      </form>

      <h3>Molderías cargadas</h3>
      {cargando ? (
        <p>Cargando…</p>
      ) : molderias.length === 0 ? (
        <p>Todavía no hay ninguna.</p>
      ) : (
        <ul className="lista-molderias">
          {molderias.map((m) => (
            <li key={m.id}>
              <strong>{m.nombre}</strong> — {m.piezas.length} pieza(s):{' '}
              {m.piezas.map((p) => p.nombre).join(', ')}
              <button type="button" onClick={() => borrar(m.id)}>
                Eliminar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
