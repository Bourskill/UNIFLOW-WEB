import { useEffect, useRef, useState } from 'react';
import { leerColor, coloresRecientes, recordarColor, alCambiarRecientes } from '../utilidades/colores.js';

// Un solo selector de color para toda la app:
//  - la muestra abre el selector de colores del sistema;
//  - el campo acepta lo que se pegue o escriba: "FF0000", "#f00",
//    "rgb(255,0,0)"... y lo aplica al instante (Enter o salir del campo, si
//    quedó a medias, vuelve al color actual);
//  - abajo, los últimos colores usados (los mismos en todos los selectores).
// `extra`: botones propios antes de los recientes (p. ej. "Automático").
export function SelectorColor({ valor, onCambiar, etiqueta = 'Color', extra = null, compacto = false }) {
  const actual = leerColor(valor) || '#000000';
  const [texto, setTexto] = useState(actual.toUpperCase());
  const [editando, setEditando] = useState(false);
  const [recientes, setRecientes] = useState(coloresRecientes);
  const muestra = useRef(null);

  useEffect(() => alCambiarRecientes(() => setRecientes(coloresRecientes())), []);
  // Si el color cambia desde afuera (otra zona, deshacer), el campo lo sigue.
  useEffect(() => { if (!editando) setTexto(actual.toUpperCase()); }, [actual, editando]);

  // El selector del sistema avisa en cada movimiento (`input`): se aplica en
  // vivo, pero se recuerda una sola vez, al cerrarlo (`change`).
  useEffect(() => {
    const el = muestra.current;
    if (!el) return undefined;
    const alCerrar = () => recordarColor(el.value);
    el.addEventListener('change', alCerrar);
    return () => el.removeEventListener('change', alCerrar);
  }, []);

  function aplicar(c, recordar = true) {
    const color = leerColor(c);
    if (!color) return false;
    if (color !== actual) onCambiar(color);
    if (recordar) recordarColor(color);
    return true;
  }
  function alEscribir(v) {
    setTexto(v);
    // Completo: se aplica ya (sin recordar cada tecla); se recuerda al salir.
    // El corto ("F00") recién al salir: si no, escribiendo "FF0000" pasaría por amarillo.
    const c = /^#?[0-9a-f]{3}$/i.test(v.trim()) ? null : leerColor(v);
    if (c && c !== actual) onCambiar(c);
  }
  function alSalir() {
    setEditando(false);
    const c = leerColor(texto);
    if (c) aplicar(c);
    setTexto((c || actual).toUpperCase());
  }

  const lado = compacto ? 'h-6 w-6' : 'h-7 w-7';
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <label className={'relative shrink-0 cursor-pointer overflow-hidden rounded-md border border-border shadow-inner ' + lado}
          title="Elegir en la paleta" style={{ background: actual }}>
          <input ref={muestra} type="color" value={actual} onChange={(e) => aplicar(e.target.value, false)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label={etiqueta + ': elegir en la paleta'} />
        </label>
        <input type="text" value={texto} spellCheck={false} autoComplete="off"
          aria-label={etiqueta + ' (hex)'} title="Pegá o escribí el color: FF0000, #f00, rgb(255,0,0)…"
          onFocus={(e) => { setEditando(true); e.target.select(); }}
          onChange={(e) => alEscribir(e.target.value)}
          onPaste={(e) => {
            const pegado = e.clipboardData?.getData('text');
            if (leerColor(pegado)) { e.preventDefault(); setTexto(leerColor(pegado).toUpperCase()); aplicar(pegado); }
          }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } if (e.key === 'Escape') { setTexto(actual.toUpperCase()); e.currentTarget.blur(); } }}
          onBlur={alSalir}
          className={'w-[84px] rounded-md border bg-surface px-2 py-1 font-mono text-xs uppercase text-foreground outline-none focus:border-primary ' +
            (editando && texto && !leerColor(texto) ? 'border-danger' : 'border-border')} />
        <button type="button" title="Copiar el color" aria-label={etiqueta + ': copiar'}
          className="rounded px-1 text-[11px] text-faint-foreground hover:text-foreground"
          onClick={() => { try { navigator.clipboard?.writeText(actual.toUpperCase()); } catch { /* sin portapapeles */ } }}>
          Copiar
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {extra}
        {recientes.length === 0 && <span className="text-[11px] text-faint-foreground">Acá van a aparecer los últimos colores que uses.</span>}
        {recientes.map((c) => (
          <button key={c} type="button" onClick={() => aplicar(c)} title={c.toUpperCase()} aria-label={etiqueta + ' ' + c}
            className={'h-5 w-5 rounded border transition-transform hover:scale-110 ' + (c === actual ? 'border-primary ring-2 ring-primary/50' : 'border-border')}
            style={{ background: c }} />
        ))}
      </div>
    </div>
  );
}
