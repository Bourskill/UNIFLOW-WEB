import { Boton } from './ui.jsx';
import { InputNumero } from './InputNumero.jsx';
import { normalizarAjusteArte } from '../utilidades/colocarArte.js';

// Panel para cuadrar el arte (la imagen del Diseño) con el molde: escala,
// alineación respecto de la pieza y corrimiento fino en cm. El mismo ajuste
// se usa en el lienzo, en la vista previa y en el PDF (colocarArte.js).
const FILAS = ['arriba', 'centro', 'abajo'];
const COLUMNAS = ['izquierda', 'centro', 'derecha'];
const NOMBRE_V = { arriba: 'arriba', centro: 'al medio', abajo: 'abajo' };
const NOMBRE_H = { izquierda: 'a la izquierda', centro: 'al centro', derecha: 'a la derecha' };

export function PanelAjusteArte({ ajuste, onCambiar, editando, onEditando }) {
  const a = normalizarAjusteArte(ajuste);
  const poner = (cambios) => onCambiar({ ...a, ...cambios });
  const mover = (dx, dy) => poner({ dxCm: Math.round((a.dxCm + dx) * 100) / 100, dyCm: Math.round((a.dyCm + dy) * 100) / 100 });
  const tocado = !!ajuste;

  return (
    <div className="mt-2 rounded-lg border border-border bg-surface p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold uppercase tracking-wide text-faint-foreground">Ajustar diseño</span>
        <label className="flex cursor-pointer items-center gap-1.5 text-foreground">
          <input type="checkbox" className="h-4 w-4 rounded accent-primary" checked={editando} onChange={(e) => onEditando(e.target.checked)} />
          Mover con el mouse (ver la imagen entera)
        </label>
        {tocado && (
          <Boton variante="fantasma" tamano="sm" type="button" className="ml-auto" onClick={() => onCambiar(null)}>
            Restablecer
          </Boton>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-start gap-5">
        <div className="flex flex-col gap-1.5">
          <span className="font-medium text-foreground">Tamaño base</span>
          <div className="flex gap-1">
            {[['cubrir', 'Cubrir', 'Llena toda la pieza sin deformar (puede recortar los costados)'],
              ['encajar', 'Encajar', 'Entra entera en la pieza sin deformar (puede dejar espacio)']].map(([id, texto, titulo]) => (
              <button key={id} type="button" title={titulo} onClick={() => poner({ base: id })}
                className={'rounded-md border px-2.5 py-1 ' + (a.base === id ? 'border-primary bg-primary-soft text-primary' : 'border-border text-muted-foreground hover:border-primary')}>
                {texto}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="font-medium text-foreground">Escala</span>
          <div className="flex items-center gap-2">
            <input type="range" min={10} max={300} step={1} value={Math.min(Math.max(a.escala, 10), 300)}
              onChange={(e) => poner({ escala: Number(e.target.value) })} className="w-32 accent-primary" aria-label="Escala" />
            <div className="w-20">
              <InputNumero value={a.escala} step={0.5} wheelStep={5} min={1} max={1000} onChange={(n) => poner({ escala: n })} aria-label="Escala en %" />
            </div>
            <span className="text-faint-foreground">%</span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="font-medium text-foreground">Alinear con la pieza</span>
          <div className="grid w-fit grid-cols-3 gap-0.5">
            {FILAS.map((v) => COLUMNAS.map((h) => {
              const activo = a.alineacionV === v && a.alineacionH === h;
              return (
                <button key={v + h} type="button" title={'Pegar ' + NOMBRE_V[v] + ' ' + NOMBRE_H[h]}
                  aria-label={'Alinear ' + NOMBRE_V[v] + ' ' + NOMBRE_H[h]}
                  onClick={() => poner({ alineacionV: v, alineacionH: h, dxCm: 0, dyCm: 0 })}
                  className={'flex h-6 w-6 items-center justify-center rounded border ' + (activo ? 'border-primary bg-primary-soft' : 'border-border hover:border-primary')}>
                  <span className={'h-1.5 w-1.5 rounded-full ' + (activo ? 'bg-primary' : 'bg-faint-foreground')} />
                </button>
              );
            }))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="font-medium text-foreground">Correr (cm)</span>
          <div className="flex items-center gap-2">
            <span className="text-faint-foreground">X</span>
            <div className="w-20"><InputNumero value={a.dxCm} step={0.1} wheelStep={1} onChange={(n) => poner({ dxCm: n })} aria-label="Correr en X (cm)" /></div>
            <span className="text-faint-foreground">Y</span>
            <div className="w-20"><InputNumero value={a.dyCm} step={0.1} wheelStep={1} onChange={(n) => poner({ dyCm: n })} aria-label="Correr en Y (cm)" /></div>
          </div>
          <div className="flex gap-1">
            {[['←', -0.5, 0, 'izquierda'], ['→', 0.5, 0, 'derecha'], ['↑', 0, -0.5, 'arriba'], ['↓', 0, 0.5, 'abajo']].map(([f, dx, dy, nombre]) => (
              <button key={f} type="button" onClick={() => mover(dx, dy)} title={'Correr 5 mm hacia ' + nombre} aria-label={'Correr 5 mm hacia ' + nombre}
                className="h-6 w-7 rounded border border-border text-muted-foreground hover:border-primary hover:text-foreground">{f}</button>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-2 text-faint-foreground">
        Lo que queda fuera del molde se recorta. Se usa igual en la vista previa y en el PDF de producción.
      </p>
    </div>
  );
}

