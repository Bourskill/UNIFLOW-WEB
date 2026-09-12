import { useEffect, useState } from 'react';
import { listarPiezas, listarGrupos, crearGrupo, eliminarGrupo } from '../api.js';

function rolVacio() {
  return { id: crypto.randomUUID(), piezaId: '', rol: '', espejoActivo: false };
}

export function Grupos({ recargarSenal, onCambio }) {
  const [piezas, setPiezas] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [nombre, setNombre] = useState('');
  const [roles, setRoles] = useState([rolVacio()]);
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

  function actualizarRol(id, cambios) {
    setRoles((prev) => prev.map((r) => (r.id === id ? { ...r, ...cambios } : r)));
  }

  function agregarRol() {
    setRoles((prev) => [...prev, rolVacio()]);
  }

  function quitarRol(id) {
    setRoles((prev) => prev.filter((r) => r.id !== id));
  }

  async function guardar(evento) {
    evento.preventDefault();
    setError(null);
    const rolesCompletos = roles.filter((r) => r.piezaId && r.rol.trim());
    if (!nombre.trim() || rolesCompletos.length === 0) {
      setError('Falta el nombre del grupo o no hay ningún rol con pieza asignada.');
      return;
    }
    try {
      await crearGrupo({
        nombre,
        piezas: rolesCompletos.map((r) => ({ piezaId: r.piezaId, rol: r.rol, espejoActivo: r.espejoActivo })),
      });
      setNombre('');
      setRoles([rolVacio()]);
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

  return (
    <div className="pagina">
      <h2>Grupos</h2>
      <p className="ayuda">
        Una prenda completa: elegís qué pieza de la biblioteca cumple cada rol. Reciclar una pieza
        entre varios grupos es tan simple como elegirla de nuevo acá — si después se resube esa
        pieza en "Piezas", todos los grupos que la usan ven el cambio solos.
      </p>

      {piezas.length === 0 ? (
        <p>Creá primero al menos una pieza en la pestaña "Piezas".</p>
      ) : (
        <form className="tarjeta" onSubmit={guardar}>
          <label>
            Nombre del grupo
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Remera básica" />
          </label>

          <h4>Roles (piezas que componen la prenda)</h4>
          {roles.map((r) => {
            const pieza = piezas.find((p) => p.id === r.piezaId);
            return (
              <div className="fila-linea" key={r.id}>
                <input
                  placeholder="Rol (ej. Espalda)"
                  value={r.rol}
                  onChange={(e) => actualizarRol(r.id, { rol: e.target.value })}
                />
                <select value={r.piezaId} onChange={(e) => actualizarRol(r.id, { piezaId: e.target.value })}>
                  <option value="">— Elegir pieza —</option>
                  {piezas.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
                {pieza?.permiteEspejo && (
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={r.espejoActivo}
                      onChange={(e) => actualizarRol(r.id, { espejoActivo: e.target.checked })}
                    />
                    Espejada
                  </label>
                )}
                {roles.length > 1 && (
                  <button type="button" onClick={() => quitarRol(r.id)}>Quitar</button>
                )}
              </div>
            );
          })}

          <div className="acciones">
            <button type="button" onClick={agregarRol}>+ Agregar rol</button>
            <button type="submit" className="primario">Guardar grupo</button>
          </div>
          {error && <p className="error">{error}</p>}
        </form>
      )}

      <h3>Grupos cargados</h3>
      {grupos.length === 0 ? (
        <p>Todavía no hay ninguno.</p>
      ) : (
        <ul className="lista-molderias">
          {grupos.map((g) => (
            <li key={g.id}>
              <strong>{g.nombre}</strong> —{' '}
              {g.piezas.map((gp) => gp.rol + ' (' + nombrePieza(gp.piezaId) + ')').join(', ')}
              <button type="button" onClick={() => borrar(g.id)}>Eliminar</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
