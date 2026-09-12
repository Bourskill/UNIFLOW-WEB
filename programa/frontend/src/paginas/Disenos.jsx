import { useCallback, useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { listarGrupos, listarDisenos, crearDiseno, eliminarDiseno } from '../api.js';
import { Boton, Campo, Input, Select, Tarjeta, Aviso } from '../componentes/ui.jsx';

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
    <Campo etiqueta={'Imagen para "' + rol + '"'}>
      <div
        {...getRootProps()}
        className={
          'cursor-pointer rounded-lg border-2 border-dashed px-4 py-4 text-center text-sm ' +
          (isDragActive ? 'border-primary bg-primary-soft text-primary' : 'border-border text-faint-foreground')
        }
      >
        <input {...getInputProps()} />
        Arrastrar o elegir archivo
      </div>
      {dataUrl && <img className="mt-2 max-h-24 max-w-24 rounded-md border border-border" src={dataUrl} alt={rol} />}
    </Campo>
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
    <div className="pagina flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Diseños</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          El arte real de cada pieza — sin esto, el nesting solo puede mostrar un rectángulo con el
          nombre de la pieza, no la prenda de verdad.
        </p>
      </div>

      {grupos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Creá primero un grupo (pestaña "Grupos") para poder subirle un diseño.
        </p>
      ) : (
        <Tarjeta as="form" onSubmit={guardar} className="flex max-w-2xl flex-col gap-4">
          <Campo etiqueta="Nombre del diseño">
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Kit titular 2026" />
          </Campo>

          <Campo etiqueta="Grupo">
            <Select value={grupoId} onChange={(e) => { setGrupoId(e.target.value); setImagenesPorPieza({}); }}>
              {grupos.map((g) => (
                <option key={g.id} value={g.id}>{g.nombre}</option>
              ))}
            </Select>
          </Campo>

          {grupoSeleccionado?.piezas.map((gp) => (
            <SlotImagenPieza
              key={gp.rol}
              rol={gp.rol}
              dataUrl={imagenesPorPieza[gp.rol]}
              onElegir={elegirImagen}
            />
          ))}

          <div>
            <Boton variante="primario" type="submit">Guardar diseño</Boton>
          </div>
          {error && <Aviso tono="error">{error}</Aviso>}
        </Tarjeta>
      )}

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint-foreground">
          Diseños cargados
        </h3>
        {disenos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay ninguno.</p>
        ) : (
          <div className="flex max-w-2xl flex-col gap-2">
            {disenos.map((d) => (
              <div key={d.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm">
                <div className="flex-1">
                  <span className="font-medium">{d.nombre}</span>{' '}
                  <span className="text-muted-foreground">
                    — {grupos.find((g) => g.id === d.grupoId)?.nombre || 'grupo eliminado'}
                  </span>
                </div>
                <Boton variante="fantasma" tamano="sm" onClick={() => borrar(d.id)}>Eliminar</Boton>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
