import { useState } from 'react';

// Tabs internas de una sección (estilo Google Drive: un apartado del nav
// lateral, con sub-pestañas adentro), no apartados nuevos del nav -- varias
// pantallas relacionadas (ej. subir/catálogo/biblioteca) son UNA sección,
// no tres.
export function SubTabs({ tabs, inicial }) {
  const primera = inicial || tabs[0].id;
  const [activa, setActiva] = useState(primera);
  // Una vez visitada, una pestaña queda montada para siempre (oculta con
  // `hidden`, no sacada del árbol con `&&`) -- volver a entrar no debe
  // repetir su carga inicial. Pero NO se montan las 3 de una: eso dispararía
  // de arranque el fetch de las 3 pantallas a la vez (mismo problema en
  // App.jsx con los 3 apartados), y contra Supabase gratis eso es tráfico
  // real de más, no gratis. Cada pestaña se suma a la lista recién la
  // primera vez que se visita.
  const [visitadas, setVisitadas] = useState(() => new Set([primera]));

  function ir(id) {
    setActiva(id);
    setVisitadas((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-none gap-1 border-b border-border px-8 pt-5">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => ir(t.id)}
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
      {tabs.filter((t) => visitadas.has(t.id)).map((t) => (
        <div key={t.id} hidden={activa !== t.id} className="min-h-0 flex-1 overflow-y-auto p-8">
          {t.contenido}
        </div>
      ))}
    </div>
  );
}
