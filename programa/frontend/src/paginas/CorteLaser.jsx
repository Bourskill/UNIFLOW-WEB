import { useEffect, useState } from 'react';
import { listarGrupos, listarPiezas, anidarDesdeGrupo, generarDxf } from '../api.js';
import { ordenarTallasNatural } from '../constantes.js';
import { VistaPreviaNesting } from '../componentes/VistaPreviaNesting.jsx';
import { Boton, Campo, Input, Select, Tarjeta, Aviso } from '../componentes/ui.jsx';

// Talla válida para cortar TODAS las piezas de la prenda a la vez: la
// intersección de tallas cargadas, no la unión -- mismo criterio que
// Pedidos.jsx·tallasDelProducto (pedir una talla que a una sola pieza le
// falte hace fallar todo el lote explícito, no a medias).
function tallasDelGrupo(grupo, piezas) {
  if (!grupo) return [];
  const conjuntos = grupo.piezas
    .map((gp) => piezas.find((p) => p.id === gp.piezaId))
    .filter(Boolean)
    .map((p) => new Set(Object.keys(p.dimensionesPorTalla || {})));
  if (conjuntos.length === 0) return [];
  const interseccion = [...conjuntos[0]].filter((t) => conjuntos.every((s) => s.has(t)));
  return ordenarTallasNatural(interseccion);
}

function lineaVacia(talla) {
  return { id: crypto.randomUUID(), talla: talla || '', cantidad: 1 };
}

// Camino corto para corte láser: moldería real (una prenda entera, todas
// sus piezas) + talla + cantidad, SIN nombre/número/diseño -- a diferencia
// de Pedidos, acá no hay personalización ninguna, solo el contorno real de
// cada pieza para cortar. Reusa /nesting/desde-grupo (existía desde antes,
// sin ninguna pantalla que lo llamara) y el exportador DXF nuevo.
export function CorteLaser() {
  const [grupos, setGrupos] = useState([]);
  const [piezas, setPiezas] = useState([]);
  const [grupoId, setGrupoId] = useState('');
  const [lineas, setLineas] = useState([]);
  const [anchoLienzoCm, setAnchoLienzoCm] = useState(160);
  const [resultado, setResultado] = useState(null);
  const [cargandoInicial, setCargandoInicial] = useState(true);
  const [anidando, setAnidando] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      const [gs, ps] = await Promise.all([listarGrupos(), listarPiezas()]);
      setGrupos(gs);
      setPiezas(ps);
      if (gs.length > 0) {
        setGrupoId(gs[0].id);
        setLineas([lineaVacia(tallasDelGrupo(gs[0], ps)[0])]);
      }
      setCargandoInicial(false);
    })();
  }, []);

  const grupo = grupos.find((g) => g.id === grupoId);
  const tallas = tallasDelGrupo(grupo, piezas);

  function elegirGrupo(id) {
    setGrupoId(id);
    const g = grupos.find((x) => x.id === id);
    setLineas([lineaVacia(tallasDelGrupo(g, piezas)[0])]);
    setResultado(null);
    setError(null);
  }

  function actualizarLinea(id, cambios) {
    setLineas((prev) => prev.map((l) => (l.id === id ? { ...l, ...cambios } : l)));
  }
  function agregarLinea() {
    setLineas((prev) => [...prev, lineaVacia(tallas[0])]);
  }
  function quitarLinea(id) {
    setLineas((prev) => prev.filter((l) => l.id !== id));
  }

  async function anidar() {
    setError(null);
    setResultado(null);
    if (!grupoId || lineas.length === 0) {
      setError('Elegí una prenda y al menos una línea de talla/cantidad.');
      return;
    }
    setAnidando(true);
    try {
      const datos = await anidarDesdeGrupo(grupoId, lineas, Number(anchoLienzoCm));
      setResultado(datos);
    } catch (e) {
      setError(e.message);
    } finally {
      setAnidando(false);
    }
  }

  async function descargarDxf() {
    if (!resultado) return;
    setGenerando(true);
    setError(null);
    try {
      await generarDxf(resultado);
    } catch (e) {
      setError(e.message);
    } finally {
      setGenerando(false);
    }
  }

  return (
    <div className="pagina flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Corte láser</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Moldería real + talla + cantidad, sin personalizar -- el contorno real de cada pieza,
          listo para exportar a DXF y cortar.
        </p>
      </div>

      {cargandoInicial ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : grupos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Armá primero una prenda (Moldería → Prendas).</p>
      ) : (
        <Tarjeta className="flex max-w-2xl flex-col gap-4">
          <Campo etiqueta="Prenda">
            <Select value={grupoId} onChange={(e) => elegirGrupo(e.target.value)} className="max-w-xs">
              {grupos.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
            </Select>
          </Campo>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint-foreground">
              Tallas y cantidades
            </h3>
            <div className="flex flex-col gap-2">
              {lineas.map((linea) => (
                <div key={linea.id} className="flex flex-wrap items-center gap-2">
                  <Select
                    className="max-w-[100px]"
                    value={linea.talla}
                    onChange={(e) => actualizarLinea(linea.id, { talla: e.target.value })}
                  >
                    {tallas.length === 0 && <option value="">— sin talla —</option>}
                    {tallas.map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                  </Select>
                  <Input
                    type="number"
                    min={1}
                    className="max-w-[90px]"
                    value={linea.cantidad}
                    onChange={(e) => actualizarLinea(linea.id, { cantidad: e.target.value })}
                  />
                  {lineas.length > 1 && (
                    <Boton variante="fantasma" tamano="sm" type="button" onClick={() => quitarLinea(linea.id)}>Quitar</Boton>
                  )}
                </div>
              ))}
              {tallas.length === 0 && (
                <span className="text-xs text-danger">
                  Ninguna talla está cargada en TODAS las piezas de esta prenda todavía.
                </span>
              )}
            </div>
            <div className="mt-2">
              <Boton tamano="sm" type="button" onClick={agregarLinea}>+ Agregar talla</Boton>
            </div>
          </div>

          <Campo etiqueta="Ancho del lienzo/rollo (cm)" className="max-w-[160px]">
            <Input type="number" value={anchoLienzoCm} onChange={(e) => setAnchoLienzoCm(e.target.value)} />
          </Campo>

          <div className="flex gap-2">
            <Boton variante="primario" type="button" onClick={anidar} disabled={anidando || tallas.length === 0}>
              {anidando ? 'Anidando…' : 'Anidar'}
            </Boton>
            <Boton type="button" onClick={descargarDxf} disabled={!resultado || generando}>
              {generando ? 'Generando…' : 'Generar DXF'}
            </Boton>
          </div>
          {error && <Aviso tono="error">{error}</Aviso>}
          {resultado && (
            <p className="text-sm text-muted-foreground">
              Lienzo {resultado.anchoLienzoCm}×{resultado.altoLienzoCm} cm · utilización {resultado.utilizacion}%
            </p>
          )}
        </Tarjeta>
      )}

      {resultado && <VistaPreviaNesting resultado={resultado} />}
    </div>
  );
}
