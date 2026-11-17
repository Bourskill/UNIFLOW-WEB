import { InputNumero } from './InputNumero.jsx';
import { normalizarFondo } from '../utilidades/fondoPieza.js';

// Fondo de color para TODAS las piezas del diseño, de una sola vez: sólido o
// degradado. Va debajo del arte, así se pueden subir los diseños en PNG con
// transparencia y el color lo pone esto.
const TIPOS = [['ninguno', 'Sin fondo'], ['solido', 'Sólido'], ['degradado', 'Degradado']];
// Dirección del degradado: hacia dónde va del color 1 al color 2.
const DIRECCIONES = [[0, '→', 'izquierda a derecha'], [90, '↓', 'arriba hacia abajo'], [45, '↘', 'diagonal hacia abajo'], [315, '↗', 'diagonal hacia arriba'], [180, '←', 'derecha a izquierda'], [270, '↑', 'abajo hacia arriba']];

function ColorCampo({ etiqueta, valor, onCambiar }) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-faint-foreground">{etiqueta}</span>
      <input type="color" value={valor} onChange={(e) => onCambiar(e.target.value)}
        className="h-7 w-9 cursor-pointer rounded border border-border bg-transparent p-0.5" aria-label={etiqueta} />
      {/* Sin controlar: se puede escribir a medias ("#12"); se aplica recién
          cuando es un color completo. `key` lo reinicia si cambia desde afuera. */}
      <input type="text" key={valor} defaultValue={valor} maxLength={7} spellCheck={false}
        onChange={(e) => { const v = e.target.value.trim(); if (/^#[0-9a-fA-F]{6}$/.test(v) && v.toLowerCase() !== valor) onCambiar(v.toLowerCase()); }}
        className="w-[76px] rounded-md border border-border bg-surface px-2 py-1 font-mono text-xs text-foreground outline-none focus:border-primary"
        aria-label={etiqueta + ' (hex)'} />
    </label>
  );
}

// `heredable`: es el fondo de UNA pieza, que puede seguir al general
// (fondo === null → "Igual que todas", mostrando `base`) o tener el suyo.
export function PanelFondo({ fondo, onCambiar, deshabilitado, titulo = 'Fondo de todas las piezas', heredable = false, base = null }) {
  const heredando = heredable && fondo == null;
  const f = normalizarFondo(heredando ? base : fondo);
  // Al pasar de "Igual que todas" a uno propio, arranca con los colores del general.
  const poner = (cambios) => onCambiar({ ...f, ...cambios });
  const muestra = f.tipo === 'solido' ? f.color1
    : f.tipo === 'degradado' ? 'linear-gradient(' + (f.anguloGrados + 90) + 'deg, ' + f.color1 + ', ' + f.color2 + ')'
      : 'transparent';
  const claseBoton = (activo) => 'rounded-md border px-2.5 py-1 ' + (activo ? 'border-primary bg-primary-soft text-primary' : 'border-border text-muted-foreground hover:border-primary');

  return (
    <div className={'mt-3 rounded-lg border border-border bg-surface p-3 text-xs ' + (deshabilitado ? 'pointer-events-none opacity-50' : '')}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold uppercase tracking-wide text-faint-foreground">{titulo}</span>
        <div className="flex flex-wrap gap-1">
          {heredable && (
            <button type="button" onClick={() => onCambiar(null)} className={claseBoton(heredando)}
              title="Usa el fondo general del diseño">
              Igual que todas
            </button>
          )}
          {TIPOS.map(([id, texto]) => (
            <button key={id} type="button" onClick={() => poner({ tipo: id })} className={claseBoton(!heredando && f.tipo === id)}>
              {texto}
            </button>
          ))}
        </div>
        {f.tipo !== 'ninguno' && (
          <span className="ml-auto h-6 w-16 rounded border border-border" style={{ background: muestra }} title="Así se ve el fondo" />
        )}
      </div>

      {!heredando && f.tipo !== 'ninguno' && (
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <ColorCampo etiqueta={f.tipo === 'degradado' ? 'Color 1' : 'Color'} valor={f.color1} onCambiar={(c) => poner({ color1: c })} />
          {f.tipo === 'degradado' && (
            <>
              <button type="button" title="Intercambiar colores" aria-label="Intercambiar colores"
                onClick={() => poner({ color1: f.color2, color2: f.color1 })}
                className="h-7 w-7 rounded border border-border text-muted-foreground hover:border-primary hover:text-foreground">⇄</button>
              <ColorCampo etiqueta="Color 2" valor={f.color2} onCambiar={(c) => poner({ color2: c })} />
              <div className="flex items-center gap-1.5">
                <span className="text-faint-foreground">Dirección</span>
                {DIRECCIONES.map(([grados, flecha, nombre]) => (
                  <button key={grados} type="button" title={'De ' + nombre} aria-label={'Degradado de ' + nombre}
                    onClick={() => poner({ anguloGrados: grados })}
                    className={'h-7 w-7 rounded border ' + (f.anguloGrados === grados ? 'border-primary bg-primary-soft text-primary' : 'border-border text-muted-foreground hover:border-primary')}>
                    {flecha}
                  </button>
                ))}
                <div className="w-20">
                  <InputNumero value={f.anguloGrados} step={1} wheelStep={15} min={0} max={359} onChange={(n) => poner({ anguloGrados: n })} aria-label="Ángulo del degradado en grados" />
                </div>
                <span className="text-faint-foreground">°</span>
              </div>
            </>
          )}
        </div>
      )}
      <p className="mt-2 text-faint-foreground">
        {heredable
          ? heredando
            ? 'Esta pieza usa el fondo general' + (f.tipo === 'ninguno' ? ' (ahora, sin fondo)' : '') + '. Elegí Sólido o Degradado para darle uno propio solo a ella.'
            : f.tipo === 'ninguno'
              ? 'Esta pieza va sin fondo, aunque las demás lo tengan.'
              : 'Solo esta pieza lleva este fondo; las demás siguen con el general.'
          : f.tipo === 'ninguno'
            ? 'Poné un color o degradado a todas las piezas de una vez y subí los diseños en PNG con fondo transparente encima.'
            : 'Se aplica a todas las piezas (salvo las que tengan uno propio), debajo de la imagen de cada una. Las partes transparentes del PNG dejan ver este fondo.'}
      </p>
    </div>
  );
}
