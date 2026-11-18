import { useEffect, useMemo, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  editarPieza, eliminarPieza, reprocesarPieza, espejarPieza,
  reemplazarArchivoPieza, eliminarVersionPieza, editarProducto, eliminarGrupo
} from '../api.js';
import { obtener, confirmarGuardado, borrarRegistro } from '../datos/index.js';
import { PRESETS_ANGULOS, ordenarTallasNatural } from '../constantes.js';
import { Boton, Campo, Input, Select, Chip, Aviso, Ayuda, ErrorCarga } from '../componentes/ui.jsx';
import { TrazosPreview } from '../componentes/TrazosPreview.jsx';
import { FichaPieza } from './Formulario.jsx';
import { FormularioPrenda } from '../componentes/FormularioPrenda.jsx';
import { nombreDeEspejo } from '../utilidades/nombreEspejo.js';

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
        '¿Seguro? Estas producciones están fijadas a esta versión y se quedarían sin geometría válida -- ' +
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
      {pieza.espejada && (
        <Aviso tono="info">
          Esta pieza es un espejo: subí el molde del MISMO lado que la original, y se espeja solo al guardarlo.
        </Aviso>
      )}
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
          Esta pieza se actualizó a la versión {pieza.version}. Hay {productosAfectados.length}{' '}
          {productosAfectados.length === 1 ? 'producción' : 'producciones'} usándola -- ¿cuáles pasan a la nueva versión?
        </span>
        <p className="mt-1 text-xs text-primary/80">
          Sin tildar, una producción se queda fijada a la versión {versionAnterior} (la que tenía antes de este
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

// Duplicar en espejo: una pieza NUEVA, reflejada (izquierda ↔ derecha), con
// todas las tallas -- para darle su propio diseño sin importar otro archivo.
function PanelEspejo({ pieza, onCancelar, onCreada }) {
  const [nombre, setNombre] = useState(() => nombreDeEspejo(pieza.nombre));
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState(null);
  async function crear() {
    setCreando(true);
    setError(null);
    try {
      const nueva = await espejarPieza(pieza.id, nombre.trim());
      confirmarGuardado('piezas', nueva);
      onCreada(nueva);
    } catch (e) {
      setError(e.message);
    } finally {
      setCreando(false);
    }
  }
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-muted p-3">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground" aria-hidden="true">
          <div className="h-16 w-14"><TrazosPreview geometriaPorTalla={pieza.geometriaPorTalla || {}} fluido /></div>
          <span className="text-lg">→</span>
          <div className="h-16 w-14 -scale-x-100"><TrazosPreview geometriaPorTalla={pieza.geometriaPorTalla || {}} fluido /></div>
        </div>
        <div className="min-w-[220px] flex-1">
          <Campo etiqueta="Nombre de la pieza en espejo">
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && nombre.trim()) crear(); }} />
          </Campo>
        </div>
      </div>
      <p className="text-xs text-faint-foreground">
        Se crea otra pieza, igual pero reflejada, con todas sus tallas, piquetes y medidas. Esta no se toca. Si más
        adelante la reprocesás o le reemplazás el molde, se sigue espejando sola.
      </p>
      {error && <Aviso tono="error">{error}</Aviso>}
      <div className="flex gap-2">
        <Boton variante="primario" tamano="sm" onClick={crear} disabled={!nombre.trim() || creando}>
          {creando ? 'Creando…' : 'Crear pieza en espejo'}
        </Boton>
        <Boton variante="fantasma" tamano="sm" onClick={onCancelar}>Cancelar</Boton>
      </div>
    </div>
  );
}

