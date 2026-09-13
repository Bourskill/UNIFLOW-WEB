// Primitivas propias de UI sobre Tailwind (mismo espíritu que shadcn/ui: se
// escriben una vez acá y se reusan en todas las pantallas, en vez de repetir
// clases sueltas o volver a escribir CSS a mano en cada página).

const ESTILOS_BOTON = {
  primario: 'bg-primary text-primary-foreground hover:bg-blue-700 border-transparent',
  secundario: 'bg-surface text-foreground hover:bg-surface-muted border-border',
  fantasma: 'bg-transparent text-muted-foreground hover:bg-surface-muted border-transparent',
  peligro: 'bg-danger text-white hover:bg-red-700 border-transparent',
};

export function Boton({ variante = 'secundario', tamano = 'md', className = '', ...props }) {
  const tamanos = tamano === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm';
  return (
    <button
      className={
        'inline-flex items-center justify-center gap-1.5 rounded-lg border font-medium ' +
        'transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ' +
        tamanos + ' ' + ESTILOS_BOTON[variante] + ' ' + className
      }
      {...props}
    />
  );
}

export function Campo({ etiqueta, ayuda, children, className = '' }) {
  return (
    <label className={'flex flex-col gap-1.5 text-sm text-muted-foreground ' + className}>
      {etiqueta && <span className="font-medium text-foreground">{etiqueta}</span>}
      {children}
      {ayuda && <span className="text-xs text-faint-foreground">{ayuda}</span>}
    </label>
  );
}

const CLASE_INPUT =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground ' +
  'placeholder:text-faint-foreground outline-none transition-shadow ' +
  'focus:border-primary focus:ring-4 focus:ring-primary-soft';

export function Input(props) {
  return <input className={CLASE_INPUT + ' ' + (props.className || '')} {...props} />;
}

export function Select(props) {
  return <select className={CLASE_INPUT + ' ' + (props.className || '')} {...props} />;
}

export function Tarjeta({ as: Etiqueta = 'div', className = '', ...props }) {
  return (
    <Etiqueta
      className={'rounded-xl border border-border bg-surface p-5 shadow-sm ' + className}
      {...props}
    />
  );
}

export function Chip({ tono = 'neutro', className = '', ...props }) {
  const tonos = {
    neutro: 'bg-surface-muted text-muted-foreground border-border',
    activo: 'bg-primary-soft text-primary border-primary/20',
    peligro: 'bg-danger-soft text-danger border-danger/20',
  };
  return (
    <span
      className={
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ' +
        tonos[tono] + ' ' + className
      }
      {...props}
    />
  );
}

export function Aviso({ tono = 'info', children }) {
  const tonos = {
    info: 'bg-primary-soft text-primary border-primary/20',
    error: 'bg-danger-soft text-danger border-danger/20',
  };
  return (
    <p className={'rounded-lg border px-3 py-2 text-sm ' + tonos[tono]}>{children}</p>
  );
}

// El "por qué" de algo puntual va detrás de un "?", no como párrafo siempre
// visible -- la pantalla se lee sola, y el detalle está ahí para quien lo
// necesite. <details> nativo: sin JS propio, se cierra solo con Escape/foco.
export function Ayuda({ children }) {
  return (
    <details className="group relative inline-block align-middle">
      <summary
        className={
          'inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-full border ' +
          'border-current text-[10px] font-bold leading-none opacity-70 hover:opacity-100 ' +
          '[&::-webkit-details-marker]:hidden [&::marker]:content-none'
        }
      >
        ?
      </summary>
      <div className="absolute left-0 top-5 z-10 w-64 rounded-lg border border-border bg-surface p-2.5 text-xs font-normal normal-case text-muted-foreground shadow-md">
        {children}
      </div>
    </details>
  );
}
