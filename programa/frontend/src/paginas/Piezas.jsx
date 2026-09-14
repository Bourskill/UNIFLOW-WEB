import { useEffect, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  listarPiezas, listarGrupos, listarProductos, editarPieza, eliminarPieza, reprocesarPieza,
  reemplazarArchivoPieza, eliminarVersionPieza, editarProducto,
} from '../api.js';
import { PRESETS_ANGULOS, ordenarTallasNatural } from '../constantes.js';
import { Boton, Campo, Input, Select, Tarjeta, Chip, Aviso, Ayuda } from '../componentes/ui.jsx';
import { TrazosPreview } from '../componentes/TrazosPreview.jsx';
import { FichaPieza } from './Formulario.jsx';

function presetDe(angulosPermitidos) {
  if (angulosPermitidos === 'libre') return 'libre';
  const preset = PRESETS_ANGULOS.find(
    (p) => Array.isArray(p.valores) && JSON.stringify(p.valores) === JSON.stringify(angulosPermitidos)
  );
  return preset?.id || '0-180';
}

function formatoFecha(iso) {
  return new Date(iso).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' });
}

function resumenMedidas(dimensionesPorTalla) {
  return ordenarTallasNatural(Object.keys(dimensionesPorTalla || {}))
    .map((t) => t.toUpperCase() + ' ' + dimensionesPorTalla[t].anchoCm + '×' + dimensionesPorTalla[t].altoCm + 'cm')
    .join(' · ') || 'sin tallas';
}

// El historial de versiones de una pieza (dominio/modelos.js·VersionPieza) --
// cada una con cuándo se creó, por qué, y un botón para borrarla (la actual
// no se puede borrar, el backend ya lo rechaza). Sigue la misma convención
// de panel-inline-sin-modal que ya usa el resto de esta pantalla.
function PanelVersiones({ pieza, productosQueLaUsan, onCambio }) {
  // Piezas creadas ANTES de este historial no tienen `versiones` -- se
  // sintetiza una sola entrada con su estado actual (sin fecha real, nunca
  // se registró) para que el panel muestre algo coherente con el "(1)" del
  // botón que lo abrió, en vez de una lista vacía.
  const versionActual = pieza.version || 1;
  const versiones = pieza.versiones?.length
    ? [...pieza.versiones].reverse() // más nueva primero
    : [{ version: versionActual, geometriaPorTalla: pieza.geometriaPorTalla, dimensionesPorTalla: pieza.dimensionesPorTalla, creadoEn: null, motivo: null }];

  async function borrar(numero) {
    const afectados = productosQueLaUsan.filter((p) => (p.versionesPiezas || {})[pieza.id] === numero);
    if (afectados.length > 0) {
      const seguro = window.confirm(
        '¿Seguro? Estos productos están fijados a esta versión y se quedarían sin geometría válida -- ' +
        'vas a tener que volver a personalizar la pieza para: ' + afectados.map((p) => p.nombre).join(', ') + '.'
      );
      if (!seguro) return;
    }
    await eliminarVersionPieza(pieza.id, numero);
    onCambio();
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <span className="text-xs font-semibold text-faint-foreground">Historial de versiones</span>
      {versiones.map((v) => (
        <div key={v.version} className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-muted px-3 py-2 text-xs">
          <Chip tono={v.version === versionActual ? 'activo' : 'neutro'}>v{v.version}{v.version === versionActual ? ' · actual' : ''}</Chip>
          {v.creadoEn ? (
            <span className="text-muted-foreground">{formatoFecha(v.creadoEn)}</span>
          ) : (
            <span className="text-faint-foreground">sin fecha registrada (de antes de este historial)</span>
          )}
          {v.motivo && <span className="text-faint-foreground">· {v.motivo}</span>}
          <span className="flex-1 text-faint-foreground">{resumenMedidas(v.dimensionesPorTalla)}</span>
          {v.version !== versionActual && (
            <Boton variante="fantasma" tamano="sm" onClick={() => borrar(v.version)}>Eliminar</Boton>
          )}
        </div>
      ))}
    </div>
  );
}

