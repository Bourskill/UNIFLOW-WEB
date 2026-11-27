import { useEffect, useMemo, useState } from 'react';
import { Boton, Select, Aviso } from './ui.jsx';
import { emparejarPiezas } from '../utilidades/enlacePrendas.js';

// "Heredar de otra prenda": las zonas (y si se quiere el diseño) de cada
// pieza de una prenda pasan a la pieza equivalente de otra de la misma
// producción -- FRENTE con FRENTE, ESPALDA con ESPALDA --, ENLAZADAS: mover
// o agrandar una zona en una cambia la otra (utilidades/enlacePrendas.js).
//
// prendas: [{ id, nombre, piezas: [{ clave, rol }] }]
// onHeredar(pares {claveDestino: claveOrigen}, conDiseno) → { zonas, piezasDiseno }
export function PanelHeredarPrenda({ prendas, hayDiseno, onHeredar }) {
  const [abierto, setAbierto] = useState(false);
  const [origenId, setOrigenId] = useState(prendas[0]?.id || '');
  const [destinoId, setDestinoId] = useState(prendas[prendas.length - 1]?.id || '');
  const [pares, setPares] = useState({});
  const [conDiseno, setConDiseno] = useState(true);
  const [trabajando, setTrabajando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState(null);

  const origen = prendas.find((p) => p.id === origenId);
  const destino = prendas.find((p) => p.id === destinoId);
  const firma = (origen?.piezas || []).map((p) => p.clave).join('|') + '>' + (destino?.piezas || []).map((p) => p.clave).join('|');
  const sugeridos = useMemo(() => (origen && destino && origen.id !== destino.id ? emparejarPiezas(origen.piezas, destino.piezas) : {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [firma]);
  useEffect(() => { setPares(sugeridos); setResultado(null); }, [sugeridos]);
  // Si se saca una prenda de la producción, que no quede elegida.
  useEffect(() => {
    if (!prendas.some((p) => p.id === origenId)) setOrigenId(prendas[0]?.id || '');
    if (!prendas.some((p) => p.id === destinoId)) setDestinoId(prendas[prendas.length - 1]?.id || '');
  }, [prendas, origenId, destinoId]);

  if (prendas.length < 2) return null;
  const cuantos = Object.values(pares).filter(Boolean).length;

  async function heredar() {
    setTrabajando(true);
    setError(null);
    try {
      setResultado(await onHeredar(pares, conDiseno && hayDiseno));
    } catch (e) {
      setError('No se pudo copiar: ' + e.message);
    } finally {
      setTrabajando(false);
    }
  }

  if (!abierto) {
    return (
      <div className="mt-3">
        <Boton type="button" variante="secundario" tamano="sm" onClick={() => setAbierto(true)}>
          Heredar diseño y zonas de otra prenda…
        </Boton>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-border bg-surface-muted/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-foreground">Heredar diseño y zonas</span>
        <span className="text-xs text-faint-foreground">
          Cada pieza recibe las zonas de su equivalente, enlazadas: lo que muevas o agrandes en una cambia en la otra.
        </span>
        <button type="button" aria-label="Cerrar" className="ml-auto rounded px-2 text-faint-foreground hover:bg-surface-muted" onClick={() => setAbierto(false)}>×</button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <span>De</span>
        <Select className="h-8 max-w-[220px]" aria-label="Prenda de origen" value={origenId} onChange={(e) => setOrigenId(e.target.value)}>
          {prendas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </Select>
        <span>a</span>
        <Select className="h-8 max-w-[220px]" aria-label="Prenda de destino" value={destinoId} onChange={(e) => setDestinoId(e.target.value)}>
          {prendas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </Select>
      </div>
      {origen && destino && origen.id === destino.id ? (
        <p className="mt-2 text-xs text-faint-foreground">Elegí dos prendas distintas.</p>
      ) : destino && (
        <>
          <div className="mt-2 grid max-w-xl grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1 text-sm">
            {destino.piezas.map((d) => (
              <div key={d.clave} className="contents">
                <Select className="h-8" aria-label={'Pieza de origen para ' + d.rol} value={pares[d.clave] || ''}
                  onChange={(e) => setPares((prev) => ({ ...prev, [d.clave]: e.target.value || null }))}>
                  <option value="">— Nada —</option>
                  {origen.piezas.map((o) => <option key={o.clave} value={o.clave}>{o.rol}</option>)}
                </Select>
                <span className="text-faint-foreground">→</span>
                <span className="truncate">{d.rol}</span>
              </div>
            ))}
          </div>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={conDiseno && hayDiseno} disabled={!hayDiseno} onChange={(e) => setConDiseno(e.target.checked)} />
            También el diseño (imagen, ajuste y fondo de cada pieza){!hayDiseno && ' — esta producción todavía no tiene diseño'}
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Boton type="button" variante="primario" tamano="sm" disabled={!cuantos || trabajando} onClick={heredar}>
              {trabajando ? 'Copiando…' : 'Copiar y enlazar' + (cuantos ? ' (' + cuantos + (cuantos === 1 ? ' pieza)' : ' piezas)') : '')}
            </Boton>
            {resultado && (
              <span className="text-xs text-muted-foreground">
                {resultado.zonas ? resultado.zonas + (resultado.zonas === 1 ? ' zona nueva' : ' zonas nuevas') : 'Ninguna zona nueva (ya estaban copiadas)'}
                {resultado.piezasDiseno ? ' · diseño en ' + resultado.piezasDiseno + (resultado.piezasDiseno === 1 ? ' pieza' : ' piezas') : ''}
                . Guardá la producción para que quede.
              </span>
            )}
          </div>
          {error && <Aviso tono="error">{error}</Aviso>}
        </>
      )}
    </div>
  );
}
