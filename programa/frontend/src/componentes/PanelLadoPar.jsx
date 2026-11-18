import { useState } from 'react';
import { Boton, Aviso } from './ui.jsx';
import { TrazosPreview } from './TrazosPreview.jsx';

// "⇋ Espejo" en Diseño: el otro lado de una pieza (manga izquierda/derecha)
// SIN crear ninguna pieza nueva ni en la Biblioteca ni en la prenda.
//  - La pieza se marca "en par" en la prenda: se corta x2 (ella y su espejo).
//  - Cada producción elige si el otro lado lleva el MISMO diseño (sin
//    reflejar) o uno PROPIO (imagen, fondo y zonas solo suyas).
// Ver backend/src/dominio/resolverGrupo.js (el otro lado, virtual).

export function PanelLadoPar({ rol, nombrePrenda, pieza, enPar, propio, zonasDelOtroLado, onElegir, onQuitarPar, onCancelar }) {
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState(null);

  async function hacer(accion) {
    setTrabajando(true);
    setError(null);
    try { await accion(); } catch (e) { setError(e.message); } finally { setTrabajando(false); }
  }

  const opcion = (activa) => 'flex flex-1 cursor-pointer flex-col gap-0.5 rounded-lg border px-3 py-2 text-left ' +
    (activa ? 'border-primary bg-primary-soft/40' : 'border-border hover:border-primary/50');

  return (
    <div className="mb-3 flex flex-col gap-3 rounded-lg border border-primary/40 bg-surface p-3 text-sm">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-faint-foreground" aria-hidden="true">
          <div className="h-12 w-10"><TrazosPreview geometriaPorTalla={pieza.geometriaPorTalla || {}} fluido /></div>
          <span>+</span>
          <div className="h-12 w-10 -scale-x-100"><TrazosPreview geometriaPorTalla={pieza.geometriaPorTalla || {}} fluido /></div>
        </div>
        <div>
          <div className="font-medium">«{rol}» en par ×2</div>
          <div className="text-xs text-faint-foreground">
            Se cortan dos: esta y su espejo. No se crea ninguna pieza nueva en la Biblioteca ni en la prenda.
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row" role="radiogroup" aria-label="Diseño del otro lado">
        <button type="button" role="radio" aria-checked={enPar && !propio} disabled={trabajando}
          className={opcion(enPar && !propio)} onClick={() => hacer(() => onElegir(false))}>
          <span className="font-medium">Mismo diseño en las dos</span>
          <span className="text-xs text-faint-foreground">El otro lado lleva la misma imagen, fondo y zonas, sin reflejar.</span>
        </button>
        <button type="button" role="radio" aria-checked={enPar && propio} disabled={trabajando}
          className={opcion(enPar && propio)} onClick={() => hacer(() => onElegir(true))}>
          <span className="font-medium">Diseño distinto en el otro lado</span>
          <span className="text-xs text-faint-foreground">Aparece «{rol} (otro lado)» para ponerle su propia imagen, fondo y zonas. Solo en esta producción.</span>
        </button>
      </div>
      {enPar && !propio && zonasDelOtroLado > 0 && (
        <p className="text-xs text-amber-400">
          El otro lado tenía {zonasDelOtroLado} zona(s) propia(s): se guardan, pero no se usan mientras lleve el mismo diseño.
        </p>
      )}

      {error && <Aviso tono="error">{error}</Aviso>}
      <div className="flex flex-wrap items-center gap-2">
        <Boton type="button" variante="fantasma" tamano="sm" onClick={onCancelar} disabled={trabajando}>Cerrar</Boton>
        {enPar && (
          <Boton type="button" variante="fantasma" tamano="sm" className="ml-auto text-danger" disabled={trabajando}
            onClick={() => {
              if (window.confirm('«' + rol + '» deja de ir en par en la prenda «' + nombrePrenda + '»: se corta UNA sola en todas las producciones de esa prenda. ¿Seguir?')) {
                hacer(onQuitarPar);
              }
            }}>
            No va en par
          </Boton>
        )}
      </div>
    </div>
  );
}
