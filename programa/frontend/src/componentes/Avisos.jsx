import { useAvisos, descartarAviso } from '../datos/avisos.js';

// Avisos flotantes de lo que pasa por detrás (ver datos/avisos.js).
export function Avisos() {
  const avisos = useAvisos();
  if (avisos.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-2" role="status" aria-live="polite">
      {avisos.map((a) => (
        <div
          key={a.id}
          className={
            'pointer-events-auto flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm shadow-md ' +
            (a.tono === 'error'
              ? 'border-danger/30 bg-danger-soft text-danger'
              : 'border-primary/20 bg-primary-soft text-primary')
          }
        >
          <span className="flex-1">{a.mensaje}</span>
          <button
            type="button"
            onClick={() => descartarAviso(a.id)}
            className="cursor-pointer opacity-60 hover:opacity-100"
            aria-label="Cerrar aviso"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
