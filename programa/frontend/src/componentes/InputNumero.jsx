import { useEffect, useRef, useState } from 'react';

// Arregla dos bugs reales de los <input type="number"> del panel de anclaje:
//
// 1) Escribir "-" solo (para empezar un número negativo) se convertía en
//    NaN de inmediato: el código de cada campo hacía Number(e.target.value)
//    en CADA tecla, sin tolerar un estado intermedio de escritura. En el
//    peor caso (value={zona.rotacion || 0}) ese NaN se mostraba como "0" en
//    el mismo instante -- el signo desaparecía antes de poder escribir el
//    primer dígito.
// 2) La rueda del mouse usaba el `step` nativo (pensado para las flechitas
//    del input, 0.1cm = 1mm de precisión) para CUALQUIER movimiento --
//    scrollear encima de un campo enfocado lo movía de a 1mm en vez del
//    1cm por "muesca" que se espera de la rueda.
//
// UN <input type="number"> nativo NO alcanza para arreglar (1) del todo:
// aunque el estado local tolere "-" a mitad de tecleo, React vuelve a
// asignar `value` en cada render -- y esa asignación PROGRAMÁTICA (a
// diferencia de una tecla real del usuario) dispara el algoritmo de saneo
// del navegador para type=number, que descarta cualquier texto que todavía
// no sea un número válido ("-" incluido) y lo deja en "" (confirmado en
// consola: "The specified value "-" cannot be parsed..."). Es una
// limitación real del tipo de input, no del código -- el arreglo es usar
// type="text" (que nunca sanea nada; la validación es toda nuestra, ver
// `alCambiar`) con flechitas propias en vez de las nativas del navegador
// (que type="text" no trae).
const CLASE_INPUT =
  'w-full rounded-lg border border-border bg-surface py-2 pl-3 pr-6 text-sm text-foreground ' +
  'placeholder:text-faint-foreground outline-none transition-shadow ' +
  'focus:border-primary focus:ring-4 focus:ring-primary-soft';

function decimalesDe(paso) {
  const s = String(paso);
  return s.includes('.') ? s.split('.')[1].length : 0;
}

export function InputNumero({ value, onChange, step = 0.1, wheelStep = 1, min, max, className = '', ...props }) {
  const [borrador, setBorrador] = useState(() => String(value ?? ''));
  const enfocadoRef = useRef(false);
  const inputRef = useRef(null);
  const decimales = decimalesDe(step);

  // Sincroniza el borrador con el valor real solo cuando el campo NO se
  // está editando -- si sincronizara siempre, un cambio externo a mitad de
  // tecleo (ej. otro control que recalcula este mismo valor) pisaría lo que
  // el usuario está escribiendo ahora mismo.
  useEffect(() => {
    if (!enfocadoRef.current) setBorrador(String(value ?? ''));
  }, [value]);

  function limitar(n) {
    let v = n;
    if (typeof min === 'number' && v < min) v = min;
    if (typeof max === 'number' && v > max) v = max;
    return v;
  }

  function confirmar(n) {
    const limitado = Number(limitar(n).toFixed(decimales));
    setBorrador(String(limitado));
    onChange(limitado);
  }

  function nudge(delta) {
    const actual = Number(borrador);
    const base = Number.isFinite(actual) ? actual : (value ?? 0);
    confirmar(base + delta);
  }

  // Ref a la última versión de `nudge` -- el listener nativo de más abajo se
  // adjunta UNA sola vez (no puede depender de `borrador`/`value`/`step` sin
  // volver a adjuntarse en cada tecla), así que llama siempre a través de
  // este ref para ver el estado más reciente sin efecto de clausura vieja.
  const nudgeRef = useRef(nudge);
  nudgeRef.current = nudge;

  // La rueda necesita un listener NATIVO no-pasivo: el `onWheel` de React
  // (y el `wheel` del root en general) se adjunta como pasivo por defecto,
  // así que un `e.preventDefault()` ahí no hace nada y el navegador tira
  // "Unable to preventDefault inside passive event listener invocation" en
  // consola en cada muesca -- sin poder evitarlo, la página se desplaza
  // ADEMÁS de cambiar el valor. `{ passive: false }` es la única forma real
  // de poder frenar el scroll de la página mientras se gira la rueda acá.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return undefined;
    function alRueda(e) {
      if (document.activeElement !== el) return; // no capturar el scroll de la página
      e.preventDefault();
      nudgeRef.current(e.deltaY < 0 ? wheelStep : -wheelStep);
    }
    el.addEventListener('wheel', alRueda, { passive: false });
    return () => el.removeEventListener('wheel', alRueda);
  }, [wheelStep]);

  function alCambiar(e) {
    const texto = e.target.value;
    // Tolera cualquier estado intermedio real de escritura de un número
    // (signo solo, punto al final, vacío) -- cualquier otro caracter (una
    // letra, un "+", una "e") ni siquiera se guarda en el borrador, misma
    // sensación que un <input type="number"> nativo descartando teclas
    // inválidas, pero sin su saneo agresivo del signo.
    if (texto !== '' && !/^-?\d*\.?\d*$/.test(texto)) return;
    setBorrador(texto);
    if (texto === '' || texto === '-' || texto.endsWith('.')) return;
    const n = Number(texto);
    if (Number.isFinite(n)) onChange(limitar(n));
  }

  function alEnfocar() { enfocadoRef.current = true; }
  function alPerderFoco() {
    enfocadoRef.current = false;
    const n = Number(borrador);
    if (borrador === '' || !Number.isFinite(n)) { setBorrador(String(value ?? '')); return; }
    confirmar(n);
  }

  function alTecla(e) {
    if (e.key === 'ArrowUp') { e.preventDefault(); nudge(step); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); nudge(-step); }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className={CLASE_INPUT + ' ' + className}
        value={borrador}
        onChange={alCambiar}
        onFocus={alEnfocar}
        onBlur={alPerderFoco}
        onKeyDown={alTecla}
        {...props}
      />
      {/* Flechitas propias -- reemplazan al spinner nativo que type="text"
          no trae. Mismo paso fino (`step`, mm) que ArrowUp/ArrowDown; la
          rueda usa el paso propio más grueso (`wheelStep`, cm). */}
      <div className="absolute inset-y-0 right-0.5 flex w-5 flex-col justify-center gap-px py-1">
        <button
          type="button" tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => nudge(step)}
          className="flex h-1/2 items-center justify-center rounded-sm text-faint-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
        >
          <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><path d="M1 6l4-4 4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <button
          type="button" tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => nudge(-step)}
          className="flex h-1/2 items-center justify-center rounded-sm text-faint-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
        >
          <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><path d="M1 4l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
    </div>
  );
}
