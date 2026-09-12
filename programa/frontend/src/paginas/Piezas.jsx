import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { listarPiezas, crearPieza, editarPieza, eliminarPieza, analizarPieza, resolverPieza } from '../api.js';
import { TALLAS, PRESETS_ANGULOS } from '../constantes.js';
import { Boton, Campo, Input, Select, Tarjeta, Chip, Aviso } from '../componentes/ui.jsx';

function leerArchivoComoTexto(archivo) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(lector.result);
    lector.onerror = reject;
    lector.readAsText(archivo);
  });
}

// Un solo archivo con todas las tallas de la pieza adentro (cada una
// nombrada: "S", "M", "L"...) — se analiza, se matchea cada forma contra una
// talla conocida, y lo que no matchea se asigna a mano. Nunca se adivina.
function ZonaSubidaPieza({ onGeometriaLista }) {
  const [estado, setEstado] = useState('vacio'); // vacio | analizando | revisando | resuelto | error
  const [svgTexto, setSvgTexto] = useState(null);
  const [analisis, setAnalisis] = useState(null);
  const [asignacionesManual, setAsignacionesManual] = useState({});
  const [tallaNueva, setTallaNueva] = useState('');
  const [indiceNuevo, setIndiceNuevo] = useState('');
  const [indiceReferencia, setIndiceReferencia] = useState('');
  const [anchoConocidoCm, setAnchoConocidoCm] = useState('');
  const [geometrias, setGeometrias] = useState(null);
  const [error, setError] = useState(null);

  const onDrop = useCallback(async (archivos) => {
    const archivo = archivos[0];
    if (!archivo) return;
    setEstado('analizando');
    setError(null);
    setGeometrias(null);
    setAsignacionesManual({});
    onGeometriaLista(null);
    try {
      const texto = await leerArchivoComoTexto(archivo);
      setSvgTexto(texto);
      const r = await analizarPieza(texto);
      setAnalisis(r);
      setEstado('revisando');
    } catch (e) {
      setError(e.message);
      setEstado('error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/svg+xml': ['.svg'] },
    multiple: false,
  });

  const mapaFinal = useMemo(() => {
    if (!analisis) return {};
    const mapa = {};
    for (const a of analisis.asignaciones) if (a.tallaAsignada) mapa[a.tallaAsignada] = a.indice;
    for (const [talla, indice] of Object.entries(asignacionesManual)) {
      if (indice !== '') mapa[talla] = Number(indice);
    }
    return mapa;
  }, [analisis, asignacionesManual]);

  const candidatosSinTalla = useMemo(() => {
    if (!analisis) return [];
    const indicesUsados = new Set(Object.values(mapaFinal));
    return analisis.candidatos.filter((c) => !indicesUsados.has(c.indice));
  }, [analisis, mapaFinal]);

  const necesitaEscala = analisis && !analisis.escalaConfirmada;
  const puedeResolver =
    analisis && Object.keys(mapaFinal).length > 0 && (!necesitaEscala || (indiceReferencia !== '' && anchoConocidoCm));

  function agregarAsignacionManual() {
    if (!tallaNueva || indiceNuevo === '') return;
    setAsignacionesManual((prev) => ({ ...prev, [tallaNueva]: indiceNuevo }));
    setTallaNueva('');
    setIndiceNuevo('');
  }

  async function resolver() {
    setError(null);
    try {
      const opciones = necesitaEscala
        ? { anchoConocidoCm: Number(anchoConocidoCm), indiceReferencia: Number(indiceReferencia) }
        : { mmPorUnidad: analisis.mmPorUnidad };
      const r = await resolverPieza(svgTexto, mapaFinal, opciones);
      const geometriaPorTalla = Object.fromEntries(
        Object.entries(r.geometriasPorTalla).map(([talla, geo]) => [
          talla,
          { ...geo, svgOriginal: svgTexto, validadoPorUsuario: true },
        ])
      );
      setGeometrias(geometriaPorTalla);
      setEstado('resuelto');
      onGeometriaLista(geometriaPorTalla);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {estado === 'vacio' && (
        <div
          {...getRootProps()}
          className={
            'cursor-pointer rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm ' +
            (isDragActive ? 'border-primary bg-primary-soft text-primary' : 'border-border text-faint-foreground')
          }
        >
          <input {...getInputProps()} />
          Arrastrá acá el archivo .svg con <strong>todas las tallas de esta pieza juntas</strong>,
          cada una nombrada (ej. "S", "M", "L", "XL").
        </div>
      )}

      {estado === 'analizando' && <p className="text-sm text-muted-foreground">Analizando…</p>}
      {estado === 'error' && <Aviso tono="error">{error}</Aviso>}

      {(estado === 'revisando' || estado === 'resuelto') && analisis && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-muted p-3">
          <div className="flex flex-wrap gap-1">
            {Object.keys(mapaFinal).length === 0 ? (
              <span className="text-xs text-faint-foreground">Ninguna talla detectada todavía.</span>
            ) : (
              Object.entries(mapaFinal).map(([talla, indice]) => (
                <Chip key={talla} tono="activo">
                  {talla} ({analisis.candidatos[indice]?.nombre || '#' + indice})
                </Chip>
              ))
            )}
          </div>

          {candidatosSinTalla.length > 0 && (
            <div className="text-xs text-faint-foreground">
              <p className="mb-1">
                Formas sin talla asignada: {candidatosSinTalla.map((c) => c.nombre || 'forma #' + c.indice).join(', ')}
                {' '}— si alguna es en realidad una talla, asignala:
              </p>
              <div className="flex flex-wrap gap-2">
                <Select value={tallaNueva} onChange={(e) => setTallaNueva(e.target.value)} className="max-w-[100px]">
                  <option value="">Talla…</option>
                  {TALLAS.map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
                <Select value={indiceNuevo} onChange={(e) => setIndiceNuevo(e.target.value)} className="max-w-[180px]">
                  <option value="">Forma…</option>
                  {candidatosSinTalla.map((c) => (
                    <option key={c.indice} value={c.indice}>{c.nombre || 'forma #' + c.indice}</option>
                  ))}
                </Select>
                <Boton tamano="sm" type="button" onClick={agregarAsignacionManual}>Asignar</Boton>
              </div>
            </div>
          )}

          {necesitaEscala && (
            <Aviso tono="info">
              Este SVG no declara una unidad física (mm/cm/in) — elegí una forma de referencia y
              decime cuánto mide de ancho en cm.
              <div className="mt-2 flex gap-2">
                <Select value={indiceReferencia} onChange={(e) => setIndiceReferencia(e.target.value)} className="max-w-[180px]">
                  <option value="">Forma de referencia…</option>
                  {analisis.candidatos.map((c) => (
                    <option key={c.indice} value={c.indice}>{c.nombre || 'forma #' + c.indice}</option>
                  ))}
                </Select>
                <Input
                  type="number"
                  placeholder="Ancho real (cm)"
                  value={anchoConocidoCm}
                  onChange={(e) => setAnchoConocidoCm(e.target.value)}
                  className="max-w-[140px]"
                />
              </div>
            </Aviso>
          )}

          {error && <Aviso tono="error">{error}</Aviso>}

          <div>
            <Boton variante="primario" tamano="sm" type="button" onClick={resolver} disabled={!puedeResolver}>
              Calcular geometría
            </Boton>
          </div>

          {estado === 'resuelto' && geometrias && (
            <div className="flex flex-wrap gap-1 border-t border-border pt-2">
              {Object.entries(geometrias).map(([talla, g]) => (
                <Chip key={talla}>
                  {talla}: {(g.boundingBoxMm.anchoMm / 10).toFixed(1)}×{(g.boundingBoxMm.altoMm / 10).toFixed(1)}cm
                </Chip>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function presetDe(angulosPermitidos) {
  if (angulosPermitidos === 'libre') return 'libre';
  const preset = PRESETS_ANGULOS.find(
    (p) => Array.isArray(p.valores) && JSON.stringify(p.valores) === JSON.stringify(angulosPermitidos)
  );
  return preset?.id || '0-180';
}

function FilaPiezaExistente({ pieza, onCambio, onBorrar }) {
  const [editando, setEditando] = useState(false);
  const [tela, setTela] = useState(pieza.tela || '');
  const [presetAngulos, setPresetAngulos] = useState(presetDe(pieza.angulosPermitidos));

  async function guardar() {
    const preset = PRESETS_ANGULOS.find((p) => p.id === presetAngulos);
    await editarPieza(pieza.id, { tela: tela || null, angulosPermitidos: preset.valores });
    setEditando(false);
    onCambio();
  }

  const tallas = Object.keys(pieza.dimensionesPorTalla || {});

  return (
    <Tarjeta className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium">{pieza.nombre}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {tallas.length === 0 ? (
              <span className="text-xs text-faint-foreground">sin geometría cargada</span>
            ) : (
              tallas.map((t) => (
                <Chip key={t}>{t}: {pieza.dimensionesPorTalla[t].anchoCm}×{pieza.dimensionesPorTalla[t].altoCm}cm</Chip>
              ))
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Boton variante="secundario" tamano="sm" onClick={() => setEditando((v) => !v)}>
            {editando ? 'Cerrar' : 'Editar'}
          </Boton>
          <Boton variante="fantasma" tamano="sm" onClick={() => onBorrar(pieza.id)}>Eliminar</Boton>
        </div>
      </div>

      {editando && (
        <div className="flex flex-wrap items-end gap-3 border-t border-border pt-3">
          <Campo etiqueta="Tela por defecto" className="max-w-[180px]">
            <Input value={tela} onChange={(e) => setTela(e.target.value)} placeholder="Dry Fit" />
          </Campo>
          <Campo etiqueta="Ángulos de rotación permitidos" className="max-w-[240px]">
            <Select value={presetAngulos} onChange={(e) => setPresetAngulos(e.target.value)}>
              {PRESETS_ANGULOS.map((p) => <option key={p.id} value={p.id}>{p.etiqueta}</option>)}
            </Select>
          </Campo>
          <Boton variante="primario" tamano="sm" onClick={guardar}>Guardar cambios</Boton>
        </div>
      )}
    </Tarjeta>
  );
}

export function Piezas({ recargarSenal, onCambio }) {
  const [piezas, setPiezas] = useState([]);
  const [nombre, setNombre] = useState('');
  const [tela, setTela] = useState('');
  const [presetAngulos, setPresetAngulos] = useState(PRESETS_ANGULOS[0].id);
  const [geometriaPorTalla, setGeometriaPorTalla] = useState(null);
  const [claveSubida, setClaveSubida] = useState(0);
  const [error, setError] = useState(null);

  async function recargar() {
    setPiezas(await listarPiezas());
  }

  useEffect(() => {
    recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recargarSenal]);

  async function guardar(evento) {
    evento.preventDefault();
    setError(null);
    if (!nombre.trim()) {
      setError('Falta el nombre de la pieza.');
      return;
    }
    if (!geometriaPorTalla || Object.keys(geometriaPorTalla).length === 0) {
      setError('Subí el archivo con las tallas y calculá la geometría antes de guardar.');
      return;
    }
    const preset = PRESETS_ANGULOS.find((p) => p.id === presetAngulos);
    try {
      await crearPieza({
        nombre,
        tela: tela || null,
        angulosPermitidos: preset.valores,
        geometriaPorTalla,
      });
      setNombre('');
      setTela('');
      setGeometriaPorTalla(null);
      setClaveSubida((n) => n + 1); // fuerza a la zona de subida a reiniciarse
      await recargar();
      onCambio?.();
    } catch (e) {
      setError(e.message);
    }
  }

  async function borrar(id) {
    await eliminarPieza(id);
    await recargar();
    onCambio?.();
  }

  return (
    <div className="pagina flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Piezas</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Acá se sube la moldería real: un archivo por pieza (ej. "Manga") con{' '}
          <strong>todas sus tallas adentro</strong>, cada una nombrada. Después se arma la prenda
          completa en <strong>Grupos</strong>, eligiendo piezas de acá.
        </p>
      </div>

      <Tarjeta as="form" onSubmit={guardar} className="flex max-w-2xl flex-col gap-4">
        <Campo etiqueta="Nombre de la pieza">
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Manga izquierda" />
        </Campo>
        <Campo etiqueta="Tela por defecto (opcional)">
          <Input value={tela} onChange={(e) => setTela(e.target.value)} placeholder="Dry Fit" />
        </Campo>
        <Campo etiqueta="Ángulos de rotación permitidos al anidar">
          <Select value={presetAngulos} onChange={(e) => setPresetAngulos(e.target.value)}>
            {PRESETS_ANGULOS.map((p) => <option key={p.id} value={p.id}>{p.etiqueta}</option>)}
          </Select>
        </Campo>

        <ZonaSubidaPieza key={claveSubida} onGeometriaLista={setGeometriaPorTalla} />

        <div>
          <Boton variante="primario" type="submit">Guardar pieza</Boton>
        </div>
        {error && <Aviso tono="error">{error}</Aviso>}
      </Tarjeta>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint-foreground">
          Piezas en biblioteca
        </h3>
        {piezas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay ninguna.</p>
        ) : (
          <div className="flex max-w-2xl flex-col gap-3">
            {piezas.map((p) => (
              <FilaPiezaExistente key={p.id} pieza={p} onCambio={recargar} onBorrar={borrar} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
