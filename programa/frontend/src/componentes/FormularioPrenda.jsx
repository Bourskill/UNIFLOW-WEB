import { useMemo, useState } from 'react';
import { crearGrupo, editarGrupo } from '../api.js';
import { confirmarGuardado } from '../datos/index.js';
import { ordenarTallasNatural } from '../constantes.js';
import { Boton, Campo, Input, Aviso } from './ui.jsx';
import { TrazosPreview } from './TrazosPreview.jsx';

function tallasDe(pieza) {
  return pieza && !pieza.tallaUnica ? ordenarTallasNatural(Object.keys(pieza.dimensionesPorTalla || {})) : [];
}

// Un rol libre para la pieza: su nombre, y si ya está usado (la misma pieza
// dos veces, ej. manga izquierda y derecha) se numera: "MANGA 2".
function rolLibre(base, filas) {
  const usados = new Set(filas.map((f) => f.rol.trim().toLowerCase()));
  if (!usados.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) if (!usados.has((base + ' ' + n).toLowerCase())) return base + ' ' + n;
}

/**
 * Crear o editar una prenda desde la Biblioteca ("+ Nueva prenda" y
 * "Editar prenda"). Se eligen piezas de la biblioteca haciendo clic en su tarjeta
 * (la misma pieza puede ir dos veces con roles distintos, ej. mangas
 * izquierda y derecha) y cada una lleva su rol -- la llave contra la que
 * después se ancla el diseño.
 *
 * @param {object} props
 * @param {object} [props.grupo]  la prenda a editar; sin esto, se crea una nueva
 * @param {object[]} props.piezas  la biblioteca completa
 * @param {(grupo: object) => void} props.onGuardado  con la prenda como quedó en el servidor
 * @param {() => void} props.onCancelar
 */
