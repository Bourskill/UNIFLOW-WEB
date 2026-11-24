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

export function PanelAjusteArte({ ajuste, onCambiar, editando, onEditando, calce }) {
  const a = normalizarAjusteArte(ajuste);
  const poner = (cambios) => onCambiar({ ...a, ...cambios });
  // Con puntos de calce enganchados, ellos ubican el arte (y con dos o más,
  // también lo escalan): lo que ya no se usa queda apagado.
  const enganchados = (calce?.puntos || []).filter((p) => p.destino).length;
  const posicionPorCalce = enganchados > 0;
  const escalaPorCalce = enganchados > 1;
  const mover = (dx, dy) => poner({ dxCm: Math.round((a.dxCm + dx) * 100) / 100, dyCm: Math.round((a.dyCm + dy) * 100) / 100 });
  const tocado = !!ajuste;

  return (
    <div className="mt-2 rounded-lg border border-border bg-surface p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold uppercase tracking-wide text-faint-foreground">Ajustar diseño</span>
        <label className="flex cursor-pointer items-center gap-1.5 text-foreground">
          <input type="checkbox" className="h-4 w-4 rounded accent-primary" checked={editando && !posicionPorCalce} disabled={posicionPorCalce} onChange={(e) => onEditando(e.target.checked)} />
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
          <span className="font-medium text-foreground">Espejo</span>
          <div className="flex gap-1">
            {[['espejoH', '⇆ Horizontal', 'Voltear el diseño de izquierda a derecha'],
              ['espejoV', '⇅ Vertical', 'Voltear el diseño de arriba abajo']].map(([campo, texto, titulo]) => (
              <button key={campo} type="button" title={titulo} aria-pressed={a[campo]} onClick={() => poner({ [campo]: !a[campo] })}
                className={'rounded-md border px-2.5 py-1 ' + (a[campo] ? 'border-primary bg-primary-soft text-primary' : 'border-border text-muted-foreground hover:border-primary')}>
                {texto}
              </button>
            ))}
          </div>
        </div>

        <div className={'flex flex-col gap-1.5 ' + (escalaPorCalce ? 'pointer-events-none opacity-40' : '')} aria-disabled={escalaPorCalce}>
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

        <div className={'flex flex-col gap-1.5 ' + (posicionPorCalce ? 'pointer-events-none opacity-40' : '')} aria-disabled={posicionPorCalce}>
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

        <div className={'flex flex-col gap-1.5 ' + (posicionPorCalce ? 'pointer-events-none opacity-40' : '')} aria-disabled={posicionPorCalce}>
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
      {calce && <SeccionCalce calce={calce} enganchados={enganchados} />}
      <p className="mt-2 text-faint-foreground">
        Lo que queda fuera del molde se recorta. Se usa igual en la vista previa y en el PDF de producción.
      </p>
    </div>
  );
}