// "Reemplazar moldería": reusa el mismo análisis/resolución de un archivo
// nuevo que Formulario.jsx (FichaPieza), pero termina en
// reemplazarArchivoPieza() en vez de crear una pieza nueva -- nombre/
// categoría/tela que FichaPieza pide de paso se ignoran, la pieza existente
// conserva los suyos.
function PanelReemplazoArchivo({ pieza, onListo, onCancelar }) {
  const [archivo, setArchivo] = useState(null);
  const [datos, setDatos] = useState(null);
  const [aplicando, setAplicando] = useState(false);
  const [error, setError] = useState(null);

  const onDrop = (archivos) => { setArchivo(archivos[0] || null); setDatos(null); };
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'application/dxf': ['.dxf'], 'image/vnd.dxf': ['.dxf'], 'application/pdf': ['.pdf'] }, multiple: false,
  });

  async function confirmar() {
    setError(null);
    setAplicando(true);
    try {
      const pieza2 = await reemplazarArchivoPieza(pieza.id, {
        geometriaPorTalla: datos.geometriaPorTalla,
        archivoOriginal: datos.archivoOriginal,
        formatoOriginal: datos.formatoOriginal,
      });
      onListo(pieza2);
    } catch (e) {
      setError(e.message);
    } finally {
      setAplicando(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-faint-foreground">Reemplazar moldería (archivo nuevo)</span>
        <Boton variante="fantasma" tamano="sm" onClick={onCancelar}>Cancelar</Boton>
      </div>
      {!archivo ? (
        <div
          {...getRootProps()}
          className={
            'cursor-pointer rounded-lg border-2 border-dashed px-4 py-5 text-center text-xs ' +
            (isDragActive ? 'border-primary bg-primary-soft text-primary' : 'border-border text-faint-foreground')
          }
        >
          <input {...getInputProps()} />
          Arrastrá acá el archivo .dxf/.pdf corregido para esta pieza.
        </div>
      ) : (
        <FichaPieza archivo={archivo} onQuitar={() => setArchivo(null)} onCambio={setDatos} />
      )}
      {error && <Aviso tono="error">{error}</Aviso>}
      {archivo && (
        <div>
          <Boton variante="primario" tamano="sm" disabled={!datos?.listo || aplicando} onClick={confirmar}>
            {aplicando ? 'Guardando…' : 'Confirmar reemplazo (crea una versión nueva)'}
          </Boton>
        </div>
      )}
    </div>
  );
}

// El aviso único al momento de actualizar (pedido explícito): reprocesar o
// reemplazar acaba de crear una versión nueva -- acá se elige, PRODUCTO POR
// PRODUCTO, cuál pasa a usarla y cuál se queda fijado a la vieja. Todos
// destildados por defecto: quedarse en la versión vieja es lo seguro,
// pasar a la nueva es una decisión explícita.
function PanelConfirmarActualizacion({ pieza, versionAnterior, productosAfectados, onResuelto }) {
  const [elegidos, setElegidos] = useState(() => new Set());
  const [guardando, setGuardando] = useState(false);

  function alternar(id) {
    setElegidos((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(id)) nuevo.delete(id); else nuevo.add(id);
      return nuevo;
    });
  }

  async function confirmar() {
    setGuardando(true);
    try {
      for (const producto of productosAfectados) {
        const nuevaVersion = elegidos.has(producto.id) ? pieza.version : versionAnterior;
        await editarProducto(producto.id, {
          versionesPiezas: { ...(producto.versionesPiezas || {}), [pieza.id]: nuevaVersion },
        });
      }
    } finally {
      setGuardando(false);
      onResuelto();
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary-soft p-3">
      <div>
        <span className="text-sm font-medium text-primary">
          Esta pieza se actualizó a la versión {pieza.version}. Hay {productosAfectados.length} producto
          {productosAfectados.length === 1 ? '' : 's'} usándola -- ¿cuáles pasan a la nueva versión?
        </span>
        <p className="mt-1 text-xs text-primary/80">
          Sin tildar, un producto se queda fijado a la versión {versionAnterior} (la que tenía antes de este
          cambio) -- ningún cliente ya entregado se ve afectado sin que lo elijas acá.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        {productosAfectados.map((p) => (
          <label key={p.id} className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={elegidos.has(p.id)} onChange={() => alternar(p.id)} />
            {p.nombre}
            <span className="text-xs text-faint-foreground">
              (hoy en v{p.versionesPiezas?.[pieza.id] ?? versionAnterior})
            </span>
          </label>
        ))}
      </div>
      <div>
        <Boton variante="primario" tamano="sm" disabled={guardando} onClick={confirmar}>
          {guardando ? 'Guardando…' : 'Confirmar'}
        </Boton>
      </div>
    </div>
  );
}

function FilaPieza({ pieza, usadaEn, productosQueLaUsan, onCambio, onBorrar }) {
  const [editando, setEditando] = useState(false);
  const [categoria, setCategoria] = useState(pieza.categoria || '');
  const [tela, setTela] = useState(pieza.tela || '');
  const [presetAngulos, setPresetAngulos] = useState(presetDe(pieza.angulosPermitidos));
  const [tallaUnica, setTallaUnica] = useState(!!pieza.tallaUnica);
  const [reprocesando, setReprocesando] = useState(false);
  const [resultadoReproceso, setResultadoReproceso] = useState(null);
  const [mostrandoVersiones, setMostrandoVersiones] = useState(false);
  const [reemplazando, setReemplazando] = useState(false);
  // Cuando reprocesar/reemplazar crea una versión nueva Y hay productos
  // usando esta pieza, queda acá pendiente hasta que se resuelva el panel
  // de confirmación de arriba.
  const [pendienteConfirmar, setPendienteConfirmar] = useState(null); // { versionAnterior }

  async function guardar() {
    const preset = PRESETS_ANGULOS.find((p) => p.id === presetAngulos);
    await editarPieza(pieza.id, { categoria: categoria || null, tela: tela || null, angulosPermitidos: preset.valores, tallaUnica });
    setEditando(false);
    onCambio();
  }

  function alDespuesDeVersionar(versionAnterior) {
    if (productosQueLaUsan.length > 0) setPendienteConfirmar({ versionAnterior });
    onCambio();
  }

  async function reprocesar() {
    setReprocesando(true);
    setResultadoReproceso(null);
    const versionAnterior = pieza.version;
    try {
      const r = await reprocesarPieza(pieza.id);
      setResultadoReproceso({
        tono: 'info',
        texto: 'Recalculadas: ' + r.tallasReprocesadas.map((t) => t.toUpperCase()).join(', ') +
          (r.tallasSinCoincidencia.length ? ' · sin coincidencia en el archivo: ' + r.tallasSinCoincidencia.map((t) => t.toUpperCase()).join(', ') : ''),
      });
      alDespuesDeVersionar(versionAnterior);
    } catch (e) {
      setResultadoReproceso({ tono: 'error', texto: e.message });
    } finally {
      setReprocesando(false);
    }
  }

  const tallas = ordenarTallasNatural(Object.keys(pieza.dimensionesPorTalla || {}));
  const faltanPiquetes = tallas.some((t) => !pieza.geometriaPorTalla?.[t]?.piquetesMm?.length);

  return (
    <Tarjeta className="flex flex-col gap-3">
      <div className="flex items-start gap-4">
        <TrazosPreview geometriaPorTalla={pieza.geometriaPorTalla || {}} size={90} />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{pieza.nombre}</span>
            {pieza.categoria && <Chip>{pieza.categoria}</Chip>}
            {pieza.tela && <span className="text-xs text-faint-foreground">· {pieza.tela}</span>}
            <Chip>v{pieza.version || 1}</Chip>
            {pieza.tallaUnica && <Chip tono="activo">talla única</Chip>}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {tallas.length === 0 ? (
              <span className="text-xs text-faint-foreground">sin geometría cargada</span>
            ) : (
              tallas.map((t) => (
                <Chip key={t}>{t.toUpperCase()}: {pieza.dimensionesPorTalla[t].anchoCm}×{pieza.dimensionesPorTalla[t].altoCm}cm</Chip>
              ))
            )}
          </div>
          <div className="mt-1.5 text-xs text-faint-foreground">
            {usadaEn.length === 0 ? 'Sin usar en ninguna prenda todavía' : 'Usada en: ' + usadaEn.join(', ')}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="flex gap-2">
            <Boton variante="secundario" tamano="sm" onClick={() => setEditando((v) => !v)}>
              {editando ? 'Cerrar' : 'Editar'}
            </Boton>
            <Boton variante="fantasma" tamano="sm" onClick={onBorrar}>Eliminar</Boton>
          </div>
          <div className="flex items-center gap-1">
            {pieza.archivoOriginal && tallas.length > 0 && (
              <>
                {faltanPiquetes && <span className="text-[10px] text-faint-foreground">sin piquetes</span>}
                <Boton variante="fantasma" tamano="sm" onClick={reprocesar} disabled={reprocesando}>
                  {reprocesando ? 'Recalculando…' : 'Reprocesar geometría'}
                </Boton>
                <Ayuda>
                  Vuelve a leer el archivo original ya guardado (sin resubirlo) y recalcula el
                  contorno y los piquetes de cada talla con el importador actual -- para piezas
                  subidas antes de que se supiera separar los piquetes sueltos. Si el resultado no
                  coincide con las medidas ya guardadas, no toca nada y avisa. Crea una versión nueva.
                </Ayuda>
              </>
            )}
            <Boton variante="fantasma" tamano="sm" onClick={() => setReemplazando((v) => !v)}>
              {reemplazando ? 'Cancelar' : 'Reemplazar moldería'}
            </Boton>
            <Boton variante="fantasma" tamano="sm" onClick={() => setMostrandoVersiones((v) => !v)}>
              {mostrandoVersiones ? 'Ocultar versiones' : 'Ver versiones (' + (pieza.versiones?.length || 1) + ')'}
            </Boton>
          </div>
        </div>
      </div>

      {resultadoReproceso && <Aviso tono={resultadoReproceso.tono}>{resultadoReproceso.texto}</Aviso>}

      {pendienteConfirmar && (
        <PanelConfirmarActualizacion
          pieza={pieza}
          versionAnterior={pendienteConfirmar.versionAnterior}
          productosAfectados={productosQueLaUsan}
          onResuelto={() => { setPendienteConfirmar(null); onCambio(); }}
        />
      )}

      {reemplazando && (
        <PanelReemplazoArchivo
          pieza={pieza}
          onCancelar={() => setReemplazando(false)}
          onListo={(piezaNueva) => {
            setReemplazando(false);
            alDespuesDeVersionar(pieza.version);
          }}
        />
      )}

      {mostrandoVersiones && (
        <PanelVersiones pieza={pieza} productosQueLaUsan={productosQueLaUsan} onCambio={onCambio} />
      )}

      {editando && (
        <div className="flex flex-wrap items-end gap-3 border-t border-border pt-3">
          <Campo etiqueta="Categoría" className="max-w-[180px]">
            <Input value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Delantero, Manga…" />
          </Campo>
          <Campo etiqueta="Tela por defecto" className="max-w-[180px]">
            <Input value={tela} onChange={(e) => setTela(e.target.value)} placeholder="Dry Fit" />
          </Campo>
          <Campo etiqueta="Ángulos de rotación permitidos" className="max-w-[240px]">
            <Select value={presetAngulos} onChange={(e) => setPresetAngulos(e.target.value)}>
              {PRESETS_ANGULOS.map((p) => <option key={p.id} value={p.id}>{p.etiqueta}</option>)}
            </Select>
          </Campo>
          <label className="mb-2 flex items-center gap-1.5 text-sm text-foreground">
            <input type="checkbox" className="h-4 w-4 rounded accent-primary" checked={tallaUnica} onChange={(e) => setTallaUnica(e.target.checked)} />
            Talla única (no escala)
          </label>
          <Ayuda>
            Marcá esto SOLO si esta pieza de verdad es igual en cualquier talla de la prenda (ej.
            una vela o un refuerzo que no cambia de tamaño). Con esto activado, un pedido en
            cualquier talla usa la única geometría cargada sin pedirla exacta. Sin marcar, si a la
            pieza todavía le falta cargar alguna talla, producción sigue avisando explícito en vez
            de usar la talla equivocada por error.
          </Ayuda>
          <Boton variante="primario" tamano="sm" onClick={guardar}>Guardar cambios</Boton>
        </div>
      )}
    </Tarjeta>
  );
}

// Biblioteca de piezas: no se sube nada acá (eso vive en "Subir piezas") —
// esto es ver qué hay, filtrar por categoría, y saber en qué prendas se usa
// o se comparte cada una antes de tocarla o borrarla.
export function Piezas({ recargarSenal, onCambio }) {
  const [piezas, setPiezas] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [productos, setProductos] = useState([]);
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [busqueda, setBusqueda] = useState('');
  // Sin esto, la PRIMERA vez que se visita esta pestaña en la sesión (o
  // después de cualquier reload de página, que resetea qué apartados ya se
  // visitaron -- ver App.jsx) el "Todavía no hay ninguna" de más abajo
  // salía mientras el fetch todavía estaba en vuelo -- indistinguible de un
  // vacío real, y el usuario lo vivía como "se demora en cargar/actualizar
  // el apartado" (más aún si el backend gratis estaba dormido, hasta un
  // minuto para despertar).
  const [cargando, setCargando] = useState(true);

  // Sin este split: cualquier acción DENTRO de una fila (reprocesar,
  // reemplazar molderia, editar) llamaba a `recargar()`, que ponía
  // `cargando=true` -- eso desmonta TODA la lista (el `cargando ? ... :
  // ...piezasFiltradas.map(...)` de más abajo) mientras el fetch está en
  // vuelo, así que cualquier estado local que esa misma fila acababa de
  // fijar (ej. "hay que confirmar qué productos actualizar") se perdía
  // ANTES de poder pintarse -- la fila se remonta de cero al volver los
  // datos. `actualizarDatos` es la versión silenciosa: mismo fetch, pero
  // sin pasar por `cargando`, así la lista nunca se desmonta.
  async function actualizarDatos() {
    const [ps, gs, prods] = await Promise.all([listarPiezas(), listarGrupos(), listarProductos()]);
    setPiezas(ps);
    setGrupos(gs);
    setProductos(prods);
  }

  async function recargar() {
    setCargando(true);
    try {
      await actualizarDatos();
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recargarSenal]);

  const categorias = useMemo(
    () => [...new Set(piezas.map((p) => p.categoria).filter(Boolean))].sort(),
    [piezas]
  );

  const usadaEnPorPieza = useMemo(() => {
    const mapa = {};
    for (const g of grupos) {
      for (const gp of g.piezas) {
        if (!mapa[gp.piezaId]) mapa[gp.piezaId] = [];
        mapa[gp.piezaId].push(g.nombre);
      }
    }
    return mapa;
  }, [grupos]);

  // Qué Productos (no Grupos) usan cada pieza -- lo que de verdad importa
  // para el versionado: un Grupo/Plantilla siempre sigue la última versión
  // sola, son los Productos ya guardados los que pueden quedar fijados y
  // hay que avisarles.
  const productosPorPieza = useMemo(() => {
    const mapa = {};
    for (const producto of productos) {
      const grupo = grupos.find((g) => g.id === producto.grupoId);
      if (!grupo) continue;
      for (const gp of grupo.piezas) {
        if (!mapa[gp.piezaId]) mapa[gp.piezaId] = [];
        mapa[gp.piezaId].push(producto);
      }
    }
    return mapa;
  }, [productos, grupos]);

  const piezasFiltradas = piezas
    .filter((p) => !filtroCategoria || p.categoria === filtroCategoria)
    .filter((p) => !busqueda.trim() || p.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()));

  async function borrar(id) {
    await eliminarPieza(id);
    await actualizarDatos();
    onCambio?.();
  }

  return (
    <div className="pagina flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Biblioteca</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          La biblioteca completa. Reprocesar o reemplazar la moldería de una pieza acá crea una
          versión nueva -- si algún producto ya guardado la usa, se pregunta cuál pasa a la versión
          nueva y cuál se queda en la que tenía.
        </p>
      </div>

      {piezas.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre…"
            className="max-w-[220px]"
          />
          {categorias.length > 0 && (
            <>
              <span className="text-xs font-medium text-faint-foreground">Categoría:</span>
              <Select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)} className="max-w-[200px]">
                <option value="">Todas</option>
                {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </>
          )}
          <span className="text-xs text-faint-foreground">
            {piezasFiltradas.length} de {piezas.length}
          </span>
        </div>
      )}

      {cargando ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : piezasFiltradas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {piezas.length === 0 ? 'Todavía no hay ninguna — subí una en "Subir piezas".' : 'Ninguna coincide con el filtro.'}
        </p>
      ) : (
        <div className="flex max-w-3xl flex-col gap-3">
          {piezasFiltradas.map((p) => (
            <FilaPieza
              key={p.id}
              pieza={p}
              usadaEn={usadaEnPorPieza[p.id] || []}
              productosQueLaUsan={productosPorPieza[p.id] || []}
              onCambio={actualizarDatos}
              onBorrar={() => borrar(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
