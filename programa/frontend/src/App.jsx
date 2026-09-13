import { useState } from 'react';
import { Piezas } from './paginas/Piezas.jsx';
import { Disenos } from './paginas/Disenos.jsx';
import { Productos } from './paginas/Productos.jsx';
import { Pedidos } from './paginas/Pedidos.jsx';
import { Icono } from './componentes/Icono.jsx';
import { EstadoServidor } from './componentes/EstadoServidor.jsx';

// Piezas y Grupos viven en una sola pestaña: subir una pieza y armar la
// prenda que la usa es un solo flujo, no "crear un producto" y después,
// aparte, "ver el catálogo" (feedback explícito del usuario).
const PESTANAS = [
  { id: 'piezas', etiqueta: 'Piezas y Grupos', icono: 'pieza' },
  { id: 'disenos', etiqueta: 'Diseños', icono: 'diseno' },
  { id: 'productos', etiqueta: 'Productos', icono: 'producto' },
  { id: 'pedidos', etiqueta: 'Pedidos', icono: 'pedido' },
];

function App() {
  const [pestana, setPestana] = useState('piezas');
  const [recargarSenal, setRecargarSenal] = useState(0);
  const marcarCambio = () => setRecargarSenal((n) => n + 1);
  const pestanaActual = PESTANAS.find((p) => p.id === pestana);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-14 flex-none items-center justify-between border-b border-border bg-surface px-5">
        <div className="flex items-center gap-2.5 text-sm font-semibold tracking-tight">
          <span className="h-5 w-5 rounded-md bg-primary" />
          UNIFLOW WEB
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-faint-foreground">Producción / {pestanaActual.etiqueta}</span>
          <EstadoServidor />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="flex w-56 flex-none flex-col gap-1 border-r border-border bg-surface p-3">
          {PESTANAS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPestana(p.id)}
              className={
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ' +
                (pestana === p.id
                  ? 'bg-primary-soft font-medium text-primary'
                  : 'text-muted-foreground hover:bg-surface-muted hover:text-foreground')
              }
            >
              <Icono nombre={p.icono} />
              {p.etiqueta}
            </button>
          ))}
        </nav>

        <main className="flex-1 overflow-y-auto p-8">
          {pestana === 'piezas' && <Piezas recargarSenal={recargarSenal} onCambio={marcarCambio} />}
          {pestana === 'disenos' && <Disenos recargarSenal={recargarSenal} onCambio={marcarCambio} />}
          {pestana === 'productos' && <Productos recargarSenal={recargarSenal} onCambio={marcarCambio} />}
          {pestana === 'pedidos' && <Pedidos recargarSenal={recargarSenal} />}
        </main>
      </div>
    </div>
  );
}

export default App;
