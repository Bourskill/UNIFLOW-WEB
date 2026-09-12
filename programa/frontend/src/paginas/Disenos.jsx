import { useCallback, useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { listarGrupos, listarDisenos, crearDiseno, eliminarDiseno } from '../api.js';

function archivoADataUrl(archivo) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(lector.result);
    lector.onerror = reject;
    lector.readAsDataURL(archivo);
  });
}

function SlotImagenPieza({ rol, dataUrl, onElegir }) {
  const onDrop = useCallback(
    async (archivos) => {
      const archivo = archivos[0];
      if (archivo) onElegir(rol, await archivoADataUrl(archivo));
    },
    [rol, onElegir]
  );
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'] },
    multiple: false,
  });

  return (
    <label>
      Imagen para "{rol}"
      <div {...getRootProps()} className={'zona-dropzone' + (isDragActive ? ' activa' : '')}>
        <input {...getInputProps()} />
        <span>Arrastrar o elegir archivo</span>
      </div>
      {dataUrl && <img className="miniatura" src={dataUrl} alt={rol} />}
    </label>
  );
}

export function Disenos({ recargarSenal, onCambio }) {
  const [grupos, setGrupos] = useState([]);
  const [disenos, setDisenos] = useState([]);
  const [grupoId, setGrupoId] = useState('');
  const [nombre, setNombre] = useState('');
  const [imagenesPorPieza, setImagenesPorPieza] = useState({});
  const [error, setError] = useState(null);

  async function recargar() {
    const [gs, ds] = await Promise.all([listarGrupos(), listarDisenos()]);
    setGrupos(gs);
    setDisenos(ds);
    if (gs.length > 0 && !grupoId) setGrupoId(gs[0].id);
  }

  useEffect(() => {
    recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recargarSenal]);

  const grupoSeleccionado = grupos.find((g) => g.id === grupoId);

  function elegirImagen(rol, dataUrl) {
    setImagenesPorPieza((prev) => ({ ...prev, [rol]: dataUrl }));
  }

  async function guardar(evento) {
    evento.preventDefault();
    setError(null);
    if (!nombre.trim() || !grupoId) {
      setError('Falta el nombre del diseño o el grupo.');
      return;
    }
    try {
      await crearDiseno({ nombre, grupoId, imagenesPorPieza });
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

      {grupos.length === 0 ? (
        <p>Creá primero un grupo (pestaña "Grupos") para poder subirle un diseño.</p>
      ) : (
        <form className="tarjeta" onSubmit={guardar}>
          <label>
            Nombre del diseño
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Kit titular 2026" />
          </label>

          <label>
            Grupo
            <select value={grupoId} onChange={(e) => { setGrupoId(e.target.value); setImagenesPorPieza({}); }}>
              {grupos.map((g) => (
                <option key={g.id} value={g.id}>{g.nombre}</option>
              ))}
            </select>
          </label>

          {grupoSeleccionado?.piezas.map((gp) => (
            <SlotImagenPieza
              key={gp.rol}
              rol={gp.rol}
              dataUrl={imagenesPorPieza[gp.rol]}
              onElegir={elegirImagen}
            />
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
              {grupos.find((g) => g.id === d.grupoId)?.nombre || 'grupo eliminado'}
              <button type="button" onClick={() => borrar(d.id)}>Eliminar</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
