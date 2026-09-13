import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { listarPiezas, crearPieza, editarPieza, eliminarPieza, analizarPieza, resolverPieza } from '../api.js';
import { PRESETS_ANGULOS, ordenarTallasNatural } from '../constantes.js';
import { Boton, Campo, Input, Select, Tarjeta, Chip, Aviso, Ayuda } from '../componentes/ui.jsx';

function leerArchivoComoTexto(archivo) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(lector.result);
    lector.onerror = reject;
    lector.readAsText(archivo);
  });
}

// Un solo archivo DXF con todas las tallas de la pieza adentro: una CAPA
// por talla, nombrada tal cual la talla ("S", "2", "34", lo que sea, nunca
// contra una lista cerrada). Una capa puede traer más de un trazo —
// contorno + piquetes sueltos de esa misma talla — sin confundirse con los
// de otra talla, porque están en otra capa. Capas sin nombre real (o la
// capa "0", la que un CAD asigna por defecto) quedan afuera solas; dos
// capas con el mismo nombre quedan ambiguas para resolver a mano. El editor
// manual está siempre disponible pero arranca cerrado — se abre solo
// cuando hay algo real para revisar (una ambigüedad).
function ZonaSubidaPieza({ onGeometriaLista }) {
  const [estado, setEstado] = useState('vacio'); // vacio | analizando | revisando | resuelto | error
  const [archivoTexto, setArchivoTexto] = useState(null);
  const [analisis, setAnalisis] = useState(null);
  const [overrides, setOverrides] = useState({}); // indice -> talla escrita a mano ('' = excluida)
  const [editando, setEditando] = useState(false);
  const [indiceReferencia, setIndiceReferencia] = useState('');
  const [anchoConocidoCm, setAnchoConocidoCm] = useState('');
  const [geometrias, setGeometrias] = useState(null);
  const [error, setError] = useState(null);

  const onDrop = useCallback(async (archivos) => {
    const archivo = archivos[0];
    if (!archivo) return;
    if (!(archivo.name || '').toLowerCase().endsWith('.dxf')) {
      setError('Solo se acepta .dxf.');
      setEstado('error');
      return;
    }
    setEstado('analizando');
    setError(null);
    setGeometrias(null);
    setOverrides({});
    onGeometriaLista(null);
    try {
      const texto = await leerArchivoComoTexto(archivo);
      setArchivoTexto(texto);
      const r = await analizarPieza(texto);
      setAnalisis(r);
      // Se abre el editor solo si quedó algo genuinamente ambiguo (dos
      // capas con el mismo nombre) — una capa sin nombre no es una
      // ambigüedad, es simplemente "no es una talla", y no necesita review.
      setEditando(r.asignaciones.some((a) => a.nombreDetectado && !a.tallaAsignada));
      setEstado('revisando');
    } catch (e) {
      setError(e.message);
      setEstado('error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/dxf': ['.dxf'], 'image/vnd.dxf': ['.dxf'] },
    multiple: false,
  });

  // Talla efectiva de cada forma: la que detectó el backend por su nombre,
  // salvo que se haya corregido a mano (renombrada o excluida).
  const tallaPorIndice = useMemo(() => {
    if (!analisis) return {};
    const mapa = {};
    for (const c of analisis.candidatos) {
      const auto = analisis.asignaciones.find((a) => a.indice === c.indice)?.tallaAsignada || '';
      mapa[c.indice] = overrides[c.indice] ?? auto;
    }
    return mapa;
  }, [analisis, overrides]);

  const mapaFinal = useMemo(() => {
    const mapa = {};
    for (const [indice, talla] of Object.entries(tallaPorIndice)) {
      if (talla) mapa[talla] = Number(indice);
    }
    return mapa;
  }, [tallaPorIndice]);

  const tallasOrdenadas = useMemo(() => ordenarTallasNatural(Object.keys(mapaFinal)), [mapaFinal]);

  const necesitaEscala = analisis && !analisis.escalaConfirmada;
  const puedeResolver =
    analisis && Object.keys(mapaFinal).length > 0 && (!necesitaEscala || (indiceReferencia !== '' && anchoConocidoCm));

  async function resolver() {
    setError(null);
    try {
      const opciones = necesitaEscala
        ? { anchoConocidoCm: Number(anchoConocidoCm), indiceReferencia: Number(indiceReferencia) }
        : { mmPorUnidad: analisis.mmPorUnidad };
      const r = await resolverPieza(archivoTexto, mapaFinal, opciones);
      const geometriaPorTalla = Object.fromEntries(
        Object.entries(r.geometriasPorTalla).map(([talla, geo]) => [
          talla,
          { ...geo, archivoOriginal: archivoTexto, validadoPorUsuario: true },
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
          Arrastrá acá el archivo <strong>.dxf</strong> con todas las tallas de esta pieza juntas,
          una capa por talla nombrada así (los piquetes sueltos de cada talla van en su misma capa).
        </div>
      )}

      {estado === 'analizando' && <p className="text-sm text-muted-foreground">Analizando…</p>}
      {estado === 'error' && <Aviso tono="error">{error}</Aviso>}

      {(estado === 'revisando' || estado === 'resuelto') && analisis && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-muted p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {tallasOrdenadas.length === 0 ? (
              <span className="text-xs text-faint-foreground">No se detectó ninguna talla.</span>
            ) : (
              tallasOrdenadas.map((talla) => <Chip key={talla} tono="activo">{talla}</Chip>)
            )}
            <Boton tamano="sm" variante="fantasma" type="button" onClick={() => setEditando((v) => !v)}>
              {editando ? 'Listo' : 'Editar'}
            </Boton>
          </div>

          {editando && (
            <div className="flex flex-col gap-1.5 border-t border-border pt-2">
              {analisis.candidatos.map((c) => (
                <div key={c.indice} className="flex items-center gap-2">
                  <span className="w-32 shrink-0 truncate text-xs text-faint-foreground" title={c.nombre || ''}>
                    {c.nombre || '(capa sin nombre)'}
                  </span>
                  <Input
                    value={tallaPorIndice[c.indice]}
                    onChange={(e) => setOverrides((prev) => ({ ...prev, [c.indice]: e.target.value }))}
                    placeholder="no es una talla"
                    className="max-w-[140px]"
                  />
                </div>
              ))}
            </div>
          )}

          {necesitaEscala && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-primary-soft px-3 py-2 text-sm text-primary">
              <span>Sin unidad física — ancho real de</span>
              <Select value={indiceReferencia} onChange={(e) => setIndiceReferencia(e.target.value)} className="max-w-[150px]">
                <option value="">una capa…</option>
                {analisis.candidatos.map((c) => (
                  <option key={c.indice} value={c.indice}>{c.nombre || 'capa #' + c.indice}</option>
                ))}
              </Select>
              <Input
                type="number"
                placeholder="cm"
                value={anchoConocidoCm}
                onChange={(e) => setAnchoConocidoCm(e.target.value)}
                className="max-w-[70px]"
              />
              <Ayuda>
                Este DXF no trae la variable de unidad física (INSUNITS) o vino en "sin unidades" —
                pasa con algunos exports. Confirmá una vez cuánto mide de verdad una capa para poder
                calcular el resto a escala.
              </Ayuda>
            </div>
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
