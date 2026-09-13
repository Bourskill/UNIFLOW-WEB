import { useState } from 'react';

// Tabs internas de una sección (estilo Google Drive: un apartado del nav
// lateral, con sub-pestañas adentro), no apartados nuevos del nav -- varias
// pantallas relacionadas (ej. subir/catálogo/biblioteca) son UNA sección,
// no tres.
export function SubTabs({ tabs, inicial }) {
  const [activa, setActiva] = useState(inicial || tabs[0].id);
  const tabActual = tabs.find((t) => t.id === activa) || tabs[0];

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-none gap-1 border-b border-border px-8 pt-5">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiva(t.id)}
            className={
              'rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ' +
              (activa === t.id
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground')
            }
          >
            {t.etiqueta}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-8">{tabActual.contenido}</div>
    </div>
  );
}
