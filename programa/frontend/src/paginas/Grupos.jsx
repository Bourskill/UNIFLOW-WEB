import { useCallback, useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  listarPiezas,
  listarGrupos,
  crearGrupo,
  eliminarGrupo,
  analizarTallaGrupo,
  confirmarTallaGrupo,
} from '../api.js';
import { TALLAS } from '../constantes.js';
import { Boton, Campo, Input, Select, Tarjeta, Chip, Aviso } from '../componentes/ui.jsx';

function rolVacio() {
  return { id: crypto.randomUUID(), nombre: '', modo: 'nueva', piezaId: '' };
}

function leerArchivoComoTexto(archivo) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(lector.result);
    lector.onerror = reject;
    lector.readAsText(archivo);
  });
}

// Cargar la geometría de UNA talla para un grupo entero: un solo archivo con
// todas las piezas juntas (así exporta de verdad un programa de diseño), que
// el backend reparte por nombre entre los roles del grupo.
function CargaTalla({ grupo, piezas, onCambio }) {
  const [talla, setTalla] = useState(TALLAS[2]);
  const [estado, setEstado] = useState('vacio');
  const [svgTexto, setSvgTexto] = useState(null);
  const [analisis, setAnalisis] = useState(null);
  const [asignacionesManual, setAsignacionesManual] = useState({});
  const [indiceReferencia, setIndiceReferencia] = useState('');
  const [anchoConocidoCm, setAnchoConocidoCm] = useState('');
  const [error, setError] = useState(null);

  const onDrop = useCallback(
    async (archivos) => {
      const archivo = archivos[0];
      if (!archivo) return;
      setEstado('analizando');
      setError(null);
      setAsignacionesManual({});
      try {
        const texto = await leerArchivoComoTexto(archivo);
        setSvgTexto(texto);
        const r = await analizarTallaGrupo(grupo.id, texto);
        setAnalisis(r);
        setEstado('listo');
      } catch (e) {
        setError(e.message);
        setEstado('error');
      }
    },
    [grupo.id]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/svg+xml': ['.svg'] },
    multiple: false,
  });

  function indiceAsignadoA(rol) {
    const automatico = analisis?.asignaciones.find((a) => a.rolAsignado === rol);
    if (automatico) return automatico.indice;
    return asignacionesManual[rol] !== undefined && asignacionesManual[rol] !== ''
      ? Number(asignacionesManual[rol])
      : null;
  }

  const necesitaEscala = analisis && !analisis.escalaConfirmada;
  const todosResueltos = analisis && grupo.piezas.every((gp) => indiceAsignadoA(gp.rol) != null);
  const puedeConfirmar =
    todosResueltos && (!necesitaEscala || (indiceReferencia !== '' && anchoConocidoCm));

  async function confirmar() {
    setError(null);
    const asignaciones = {};
    for (const gp of grupo.piezas) asignaciones[gp.rol] = indiceAsignadoA(gp.rol);
    try {
      const opciones = necesitaEscala
        ? { anchoConocidoCm: Number(anchoConocidoCm), indiceReferencia: Number(indiceReferencia) }
        : { mmPorUnidad: analisis.mmPorUnidad };
      await confirmarTallaGrupo(grupo.id, { svgTexto, talla, asignaciones, ...opciones });
      setEstado('vacio');
      setAnalisis(null);
      setSvgTexto(null);
      onCambio?.();
    } catch (e) {
      setError(e.message);
    }
  }

  function nombrePieza(id) {
    return piezas.find((p) => p.id === id)?.nombre;
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-muted p-4">
      <Campo etiqueta="Talla de este archivo" className="max-w-[140px]">
        <Select value={talla} onChange={(e) => setTalla(e.target.value)}>
          {TALLAS.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
      </Campo>

      {estado === 'vacio' && (
        <div
          {...getRootProps()}
          className={
            'cursor-pointer rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm ' +
            (isDragActive ? 'border-primary bg-primary-soft text-primary' : 'border-border text-faint-foreground')
          }
        >
          <input {...getInputProps()} />
          Arrastrá acá el archivo .svg de la talla {talla} — tiene que traer{' '}
          <strong>todas las piezas juntas</strong> ({grupo.piezas.map((gp) => gp.rol).join(', ')}), cada una
          nombrada.
        </div>
      )}

      {estado === 'analizando' && <p className="text-sm text-muted-foreground">Analizando archivo…</p>}
      {estado === 'error' && <Aviso tono="error">{error}</Aviso>}

      {estado === 'listo' && analisis && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            {grupo.piezas.map((gp) => {
              const indice = indiceAsignadoA(gp.rol);
              const automatico = analisis.asignaciones.find((a) => a.rolAsignado === gp.rol);
              return (
                <div key={gp.rol} className="flex items-center gap-2 text-sm">
                  <Chip tono={indice != null ? 'activo' : 'neutro'}>{gp.rol}</Chip>
                  {nombrePieza(gp.piezaId) !== gp.rol && (
                    <span className="text-xs text-faint-foreground">({nombrePieza(gp.piezaId)})</span>
                  )}
                  {automatico ? (
                    <span className="text-xs text-muted-foreground">
                      detectado automático: "{automatico.nombreDetectado}"
                    </span>
                  ) : (
                    <Select
                      className="max-w-[220px]"
                      value={asignacionesManual[gp.rol] ?? ''}
                      onChange={(e) =>
                        setAsignacionesManual((prev) => ({ ...prev, [gp.rol]: e.target.value }))
                      }
                    >
                      <option value="">— Elegir forma del archivo —</option>
                      {analisis.candidatos.map((c) => (
                        <option key={c.indice} value={c.indice}>
                          {c.nombre || 'forma sin nombre #' + c.indice}
                        </option>
                      ))}
                    </Select>
                  )}
                </div>
              );
            })}
          </div>

          {necesitaEscala && (
            <Aviso tono="info">
              Este SVG no declara una unidad física (mm/cm/in) — elegí una forma de referencia y
              decime cuánto mide de ancho en cm.
              <div className="mt-2 flex gap-2">
                <Select value={indiceReferencia} onChange={(e) => setIndiceReferencia(e.target.value)} className="max-w-[220px]">
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

          <div className="flex gap-2">
            <Boton variante="primario" onClick={confirmar} disabled={!puedeConfirmar}>
              Confirmar talla {talla}
            </Boton>
            <Boton variante="fantasma" onClick={() => { setEstado('vacio'); setAnalisis(null); }}>
              Cancelar
            </Boton>
          </div>
        </div>
      )}
    </div>
  );
}

export function Grupos({ recargarSenal, onCambio }) {
  const [piezas, setPiezas] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [nombre, setNombre] = useState('');
  const [roles, setRoles] = useState([rolVacio()]);
  const [grupoExpandido, setGrupoExpandido] = useState(null);
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

  function actualizarRol(id, cambios) {
    setRoles((prev) => prev.map((r) => (r.id === id ? { ...r, ...cambios } : r)));
  }

  function agregarRol() {
    setRoles((prev) => [...prev, rolVacio()]);
  }

  function quitarRol(id) {
    setRoles((prev) => prev.filter((r) => r.id !== id));
  }

  async function guardar(evento) {
    evento.preventDefault();
    setError(null);
    const rolesCompletos = roles.filter((r) => r.nombre.trim());
    if (!nombre.trim() || rolesCompletos.length === 0) {
      setError('Falta el nombre del grupo o no hay ningún rol con nombre.');
      return;
    }
    try {
      await crearGrupo({ nombre, roles: rolesCompletos });
      setNombre('');
      setRoles([rolVacio()]);
      await recargar();
      onCambio?.();
    } catch (e) {
      setError(e.message);
    }
  }

  async function borrar(id) {
    await eliminarGrupo(id);
    if (grupoExpandido === id) setGrupoExpandido(null);
    await recargar();
    onCambio?.();
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
    return [...tallas];
  }

  return (
    <div className="pagina flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Grupos</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Una prenda completa: definís qué roles la componen (Espalda, Manga izquierda...) y después
          subís <strong>un solo archivo por talla</strong> con todas las piezas juntas — igual que
          exporta un programa de diseño real. Reciclar una pieza entre grupos es elegirla de nuevo
          acá abajo.
        </p>
      </div>

      <Tarjeta as="form" onSubmit={guardar} className="flex max-w-2xl flex-col gap-4">
        <Campo etiqueta="Nombre del grupo">
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Remera básica" />
        </Campo>

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint-foreground">
            Roles (piezas que componen la prenda)
          </h3>
          <div className="flex flex-col gap-2">
            {roles.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2">
                <Input
                  placeholder="Rol (ej. Espalda)"
                  value={r.nombre}
                  onChange={(e) => actualizarRol(r.id, { nombre: e.target.value })}
                  className="max-w-[220px]"
                />
                <Select
                  value={r.modo}
                  onChange={(e) => actualizarRol(r.id, { modo: e.target.value, piezaId: '' })}
                  className="max-w-[160px]"
                >
                  <option value="nueva">Pieza nueva</option>
                  <option value="reciclada">Reciclar pieza existente</option>
                </Select>
                {r.modo === 'reciclada' && (
                  <Select
                    value={r.piezaId}
                    onChange={(e) => actualizarRol(r.id, { piezaId: e.target.value })}
                    className="max-w-[220px]"
                  >
                    <option value="">— Elegir pieza —</option>
                    {piezas.map((p) => (
                      <option key={p.id} value={p.id}>{p.nombre}</option>
                    ))}
                  </Select>
                )}
                {roles.length > 1 && (
                  <Boton variante="fantasma" tamano="sm" type="button" onClick={() => quitarRol(r.id)}>
                    Quitar
                  </Boton>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <Boton type="button" onClick={agregarRol}>+ Agregar rol</Boton>
          <Boton variante="primario" type="submit">Guardar grupo</Boton>
        </div>
        {error && <Aviso tono="error">{error}</Aviso>}
      </Tarjeta>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint-foreground">
          Grupos cargados
        </h3>
        {grupos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay ninguno.</p>
        ) : (
          <div className="flex max-w-2xl flex-col gap-2">
            {grupos.map((g) => (
              <div key={g.id} className="rounded-lg border border-border bg-surface">
                <div className="flex items-center gap-3 px-4 py-3">
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
                  <Boton
                    variante="secundario"
                    tamano="sm"
                    onClick={() => setGrupoExpandido(grupoExpandido === g.id ? null : g.id)}
                  >
                    {grupoExpandido === g.id ? 'Cerrar' : 'Cargar talla'}
                  </Boton>
                  <Boton variante="fantasma" tamano="sm" onClick={() => borrar(g.id)}>Eliminar</Boton>
                </div>
                {grupoExpandido === g.id && (
                  <div className="border-t border-border p-4">
                    <CargaTalla grupo={g} piezas={piezas} onCambio={recargar} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
