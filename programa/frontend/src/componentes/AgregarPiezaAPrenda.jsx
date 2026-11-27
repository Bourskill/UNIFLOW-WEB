import { useMemo, useState } from 'react';
import { Boton, Input, Aviso } from './ui.jsx';
import { ordenarTallasNatural } from '../constantes.js';
import { agrupacionDe } from '../utilidades/agrupaciones.js';

const tallasDe = (p) => (p && !p.tallaUnica ? Object.keys(p.dimensionesPorTalla || {}) : []);

// "+ Pieza" de una prenda en Diseño: una o varias piezas de la Biblioteca
// pasan a ser parte de la prenda (un tapacuellos, un bolsillo...), con su
// nombre como rol. Es lo mismo que Editar prenda en la Biblioteca: vale para
// TODAS las producciones que usan esa prenda (se avisa cuáles).
export function AgregarPiezaAPrenda({ grupo, piezas, otrasProducciones, onAgregar }) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [elegidas, setElegidas] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  // Las tallas de la prenda: una pieza que no las tenga todas la achica.
  const tallasPrenda = useMemo(() => {
    const t = new Set();
    for (const gp of grupo.piezas) for (const x of tallasDe(piezas.find((p) => p.id === gp.piezaId))) t.add(x);
    return t;
  }, [grupo, piezas]);
  const faltan = (p) => (p.tallaUnica ? [] : ordenarTallasNatural([...tallasPrenda].filter((t) => !(t in (p.dimensionesPorTalla || {})))));

  const q = busqueda.trim().toLowerCase();
  const lista = piezas
    .filter((p) => !q || p.nombre.toLowerCase().includes(q) || (agrupacionDe(p) || '').toLowerCase().includes(q))
    .slice(0, 80);

  function cerrar() { setAbierto(false); setElegidas([]); setBusqueda(''); setError(null); }
  async function agregar() {
    setGuardando(true);
    setError(null);
    try {
      await onAgregar(elegidas);
      cerrar();
    } catch (e) {
      setError('No se pudo agregar: ' + e.message);
    } finally {
      setGuardando(false);
    }
  }

  if (!abierto) {
    return (
      <button type="button" className="rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground hover:border-primary hover:text-primary"
        title={'Sumar piezas de la Biblioteca a «' + grupo.nombre + '»'} onClick={() => setAbierto(true)}>
        + Pieza a {grupo.nombre}
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Sumar piezas a «{grupo.nombre}»</span>
        <Input className="h-8 w-56" placeholder="Buscar pieza…" value={busqueda} autoFocus onChange={(e) => setBusqueda(e.target.value)} aria-label="Buscar pieza" />
        <button type="button" aria-label="Cerrar" className="ml-auto rounded px-2 text-faint-foreground hover:bg-surface-muted" onClick={cerrar}>×</button>
      </div>
      <div className="mt-2 flex max-h-56 flex-col overflow-y-auto rounded-lg border border-border">
        {lista.length === 0 ? <p className="p-2 text-xs text-faint-foreground">No hay piezas con ese nombre.</p> : lista.map((p) => {
          const marcada = elegidas.includes(p.id);
          const yaEsta = grupo.piezas.some((gp) => gp.piezaId === p.id);
          const sinTallas = faltan(p);
          return (
            <label key={p.id} className="flex cursor-pointer items-center gap-2 border-b border-border px-2 py-1.5 text-sm last:border-b-0 hover:bg-surface-muted">
              <input type="checkbox" checked={marcada} onChange={() => setElegidas((prev) => (marcada ? prev.filter((x) => x !== p.id) : [...prev, p.id]))} />
              <span className="font-medium">{p.nombre}</span>
              {agrupacionDe(p) && <span className="text-xs text-faint-foreground">{agrupacionDe(p)}</span>}
              {p.tallaUnica && <span className="text-xs text-faint-foreground">talla única</span>}
              {yaEsta && <span className="text-xs text-faint-foreground">(ya está en la prenda)</span>}
              {sinTallas.length > 0 && <span className="text-xs text-danger">sin {sinTallas.join(', ')}</span>}
            </label>
          );
        })}
      </div>
      {otrasProducciones.length > 0 && elegidas.length > 0 && (
        <p className="mt-2 text-xs text-danger">
          «{grupo.nombre}» también la usan: {otrasProducciones.join(', ')}. La pieza nueva va a salir en sus pedidos también.
        </p>
      )}
      <div className="mt-2 flex items-center gap-2">
        <Boton type="button" variante="primario" tamano="sm" disabled={!elegidas.length || guardando} onClick={agregar}>
          {guardando ? 'Agregando…' : 'Agregar' + (elegidas.length ? ' ' + elegidas.length + (elegidas.length === 1 ? ' pieza' : ' piezas') : '')}
        </Boton>
        <Boton type="button" variante="fantasma" tamano="sm" onClick={cerrar}>Cancelar</Boton>
      </div>
      {error && <Aviso tono="error">{error}</Aviso>}
    </div>
  );
}
