import { useEffect, useRef, useState } from 'react';

// Panel lateral anclado (izquierda o derecha) que no se mueve ni empuja al
// resto del layout cuando su contenido cambia de alto -- a diferencia de un
// panel "en flujo" (un simple flex-col al lado del contenido), este vive
// como hermano flex de altura completa con su PROPIO scroll interno, así
// que el contenido de al lado (ej. el lienzo de anclaje) nunca se
// reacomoda ni "marea" cuando este panel crece o encoge.
//
// Redimensionable arrastrando el borde (mismo patrón de mousedown + drag en
// window que usa LienzoAnclaje para arrastrar una zona, por consistencia) y
// colapsable a una tira angosta de solo íconos -- arrastrar más allá del
// ancho mínimo colapsa automáticamente, en vez de dejarlo angustiosamente
// angosto a medio camino. Ancho y colapso persisten en localStorage por
// `storageKey`, para que no se resetee cada vez que se recarga la página.
function leer(clave, porDefecto) {
  try {
    const crudo = localStorage.getItem(clave);
    return crudo === null ? porDefecto : JSON.parse(crudo);
  } catch { return porDefecto; }
}
function guardar(clave, valor) {
  try { localStorage.setItem(clave, JSON.stringify(valor)); } catch { /* localStorage puede no estar disponible (modo privado, cuota) -- degrada a no persistir, no rompe el panel */ }
}

function Chevron({ hacia }) {
  // hacia: 'izquierda' | 'derecha'
  const d = hacia === 'izquierda' ? 'M14 5l-7 7 7 7' : 'M10 5l7 7-7 7';
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function PanelDock({
  storageKey,
  lado = 'derecha',
  anchoPorDefecto = 320,
  anchoMinimo = 220,
  anchoMaximo = 520,
  anchoColapsado = 52,
  children,
}) {
  const [ancho, setAncho] = useState(() => leer('panelDock:' + storageKey + ':ancho', anchoPorDefecto));
  const [colapsado, setColapsado] = useState(() => leer('panelDock:' + storageKey + ':colapsado', false));
  const arrastrandoRef = useRef(false);

  useEffect(() => { guardar('panelDock:' + storageKey + ':ancho', ancho); }, [ancho, storageKey]);
  useEffect(() => { guardar('panelDock:' + storageKey + ':colapsado', colapsado); }, [colapsado, storageKey]);

  function iniciarResize(e) {
    e.preventDefault();
    arrastrandoRef.current = true;
    const anchoInicial = ancho;
    const xInicial = e.clientX;
    const signo = lado === 'derecha' ? -1 : 1; // arrastrar hacia el centro del contenido agranda el panel
    function mover(ev) {
      if (!arrastrandoRef.current) return;
      const nuevo = anchoInicial + (ev.clientX - xInicial) * signo;
      if (nuevo < anchoMinimo) { setColapsado(true); soltar(); return; }
      setAncho(Math.min(anchoMaximo, nuevo));
    }
    function soltar() {
      arrastrandoRef.current = false;
      window.removeEventListener('mousemove', mover);
      window.removeEventListener('mouseup', soltar);
    }
    window.addEventListener('mousemove', mover);
    window.addEventListener('mouseup', soltar);
  }

  const bordeLado = lado === 'derecha' ? 'border-l' : 'border-r';
  const chevronContraer = lado === 'derecha' ? 'derecha' : 'izquierda';
  const chevronExpandir = lado === 'derecha' ? 'izquierda' : 'derecha';

  if (colapsado) {
    return (
      <div className={'flex h-full flex-none flex-col items-center border-border bg-surface py-3 ' + bordeLado} style={{ width: anchoColapsado }}>
        <button
          type="button"
          onClick={() => setColapsado(false)}
          title="Expandir panel"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
        >
          <Chevron hacia={chevronExpandir} />
        </button>
        <div className="mt-2 min-h-0 flex-1 overflow-hidden">
          {children(true)}
        </div>
      </div>
    );
  }

  return (
    <div className={'relative flex h-full flex-none flex-col border-border bg-surface ' + bordeLado} style={{ width: ancho }}>
      <div
        onMouseDown={iniciarResize}
        className={
          'absolute top-0 z-10 h-full w-2 cursor-col-resize transition-colors hover:bg-primary/30 ' +
          (lado === 'derecha' ? '-left-1' : '-right-1')
        }
      />
      <div className="flex flex-none items-center justify-end border-b border-border px-2 py-1.5">
        <button
          type="button"
          onClick={() => setColapsado(true)}
          title="Contraer panel"
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
        >
          <Chevron hacia={chevronContraer} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {children(false)}
      </div>
    </div>
  );
}
