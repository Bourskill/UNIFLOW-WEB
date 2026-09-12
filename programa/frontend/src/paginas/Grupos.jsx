import { useEffect, useState } from 'react';
import { listarPiezas, listarGrupos, crearGrupo, eliminarGrupo } from '../api.js';
import { Boton, Campo, Input, Select, Tarjeta, Chip, Aviso } from '../componentes/ui.jsx';

function filaVacia() {
  return { id: crypto.randomUUID(), rol: '', piezaId: '' };
}

// Catálogo: arma una prenda completa eligiendo, por rol, una pieza que ya
// existe en la biblioteca (pestaña "Piezas"). Nada se sube acá — reciclar
// una pieza en otra prenda es elegirla de nuevo en esta misma lista.
export function Grupos({ recargarSenal, onCambio }) {
  const [piezas, setPiezas] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [nombre, setNombre] = useState('');
  const [filas, setFilas] = useState([filaVacia()]);
  const [error, setError] = useState(null);

  async function recargar() {
    const [ps, gs] = await Promise.all([listarPiezas(), listarGrupos()]);
    setPiezas(ps);
    setGrupos(gs);
  }

  useEffect(() => {
    recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recargarSenal]);

  function actualizarFila(id, cambios) {
    setFilas((prev) => prev.map((f) => (f.id === id ? { ...f, ...cambios } : f)));
  }

  function agregarFila() {
    setFilas((prev) => [...prev, filaVacia()]);
  }

  function quitarFila(id) {
    setFilas((prev) => prev.filter((f) => f.id !== id));
  }

  function elegirPieza(id, piezaId) {
    const pieza = piezas.find((p) => p.id === piezaId);
    actualizarFila(id, { piezaId, rol: pieza && !filas.find((f) => f.id === id).rol ? pieza.nombre : filas.find((f) => f.id === id).rol });
  }

  async function guardar(evento) {
    evento.preventDefault();
    setError(null);
    const filasCompletas = filas.filter((f) => f.piezaId && f.rol.trim());
    if (!nombre.trim() || filasCompletas.length === 0) {
      setError('Falta el nombre del grupo o no hay ninguna pieza elegida.');
      return;
    }
    try {
      await crearGrupo({
        nombre,
        piezas: filasCompletas.map((f) => ({ piezaId: f.piezaId, rol: f.rol })),
      });
      setNombre('');
      setFilas([filaVacia()]);
      await recargar();
      onCambio?.();
    } catch (e) {
      setError(e.message);
    }
  }

  async function borrar(id) {
    await eliminarGrupo(id);
    await recargar();
    onCambio?.();
  }

  function nombrePieza(id) {
    return piezas.find((p) => p.id === id)?.nombre || '?';
  }

  function tallasDe(grupo) {
    const tallas = new Set();
    for (const gp of grupo.piezas) {
      const pieza = piezas.find((p) => p.id === gp.piezaId);
      Object.keys(pieza?.dimensionesPorTalla || {}).forEach((t) => tallas.add(t));
    }
    return [...tallas];
  }

  return (
    <div className="pagina flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Grupos</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          El catálogo: armá una prenda completa eligiendo piezas que ya están cargadas en{' '}
          <strong>Piezas</strong>. Reciclar una pieza en otra prenda es elegirla de nuevo acá — si
          después se resube esa pieza, todos los grupos que la usan se actualizan solos.
        </p>
      </div>

      {piezas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no hay ninguna pieza — subí al menos una en la pestaña "Piezas" primero.
        </p>
      ) : (
        <Tarjeta as="form" onSubmit={guardar} className="flex max-w-2xl flex-col gap-4">
          <Campo etiqueta="Nombre del grupo">
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Remera básica" />
          </Campo>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint-foreground">
              Piezas de esta prenda
            </h3>
            <div className="flex flex-col gap-2">
              {filas.map((f) => (
                <div key={f.id} className="flex flex-wrap items-center gap-2">
                  <Select
                    value={f.piezaId}
                    onChange={(e) => elegirPieza(f.id, e.target.value)}
                    className="max-w-[220px]"
                  >
                    <option value="">— Elegir pieza de la biblioteca —</option>
                    {piezas.map((p) => (
                      <option key={p.id} value={p.id}>{p.nombre}</option>
                    ))}
                  </Select>
                  <Input
                    placeholder="Rol en esta prenda (ej. Manga izquierda)"
                    value={f.rol}
                    onChange={(e) => actualizarFila(f.id, { rol: e.target.value })}
                    className="max-w-[220px]"
                  />
                  {filas.length > 1 && (
                    <Boton variante="fantasma" tamano="sm" type="button" onClick={() => quitarFila(f.id)}>
                      Quitar
                    </Boton>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-1 text-xs text-faint-foreground">
              El rol se autocompleta con el nombre de la pieza — cambialo solo si en esta prenda
              cumple un papel distinto (ej. la misma pieza "Manga" usada como "Manga izquierda").
            </p>
          </div>

          <div className="flex gap-2">
            <Boton type="button" onClick={agregarFila}>+ Agregar pieza</Boton>
            <Boton variante="primario" type="submit">Guardar grupo</Boton>
          </div>
          {error && <Aviso tono="error">{error}</Aviso>}
        </Tarjeta>
      )}

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint-foreground">
          Catálogo de grupos
        </h3>
        {grupos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay ninguno.</p>
        ) : (
          <div className="flex max-w-2xl flex-col gap-2">
            {grupos.map((g) => (
              <div key={g.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3">
                <div className="flex-1">
                  <div className="font-medium">{g.nombre}</div>
                  <div className="text-xs text-muted-foreground">
                    {g.piezas.map((gp) => gp.rol + ' (' + nombrePieza(gp.piezaId) + ')').join(', ')}
                  </div>
                  <div className="mt-1 flex gap-1">
                    {tallasDe(g).length === 0 ? (
                      <span className="text-xs text-faint-foreground">sin tallas cargadas</span>
                    ) : (
                      tallasDe(g).map((t) => <Chip key={t}>{t}</Chip>)
                    )}
                  </div>
                </div>
                <Boton variante="fantasma" tamano="sm" onClick={() => borrar(g.id)}>Eliminar</Boton>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
