import { Boton, Input } from './ui.jsx';

// Conjuntos de una producción (utilidades/conjuntos.js): las prendas se
// agrupan por público -- "Dama" = camiseta + pantaloneta de dama,
// "Caballero" = las de caballero -- con el mismo diseño y zonas. En el
// pedido, cada jugador elige su conjunto y solo salen esas prendas, en las
// tallas de ese conjunto.
//
// Se ofrecen TODAS las prendas de la Biblioteca: marcar una que todavía no
// está en la producción la agrega (onAgregarPrenda), así se arma el
// conjunto nuevo desde acá mismo.
export function PanelConjuntos({ prendas, enProduccion, conjuntos, onCambiar, onAgregarPrenda }) {
  if (!enProduccion.length) return null;
  const nuevoId = () => 'C' + Math.random().toString(36).slice(2, 8);
  const cambiar = (id, cambios) => onCambiar(conjuntos.map((c) => (c.id === id ? { ...c, ...cambios } : c)));

  function nuevoConjunto() {
    if (!conjuntos.length) {
      // El primero: con las prendas que ya tiene la producción; el segundo
      // arranca vacío, para elegirle las suyas.
      onCambiar([{ id: nuevoId(), nombre: 'Dama', grupoIds: [...enProduccion] }, { id: nuevoId(), nombre: 'Caballero', grupoIds: [] }]);
      return;
    }
    onCambiar([...conjuntos, { id: nuevoId(), nombre: 'Conjunto ' + (conjuntos.length + 1), grupoIds: [] }]);
  }
  function alternar(c, g) {
    const tiene = (c.grupoIds || []).includes(g.id);
    if (!tiene && !enProduccion.includes(g.id)) onAgregarPrenda(g.id);
    cambiar(c.id, { grupoIds: tiene ? c.grupoIds.filter((x) => x !== g.id) : [...(c.grupoIds || []), g.id] });
  }

  return (
    <div className="mt-4 rounded-xl border border-border bg-surface-muted/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-foreground">Conjuntos</span>
        <span className="text-xs text-faint-foreground">
          {conjuntos.length
            ? 'Cada jugador del pedido elige su conjunto y solo salen esas prendas. Las prendas nuevas se suman a la producción solas.'
            : '¿Dama y caballero en la misma producción? Armá un conjunto por cada uno, con sus prendas.'}
        </span>
        <Boton type="button" variante="primario" tamano="sm" className="ml-auto" onClick={nuevoConjunto}>+ Nuevo conjunto</Boton>
      </div>
      <div className="mt-2 flex flex-col gap-2">
        {conjuntos.map((c) => (
          <div key={c.id} className="rounded-lg border border-border bg-surface p-2.5">
            <div className="flex items-center gap-2">
              <Input className="h-8 w-44 font-medium" value={c.nombre} aria-label="Nombre del conjunto" placeholder="Nombre (p. ej. Dama)"
                onChange={(e) => cambiar(c.id, { nombre: e.target.value })} />
              <span className="text-xs text-faint-foreground">
                {(c.grupoIds || []).length ? (c.grupoIds.length + (c.grupoIds.length === 1 ? ' prenda' : ' prendas')) : 'Marcá sus prendas:'}
              </span>
              <button type="button" aria-label={'Quitar el conjunto ' + c.nombre} title="Quitar este conjunto (las prendas siguen en la producción)"
                className="ml-auto rounded px-2 text-faint-foreground hover:bg-danger-soft hover:text-danger"
                onClick={() => onCambiar(conjuntos.filter((x) => x.id !== c.id))}>×</button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {prendas.map((g) => {
                const activo = (c.grupoIds || []).includes(g.id);
                return (
                  <button key={g.id} type="button" aria-pressed={activo} onClick={() => alternar(c, g)}
                    title={activo ? 'En este conjunto' : enProduccion.includes(g.id) ? 'Sumar a este conjunto' : 'Sumar a este conjunto (se agrega a la producción)'}
                    className={'rounded-full border px-2.5 py-1 text-xs transition-colors ' +
                      (activo ? 'border-primary bg-primary-soft text-primary' : 'border-border text-muted-foreground hover:border-primary')}>
                    {activo ? '✓ ' : '+ '}{g.nombre}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
