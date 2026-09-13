import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { listarPiezas, crearPieza, crearGrupo, analizarPieza, resolverPieza, subirArchivo } from '../api.js';
import { PRESETS_ANGULOS, ordenarTallasNatural } from '../constantes.js';
import { Boton, Campo, Input, Select, Tarjeta, Chip, Aviso, Ayuda } from '../componentes/ui.jsx';
import { TrazosPreview } from '../componentes/TrazosPreview.jsx';

function leerArchivoComoTexto(archivo) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(lector.result);
    lector.onerror = reject;
    lector.readAsText(archivo);
  });
}

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

// Una ficha por archivo soltado: analiza y calcula la geometría sola (mismo
// motor que antes -- una capa por talla, editor manual solo si hay una
// ambigüedad real), y además pide acá mismo el nombre/categoría/tela/ángulos
// de ESA pieza, para no tener que ir a otra pantalla después. Reporta su
// estado hacia arriba en cada cambio -- el formulario padre decide cuándo
// está todo listo para guardar.
function FichaPieza({ archivo, onQuitar, onCambio }) {
  const [estado, setEstado] = useState('analizando'); // analizando | revisando | resuelto | error
  const [archivoTexto, setArchivoTexto] = useState(null);
  const [archivoUrl, setArchivoUrl] = useState(null);
  const [formato, setFormato] = useState(null);
  const [analisis, setAnalisis] = useState(null);
  const [overrides, setOverrides] = useState({});
  const [editando, setEditando] = useState(false);
  const [indiceReferencia, setIndiceReferencia] = useState('');
  const [anchoConocidoCm, setAnchoConocidoCm] = useState('');
  const [geometrias, setGeometrias] = useState(null);
  const [error, setError] = useState(null);
  const [resolviendo, setResolviendo] = useState(false);

  const [nombre, setNombre] = useState(archivo.name.replace(/\.(dxf|pdf)$/i, ''));
  const [categoria, setCategoria] = useState('');
  const [tela, setTela] = useState('');
  const [presetAngulos, setPresetAngulos] = useState(PRESETS_ANGULOS[0].id);

  useEffect(() => {
    const formatoDetectado = formatoDeArchivo(archivo);
    if (!formatoDetectado) {
      setError('Solo se acepta .dxf o .pdf.');
      setEstado('error');
      return;
    }
    (async () => {
      try {
        const texto =
          formatoDetectado === 'pdf' ? await leerArchivoComoBase64(archivo) : await leerArchivoComoTexto(archivo);
        setArchivoTexto(texto);
        setFormato(formatoDetectado);
        const base64ParaGuardar = formatoDetectado === 'pdf' ? texto : await leerArchivoComoBase64(archivo);
        const [url, r] = await Promise.all([
          subirArchivo(base64ParaGuardar, TIPO_MIME_POR_FORMATO[formatoDetectado], 'pieza'),
          analizarPieza(texto, formatoDetectado),
        ]);
        setArchivoUrl(url);
        setAnalisis(r);
        setEditando(r.asignaciones.some((a) => a.nombreDetectado && !a.tallaAsignada));
        setEstado('revisando');
      } catch (e) {
        setError(e.message);
        setEstado('error');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    } catch (e) {
      setError(e.message);
    } finally {
      setResolviendo(false);
    }
  }

  useEffect(() => {
    if (!puedeResolver || resolviendo) return;
    const temporizador = setTimeout(() => resolver(), 500);
    return () => clearTimeout(temporizador);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puedeResolver, mapaFinal, indiceReferencia, anchoConocidoCm]);

  // Reporta hacia arriba en cada cambio relevante -- el padre decide cuándo
  // hay algo guardable, no esta ficha.
  useEffect(() => {
    const preset = PRESETS_ANGULOS.find((p) => p.id === presetAngulos);
    onCambio({
      listo: estado === 'resuelto' && !!geometrias && nombre.trim().length > 0,
      nombre: nombre.trim(),
      categoria: categoria.trim() || null,
      tela: tela.trim() || null,
      angulosPermitidos: preset.valores,
      geometriaPorTalla: geometrias,
      archivoOriginal: archivoUrl,
      formatoOriginal: formato,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado, nombre, categoria, tela, presetAngulos, geometrias, archivoUrl, formato]);

  return (
    <Tarjeta className="flex gap-4">
      <TrazosPreview geometriaPorTalla={geometrias || {}} size={110} />
      <div className="flex flex-1 flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs text-faint-foreground" title={archivo.name}>{archivo.name}</span>
          <Boton variante="fantasma" tamano="sm" type="button" onClick={onQuitar}>Quitar</Boton>
        </div>

        {estado === 'analizando' && <p className="text-sm text-muted-foreground">Analizando…</p>}
        {estado === 'error' && <Aviso tono="error">{error}</Aviso>}

        {(estado === 'revisando' || estado === 'resuelto') && analisis && (
          <>
            <div className="flex flex-wrap gap-2">
              <Input
                className="max-w-[220px]"
                placeholder="Nombre de la pieza"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
              <Input
                className="max-w-[160px]"
                placeholder="Categoría (opc.)"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
              />
              <Input
                className="max-w-[140px]"
                placeholder="Tela (opc.)"
                value={tela}
                onChange={(e) => setTela(e.target.value)}
              />
              <Select className="max-w-[190px]" value={presetAngulos} onChange={(e) => setPresetAngulos(e.target.value)}>
                {PRESETS_ANGULOS.map((p) => <option key={p.id} value={p.id}>{p.etiqueta}</option>)}
              </Select>
            </div>

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
                  pasa con algunos exports. Confirmá una vez cuánto mide de verdad una capa para
                  poder calcular el resto a escala.
                </Ayuda>
              </div>
            )}

            {error && <Aviso tono="error">{error}</Aviso>}
            {resolviendo && <p className="text-xs text-faint-foreground">Calculando…</p>}
          </>
        )}
      </div>
    </Tarjeta>
  );
}

function filaRolVacia() {
  return { id: crypto.randomUUID(), rol: '', origen: '' }; // origen: "nueva:<indiceFicha>" o "existente:<piezaId>"
}

export function Formulario({ onCambio }) {
  const [fichas, setFichas] = useState([]); // [{ id, archivo }]
  const [datosPorFicha, setDatosPorFicha] = useState({}); // id -> snapshot reportado por FichaPieza
  const [piezasExistentes, setPiezasExistentes] = useState([]);
  const [armarPrenda, setArmarPrenda] = useState(false);
  const [nombrePrenda, setNombrePrenda] = useState('');
  const [filasRol, setFilasRol] = useState([filaRolVacia()]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [exito, setExito] = useState(null);

  useEffect(() => {
    listarPiezas().then(setPiezasExistentes);
  }, [exito]);

  const onDrop = useCallback((archivos) => {
    setExito(null);
    setFichas((prev) => [...prev, ...archivos.map((archivo) => ({ id: crypto.randomUUID(), archivo }))]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/dxf': ['.dxf'], 'image/vnd.dxf': ['.dxf'], 'application/pdf': ['.pdf'] },
    multiple: true,
  });

  function quitarFicha(id) {
    setFichas((prev) => prev.filter((f) => f.id !== id));
    setDatosPorFicha((prev) => {
      const { [id]: _quitada, ...resto } = prev;
      return resto;
    });
    setFilasRol((prev) => prev.map((f) => (f.origen === 'nueva:' + id ? { ...f, origen: '' } : f)));
  }

  function actualizarFilaRol(id, cambios) {
    setFilasRol((prev) => prev.map((f) => (f.id === id ? { ...f, ...cambios } : f)));
  }

  function agregarFilaRol() {
    setFilasRol((prev) => [...prev, filaRolVacia()]);
  }

  function quitarFilaRol(id) {
    setFilasRol((prev) => prev.filter((f) => f.id !== id));
  }

  // Nombre "para mostrar" de una opción del selector de rol -- puede ser una
  // pieza ya guardada o una recién subida en esta misma pantalla, todavía sin
  // id real.
  function elegirOrigen(filaId, origen) {
    const fila = filasRol.find((f) => f.id === filaId);
    let nombreSugerido = '';
    if (origen.startsWith('nueva:')) nombreSugerido = datosPorFicha[origen.slice(6)]?.nombre || '';
    else if (origen.startsWith('existente:')) nombreSugerido = piezasExistentes.find((p) => p.id === origen.slice(10))?.nombre || '';
    actualizarFilaRol(filaId, { origen, rol: fila.rol || nombreSugerido });
  }

  const fichasListas = fichas.filter((f) => datosPorFicha[f.id]?.listo);
  const hayAlgoAnalizando = fichas.some((f) => !datosPorFicha[f.id]?.listo);

  async function guardarTodo() {
    setError(null);
    setExito(null);
    if (fichasListas.length === 0) {
      setError('Subí y completá al menos una pieza (nombre + tallas calculadas) antes de guardar.');
      return;
    }
    if (armarPrenda && !nombrePrenda.trim()) {
      setError('Falta el nombre de la prenda.');
      return;
    }
    setGuardando(true);
    try {
      // 1) Crear las piezas nuevas -- se necesita su id real antes de armar el grupo.
      const idRealPorFicha = {};
      for (const f of fichasListas) {
        const datos = datosPorFicha[f.id];
        const creada = await crearPieza({
          nombre: datos.nombre,
          categoria: datos.categoria,
          tela: datos.tela,
          angulosPermitidos: datos.angulosPermitidos,
          geometriaPorTalla: datos.geometriaPorTalla,
          archivoOriginal: datos.archivoOriginal,
          formatoOriginal: datos.formatoOriginal,
        });
        idRealPorFicha[f.id] = creada.id;
      }

      // 2) Si corresponde, armar la prenda referenciando lo recién creado +
      // cualquier pieza ya existente que se haya elegido en las filas de rol.
      if (armarPrenda) {
        const piezasDelGrupo = filasRol
          .filter((f) => f.rol.trim() && f.origen)
          .map((f) => {
            const piezaId = f.origen.startsWith('nueva:')
              ? idRealPorFicha[f.origen.slice(6)]
              : f.origen.slice(10);
            return piezaId ? { piezaId, rol: f.rol.trim() } : null;
          })
          .filter(Boolean);
        if (piezasDelGrupo.length > 0) {
          await crearGrupo({ nombre: nombrePrenda.trim(), piezas: piezasDelGrupo });
        }
      }

      setExito(
        fichasListas.length + (fichasListas.length === 1 ? ' pieza guardada' : ' piezas guardadas') +
          (armarPrenda ? ', prenda "' + nombrePrenda.trim() + '" armada.' : ', sin agrupar.')
      );
      setFichas([]);
      setDatosPorFicha({});
      setArmarPrenda(false);
      setNombrePrenda('');
      setFilasRol([filaRolVacia()]);
      onCambio?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  }

  const opcionesOrigen = [
    ...fichasListas.map((f) => ({ valor: 'nueva:' + f.id, etiqueta: (datosPorFicha[f.id]?.nombre || '(sin nombre)') + ' (nueva)' })),
    ...piezasExistentes.map((p) => ({ valor: 'existente:' + p.id, etiqueta: p.nombre + ' (biblioteca)' })),
  ];

  return (
    <div className="pagina flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Subir piezas</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Soltá uno o varios archivos <strong>.dxf o .pdf</strong> (una capa por talla en cada uno,
          piquetes sueltos incluidos en su misma capa). Cada archivo es una pieza — después decidís
          si quedan sueltas o forman una prenda nueva.
        </p>
      </div>

      <div
        {...getRootProps()}
        className={
          'cursor-pointer rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm ' +
          (isDragActive ? 'border-primary bg-primary-soft text-primary' : 'border-border text-faint-foreground')
        }
      >
        <input {...getInputProps()} />
        Arrastrá acá uno o varios archivos .dxf/.pdf — una pieza entera de la prenda (ej. toda la
        moldería) o solo una pieza suelta, lo que tengas a mano.
      </div>

      {fichas.length > 0 && (
        <div className="flex flex-col gap-3">
          {fichas.map((f) => (
            <FichaPieza
              key={f.id}
              archivo={f.archivo}
              onQuitar={() => quitarFicha(f.id)}
              onCambio={(datos) => setDatosPorFicha((prev) => ({ ...prev, [f.id]: datos }))}
            />
          ))}
        </div>
      )}

      {fichas.length > 0 && (
        <Tarjeta className="flex flex-col gap-4">
          <label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <input type="checkbox" checked={armarPrenda} onChange={(e) => setArmarPrenda(e.target.checked)} />
            Armar una prenda con estas piezas
          </label>

          {armarPrenda && (
            <div className="flex flex-col gap-3">
              <Campo etiqueta="Nombre de la prenda">
                <Input value={nombrePrenda} onChange={(e) => setNombrePrenda(e.target.value)} placeholder="Remera titular" className="max-w-[280px]" />
              </Campo>

              <div className="flex flex-col gap-2">
                {filasRol.map((f) => (
                  <div key={f.id} className="flex flex-wrap items-center gap-2">
                    <Select value={f.origen} onChange={(e) => elegirOrigen(f.id, e.target.value)} className="max-w-[240px]">
                      <option value="">— Elegir pieza —</option>
                      {opcionesOrigen.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
                    </Select>
                    <Input
                      placeholder="Rol en esta prenda (ej. Manga izquierda)"
                      value={f.rol}
                      onChange={(e) => actualizarFilaRol(f.id, { rol: e.target.value })}
                      className="max-w-[220px]"
                    />
                    {filasRol.length > 1 && (
                      <Boton variante="fantasma" tamano="sm" type="button" onClick={() => quitarFilaRol(f.id)}>Quitar</Boton>
                    )}
                  </div>
                ))}
              </div>
              <div>
                <Boton type="button" tamano="sm" onClick={agregarFilaRol}>+ Agregar pieza a la prenda</Boton>
              </div>
            </div>
          )}
        </Tarjeta>
      )}

      {fichas.length > 0 && (
        <div className="flex flex-col gap-2">
          <div>
            <Boton variante="primario" type="button" onClick={guardarTodo} disabled={guardando || fichasListas.length === 0}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Boton>
            {hayAlgoAnalizando && (
              <span className="ml-3 text-xs text-faint-foreground">
                {fichasListas.length} de {fichas.length} piezas listas para guardar.
              </span>
            )}
          </div>
          {error && <Aviso tono="error">{error}</Aviso>}
          {exito && <Aviso tono="info">{exito}</Aviso>}
        </div>
      )}
    </div>
  );
}