export function FormularioPrenda({ grupo, piezas, onGuardado, onCancelar }) {
  const editando = !!grupo;
  const [nombre, setNombre] = useState(grupo?.nombre || '');
  const [filas, setFilas] = useState(() =>
    (grupo?.piezas || []).map((gp) => ({ id: crypto.randomUUID(), piezaId: gp.piezaId, rol: gp.rol }))
  );
  const [busqueda, setBusqueda] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const piezaPorId = useMemo(() => new Map(piezas.map((p) => [p.id, p])), [piezas]);
  const vecesElegida = useMemo(() => {
    const m = new Map();
    for (const f of filas) m.set(f.piezaId, (m.get(f.piezaId) || 0) + 1);
    return m;
  }, [filas]);

  const disponibles = piezas.filter(
    (p) => !busqueda.trim() || p.nombre.toLowerCase().includes(busqueda.trim().toLowerCase())
  );

  function agregar(pieza) {
    setFilas((prev) => [...prev, { id: crypto.randomUUID(), piezaId: pieza.id, rol: rolLibre(pieza.nombre, prev) }]);
  }
  function quitar(id) {
    setFilas((prev) => prev.filter((f) => f.id !== id));
  }
  function cambiarRol(id, rol) {
    setFilas((prev) => prev.map((f) => (f.id === id ? { ...f, rol } : f)));
  }

  // Validaciones
  const conteoRoles = {};
  for (const f of filas) {
    const r = f.rol.trim().toLowerCase();
    if (r) conteoRoles[r] = (conteoRoles[r] || 0) + 1;
  }
  const rolRepetido = (f) => conteoRoles[f.rol.trim().toLowerCase()] > 1;
  const pendientes = [];
  if (!nombre.trim()) pendientes.push('nombre de la prenda');
  if (filas.length === 0) pendientes.push('al menos una pieza');
  if (filas.some((f) => !f.rol.trim())) pendientes.push('rol en todas las piezas');
  if (filas.some(rolRepetido)) pendientes.push('roles repetidos');

  // Tallas que no comparten todas las piezas (las de talla única no cuentan):
  // no bloquea -- puede ser a propósito --, pero conviene verlo.
  const conjuntos = filas.map((f) => tallasDe(piezaPorId.get(f.piezaId))).filter((t) => t.length > 0);
  const tallasDispares = new Set(conjuntos.map((t) => t.join('|'))).size > 1;

  // Al editar: roles que desaparecen o cambian rompen el anclaje de un
  // Producto que ya ancló contra ellos (ver rutas/api.js·PUT /grupos/:id).
  const rolesOriginales = new Set((grupo?.piezas || []).map((gp) => gp.rol));
  const rolesQueDesaparecen = [...rolesOriginales].filter((r) => !filas.some((f) => f.rol.trim() === r));

  async function guardar() {
    if (pendientes.length > 0) return;
    setGuardando(true);
    setError(null);
    const datos = { nombre: nombre.trim(), piezas: filas.map((f) => ({ piezaId: f.piezaId, rol: f.rol.trim() })) };
    try {
      const guardado = editando ? await editarGrupo(grupo.id, datos) : await crearGrupo(datos);
      confirmarGuardado('grupos', guardado);
      onGuardado(guardado);
    } catch (e) {
      setError(e.message);
      setGuardando(false);
    }
  }

  return (
    <div className="col-span-full flex flex-col gap-5 rounded-xl border border-primary/40 bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Campo etiqueta={editando ? 'Nombre de la prenda' : 'Nueva prenda'} className="w-full max-w-[340px]">
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. Camiseta cuello V"
            autoFocus={!editando}
          />
        </Campo>
        <div className="flex gap-2">
          <Boton variante="primario" type="button" onClick={guardar} disabled={guardando || pendientes.length > 0}>
            {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear prenda'}
          </Boton>
          <Boton variante="fantasma" type="button" onClick={onCancelar} disabled={guardando}>Cancelar</Boton>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {/* Lo elegido, con su rol */}
        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-faint-foreground">
            Piezas de la prenda · {filas.length}
          </h4>
          {filas.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-faint-foreground">
              Hacé clic en las piezas de la biblioteca para sumarlas.
            </p>
          ) : (
            filas.map((f) => {
              const pieza = piezaPorId.get(f.piezaId);
              return (
                <div key={f.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface-muted/50 p-2">
                  <div className="relative h-11 w-11 shrink-0 rounded-md bg-surface-muted">
                    <div className="absolute inset-1">
                      <TrazosPreview geometriaPorTalla={pieza?.geometriaPorTalla || {}} fluido />
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Input
                      value={f.rol}
                      onChange={(e) => cambiarRol(f.id, e.target.value)}
                      placeholder="Rol (ej. Manga izquierda)"
                      aria-label="Rol en la prenda"
                      className={'py-1.5 ' + (rolRepetido(f) ? 'border-danger' : '')}
                    />
                    <span className="truncate text-[11px] text-faint-foreground">
                      {pieza ? pieza.nombre : 'pieza borrada de la biblioteca'}
                      {rolRepetido(f) && <span className="text-danger"> · rol repetido</span>}
                    </span>
                  </div>
                  <Boton variante="fantasma" tamano="sm" type="button" onClick={() => quitar(f.id)} aria-label="Quitar">✕</Boton>
                </div>
              );
            })
          )}
        </div>

        {/* La biblioteca para elegir */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-faint-foreground">Biblioteca</h4>
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar pieza…"
              className="max-w-[200px] py-1.5"
            />
          </div>
          <div className="grid max-h-[420px] grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2 overflow-y-auto pr-1">
            {disponibles.map((p) => {
              const veces = vecesElegida.get(p.id) || 0;
              const tallas = tallasDe(p);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => agregar(p)}
                  title={veces > 0 ? 'Ya está ' + veces + (veces === 1 ? ' vez' : ' veces') + ' -- clic para sumarla otra vez' : 'Sumar a la prenda'}
                  className={
                    'relative flex cursor-pointer flex-col overflow-hidden rounded-lg border text-left transition-colors ' +
                    (veces > 0 ? 'border-primary/60 bg-primary-soft/40' : 'border-border hover:border-primary/40')
                  }
                >
                  <div className="relative aspect-[4/3] bg-surface-muted">
                    <div className="absolute inset-2">
                      <TrazosPreview geometriaPorTalla={p.geometriaPorTalla || {}} fluido />
                    </div>
                    {veces > 0 && (
                      <span className="absolute right-1.5 top-1.5 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                        ✓{veces > 1 ? ' ' + veces : ''}
                      </span>
                    )}
                  </div>
                  <div className="px-2 py-1.5">
                    <div className="truncate text-xs font-medium">{p.nombre}</div>
                    <div className="text-[10px] text-faint-foreground">
                      {p.tallaUnica || tallas.length <= 1 ? 'talla única' : tallas.length + ' tallas'}
                    </div>
                  </div>
                </button>
              );
            })}
            {disponibles.length === 0 && (
              <p className="col-span-full text-sm text-faint-foreground">
                {piezas.length === 0 ? 'La biblioteca está vacía -- subí piezas primero.' : 'Ninguna pieza coincide.'}
              </p>
            )}
          </div>
        </div>
      </div>

      {tallasDispares && (
        <Aviso tono="info">
          Las piezas elegidas no tienen las mismas tallas -- en Producción solo se van a poder pedir las
          tallas que tengan todas.
        </Aviso>
      )}
      {editando && rolesQueDesaparecen.length > 0 && (
        <Aviso tono="error">
          Cambiaste o quitaste roles ({rolesQueDesaparecen.join(', ')}). Si alguna producción ya ancló su diseño
          contra ellos, va a dejar de encontrar esa pieza.
        </Aviso>
      )}
      {pendientes.length > 0 && (filas.length > 0 || nombre) && (
        <span className="text-xs text-faint-foreground">Falta: {pendientes.join(' · ')}</span>
      )}
      {error && <Aviso tono="error">{error}</Aviso>}
    </div>
  );
}
