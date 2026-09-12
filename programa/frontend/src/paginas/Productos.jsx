import { useEffect, useState } from 'react';
import { listarGrupos, listarDisenos, listarProductos, crearProducto, eliminarProducto } from '../api.js';
import { TALLAS } from '../constantes.js';
import { Boton, Campo, Input, Select, Tarjeta, Aviso } from '../componentes/ui.jsx';

function elementoVacio(piezaNombre) {
  return {
    id: crypto.randomUUID(),
    piezaNombre,
    tipo: 'nombre',
    posicion: { xCm: 5, yCm: 15 },
    modoEscalado: 'proporcional',
    // "A esta talla, la letra mide referenciaProporcional.altoCm" — sin esto
    // no hay contra qué comparar el crecimiento de la pieza en otras tallas.
    tallaReferencia: 'M',
    referenciaProporcional: { altoCm: 5 },
    colorHex: '#ffffff',
  };
}

export function Productos({ recargarSenal, onCambio }) {
  const [grupos, setGrupos] = useState([]);
  const [disenos, setDisenos] = useState([]);
  const [productos, setProductos] = useState([]);
  const [nombre, setNombre] = useState('');
  const [grupoId, setGrupoId] = useState('');
  const [disenoId, setDisenoId] = useState('');
  const [elementos, setElementos] = useState([]);
  const [error, setError] = useState(null);

  async function recargar() {
    const [gs, ds, ps] = await Promise.all([listarGrupos(), listarDisenos(), listarProductos()]);
    setGrupos(gs);
    setDisenos(ds);
    setProductos(ps);
    if (gs.length > 0 && !grupoId) setGrupoId(gs[0].id);
  }

  useEffect(() => {
    recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recargarSenal]);

  const grupoSeleccionado = grupos.find((g) => g.id === grupoId);
  const disenosDeEsteGrupo = disenos.filter((d) => d.grupoId === grupoId);

  function agregarElemento(piezaNombre) {
    setElementos((prev) => [...prev, elementoVacio(piezaNombre)]);
  }

  function actualizarElemento(id, cambios) {
    setElementos((prev) => prev.map((el) => (el.id === id ? { ...el, ...cambios } : el)));
  }

  function quitarElemento(id) {
    setElementos((prev) => prev.filter((el) => el.id !== id));
  }

  async function guardar(evento) {
    evento.preventDefault();
    setError(null);
    if (!nombre.trim() || !grupoId) {
      setError('Falta el nombre del producto o el grupo.');
      return;
    }
    try {
      await crearProducto({ nombre, grupoId, disenoId: disenoId || null, elementos });
      setNombre('');
      setElementos([]);
      await recargar();
      onCambio?.();
    } catch (e) {
      setError(e.message);
    }
  }

  async function borrar(id) {
    await eliminarProducto(id);
    await recargar();
    onCambio?.();
  }

  return (
    <div className="pagina flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Productos</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Une un grupo (piezas reales) con un diseño y define dónde va cada nombre/número — el
          equivalente a "Elementos" en la referencia que usamos.
        </p>
      </div>

      {grupos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Creá primero un grupo (pestaña "Grupos").</p>
      ) : (
        <Tarjeta as="form" onSubmit={guardar} className="flex max-w-2xl flex-col gap-4">
          <Campo etiqueta="Nombre del producto">
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Camiseta titular" />
          </Campo>

          <Campo etiqueta="Grupo">
            <Select value={grupoId} onChange={(e) => { setGrupoId(e.target.value); setElementos([]); setDisenoId(''); }}>
              {grupos.map((g) => (
                <option key={g.id} value={g.id}>{g.nombre}</option>
              ))}
            </Select>
          </Campo>

          <Campo etiqueta="Diseño (opcional — sin diseño, la pieza sale en blanco)">
            <Select value={disenoId} onChange={(e) => setDisenoId(e.target.value)}>
              <option value="">— Sin diseño —</option>
              {disenosDeEsteGrupo.map((d) => (
                <option key={d.id} value={d.id}>{d.nombre}</option>
              ))}
            </Select>
          </Campo>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint-foreground">
              Elementos (nombre, número, texto por pieza)
            </h3>
            <div className="flex flex-col gap-3">
              {grupoSeleccionado?.piezas.map((gp) => (
                <div key={gp.rol} className="rounded-lg border border-border bg-surface-muted p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <strong className="text-sm">{gp.rol}</strong>
                    <Boton variante="fantasma" tamano="sm" type="button" onClick={() => agregarElemento(gp.rol)}>
                      + Agregar elemento
                    </Boton>
                  </div>

                  <div className="flex flex-col gap-2">
                    {elementos.filter((el) => el.piezaNombre === gp.rol).map((elemento) => (
                      <div key={elemento.id} className="flex flex-wrap items-center gap-2 rounded-md bg-surface p-2">
                        <Select
                          className="max-w-[160px]"
                          value={elemento.tipo}
                          onChange={(e) => actualizarElemento(elemento.id, { tipo: e.target.value })}
                        >
                          <option value="nombre">Nombre del jugador</option>
                          <option value="numero">Número</option>
                          <option value="texto">Texto fijo</option>
                        </Select>

                        {elemento.tipo === 'texto' && (
                          <Input
                            className="max-w-[120px]"
                            placeholder="Texto fijo"
                            value={elemento.valorFijo || ''}
                            onChange={(e) => actualizarElemento(elemento.id, { valorFijo: e.target.value })}
                          />
                        )}

                        <span className="text-xs text-faint-foreground">X</span>
                        <Input
                          className="w-16"
                          type="number"
                          value={elemento.posicion.xCm}
                          onChange={(e) =>
                            actualizarElemento(elemento.id, { posicion: { ...elemento.posicion, xCm: Number(e.target.value) } })
                          }
                        />
                        <span className="text-xs text-faint-foreground">Y</span>
                        <Input
                          className="w-16"
                          type="number"
                          value={elemento.posicion.yCm}
                          onChange={(e) =>
                            actualizarElemento(elemento.id, { posicion: { ...elemento.posicion, yCm: Number(e.target.value) } })
                          }
                        />
                        <span className="text-xs text-faint-foreground" title="Alto de la letra, medido a la talla de referencia elegida al lado">
                          Alto letra
                        </span>
                        <Input
                          className="w-16"
                          type="number"
                          step="0.5"
                          value={elemento.referenciaProporcional.altoCm}
                          onChange={(e) =>
                            actualizarElemento(elemento.id, { referenciaProporcional: { altoCm: Number(e.target.value) } })
                          }
                        />
                        <Select
                          className="max-w-[90px]"
                          value={elemento.tallaReferencia}
                          title="A esta talla corresponde el alto de letra; en otras tallas escala junto con la pieza"
                          onChange={(e) => actualizarElemento(elemento.id, { tallaReferencia: e.target.value })}
                        >
                          {TALLAS.map((t) => <option key={t} value={t}>{t}</option>)}
                        </Select>
                        <input
                          type="color"
                          className="h-8 w-8 rounded border border-border"
                          value={elemento.colorHex}
                          onChange={(e) => actualizarElemento(elemento.id, { colorHex: e.target.value })}
                        />
                        <Boton variante="fantasma" tamano="sm" type="button" onClick={() => quitarElemento(elemento.id)}>
                          Quitar
                        </Boton>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Boton variante="primario" type="submit">Guardar producto</Boton>
          </div>
          {error && <Aviso tono="error">{error}</Aviso>}
        </Tarjeta>
      )}

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint-foreground">
          Productos cargados
        </h3>
        {productos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay ninguno.</p>
        ) : (
          <div className="flex max-w-2xl flex-col gap-2">
            {productos.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm">
                <div className="flex-1">
                  <span className="font-medium">{p.nombre}</span>{' '}
                  <span className="text-muted-foreground">— {p.elementos?.length || 0} elemento(s)</span>
                </div>
                <Boton variante="fantasma" tamano="sm" onClick={() => borrar(p.id)}>Eliminar</Boton>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
