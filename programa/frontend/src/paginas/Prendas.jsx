import { useEffect, useState } from 'react';
import { listarGrupos, listarPiezas, eliminarGrupo, editarGrupo } from '../api.js';
import { Boton, Tarjeta, Chip, Campo, Input, Select, Aviso } from '../componentes/ui.jsx';
import { TrazosPreview } from '../componentes/TrazosPreview.jsx';
import { ordenarTallasNatural } from '../constantes.js';

function tallasDe(grupo, piezas) {
  const tallas = new Set();
  for (const gp of grupo.piezas) {
    const pieza = piezas.find((p) => p.id === gp.piezaId);
    Object.keys(pieza?.dimensionesPorTalla || {}).forEach((t) => tallas.add(t));
  }
  return ordenarTallasNatural([...tallas]);
}

function TarjetaPrenda({ grupo, piezas, onAbrir, onBorrar }) {
  const piezasReales = grupo.piezas.map((gp) => ({ ...gp, pieza: piezas.find((p) => p.id === gp.piezaId) }));

  return (
    <Tarjeta className="flex cursor-pointer flex-col gap-3 transition-colors hover:border-primary/40" onClick={onAbrir}>
      <div className="grid grid-cols-2 gap-1.5">
        {piezasReales.slice(0, 4).map((gp, i) => (
          <TrazosPreview key={i} geometriaPorTalla={gp.pieza?.geometriaPorTalla || {}} size={64} />
        ))}
      </div>
      <div>
        <div className="font-medium">{grupo.nombre}</div>
        <div className="text-xs text-muted-foreground">
          {grupo.piezas.length} pieza{grupo.piezas.length === 1 ? '' : 's'}
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {tallasDe(grupo, piezas).length === 0 ? (
          <span className="text-xs text-faint-foreground">sin tallas cargadas</span>
        ) : (
          tallasDe(grupo, piezas).map((t) => <Chip key={t} className="uppercase">{t}</Chip>)
        )}
      </div>
      <div onClick={(e) => e.stopPropagation()}>
        <Boton variante="fantasma" tamano="sm" onClick={onBorrar}>Eliminar</Boton>
      </div>
    </Tarjeta>
  );
}

function filaDesde(gp) {
  return { id: crypto.randomUUID(), rol: gp.rol, piezaId: gp.piezaId };
}