// Puntos de calce: dónde el diseño tiene que tocar la costura para seguir en
// la pieza de al lado. Cada uno se marca sobre el arte y se engancha a un
// punto del molde; en cada talla el arte se acomoda para que caigan ahí.
function SeccionCalce({ calce, enganchados }) {
  const { puntos, espejo, onEspejo, marcando, enganchandoId, onMarcar, onEnganchar, onQuitar, onCancelar, onCambiarPunto, Medida } = calce;
  const nombreDe = (id) => 'C' + (puntos.findIndex((q) => q.id === id) + 1);
  const ocupado = marcando || !!enganchandoId;
  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold uppercase tracking-wide text-faint-foreground">Puntos de calce</span>
        <span className="text-faint-foreground">para que el diseño siga en la pieza de al lado</span>
      </div>
      {puntos.length > 0 && (
        <ul className="flex flex-col gap-1">
          {puntos.map((p, i) => {
            const activo = enganchandoId === p.id;
            return (
              <li key={p.id} className={'flex flex-col gap-2 rounded-md border px-2 py-1.5 ' + (activo ? 'border-amber-500/60 bg-amber-500/10' : 'border-border')}>
                <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-[#ff4d8d]">C{i + 1}</span>
                <span className="text-muted-foreground">
                  {activo ? 'Hacé clic en el molde…'
                    : p.destino ? (<>en {p.descripcion}{!p.resuelto && <span className="text-danger"> · no se encuentra en esta talla</span>}</>)
                    : <span className="text-danger">sin enganchar al molde</span>}
                </span>
                <span className="ml-auto flex gap-1">
                  {!activo && (
                    <button type="button" disabled={ocupado} onClick={() => onEnganchar(p.id)}
                      className="rounded border border-border px-1.5 py-0.5 text-muted-foreground hover:border-primary hover:text-foreground disabled:opacity-40">
                      {p.destino ? 'Cambiar punto del molde' : 'Enganchar'}
                    </button>
                  )}
                  <button type="button" onClick={() => onQuitar(p.id)} aria-label={'Quitar el punto de calce ' + (i + 1)}
                    className="rounded px-1.5 py-0.5 text-faint-foreground hover:bg-danger-soft hover:text-danger">×</button>
                </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-24 flex-none text-muted-foreground">En el diseño</span>
                  <span className="text-faint-foreground">X</span>
                  <div className="w-20"><InputNumero value={Math.round(p.u * 1000) / 10} step={0.1} wheelStep={1} min={0} max={100}
                    onChange={(n) => onCambiarPunto(p.id, { u: Math.min(Math.max(n, 0), 100) / 100 })} aria-label={'Posición horizontal del punto ' + (i + 1) + ' en el diseño (%)'} /></div>
                  <span className="text-faint-foreground">Y</span>
                  <div className="w-20"><InputNumero value={Math.round(p.v * 1000) / 10} step={0.1} wheelStep={1} min={0} max={100}
                    onChange={(n) => onCambiarPunto(p.id, { v: Math.min(Math.max(n, 0), 100) / 100 })} aria-label={'Posición vertical del punto ' + (i + 1) + ' en el diseño (%)'} /></div>
                  <span className="text-faint-foreground">% del diseño, desde arriba a la izquierda</span>
                </div>
                {p.destino && Medida && (
                  <div className="flex flex-col gap-1">
                    <Medida etiqueta="Mover X en el molde" valor={p.destino.x} onCambiar={(m) => onCambiarPunto(p.id, { destino: { ...p.destino, x: { ...p.destino.x, ...m } } })} />
                    <Medida etiqueta="Mover Y en el molde" valor={p.destino.y} onCambiar={(m) => onCambiarPunto(p.id, { destino: { ...p.destino, y: { ...p.destino.y, ...m } } })} />
                  </div>
                )}
                {p.par && puntos.some((q) => q.id === p.par) && (
                  <span className="text-faint-foreground">Espejo de {nombreDe(p.par)}: lo que cambies acá se refleja en él.</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {ocupado ? (
          <Boton variante="fantasma" tamano="sm" type="button" onClick={onCancelar}>
            {marcando ? 'Cancelar' : 'Terminar después'}
          </Boton>
        ) : (
          <Boton tamano="sm" type="button" onClick={onMarcar} disabled={puntos.length >= 6}>+ Marcar punto en el diseño</Boton>
        )}
        <label className="flex cursor-pointer items-center gap-1.5 text-foreground">
          <input type="checkbox" className="h-4 w-4 rounded accent-primary" checked={espejo} onChange={(e) => onEspejo(e.target.checked)} />
          Con su espejo del otro lado
        </label>
      </div>
      <p className="text-faint-foreground">
        {enganchados === 0 && 'Marcá sobre el diseño el punto que toca la costura y después hacé clic en el punto del molde donde tiene que caer (mejor un piquete: está en todas las tallas).'}
        {enganchados === 1 && 'Con un punto, el diseño queda fijo ahí en todas las tallas; la escala la elegís vos. Con dos, la escala también sale sola.'}
        {enganchados > 1 && 'El diseño se ubica y se escala solo en cada talla para que estos puntos caigan en el molde (sin deformarse). Hacé lo mismo en la pieza de al lado, con los piquetes de la misma costura.'}
      </p>
    </div>
  );
}
