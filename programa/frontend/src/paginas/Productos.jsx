import { useEffect, useState } from 'react';
import {
  listarGrupos,
  listarDisenos,
  listarProductos,
  listarPiezas,
  crearDiseno,
  eliminarDiseno,
  crearProducto,
  eliminarProducto,
} from '../api.js';
import { ordenarTallasNatural } from '../constantes.js';
import { Boton, Campo, Input, Select, Tarjeta, Aviso, Ayuda } from '../componentes/ui.jsx';
import { CanvasZonas } from '../componentes/CanvasZonas.jsx';
import { SlotImagenDiseno } from '../componentes/SlotImagenDiseno.jsx';

const BORDE_POR_DEFECTO = { activo: false, colorHex: '#ffffff', grosorCm: 0.03 };

function elementoVacio(piezaNombre, tallaReferencia, posicion) {
  return {
    id: crypto.randomUUID(),
    piezaNombre,
    tipo: 'nombre',
    valorEjemplo: '',
    posicion: posicion || { xCm: 5, yCm: 15 },
    modoEscalado: 'proporcional',
    // "A esta talla, la letra mide referenciaProporcional.altoCm" — sin esto
    // no hay contra qué comparar el crecimiento de la pieza en otras tallas.
    tallaReferencia,
    referenciaProporcional: { altoCm: 5 },
    colorHex: '#ffffff',
  };
}

function etiquetaCorta(elemento) {
  if (elemento.tipo === 'texto') return elemento.valorFijo || 'Texto fijo';
  if (elemento.tipo === 'numero') return elemento.valorEjemplo ? 'N° · ' + elemento.valorEjemplo : 'Número';
  return elemento.valorEjemplo ? 'Nombre · ' + elemento.valorEjemplo : 'Nombre';
}

// L por defecto (talla intermedia, buena referencia visual) -- pero varía
// según qué tallas tiene de verdad la pieza (no toda pieza tiene L: podría
// ser numérica de niño o de pantalón). Se cae a la del medio de lo que haya.
function tallaDeTrabajoPorDefecto(pieza) {
  const tallas = ordenarTallasNatural(Object.keys(pieza?.dimensionesPorTalla || {}));
  if (tallas.length === 0) return null;
  const conL = tallas.find((t) => t.toUpperCase() === 'L');
  return conL || tallas[Math.floor((tallas.length - 1) / 2)];
}