// Edita nombre y/o roles de una prenda ya guardada. No hay chequeo automático
// de qué Producto ya ancló contra un rol puntual -- si se renombra o se
// borra un rol que un Producto ya usa, el próximo cálculo de anclaje de ese
// Producto deja de encontrar esa geometría (ver el comentario en
// rutas/api.js·PUT /grupos/:id). Por eso el aviso vive acá, en el momento en
// que el usuario está por tocar eso, no escondido en la documentación.
function EditorPrenda({ grupo, piezas, onGuardado, onCancelar }) {
  const [nombre, setNombre] = useState(grupo.nombre);
  const [filas, setFilas] = useState(grupo.piezas.map(filaDesde));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const rolesOriginales = new Set(grupo.piezas.map((gp) => gp.rol));

  function actualizarFila(id, cambios) {
    setFilas((prev) => prev.map((f) => (f.id === id ? { ...f, ...cambios } : f)));
  }

  function quitarFila(id) {
    setFilas((prev) => prev.filter((f) => f.id !== id));
  }

  function agregarFila() {
    setFilas((prev) => [...prev, { id: crypto.randomUUID(), rol: '', piezaId: '' }]);
  }

  const rolesTocados = filas.filter((f) => f.rol.trim() && !rolesOriginales.has(f.rol.trim()));
  const rolesQueDesaparecen = [...rolesOriginales].filter((r) => !filas.some((f) => f.rol.trim() === r));
  const hayCambioDeRoles = rolesTocados.length > 0 || rolesQueDesaparecen.length > 0;

  async function guardar() {
    setError(null);
    const piezasFinales = filas
      .filter((f) => f.rol.trim() && f.piezaId)
      .map((f) => ({ rol: f.rol.trim(), piezaId: f.piezaId }));
    if (!nombre.trim()) return setError('Falta el nombre de la prenda.');
    if (piezasFinales.length === 0) return setError('Una prenda necesita al menos una pieza con rol.');
    setGuardando(true);
    try {
      await editarGrupo(grupo.id, { nombre: nombre.trim(), piezas: piezasFinales });
      onGuardado();
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Campo etiqueta="Nombre de la prenda">
        <Input value={nombre} onChange={(e) => setNombre(e.target.value)} className="max-w-[280px]" />
      </Campo>

      <div className="flex flex-col gap-2">
        {filas.map((f) => (
          <div key={f.id} className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Rol (ej. Manga izquierda)"
              value={f.rol}
              onChange={(e) => actualizarFila(f.id, { rol: e.target.value })}
              className="max-w-[220px]"
            />
            <Select value={f.piezaId} onChange={(e) => actualizarFila(f.id, { piezaId: e.target.value })} className="max-w-[240px]">
              <option value="">— Elegir pieza de biblioteca —</option>
              {piezas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </Select>
            <Boton variante="fantasma" tamano="sm" type="button" onClick={() => quitarFila(f.id)}>Quitar</Boton>
          </div>
        ))}
      </div>
      <div>
        <Boton type="button" tamano="sm" onClick={agregarFila}>+ Agregar pieza</Boton>
      </div>

      {hayCambioDeRoles && (
        <Aviso tono="error">
          Estás {rolesQueDesaparecen.length > 0 ? 'borrando o renombrando' : 'agregando'} roles
          {rolesQueDesaparecen.length > 0 && (' (' + rolesQueDesaparecen.join(', ') + ')')}. Si algún Producto ya
          armó su anclaje contra ese rol, va a dejar de encontrar esa geometría la próxima vez que se calcule.
        </Aviso>
      )}
      {error && <Aviso tono="error">{error}</Aviso>}

      <div className="flex gap-2">
        <Boton variante="primario" type="button" onClick={guardar} disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </Boton>
        <Boton variante="fantasma" type="button" onClick={onCancelar} disabled={guardando}>Cancelar</Boton>
      </div>
    </div>
  );
}

function DetallePrenda({ grupo, piezas, onVolver, onGuardado }) {
  const [editando, setEditando] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Boton variante="fantasma" tamano="sm" onClick={onVolver}>← Volver al catálogo</Boton>
        {!editando && <Boton tamano="sm" onClick={() => setEditando(true)}>Editar</Boton>}
      </div>

      {editando ? (
        <EditorPrenda
          grupo={grupo}
          piezas={piezas}
          onCancelar={() => setEditando(false)}
          onGuardado={() => {
            setEditando(false);
            onGuardado();
          }}
        />
      ) : (
        <>
          <div>
            <h2 className="text-lg font-semibold">{grupo.nombre}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {grupo.piezas.length} pieza{grupo.piezas.length === 1 ? '' : 's'} — tallas disponibles:{' '}
              {tallasDe(grupo, piezas).map((t) => t.toUpperCase()).join(', ') || 'ninguna cargada'}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {grupo.piezas.map((gp) => {
              const pieza = piezas.find((p) => p.id === gp.piezaId);
              return (
                <Tarjeta key={gp.piezaId + gp.rol} className="flex gap-3">
                  <TrazosPreview geometriaPorTalla={pieza?.geometriaPorTalla || {}} size={80} />
                  <div className="flex flex-col gap-1">
                    <div className="text-sm font-medium">{gp.rol}</div>
                    {!pieza ? (
                      <span className="text-xs text-danger">pieza eliminada de la biblioteca</span>
                    ) : (
                      <>
                        <div className="text-xs text-muted-foreground">{pieza.nombre}</div>
                        {pieza.categoria && <div className="text-xs text-faint-foreground">{pieza.categoria}</div>}
                        <div className="mt-1 flex flex-wrap gap-1">
                          {ordenarTallasNatural(Object.keys(pieza.dimensionesPorTalla || {})).map((t) => (
                            <Chip key={t}>{t.toUpperCase()}: {pieza.dimensionesPorTalla[t].anchoCm}×{pieza.dimensionesPorTalla[t].altoCm}cm</Chip>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </Tarjeta>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// El catálogo: cada prenda es una card (mosaico de sus piezas + tallas
// disponibles); entrar a una muestra el detalle real de qué piezas la
// forman, con su contorno real -- no una lista de texto plano.
export function Prendas({ recargarSenal }) {
  const [grupos, setGrupos] = useState([]);
  const [piezas, setPiezas] = useState([]);
  const [seleccionado, setSeleccionado] = useState(null);
  // Ver el comentario igual en Piezas.jsx: sin esto, la primera visita
  // muestra "Todavía no hay ninguna prenda armada" mientras el fetch sigue
  // en vuelo -- indistinguible de que de verdad no haya ninguna.
  const [cargando, setCargando] = useState(true);

  async function recargar() {
    setCargando(true);
    try {
      const [gs, ps] = await Promise.all([listarGrupos(), listarPiezas()]);
      setGrupos(gs);
      setPiezas(ps);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recargarSenal]);

  async function borrar(id) {
    await eliminarGrupo(id);
    if (seleccionado === id) setSeleccionado(null);
    await recargar();
  }

  const grupoAbierto = grupos.find((g) => g.id === seleccionado);

  if (grupoAbierto) {
    return (
      <div className="pagina">
        <DetallePrenda grupo={grupoAbierto} piezas={piezas} onVolver={() => setSeleccionado(null)} onGuardado={recargar} />
      </div>
    );
  }

  return (
    <div className="pagina flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Prendas</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          El catálogo de prendas armadas. Para crear una nueva, subí o elegí sus piezas en{' '}
          <strong>Subir piezas</strong>.
        </p>
      </div>

      {cargando ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : grupos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay ninguna prenda armada.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {grupos.map((g) => (
            <TarjetaPrenda
              key={g.id}
              grupo={g}
              piezas={piezas}
              onAbrir={() => setSeleccionado(g.id)}
              onBorrar={() => borrar(g.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
