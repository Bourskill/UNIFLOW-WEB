import { useEffect, useState } from 'react';
import { listarMolderias, listarDisenos, crearDiseno, eliminarDiseno } from '../api.js';

function archivoADataUrl(archivo) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(lector.result);
    lector.onerror = reject;
    lector.readAsDataURL(archivo);
  });
}

export function Disenos({ recargarSenal, onCambio }) {
  const [molderias, setMolderias] = useState([]);
  const [disenos, setDisenos] = useState([]);
  const [molderiaId, setMolderiaId] = useState('');
  const [nombre, setNombre] = useState('');
  const [imagenesPorPieza, setImagenesPorPieza] = useState({});
  const [error, setError] = useState(null);

  async function recargar() {
    const [ms, ds] = await Promise.all([listarMolderias(), listarDisenos()]);
    setMolderias(ms);
    setDisenos(ds);
    if (ms.length > 0 && !molderiaId) setMolderiaId(ms[0].id);
  }

  useEffect(() => {
    recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recargarSenal]);

  const molderiaSeleccionada = molderias.find((m) => m.id === molderiaId);

  async function elegirImagen(piezaNombre, archivo) {
    if (!archivo) return;
    const dataUrl = await archivoADataUrl(archivo);
    setImagenesPorPieza((prev) => ({ ...prev, [piezaNombre]: dataUrl }));
  }

  async function guardar(evento) {
    evento.preventDefault();
    setError(null);
    if (!nombre.trim() || !molderiaId) {
      setError('Falta el nombre del diseño o la moldería.');
      return;
    }
    try {
      await crearDiseno({ nombre, molderiaId, imagenesPorPieza });
      setNombre('');
      setImagenesPorPieza({});
      await recargar();
      onCambio?.();
    } catch (e) {
      setError(e.message);
    }
  }

  async function borrar(id) {
    await eliminarDiseno(id);
    await recargar();
    onCambio?.();
  }

  return (
    <div className="pagina">
      <h2>Diseños</h2>
      <p className="ayuda">
        El arte real de cada pieza — sin esto, el nesting solo puede mostrar un rectángulo con el
        nombre de la pieza, no la prenda de verdad.
      </p>

      {molderias.length === 0 ? (
        <p>Creá primero una moldería para poder subirle un diseño.</p>
      ) : (
        <form className="tarjeta" onSubmit={guardar}>
          <label>
            Nombre del diseño
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Kit titular 2026" />
          </label>

          <label>
            Moldería
            <select value={molderiaId} onChange={(e) => { setMolderiaId(e.target.value); setImagenesPorPieza({}); }}>
              {molderias.map((m) => (
                <option key={m.id} value={m.id}>{m.nombre}</option>
              ))}
            </select>
          </label>

          {molderiaSeleccionada?.piezas.map((pieza) => (
            <label key={pieza.nombre}>
              Imagen para "{pieza.nombre}"
              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={(e) => elegirImagen(pieza.nombre, e.target.files[0])}
              />
              {imagenesPorPieza[pieza.nombre] && (
                <img className="miniatura" src={imagenesPorPieza[pieza.nombre]} alt={pieza.nombre} />
              )}
            </label>
          ))}

          <div className="acciones">
            <button type="submit" className="primario">Guardar diseño</button>
          </div>
          {error && <p className="error">{error}</p>}
        </form>
      )}

      <h3>Diseños cargados</h3>
      {disenos.length === 0 ? (
        <p>Todavía no hay ninguno.</p>
      ) : (
        <ul className="lista-molderias">
          {disenos.map((d) => (
            <li key={d.id}>
              <strong>{d.nombre}</strong> —{' '}
              {molderias.find((m) => m.id === d.molderiaId)?.nombre || 'moldería eliminada'}
              <button type="button" onClick={() => borrar(d.id)}>Eliminar</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
