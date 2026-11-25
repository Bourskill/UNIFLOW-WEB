import { Boton, Input, Chip } from './ui.jsx';

// Conjuntos de una producción (utilidades/conjuntos.js): con varias prendas,
// se agrupan por público -- "Dama" = camiseta + pantaloneta de dama,
// "Caballero" = las de caballero -- con el mismo diseño y zonas. En el
// pedido, cada jugador elige su conjunto y solo salen esas prendas, en las
// tallas de ese conjunto.
export function PanelConjuntos({ prendas, conjuntos, onCambiar }) {
  if (prendas.length < 2) return null;
  const nuevoId = () => 'C' + Math.random().toString(36).slice(2, 8);
  const cambiar = (id, cambios) => onCambiar(conjuntos.map((c) => (c.id === id ? { ...c, ...cambios } : c)));
  const usadas = new Set(conjuntos.flatMap((c) => c.grupoIds || []));
  function agregar() {
    // El primero arranca con todas; los siguientes, con las que nadie usa.
    const libres = prendas.filter((g) => !usadas.has(g.id)).map((g) => g.id);
    const n = conjuntos.length + 1;
    onCambiar([...conjuntos, { id: nuevoId(), nombre: n === 1 ? 'Dama' : n === 2 ? 'Caballero' : 'Conjunto ' + n, grupoIds: conjuntos.length ? libres : [] }]);
  }
  return (
    <div className="mt-3 rounded-lg border border-border bg-surface-muted/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-foreground">Conjuntos</span>
        <span className="text-xs text-faint-foreground">
          {conjuntos.length
            ? 'En el pedido, cada jugador elige su conjunto y solo salen esas prendas.'
            : 'Para juntar en una producción, p. ej., dama y caballero: cada conjunto con sus prendas.'}
        </span>
        <Boton type="button" variante="secundario" tamano="sm" onClick={agregar}>+ Agregar conjunto</Boton>
      </div>
      {conjuntos.map((c) => (
        <div key={c.id} className="mt-2 flex flex-wrap items-center gap-2">
          <Input className="h-8 w-36" value={c.nombre} aria-label="Nombre del conjunto"
            onChange={(e) => cambiar(c.id, { nombre: e.target.value })} />
          {prendas.map((g) => {
            const activo = (c.grupoIds || []).includes(g.id);
            return (
              <label key={g.id} className="cursor-pointer">
                <input type="checkbox" className="peer sr-only" checked={activo}
                  onChange={() => cambiar(c.id, { grupoIds: activo ? c.grupoIds.filter((x) => x !== g.id) : [...(c.grupoIds || []), g.id] })} />
                <Chip tono={activo ? 'activo' : 'neutro'}>{g.nombre}</Chip>
              </label>
            );
          })}
          {!(c.grupoIds || []).length && <span className="text-xs text-danger">Elegí al menos una prenda</span>}
          <button type="button" aria-label={'Quitar el conjunto ' + c.nombre}
            className="rounded px-1.5 text-faint-foreground hover:bg-danger-soft hover:text-danger"
            onClick={() => onCambiar(conjuntos.filter((x) => x.id !== c.id))}>×</button>
        </div>
      ))}
    </div>
  );
}
