import { useCallback, useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { listarFuentes, crearFuente, eliminarFuente } from '../api.js';
import { Boton, Campo, Input, Tarjeta, Chip, Aviso } from '../componentes/ui.jsx';

function leerArchivoComoBase64(archivo) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(lector.result.split(',')[1]);
    lector.onerror = reject;
    lector.readAsDataURL(archivo);
  });
}

const TIPO_MIME_POR_EXTENSION = { ttf: 'font/ttf', otf: 'font/otf' };

// Catálogo de tipografías propias para nombre/número/texto fijo de una zona
// (Productos.jsx) -- sin elegir ninguna, se sigue usando la Helvetica
// estándar de siempre. La cobertura de ñ/acentos se calcula UNA vez acá, al
// subir el archivo (rutas/api.js·POST /fuentes), no en cada PDF generado.
export function Fuentes() {
  const [fuentes, setFuentes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState(null);
  const [nombrePendiente, setNombrePendiente] = useState(null); // {archivo, nombre} entre soltar y confirmar

  async function recargar() {
    setCargando(true);
    setError(null);
    try {
      setFuentes(await listarFuentes());
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    recargar();
  }, []);

  const onDrop = useCallback((archivos) => {
    const archivo = archivos[0];
    if (!archivo) return;
    setError(null);
    setNombrePendiente({ archivo, nombre: archivo.name.replace(/\.(ttf|otf)$/i, '') });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'font/ttf': ['.ttf'], 'font/otf': ['.otf'] },
    multiple: false,
  });

  async function confirmarSubida() {
    if (!nombrePendiente) return;
    setError(null);
    setSubiendo(true);
    try {
      const extension = nombrePendiente.archivo.name.split('.').pop().toLowerCase();
      const base64 = await leerArchivoComoBase64(nombrePendiente.archivo);
      await crearFuente({ nombre: nombrePendiente.nombre, base64, contentType: TIPO_MIME_POR_EXTENSION[extension] });
      setNombrePendiente(null);
      await recargar();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubiendo(false);
    }
  }

  async function borrar(id) {
    await eliminarFuente(id);
    await recargar();
  }

  return (
    <div className="pagina flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Fuentes</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Tipografías propias para nombre/número/texto en una zona -- sin elegir ninguna, se usa la
          Helvetica estándar de siempre. Al subir un archivo se revisa una sola vez si soporta ñ y
          acentos.
        </p>
      </div>

      <Tarjeta className="flex max-w-xl flex-col gap-3">
        <div
          {...getRootProps()}
          className={
            'cursor-pointer rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm ' +
            (isDragActive ? 'border-primary bg-primary-soft text-primary' : 'border-border text-faint-foreground')
          }
        >
          <input {...getInputProps()} />
          Arrastrá acá un archivo .ttf o .otf
        </div>

        {nombrePendiente && (
          <div className="flex flex-wrap items-center gap-2">
            <Campo etiqueta="Nombre de la fuente" className="flex-1">
              <Input
                value={nombrePendiente.nombre}
                onChange={(e) => setNombrePendiente((prev) => ({ ...prev, nombre: e.target.value }))}
              />
            </Campo>
            <Boton variante="primario" type="button" onClick={confirmarSubida} disabled={subiendo}>
              {subiendo ? 'Subiendo…' : 'Guardar'}
            </Boton>
            <Boton variante="fantasma" type="button" onClick={() => setNombrePendiente(null)} disabled={subiendo}>
              Cancelar
            </Boton>
          </div>
        )}
        {error && <Aviso tono="error">{error}</Aviso>}
      </Tarjeta>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint-foreground">
          Fuentes cargadas
        </h3>
        {cargando ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : fuentes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay ninguna.</p>
        ) : (
          <div className="flex max-w-xl flex-col gap-2">
            {fuentes.map((f) => (
              <div key={f.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm">
                <span className="flex-1 font-medium" style={{ fontFamily: 'inherit' }}>{f.nombre}</span>
                {f.coberturaCompleta ? (
                  <Chip tono="activo">Todos los caracteres</Chip>
                ) : (
                  <Chip tono="peligro" title={'Sin: ' + f.caracteresFaltantes.join(' ')}>
                    Sin ñ/acentos
                  </Chip>
                )}
                <Boton variante="fantasma" tamano="sm" onClick={() => borrar(f.id)}>Eliminar</Boton>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
