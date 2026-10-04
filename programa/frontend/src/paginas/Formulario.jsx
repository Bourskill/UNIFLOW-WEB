import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { crearPieza, crearGrupo, analizarPieza, resolverPieza, subirArchivo } from '../api.js';
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
// ambigüedad real), y además pide acá mismo el nombre/giros de ESA pieza --
// y, si el padre está armando una prenda, su ROL en ella (en vez de pedir
// categoría/tela, que se definen después: categoría en Biblioteca, tela en
// Producción). Reporta su
// estado hacia arriba en cada cambio -- el formulario padre decide cuándo
// está todo listo para guardar.
// Exportada: Piezas.jsx la reusa tal cual para "Reemplazar moldería" (mismo
// análisis/resolución de acá, terminando en reemplazarArchivoPieza() en vez
// de crearPieza()) -- nombre/rol que pide de paso se ignoran en
// ese flujo (la pieza ya existente conserva los suyos), solo importa
// geometriaPorTalla/archivoOriginal/formatoOriginal.
export function FichaPieza({ archivo, onQuitar, onCambio, modoPrenda = false, rolRepetido = false }) {
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
  // null = el rol acompaña al nombre hasta que se lo edite a mano.
  const [rolEditado, setRolEditado] = useState(null);
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
  const rol = (rolEditado ?? nombre).trim();
  useEffect(() => {
    const preset = PRESETS_ANGULOS.find((p) => p.id === presetAngulos);
    onCambio({
      listo: estado === 'resuelto' && !!geometrias && nombre.trim().length > 0,
      nombre: nombre.trim(),
      rol,
      angulosPermitidos: preset.valores,
      geometriaPorTalla: geometrias,
      archivoOriginal: archivoUrl,
      formatoOriginal: formato,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado, nombre, rol, presetAngulos, geometrias, archivoUrl, formato]);

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
            <div className="flex flex-wrap gap-3">
              <Campo etiqueta="Nombre" className="w-[220px]">
                <Input placeholder="Nombre de la pieza" value={nombre} onChange={(e) => setNombre(e.target.value)} />
              </Campo>
              {modoPrenda && (
                <Campo etiqueta="Rol en la prenda" className="w-[200px]">
                  <Input
                    placeholder="Ej. Manga izquierda"
                    value={rolEditado ?? nombre}
                    onChange={(e) => setRolEditado(e.target.value)}
                  />
                  {rolRepetido && <span className="text-xs text-danger">Otra pieza ya usa este rol</span>}
                </Campo>
              )}
              <Campo etiqueta="Giros permitidos" className="w-[230px]">
                <Select value={presetAngulos} onChange={(e) => setPresetAngulos(e.target.value)}>
                  {PRESETS_ANGULOS.map((p) => <option key={p.id} value={p.id}>{p.etiqueta}</option>)}
                </Select>
              </Campo>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {tallasOrdenadas.length === 0 ? (
                <span className="text-xs text-faint-foreground">No se detectó ninguna talla.</span>
              ) : (
                tallasOrdenadas.map((talla) => <Chip key={talla} tono="activo" className="uppercase">{talla}</Chip>)
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

export function Formulario({ onCambio }) {
  const [fichas, setFichas] = useState([]); // [{ id, archivo }]
  const [datosPorFicha, setDatosPorFicha] = useState({}); // id -> snapshot reportado por FichaPieza
  const [armarPrenda, setArmarPrenda] = useState(false);
  const [nombrePrenda, setNombrePrenda] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [exito, setExito] = useState(null);

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
  }

  const fichasListas = fichas.filter((f) => datosPorFicha[f.id]?.listo);
  const faltanListas = fichas.length - fichasListas.length;

  // Límites de una prenda: las piezas de la prenda SON las fichas de esta
  // pantalla (ni más ni menos), cada una con un rol propio -- el rol es la
  // llave contra la que se ancla el diseño, dos piezas con el mismo rol
  // dentro de una misma prenda se pisarían entre sí.
  const conteoRoles = {};
  for (const f of fichasListas) {
    const r = (datosPorFicha[f.id].rol || '').toLowerCase();
    if (r) conteoRoles[r] = (conteoRoles[r] || 0) + 1;
  }
  const rolRepetido = (id) => {
    const r = (datosPorFicha[id]?.rol || '').toLowerCase();
    return armarPrenda && !!r && conteoRoles[r] > 1;
  };
  const sinRol = fichasListas.filter((f) => !datosPorFicha[f.id].rol).length;
  const hayRolesRepetidos = Object.values(conteoRoles).some((n) => n > 1);

  // Tallas distintas entre piezas de una misma prenda: no se bloquea (una
  // pieza de talla única puede serlo a propósito), pero se muestra.
  const tallasPorFicha = fichasListas.map((f) => ({
    nombre: datosPorFicha[f.id].nombre,
    tallas: ordenarTallasNatural(Object.keys(datosPorFicha[f.id].geometriaPorTalla || {})),
  }));
  const tallasDispares =
    armarPrenda && tallasPorFicha.length > 1 &&
    new Set(tallasPorFicha.map((t) => t.tallas.join('|'))).size > 1;

  const pendientes = [];
  if (faltanListas > 0) pendientes.push(faltanListas === 1 ? '1 pieza sin terminar (o quitala)' : faltanListas + ' piezas sin terminar (o quitalas)');
  if (armarPrenda && !nombrePrenda.trim()) pendientes.push('nombre de la prenda');
  if (armarPrenda && sinRol > 0) pendientes.push('rol en ' + sinRol + (sinRol === 1 ? ' pieza' : ' piezas'));
  if (armarPrenda && hayRolesRepetidos) pendientes.push('roles repetidos');
  const puedeGuardar = fichas.length > 0 && pendientes.length === 0;

  async function guardarTodo() {
    if (!puedeGuardar) return;
    setError(null);
    setExito(null);
    setGuardando(true);
    try {
      const piezasDelGrupo = [];
      for (const f of fichasListas) {
        const datos = datosPorFicha[f.id];
        const creada = await crearPieza({
          nombre: datos.nombre,
          angulosPermitidos: datos.angulosPermitidos,
          geometriaPorTalla: datos.geometriaPorTalla,
          archivoOriginal: datos.archivoOriginal,
          formatoOriginal: datos.formatoOriginal,
        });
        piezasDelGrupo.push({ piezaId: creada.id, rol: datos.rol });
      }
      if (armarPrenda) await crearGrupo({ nombre: nombrePrenda.trim(), piezas: piezasDelGrupo });

      setExito(
        fichasListas.length + (fichasListas.length === 1 ? ' pieza guardada' : ' piezas guardadas') +
          (armarPrenda ? ' · prenda "' + nombrePrenda.trim() + '" armada.' : '.')
      );
      setFichas([]);
      setDatosPorFicha({});
      setArmarPrenda(false);
      setNombrePrenda('');
      onCambio?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="pagina flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Subir piezas</h2>
        <div className="mt-1 flex max-w-2xl items-center gap-1.5 text-sm text-muted-foreground">
          Un archivo por pieza, con una capa por talla.
          <Ayuda>
            Acepta .dxf o .pdf. Los piquetes sueltos van dentro de la misma capa de su talla. Cada
            archivo se guarda como una pieza de la biblioteca; si querés, las juntás en una prenda
            acá mismo. Categoría y tela se definen después (Biblioteca y Producción).
          </Ayuda>
        </div>
      </div>

      <div
        {...getRootProps()}
        className={
          'cursor-pointer rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm ' +
          (isDragActive ? 'border-primary bg-primary-soft text-primary' : 'border-border text-faint-foreground')
        }
      >
        <input {...getInputProps()} />
        Soltá acá tus .dxf o .pdf
      </div>

      {fichas.length > 0 && (
        <Tarjeta className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <input type="checkbox" checked={armarPrenda} onChange={(e) => setArmarPrenda(e.target.checked)} />
            Juntar en una prenda
          </label>
          {armarPrenda && (
            <Input
              value={nombrePrenda}
              onChange={(e) => setNombrePrenda(e.target.value)}
              placeholder="Nombre de la prenda (ej. Remera titular)"
              className="max-w-[320px]"
            />
          )}
        </Tarjeta>
      )}

      {fichas.length > 0 && (
        <div className="flex flex-col gap-3">
          {fichas.map((f) => (
            <FichaPieza
              key={f.id}
              archivo={f.archivo}
              modoPrenda={armarPrenda}
              rolRepetido={rolRepetido(f.id)}
              onQuitar={() => quitarFicha(f.id)}
              onCambio={(datos) => setDatosPorFicha((prev) => ({ ...prev, [f.id]: datos }))}
            />
          ))}
        </div>
      )}

      {tallasDispares && (
        <Aviso tono="info">
          Las piezas no tienen las mismas tallas:{' '}
          {tallasPorFicha.map((t) => t.nombre + ' (' + t.tallas.join(' ').toUpperCase() + ')').join(' · ')}
        </Aviso>
      )}

      {fichas.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <Boton variante="primario" type="button" onClick={guardarTodo} disabled={guardando || !puedeGuardar}>
              {guardando ? 'Guardando…' : armarPrenda ? 'Guardar prenda' : fichas.length === 1 ? 'Guardar pieza' : 'Guardar ' + fichas.length + ' piezas'}
            </Boton>
            {pendientes.length > 0 && (
              <span className="text-xs text-faint-foreground">Falta: {pendientes.join(' · ')}</span>
            )}
          </div>
          {error && <Aviso tono="error">{error}</Aviso>}
        </div>
      )}
      {exito && <Aviso tono="info">{exito}</Aviso>}
    </div>
  );
}
