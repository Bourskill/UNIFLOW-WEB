import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  listarPiezas,
  crearPieza,
  editarPieza,
  eliminarPieza,
  analizarPieza,
  resolverPieza,
  subirArchivo,
  listarGrupos,
  crearGrupo,
  eliminarGrupo,
} from '../api.js';
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

// El PDF es binario: viaja como base64 dentro del mismo campo de texto que
// usa el DXF, así la API no necesita dos caminos distintos de subida.
function leerArchivoComoBase64(archivo) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(lector.result.split(',')[1]);
    lector.onerror = reject;
    lector.readAsDataURL(archivo);
  });
}

function formatoDeArchivo(archivo) {
  const nombre = (archivo.name || '').toLowerCase();
  if (nombre.endsWith('.dxf')) return 'dxf';
  if (nombre.endsWith('.pdf')) return 'pdf';
  return null;
}

const TIPO_MIME_POR_FORMATO = { dxf: 'application/dxf', pdf: 'application/pdf' };

// Un solo archivo (.dxf o .pdf, exportado con capas de Illustrator) con
// todas las tallas de la pieza adentro: una CAPA por talla, nombrada tal
// cual la talla ("S", "2", "34", lo que sea, nunca contra una lista
// cerrada). Una capa puede traer más de un trazo — contorno + piquetes
// sueltos de esa misma talla — sin confundirse con los de otra talla,
// porque están en otra capa. Capas sin nombre real (o la capa "0" de DXF,
// la que un CAD asigna por defecto) quedan afuera solas; dos capas con el
// mismo nombre quedan ambiguas para resolver a mano. El editor manual está
// siempre disponible pero arranca cerrado — se abre solo cuando hay algo
// real para revisar (una ambigüedad).
function ZonaSubidaPieza({ onGeometriaLista }) {
  const [estado, setEstado] = useState('vacio'); // vacio | analizando | revisando | resuelto | error
  const [archivoTexto, setArchivoTexto] = useState(null);
  const [archivoUrl, setArchivoUrl] = useState(null);
  const [formato, setFormato] = useState(null);
  const [analisis, setAnalisis] = useState(null);
  const [overrides, setOverrides] = useState({}); // indice -> talla escrita a mano ('' = excluida)
  const [editando, setEditando] = useState(false);
  const [indiceReferencia, setIndiceReferencia] = useState('');
  const [anchoConocidoCm, setAnchoConocidoCm] = useState('');
  const [geometrias, setGeometrias] = useState(null);
  const [error, setError] = useState(null);
  const [resolviendo, setResolviendo] = useState(false);

  const onDrop = useCallback(async (archivos) => {
    const archivo = archivos[0];
    if (!archivo) return;
    const formatoDetectado = formatoDeArchivo(archivo);
    if (!formatoDetectado) {
      setError('Solo se acepta .dxf o .pdf.');
      setEstado('error');
      return;
    }
    setEstado('analizando');
    setError(null);
    setGeometrias(null);
    setOverrides({});
    setArchivoUrl(null);
    onGeometriaLista(null);
    try {
      const texto =
        formatoDetectado === 'pdf' ? await leerArchivoComoBase64(archivo) : await leerArchivoComoTexto(archivo);
      setArchivoTexto(texto);
      setFormato(formatoDetectado);
      // El archivo original se sube a Storage UNA sola vez acá (no en cada
      // recálculo de geometría) -- solo se guarda su URL en la Pieza, nunca
      // el archivo embebido (ver almacen.js sobre el "statement timeout").
      const base64ParaGuardar = formatoDetectado === 'pdf' ? texto : await leerArchivoComoBase64(archivo);
      const [url, r] = await Promise.all([
        subirArchivo(base64ParaGuardar, TIPO_MIME_POR_FORMATO[formatoDetectado], 'pieza'),
        analizarPieza(texto, formatoDetectado),
      ]);
      setArchivoUrl(url);
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
    accept: { 'application/dxf': ['.dxf'], 'image/vnd.dxf': ['.dxf'], 'application/pdf': ['.pdf'] },
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
    setResolviendo(true);
    try {
      const opciones = necesitaEscala
        ? { anchoConocidoCm: Number(anchoConocidoCm), indiceReferencia: Number(indiceReferencia) }
        : { mmPorUnidad: analisis.mmPorUnidad };
      const r = await resolverPieza(archivoTexto, formato, mapaFinal, opciones);
      const geometriaPorTalla = Object.fromEntries(
        Object.entries(r.geometriasPorTalla).map(([talla, geo]) => [talla, { ...geo, validadoPorUsuario: true }])
      );
      setGeometrias(geometriaPorTalla);
      setEstado('resuelto');
      // archivoOriginal/formatoOriginal viajan una sola vez, al nivel de la
      // Pieza -- no adentro de cada talla (sería el mismo archivo repetido
      // N veces, y encima el motivo original del timeout).
      onGeometriaLista({ geometriaPorTalla, archivoOriginal: archivoUrl, formatoOriginal: formato });
    } catch (e) {
      setError(e.message);
    } finally {
      setResolviendo(false);
    }
  }

  // No hace falta ningún clic: en cuanto hay algo calculable (tallas
  // detectadas + escala resuelta, sola o recién confirmada a mano) se
  // calcula sola. El debounce evita disparar una petición por cada tecla
  // mientras se escribe el ancho de referencia o se corrige una talla a
  // mano en el editor.
  useEffect(() => {
    if (!puedeResolver || resolviendo) return;
    const temporizador = setTimeout(() => resolver(), 500);
    return () => clearTimeout(temporizador);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puedeResolver, mapaFinal, indiceReferencia, anchoConocidoCm]);

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
          Arrastrá acá el archivo <strong>.dxf o .pdf</strong> con todas las tallas de esta pieza
          juntas, una capa por talla nombrada así (los piquetes sueltos de cada talla van en su
          misma capa). El PDF se exporta desde Illustrator con "Crear capas de Acrobat" activado.
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

          {error && (
            <Aviso tono="error">
              {error}
              <Boton tamano="sm" variante="fantasma" type="button" className="ml-2" onClick={resolver}>
                Reintentar
              </Boton>
            </Aviso>
          )}

          {resolviendo && <p className="text-xs text-faint-foreground">Calculando…</p>}

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

  const tallas = ordenarTallasNatural(Object.keys(pieza.dimensionesPorTalla || {}));

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

function filaGrupoVacia() {
  return { id: crypto.randomUUID(), rol: '', piezaId: '' };
}

// El catálogo: arma una prenda completa eligiendo, por rol, una pieza que ya
// existe en la biblioteca de arriba. Nada se sube acá — reciclar una pieza
// en otra prenda es elegirla de nuevo en esta misma lista. Vive en la misma
// pestaña que Piezas a propósito: subir una pieza y armar la prenda que la
// usa es un solo flujo, no "crear un producto" y después, aparte, "ver el
// catálogo".
function CatalogoGrupos({ piezas, grupos, onCambio }) {
  const [nombre, setNombre] = useState('');
  const [filas, setFilas] = useState([filaGrupoVacia()]);
  const [error, setError] = useState(null);

  function actualizarFila(id, cambios) {
    setFilas((prev) => prev.map((f) => (f.id === id ? { ...f, ...cambios } : f)));
  }

  function agregarFila() {
    setFilas((prev) => [...prev, filaGrupoVacia()]);
  }

  function quitarFila(id) {
    setFilas((prev) => prev.filter((f) => f.id !== id));
  }

  function elegirPieza(id, piezaId) {
    const pieza = piezas.find((p) => p.id === piezaId);
    const filaActual = filas.find((f) => f.id === id);
    actualizarFila(id, { piezaId, rol: pieza && !filaActual.rol ? pieza.nombre : filaActual.rol });
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
      await crearGrupo({ nombre, piezas: filasCompletas.map((f) => ({ piezaId: f.piezaId, rol: f.rol })) });
      setNombre('');
      setFilas([filaGrupoVacia()]);
      await onCambio();
    } catch (e) {
      setError(e.message);
    }
  }

  async function borrar(id) {
    await eliminarGrupo(id);
    await onCambio();
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
    return ordenarTallasNatural([...tallas]);
  }

  return (
    <div className="flex flex-col gap-6 border-t border-border pt-6">
      <div>
        <h2 className="text-lg font-semibold">Grupos</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          El catálogo: armá una prenda completa eligiendo piezas de la biblioteca de arriba.
          Reciclar una pieza en otra prenda es elegirla de nuevo acá — si después se resube esa
          pieza, todos los grupos que la usan se actualizan solos.
        </p>
      </div>

      {piezas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Subí al menos una pieza arriba primero.</p>
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

export function Piezas({ recargarSenal, onCambio }) {
  const [piezas, setPiezas] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [nombre, setNombre] = useState('');
  const [tela, setTela] = useState('');
  const [presetAngulos, setPresetAngulos] = useState(PRESETS_ANGULOS[0].id);
  const [resultadoSubida, setResultadoSubida] = useState(null); // { geometriaPorTalla, archivoOriginal, formatoOriginal }
  const [claveSubida, setClaveSubida] = useState(0);
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

  async function guardar(evento) {
    evento.preventDefault();
    setError(null);
    if (!nombre.trim()) {
      setError('Falta el nombre de la pieza.');
      return;
    }
    if (!resultadoSubida || Object.keys(resultadoSubida.geometriaPorTalla).length === 0) {
      setError('Subí el archivo con las tallas y calculá la geometría antes de guardar.');
      return;
    }
    const preset = PRESETS_ANGULOS.find((p) => p.id === presetAngulos);
    try {
      await crearPieza({
        nombre,
        tela: tela || null,
        angulosPermitidos: preset.valores,
        geometriaPorTalla: resultadoSubida.geometriaPorTalla,
        archivoOriginal: resultadoSubida.archivoOriginal,
        formatoOriginal: resultadoSubida.formatoOriginal,
      });
      setNombre('');
      setTela('');
      setResultadoSubida(null);
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
          <strong>todas sus tallas adentro</strong>, cada una nombrada. Más abajo se arma la prenda
          completa (<strong>Grupos</strong>), eligiendo piezas de acá.
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

        <ZonaSubidaPieza key={claveSubida} onGeometriaLista={setResultadoSubida} />

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

      <CatalogoGrupos
        piezas={piezas}
        grupos={grupos}
        onCambio={async () => {
          await recargar();
          onCambio?.();
        }}
      />
    </div>
  );
}