export function Productos({ recargarSenal, onCambio }) {
  const [grupos, setGrupos] = useState([]);
  const [disenos, setDisenos] = useState([]);
  const [productos, setProductos] = useState([]);
  const [piezas, setPiezas] = useState([]);
  const [nombre, setNombre] = useState('');
  const [grupoId, setGrupoId] = useState('');
  const [disenoId, setDisenoId] = useState('');
  const [elementos, setElementos] = useState([]);
  const [tallaTrabajoPorRol, setTallaTrabajoPorRol] = useState({});
  const [bordeContraste, setBordeContraste] = useState(BORDE_POR_DEFECTO);
  const [activoId, setActivoId] = useState(null);
  const [error, setError] = useState(null);

  // Crear un diseño nuevo sin salir de esta pantalla -- antes había que ir a
  // una pestaña aparte, guardarlo ahí, y volver a elegir el grupo acá para
  // encontrarlo en un dropdown por nombre. Un paso menos, y con vista previa
  // en el momento (el canvas de abajo ya muestra la imagen apenas se sube).
  const [creandoDiseno, setCreandoDiseno] = useState(false);
  const [nombreNuevoDiseno, setNombreNuevoDiseno] = useState('');
  const [imagenesNuevoDiseno, setImagenesNuevoDiseno] = useState({});
  const [errorDiseno, setErrorDiseno] = useState(null);

  async function recargar() {
    const [gs, ds, ps, pzs] = await Promise.all([listarGrupos(), listarDisenos(), listarProductos(), listarPiezas()]);
    setGrupos(gs);
    setDisenos(ds);
    setProductos(ps);
    setPiezas(pzs);
    if (gs.length > 0 && !grupoId) setGrupoId(gs[0].id);
  }

  useEffect(() => {
    recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recargarSenal]);

  const grupoSeleccionado = grupos.find((g) => g.id === grupoId);
  const disenosDeEsteGrupo = disenos.filter((d) => d.grupoId === grupoId);
  const disenoSeleccionado = disenos.find((d) => d.id === disenoId);

  function alCambiarGrupo(id) {
    setGrupoId(id);
    setElementos([]);
    setDisenoId('');
    setTallaTrabajoPorRol({});
    setCreandoDiseno(false);
    setNombreNuevoDiseno('');
    setImagenesNuevoDiseno({});
  }

  async function guardarDisenoNuevo() {
    setErrorDiseno(null);
    if (!nombreNuevoDiseno.trim()) {
      setErrorDiseno('Falta el nombre del diseño.');
      return;
    }
    try {
      const creado = await crearDiseno({ nombre: nombreNuevoDiseno, grupoId, imagenesPorPieza: imagenesNuevoDiseno });
      setDisenos((prev) => [...prev, creado]);
      setDisenoId(creado.id);
      setCreandoDiseno(false);
      setNombreNuevoDiseno('');
      setImagenesNuevoDiseno({});
    } catch (e) {
      setErrorDiseno(e.message);
    }
  }

  async function eliminarDisenoActual() {
    if (!disenoId) return;
    await eliminarDiseno(disenoId);
    setDisenoId('');
    await recargar();
  }

  function piezaDelRol(gp) {
    return piezas.find((p) => p.id === gp.piezaId);
  }

  function tallaTrabajoDe(gp) {
    return tallaTrabajoPorRol[gp.rol] ?? tallaDeTrabajoPorDefecto(piezaDelRol(gp));
  }

  function agregarElemento(gp, posicion) {
    const nuevo = elementoVacio(gp.rol, tallaTrabajoDe(gp), posicion);
    setElementos((prev) => [...prev, nuevo]);
    setActivoId(nuevo.id);
  }

  function actualizarElemento(id, cambios) {
    setElementos((prev) => prev.map((el) => (el.id === id ? { ...el, ...cambios } : el)));
  }

  function quitarElemento(id) {
    setElementos((prev) => prev.filter((el) => el.id !== id));
    setActivoId((actual) => (actual === id ? null : actual));
  }

  async function guardar(evento) {
    evento.preventDefault();
    setError(null);
    if (!nombre.trim() || !grupoId) {
      setError('Falta el nombre del producto o el grupo.');
      return;
    }
    try {
      await crearProducto({ nombre, grupoId, disenoId: disenoId || null, elementos, bordeContraste });
      setNombre('');
      setElementos([]);
      setActivoId(null);
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
        <h2 className="text-lg font-semibold">Producto</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Una prenda real, el diseño que lleva encima y dónde va cada nombre/número — todo en una
          sola pantalla, sobre el molde real de cada pieza, no a ciegas con números sueltos.
        </p>
      </div>

      {grupos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Creá primero una prenda (Piezas → Prendas).</p>
      ) : (
        <Tarjeta as="form" onSubmit={guardar} className="flex max-w-3xl flex-col gap-4">
          <Campo etiqueta="Nombre del producto">
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Camiseta titular" />
          </Campo>

          <Campo etiqueta="Grupo">
            <Select value={grupoId} onChange={(e) => alCambiarGrupo(e.target.value)}>
              {grupos.map((g) => (
                <option key={g.id} value={g.id}>{g.nombre}</option>
              ))}
            </Select>
          </Campo>

          <div>
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-faint-foreground">Diseño</h3>
              <Ayuda>
                El diseño es el arte real de esta prenda (una imagen por pieza). Podés reusar uno ya
                cargado o crear uno nuevo sin salir de esta pantalla. Sin diseño, la pieza sale en
                blanco en la vista previa y el PDF.
              </Ayuda>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select className="max-w-xs" value={disenoId} onChange={(e) => setDisenoId(e.target.value)}>
                <option value="">— Sin diseño —</option>
                {disenosDeEsteGrupo.map((d) => (
                  <option key={d.id} value={d.id}>{d.nombre}</option>
                ))}
              </Select>
              {disenoId && (
                <Boton variante="fantasma" tamano="sm" type="button" onClick={eliminarDisenoActual}>
                  Eliminar este diseño
                </Boton>
              )}
              <Boton
                variante="fantasma"
                tamano="sm"
                type="button"
                onClick={() => setCreandoDiseno((v) => !v)}
              >
                {creandoDiseno ? 'Cancelar' : '+ Crear diseño nuevo'}
              </Boton>
            </div>

            {creandoDiseno && (
              <div className="mt-3 flex flex-col gap-3 rounded-lg border border-dashed border-border p-3">
                <Campo etiqueta="Nombre del diseño">
                  <Input
                    value={nombreNuevoDiseno}
                    onChange={(e) => setNombreNuevoDiseno(e.target.value)}
                    placeholder="Kit titular 2026"
                  />
                </Campo>
                <div className="flex flex-wrap gap-3">
                  {grupoSeleccionado?.piezas.map((gp) => (
                    <SlotImagenDiseno
                      key={gp.rol}
                      rol={gp.rol}
                      url={imagenesNuevoDiseno[gp.rol]}
                      onElegir={(rol, url) => setImagenesNuevoDiseno((prev) => ({ ...prev, [rol]: url }))}
                    />
                  ))}
                </div>
                {errorDiseno && <Aviso tono="error">{errorDiseno}</Aviso>}
                <div>
                  <Boton variante="secundario" tamano="sm" type="button" onClick={guardarDisenoNuevo}>
                    Guardar diseño
                  </Boton>
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={bordeContraste.activo}
                  onChange={(e) => setBordeContraste((prev) => ({ ...prev, activo: e.target.checked }))}
                />
                Borde de contraste sobre el diseño
              </label>
              <Ayuda>
                Dibuja el contorno del molde encima del diseño recortado, en un color que
                contraste, para no perder de vista los piquetes que suele traer la moldería.
                Grosor real de producción — a este zoom se muestra un poco más grueso para poder
                verlo y ajustarlo.
              </Ayuda>
            </div>
            {bordeContraste.activo && (
              <div className="flex flex-wrap items-end gap-3">
                <Campo etiqueta="Color">
                  <input
                    type="color"
                    className="h-9 w-9 rounded border border-border"
                    value={bordeContraste.colorHex}
                    onChange={(e) => setBordeContraste((prev) => ({ ...prev, colorHex: e.target.value }))}
                  />
                </Campo>
                <Campo etiqueta="Grosor (cm)">
                  <Input
                    className="w-20"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={bordeContraste.grosorCm}
                    onChange={(e) => setBordeContraste((prev) => ({ ...prev, grosorCm: Number(e.target.value) }))}
                  />
                </Campo>
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint-foreground">
              Elementos (nombre, número, texto por pieza)
            </h3>
            <div className="flex flex-col gap-4">
              {grupoSeleccionado?.piezas.map((gp) => {
                const pieza = piezaDelRol(gp);
                const tallasDePieza = ordenarTallasNatural(Object.keys(pieza?.dimensionesPorTalla || {}));
                const tallaTrabajo = tallaTrabajoDe(gp);
                const geo = tallaTrabajo ? pieza?.geometriaPorTalla?.[tallaTrabajo] : null;
                const dim = tallaTrabajo ? pieza?.dimensionesPorTalla?.[tallaTrabajo] : null;
                const elementosDelRol = elementos.filter((el) => el.piezaNombre === gp.rol);
                const elementoActivo = elementosDelRol.find((el) => el.id === activoId) || null;

                return (
                  <div key={gp.rol} className="rounded-lg border border-border bg-surface-muted p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <strong className="text-sm">{gp.rol}</strong>
                      {!pieza ? (
                        <span className="text-xs text-danger">pieza eliminada de la biblioteca</span>
                      ) : (
                        <>
                          <span className="text-xs text-faint-foreground">· molde de referencia:</span>
                          <Select
                            className="max-w-[100px]"
                            value={tallaTrabajo || ''}
                            onChange={(e) => setTallaTrabajoPorRol((prev) => ({ ...prev, [gp.rol]: e.target.value }))}
                          >
                            {tallasDePieza.map((t) => <option key={t} value={t}>{t}</option>)}
                          </Select>
                        </>
                      )}
                      <Boton variante="fantasma" tamano="sm" type="button" onClick={() => agregarElemento(gp)}>
                        + Agregar elemento
                      </Boton>
                    </div>

                    {pieza && geo && dim && (
                      <CanvasZonas
                        poligonoMm={geo.poligonoMm}
                        anchoCm={dim.anchoCm}
                        altoCm={dim.altoCm}
                        imagenUrl={disenoSeleccionado?.imagenesPorPieza?.[gp.rol]}
                        borde={bordeContraste}
                        elementos={elementosDelRol}
                        elementoActivoId={activoId}
                        onSeleccionar={setActivoId}
                        onMover={(id, xCm, yCm) => actualizarElemento(id, { posicion: { xCm: Math.round(xCm * 10) / 10, yCm: Math.round(yCm * 10) / 10 } })}
                        onCrear={(xCm, yCm) => agregarElemento(gp, { xCm: Math.round(xCm * 10) / 10, yCm: Math.round(yCm * 10) / 10 })}
                      />
                    )}

                    <div className="mt-3 flex flex-wrap gap-2">
                      {elementosDelRol.length === 0 && (
                        <span className="text-xs text-faint-foreground">
                          Sin elementos todavía — hacé clic en el molde para agregar uno.
                        </span>
                      )}
                      {elementosDelRol.map((el) => (
                        <button
                          key={el.id}
                          type="button"
                          onClick={() => setActivoId(el.id)}
                          className={
                            'rounded-full border px-3 py-1 text-xs transition-colors ' +
                            (el.id === activoId
                              ? 'border-primary bg-primary-soft text-primary'
                              : 'border-border bg-surface text-muted-foreground hover:border-primary')
                          }
                        >
                          {etiquetaCorta(el)}
                        </button>
                      ))}
                    </div>

                    {elementoActivo && (
                      <div className="mt-3 rounded-lg border border-border bg-surface p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <h4 className="text-xs font-semibold uppercase tracking-wide text-faint-foreground">
                            Propiedades del elemento
                          </h4>
                          <Boton variante="fantasma" tamano="sm" type="button" onClick={() => quitarElemento(elementoActivo.id)}>
                            Quitar
                          </Boton>
                        </div>
                        <div className="flex flex-wrap items-end gap-3">
                          <Campo etiqueta="Tipo">
                            <Select
                              className="max-w-[160px]"
                              value={elementoActivo.tipo}
                              onChange={(e) => actualizarElemento(elementoActivo.id, { tipo: e.target.value })}
                            >
                              <option value="nombre">Nombre del jugador</option>
                              <option value="numero">Número</option>
                              <option value="texto">Texto fijo</option>
                            </Select>
                          </Campo>

                          {elementoActivo.tipo === 'texto' ? (
                            <Campo etiqueta="Texto">
                              <Input
                                className="max-w-[140px]"
                                value={elementoActivo.valorFijo || ''}
                                onChange={(e) => actualizarElemento(elementoActivo.id, { valorFijo: e.target.value })}
                              />
                            </Campo>
                          ) : (
                            <Campo etiqueta="Ejemplo (solo vista previa)">
                              <Input
                                className="max-w-[140px]"
                                placeholder={elementoActivo.tipo === 'nombre' ? 'PEÑA' : '7'}
                                value={elementoActivo.valorEjemplo || ''}
                                onChange={(e) => actualizarElemento(elementoActivo.id, { valorEjemplo: e.target.value })}
                              />
                            </Campo>
                          )}

                          <Campo etiqueta="X (cm)">
                            <Input
                              className="w-20"
                              type="number"
                              value={elementoActivo.posicion.xCm}
                              onChange={(e) =>
                                actualizarElemento(elementoActivo.id, { posicion: { ...elementoActivo.posicion, xCm: Number(e.target.value) } })
                              }
                            />
                          </Campo>
                          <Campo etiqueta="Y (cm)">
                            <Input
                              className="w-20"
                              type="number"
                              value={elementoActivo.posicion.yCm}
                              onChange={(e) =>
                                actualizarElemento(elementoActivo.id, { posicion: { ...elementoActivo.posicion, yCm: Number(e.target.value) } })
                              }
                            />
                          </Campo>
                          <Campo etiqueta="Alto de letra (cm)">
                            <Input
                              className="w-20"
                              type="number"
                              step="0.5"
                              value={elementoActivo.referenciaProporcional.altoCm}
                              onChange={(e) =>
                                actualizarElemento(elementoActivo.id, { referenciaProporcional: { altoCm: Number(e.target.value) } })
                              }
                            />
                          </Campo>
                          <Campo etiqueta="A esta talla">
                            <div className="flex items-center gap-1">
                              <Select
                                className="max-w-[90px]"
                                value={elementoActivo.tallaReferencia || ''}
                                onChange={(e) => actualizarElemento(elementoActivo.id, { tallaReferencia: e.target.value })}
                              >
                                {tallasDePieza.map((t) => <option key={t} value={t}>{t}</option>)}
                              </Select>
                              <Ayuda>
                                El alto de letra de arriba corresponde a esta talla. En las demás
                                tallas, la letra escala en la misma proporción que crece la pieza.
                              </Ayuda>
                            </div>
                          </Campo>
                          <Campo etiqueta="Color">
                            <input
                              type="color"
                              className="h-9 w-9 rounded border border-border"
                              value={elementoActivo.colorHex}
                              onChange={(e) => actualizarElemento(elementoActivo.id, { colorHex: e.target.value })}
                            />
                          </Campo>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
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
                  <span className="text-muted-foreground">
                    — {disenos.find((d) => d.id === p.disenoId)?.nombre || 'sin diseño'} ·{' '}
                    {p.elementos?.length || 0} elemento(s)
                  </span>
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