function FilaPieza({ pieza, rol, usadaEn, productosQueLaUsan, onCambio, onBorrar }) {
  const [editando, setEditando] = useState(false);
  const [categoria, setCategoria] = useState(pieza.categoria || '');
  const [tela, setTela] = useState(pieza.tela || '');
  const [presetAngulos, setPresetAngulos] = useState(presetDe(pieza.angulosPermitidos));
  const [tallaUnica, setTallaUnica] = useState(!!pieza.tallaUnica);
  const [reprocesando, setReprocesando] = useState(false);
  const [resultadoReproceso, setResultadoReproceso] = useState(null);
  const [mostrandoVersiones, setMostrandoVersiones] = useState(false);
  const [reemplazando, setReemplazando] = useState(false);
  const [espejando, setEspejando] = useState(false);
  const [creadaEnEspejo, setCreadaEnEspejo] = useState(null); // nombre de la que se acaba de crear
  // Cuando reprocesar/reemplazar crea una versión nueva Y hay productos
  // usando esta pieza, queda acá pendiente hasta que se resuelva el panel
  // de confirmación de arriba.
  const [pendienteConfirmar, setPendienteConfirmar] = useState(null); // { versionAnterior }

  async function guardar() {
    const preset = PRESETS_ANGULOS.find((p) => p.id === presetAngulos);
    const actualizada = await editarPieza(pieza.id, { categoria: categoria || null, tela: tela || null, angulosPermitidos: preset.valores, tallaUnica });
    // El servidor ya devolvió la pieza como quedó: va directo a la caché, sin
    // volver a pedir la lista entera de piezas (eso era lo lento).
    confirmarGuardado('piezas', actualizada);
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
  const piquetesPorTalla = tallas.length > 0 ? (pieza.geometriaPorTalla?.[tallas[0]]?.piquetesMm?.length || 0) : 0;
  const rangoTallas = pieza.tallaUnica || tallas.length === 1
    ? 'Talla única'
    : tallas.length === 0
      ? 'Sin tallas'
      : tallas.length + ' tallas · ' + tallas[0].toUpperCase() + ' – ' + tallas[tallas.length - 1].toUpperCase();
  const medidaMayor = tallas.length > 0 ? pieza.dimensionesPorTalla[tallas[tallas.length - 1]] : null;
  // Mientras se edita, se revisan versiones o hay un panel abierto, la
  // tarjeta ocupa toda la fila: los formularios no entran en una columna.
  const expandida = editando || reemplazando || espejando || !!creadaEnEspejo || mostrandoVersiones || !!pendienteConfirmar || !!resultadoReproceso;
  const puedeReprocesar = !!pieza.archivoOriginal && tallas.length > 0 && pieza.formatoOriginal !== 'pdf-prenda';

  return (
    <article
      className={
        'flex flex-col overflow-hidden rounded-xl border bg-surface shadow-sm transition-[border-color,box-shadow] ' +
        'hover:border-primary/40 hover:shadow-md ' +
        (expandida ? 'col-span-full border-primary/40' : 'border-border')
      }
    >
      <div className={'relative border-b border-border bg-surface-muted ' + (expandida ? 'h-56' : 'aspect-[4/3]')}>
        {/* Caja absoluta: sin esto, una pieza alta y angosta (un tapacuellos)
            estiraba la tarjeta entera con la proporción propia del SVG. */}
        <div className="absolute inset-4">
          <TrazosPreview geometriaPorTalla={pieza.geometriaPorTalla || {}} fluido mostrarPiquetes />
        </div>
        <div className="absolute left-2.5 top-2.5 flex gap-1">
          <span className="rounded-md bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            v{pieza.version || 1}
          </span>
          {pieza.tallaUnica && (
            <span className="rounded-md bg-primary-soft px-1.5 py-0.5 text-[10px] font-medium text-primary">talla única</span>
          )}
          {pieza.espejada && (
            <span className="rounded-md bg-primary-soft px-1.5 py-0.5 text-[10px] font-medium text-primary" title="Sacada en espejo de otra pieza">espejo</span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold leading-snug" title={pieza.nombre}>{pieza.nombre}</h3>
          {pieza.categoria && <Chip className="shrink-0">{pieza.categoria}</Chip>}
        </div>
        <div className="text-xs text-muted-foreground">
          {rangoTallas}
          {medidaMayor && ' · hasta ' + medidaMayor.anchoCm + '×' + medidaMayor.altoCm + ' cm'}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-faint-foreground">
          <span>{faltanPiquetes ? 'sin piquetes en alguna talla' : piquetesPorTalla + (piquetesPorTalla === 1 ? ' piquete' : ' piquetes') + ' por talla'}</span>
          {pieza.tela && <span>· {pieza.tela}</span>}
        </div>
        {tallas.length > 1 && (
          <div className="flex flex-wrap gap-1">
            {tallas.map((t) => (
              <span
                key={t}
                title={t.toUpperCase() + ': ' + pieza.dimensionesPorTalla[t].anchoCm + '×' + pieza.dimensionesPorTalla[t].altoCm + ' cm'}
                className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground"
              >
                {t}
              </span>
            ))}
          </div>
        )}
        <div className="mt-auto pt-1 text-xs text-faint-foreground">
          {rol
            ? 'Rol: ' + rol + (usadaEn.length > 1 ? ' · también en ' + (usadaEn.length - 1) + ' prenda' + (usadaEn.length > 2 ? 's' : '') + ' más' : '')
            : usadaEn.length === 0 ? 'Sin usar en ninguna prenda' : 'En: ' + usadaEn.join(', ')}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 border-t border-border px-2 py-1.5">
        <Boton variante={editando ? 'acento' : 'fantasma'} tamano="sm" onClick={() => setEditando((v) => !v)}>
          {editando ? 'Cerrar' : 'Editar'}
        </Boton>
        <Boton
          variante={mostrandoVersiones ? 'acento' : 'fantasma'}
          tamano="sm"
          title={(pieza.versiones?.length || 1) + ((pieza.versiones?.length || 1) === 1 ? ' versión' : ' versiones')}
          onClick={() => setMostrandoVersiones((v) => !v)}
        >
          Historial
        </Boton>
        <Boton variante={reemplazando ? 'acento' : 'fantasma'} tamano="sm" onClick={() => setReemplazando((v) => !v)}>
          {reemplazando ? 'Cancelar' : 'Reemplazar'}
        </Boton>
        <Boton variante={espejando ? 'acento' : 'fantasma'} tamano="sm" onClick={() => { setEspejando((v) => !v); setCreadaEnEspejo(null); }}
          title="Crea otra pieza igual pero reflejada (izquierda ↔ derecha), para darle su propio diseño sin importar otro archivo.">
          {espejando ? 'Cancelar' : 'Espejo'}
        </Boton>
        {puedeReprocesar && (
          <Boton variante="fantasma" tamano="sm" onClick={reprocesar} disabled={reprocesando} title="Vuelve a leer el archivo original guardado y recalcula contorno y piquetes de cada talla. Si no coincide con las medidas guardadas, no toca nada. Crea una versión nueva.">
            {reprocesando ? 'Recalculando…' : 'Reprocesar'}
          </Boton>
        )}
      </div>

      {expandida && (
        <div className="flex flex-col gap-3 border-t border-border p-4">
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

      {espejando && (
        <PanelEspejo
          pieza={pieza}
          onCancelar={() => setEspejando(false)}
          onCreada={(nueva) => { setEspejando(false); setCreadaEnEspejo(nueva.nombre); onCambio(); }}
        />
      )}
      {creadaEnEspejo && (
        <Aviso tono="info">
          Listo: se creó «{creadaEnEspejo}», reflejada, en todas las tallas. Ya está en la Biblioteca (abajo, en
          Todas las piezas). Para usarla, sumala a la prenda con «Editar prenda» y dale su rol (ej. la manga del
          otro lado); después le ponés su propio diseño en Diseño.{' '}
          <button type="button" className="underline" onClick={() => setCreadaEnEspejo(null)}>Cerrar</button>
        </Aviso>
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
          <Boton variante="fantasma" tamano="sm" className="ml-auto text-danger" onClick={onBorrar}>Eliminar pieza</Boton>
        </div>
      )}
        </div>
      )}
    </article>
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
  const [prendaAbierta, setPrendaAbierta] = useState(null); // id de la prenda desplegada
  const [creandoPrenda, setCreandoPrenda] = useState(false);
  const [editandoPrenda, setEditandoPrenda] = useState(null); // id
  // Sin esto, la PRIMERA vez que se visita esta pestaña en la sesión (o
  // después de cualquier reload de página, que resetea qué apartados ya se
  // visitaron -- ver App.jsx) el "Todavía no hay ninguna" de más abajo
  // salía mientras el fetch todavía estaba en vuelo -- indistinguible de un
  // vacío real, y el usuario lo vivía como "se demora en cargar/actualizar
  // el apartado" (más aún si el backend gratis estaba dormido, hasta un
  // minuto para despertar).
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(null);

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
    const [ps, gs, prods] = await Promise.all([obtener('piezas'), obtener('grupos'), obtener('productos')]);
    setPiezas(ps);
    setGrupos(gs);
    setProductos(prods);
  }

  async function recargar() {
    setCargando(true);
    setErrorCarga(null);
    try {
      await actualizarDatos();
    } catch (e) {
      setErrorCarga(e.message);
    } finally {
      setCargando(false);
    }
  }

  // La primera vez, con "Cargando…"; después (cuando otra pantalla avisa un
  // cambio), en silencio: la lista se queda a la vista y se actualiza sola,
  // en vez de desaparecer detrás de un "Cargando…" en cada guardado.
  const yaCargo = useRef(false);
  useEffect(() => {
    if (!yaCargo.current) {
      yaCargo.current = true;
      recargar();
    } else {
      actualizarDatos().catch(() => {});
    }
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
      // grupoIds (kit multi-prenda) o el viejo grupoId singular -- un
      // producto que usa esta pieza en CUALQUIERA de sus prendas combinadas
      // tiene que aparecer acá igual.
      const idsGrupos = producto.grupoIds || (producto.grupoId ? [producto.grupoId] : []);
      const gruposDelProducto = idsGrupos.map((id) => grupos.find((g) => g.id === id)).filter(Boolean);
      for (const grupo of gruposDelProducto) {
        for (const gp of grupo.piezas) {
          if (!mapa[gp.piezaId]) mapa[gp.piezaId] = [];
          if (!mapa[gp.piezaId].includes(producto)) mapa[gp.piezaId].push(producto);
        }
      }
    }
    return mapa;
  }, [productos, grupos]);

  function productosDeGrupo(grupoId) {
    return productos.filter((p) => (p.grupoIds || (p.grupoId ? [p.grupoId] : [])).includes(grupoId));
  }

  const busquedaNormal = busqueda.trim().toLowerCase();
  const piezaCoincide = (p) =>
    (!filtroCategoria || p.categoria === filtroCategoria) &&
    (!busquedaNormal || p.nombre.toLowerCase().includes(busquedaNormal));

  // TODAS las piezas, también las que ya son parte de una prenda: así se ven
  // y se pueden reutilizar en otra. Cada tarjeta dice en qué prendas está.
  const piezasVisibles = piezas.filter(piezaCoincide);
  const prendasVisibles = grupos.filter((g) => {
    const suyas = g.piezas.map((gp) => piezas.find((p) => p.id === gp.piezaId)).filter(Boolean);
    if (busquedaNormal && g.nombre.toLowerCase().includes(busquedaNormal) && !filtroCategoria) return true;
    return suyas.some(piezaCoincide);
  });

  // Borrar es optimista: desaparece de la pantalla en el acto y el servidor
  // se entera por detrás. Si falla, vuelve a aparecer y sale un aviso abajo
  // a la derecha (ver datos/index.js·borrarRegistro).
  async function borrar(id) {
    const pieza = piezas.find((p) => p.id === id);
    setPiezas((prev) => prev.filter((p) => p.id !== id));
    await borrarRegistro('piezas', id, () => eliminarPieza(id), 'la pieza "' + (pieza?.nombre || '') + '"');
    await actualizarDatos().catch(() => {});
    onCambio?.();
  }

  // Borra la prenda y, si se pide, también sus piezas -- salvo las que use
  // otra prenda, que se quedan (borrarlas rompería esa otra prenda).
  async function borrarPrenda(grupo, conPiezas) {
    const usadasEnOtras = new Set(
      grupos.filter((g) => g.id !== grupo.id).flatMap((g) => g.piezas.map((gp) => gp.piezaId))
    );
    const piezasABorrar = conPiezas
      ? grupo.piezas.map((gp) => gp.piezaId).filter((id) => !usadasEnOtras.has(id))
      : [];
    setPrendaAbierta(null);
    setGrupos((prev) => prev.filter((g) => g.id !== grupo.id));
    if (piezasABorrar.length > 0) setPiezas((prev) => prev.filter((p) => !piezasABorrar.includes(p.id)));

    const prendaBorrada = await borrarRegistro(
      'grupos', grupo.id, () => eliminarGrupo(grupo.id), 'la prenda "' + grupo.nombre + '"'
    );
    // Si la prenda no se pudo borrar, sus piezas tampoco se tocan.
    if (prendaBorrada) {
      await Promise.all(
        piezasABorrar.map((id) =>
          borrarRegistro('piezas', id, () => eliminarPieza(id), 'una pieza de "' + grupo.nombre + '"')
        )
      );
    }
    await actualizarDatos().catch(() => {});
    onCambio?.();
  }

  function tarjetaDePieza(p, rol) {
    return (
      <FilaPieza
        key={p.id + (rol || '')}
        pieza={p}
        rol={rol}
        usadaEn={usadaEnPorPieza[p.id] || []}
        productosQueLaUsan={productosPorPieza[p.id] || []}
        onCambio={() => { actualizarDatos(); onCambio?.(); }}
        onBorrar={() => borrar(p.id)}
      />
    );
  }

  // Crear o editar una prenda (FormularioPrenda):
  // la prenda guardada entra a la lista en el acto y queda abierta.
  function alGuardarPrenda(guardada) {
    setGrupos((prev) =>
      prev.some((g) => g.id === guardada.id) ? prev.map((g) => (g.id === guardada.id ? guardada : g)) : [...prev, guardada]
    );
    setCreandoPrenda(false);
    setEditandoPrenda(null);
    setPrendaAbierta(guardada.id);
    onCambio?.();
  }

  const nada = prendasVisibles.length === 0 && piezasVisibles.length === 0;

  return (
    <div className="pagina flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Biblioteca</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Las prendas con sus piezas, y abajo todas las piezas (también las que ya están en una
          prenda, para reutilizarlas en otra). Reprocesar o reemplazar la moldería
          de una pieza crea una versión nueva -- si alguna producción ya guardada la usa, se pregunta cuál
          pasa a la versión nueva y cuál se queda en la que tenía.
        </p>
      </div>

      {piezas.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar prenda o pieza…"
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
            {grupos.length} {grupos.length === 1 ? 'prenda' : 'prendas'} · {piezas.length} {piezas.length === 1 ? 'pieza' : 'piezas'}
          </span>
          {!creandoPrenda && (
            <Boton variante="acento" tamano="sm" className="ml-auto" onClick={() => setCreandoPrenda(true)}>
              + Nueva prenda
            </Boton>
          )}
        </div>
      )}

      {creandoPrenda && (
        <FormularioPrenda piezas={piezas} onGuardado={alGuardarPrenda} onCancelar={() => setCreandoPrenda(false)} />
      )}

      {cargando ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : errorCarga ? (
        <ErrorCarga mensaje={errorCarga} onReintentar={recargar} />
      ) : nada ? (
        <p className="text-sm text-muted-foreground">
          {piezas.length === 0 ? 'Todavía no hay ninguna — subí una en "Subir piezas".' : 'Nada coincide con el filtro.'}
        </p>
      ) : (
        <>
          {prendasVisibles.length > 0 && (
            <section className="flex flex-col gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-faint-foreground">
                Prendas · {prendasVisibles.length}
              </h3>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4">
                {prendasVisibles.map((g) =>
                  g.id === editandoPrenda ? (
                    <FormularioPrenda
                      key={g.id}
                      grupo={g}
                      piezas={piezas}
                      onGuardado={alGuardarPrenda}
                      onCancelar={() => setEditandoPrenda(null)}
                    />
                  ) : g.id === prendaAbierta ? (
                    <PrendaAbierta
                      key={g.id}
                      grupo={g}
                      piezas={piezas}
                      productos={productosDeGrupo(g.id)}
                      onEditar={() => setEditandoPrenda(g.id)}
                      onCerrar={() => setPrendaAbierta(null)}
                      onBorrar={(conPiezas) => borrarPrenda(g, conPiezas)}
                      tarjetaDePieza={tarjetaDePieza}
                    />
                  ) : (
                    <TarjetaPrenda
                      key={g.id}
                      grupo={g}
                      piezas={piezas}
                      onAbrir={() => setPrendaAbierta(g.id)}
                    />
                  )
                )}
              </div>
            </section>
          )}

          {piezasVisibles.length > 0 && (
            <section className="flex flex-col gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-faint-foreground">
                Todas las piezas · {piezasVisibles.length}
              </h3>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4">
                {piezasVisibles.map((p) => tarjetaDePieza(p))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function tallasDeGrupo(grupo, piezas) {
  const tallas = new Set();
  for (const gp of grupo.piezas) {
    const pieza = piezas.find((p) => p.id === gp.piezaId);
    if (pieza && !pieza.tallaUnica) Object.keys(pieza.dimensionesPorTalla || {}).forEach((t) => tallas.add(t));
  }
  return ordenarTallasNatural([...tallas]);
}

// Tarjeta de una prenda: un mosaico con las primeras piezas y, al abrirla,
// sus piezas completas (PrendaAbierta).
function TarjetaPrenda({ grupo, piezas, onAbrir }) {
  const suyas = grupo.piezas.map((gp) => piezas.find((p) => p.id === gp.piezaId));
  const tallas = tallasDeGrupo(grupo, piezas);
  const faltan = suyas.filter((p) => !p).length;
  return (
    <article
      onClick={onAbrir}
      className="flex cursor-pointer flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm transition-[border-color,box-shadow] hover:border-primary/40 hover:shadow-md"
    >
      <div className="grid aspect-[4/3] grid-cols-2 grid-rows-2 gap-px border-b border-border bg-border">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="relative bg-surface-muted">
            {suyas[i] && (
              <div className="absolute inset-2.5">
                <TrazosPreview geometriaPorTalla={suyas[i].geometriaPorTalla || {}} fluido />
              </div>
            )}
            {i === 3 && suyas.length > 4 && (
              <span className="absolute bottom-1.5 right-1.5 rounded-md bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                +{suyas.length - 4}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h3 className="font-semibold leading-snug">{grupo.nombre}</h3>
        <div className="text-xs text-muted-foreground">
          {grupo.piezas.length} {grupo.piezas.length === 1 ? 'pieza' : 'piezas'}
          {tallas.length > 0 && ' · ' + tallas.length + ' tallas · ' + tallas[0].toUpperCase() + ' – ' + tallas[tallas.length - 1].toUpperCase()}
        </div>
        {faltan > 0 && <div className="text-xs text-danger">{faltan} pieza{faltan === 1 ? '' : 's'} borrada{faltan === 1 ? '' : 's'} de la biblioteca</div>}
        <div className="mt-auto pt-1 text-xs text-primary">Ver piezas →</div>
      </div>
    </article>
  );
}

function PrendaAbierta({ grupo, piezas, productos, onEditar, onCerrar, onBorrar, tarjetaDePieza }) {
  const [confirmando, setConfirmando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState(null);
  const tallas = tallasDeGrupo(grupo, piezas);

  async function borrar(conPiezas) {
    setBorrando(true);
    setError(null);
    try {
      await onBorrar(conPiezas);
    } catch (e) {
      setError(e.message);
      setBorrando(false);
    }
  }

  return (
    <section className="col-span-full flex flex-col gap-4 rounded-xl border border-primary/40 bg-surface/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{grupo.nombre}</h3>
          <div className="text-xs text-muted-foreground">
            {grupo.piezas.length} {grupo.piezas.length === 1 ? 'pieza' : 'piezas'}
            {tallas.length > 0 && ' · tallas ' + tallas.map((t) => t.toUpperCase()).join(' ')}
            {productos.length > 0 && ' · usada en ' + productos.length + (productos.length === 1 ? ' producción' : ' producciones')}
          </div>
        </div>
        <div className="flex gap-1">
          <Boton variante="fantasma" tamano="sm" onClick={onEditar}>Editar prenda</Boton>
          <Boton variante="fantasma" tamano="sm" className="text-danger" onClick={() => setConfirmando((v) => !v)}>
            Eliminar prenda
          </Boton>
          <Boton tamano="sm" onClick={onCerrar}>Cerrar</Boton>
        </div>
      </div>

      {confirmando && (
        <div className="flex flex-col gap-2 rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
          <span>
            ¿Eliminar «{grupo.nombre}»?
            {productos.length > 0 &&
              ' La usan ' + productos.length + (productos.length === 1 ? ' producción' : ' producciones') +
                ' (' + productos.map((p) => p.nombre).join(', ') + '), que van a dejar de funcionar.'}{' '}
            Esto no se puede deshacer.
          </span>
          <div className="flex flex-wrap gap-2">
            <Boton variante="peligro" tamano="sm" disabled={borrando} onClick={() => borrar(true)}>
              {borrando ? 'Eliminando…' : 'Eliminar prenda y sus piezas'}
            </Boton>
            <Boton tamano="sm" disabled={borrando} onClick={() => borrar(false)}>Solo la prenda (dejar las piezas)</Boton>
            <Boton variante="fantasma" tamano="sm" disabled={borrando} onClick={() => setConfirmando(false)}>Cancelar</Boton>
          </div>
          <span className="text-xs opacity-80">Las piezas que use otra prenda no se borran nunca.</span>
          {error && <span className="text-xs">{error}</span>}
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4">
        {grupo.piezas.map((gp) => {
          const pieza = piezas.find((p) => p.id === gp.piezaId);
          return pieza ? (
            tarjetaDePieza(pieza, gp.rol)
          ) : (
            <div key={gp.piezaId + gp.rol} className="rounded-xl border border-dashed border-danger/40 p-4 text-sm text-danger">
              {gp.rol}: pieza borrada de la biblioteca
            </div>
          );
        })}
      </div>
    </section>
  );
}
