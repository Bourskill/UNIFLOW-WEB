import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Boton, Input } from './ui.jsx';

// Pide un texto con una ventanita propia. Reemplaza a window.prompt, que la
// app de escritorio (Electron) no tiene: ahí prompt() no muestra nada y
// devuelve null, así que "Duplicar" o "Guardar plantilla" no hacían nada.
// Devuelve el texto, o null si se cancela.
export function pedirTexto(mensaje, inicial = '') {
  return new Promise((resolver) => {
    const lugar = document.createElement('div');
    document.body.appendChild(lugar);
    const raiz = createRoot(lugar);
    const terminar = (valor) => {
      resolver(valor);
      setTimeout(() => { raiz.unmount(); lugar.remove(); }, 0);
    };
    raiz.render(<Ventana mensaje={mensaje} inicial={inicial} onTerminar={terminar} />);
  });
}

function Ventana({ mensaje, inicial, onTerminar }) {
  const [valor, setValor] = useState(inicial);
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onTerminar(null); }}>
      <form className="w-full max-w-md rounded-xl border border-border bg-surface p-4 shadow-xl"
        onSubmit={(e) => { e.preventDefault(); onTerminar(valor); }}>
        <p className="mb-3 text-sm text-foreground">{mensaje}</p>
        <Input autoFocus value={valor} onChange={(e) => setValor(e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onTerminar(null); } }} />
        <div className="mt-4 flex justify-end gap-2">
          <Boton type="button" variante="fantasma" onClick={() => onTerminar(null)}>Cancelar</Boton>
          <Boton type="submit" variante="primario">Aceptar</Boton>
        </div>
      </form>
    </div>
  );
}
