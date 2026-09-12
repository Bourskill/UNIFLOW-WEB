import { useState } from 'react';
import { Piezas } from './paginas/Piezas.jsx';
import { Grupos } from './paginas/Grupos.jsx';
import { Disenos } from './paginas/Disenos.jsx';
import { Productos } from './paginas/Productos.jsx';
import { Pedidos } from './paginas/Pedidos.jsx';
import { Icono } from './componentes/Icono.jsx';
import './App.css';

const PESTANAS = [
  { id: 'piezas', etiqueta: 'Piezas', icono: 'pieza' },
  { id: 'grupos', etiqueta: 'Grupos', icono: 'grupo' },
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
    <div className="app">
      <header className="barra-superior">
        <div className="marca">
          <span className="marca-swatch" />
          UNIFLOW WEB
        </div>
        <span className="ruta-actual">Producción / {pestanaActual.etiqueta}</span>
      </header>

      <div className="cuerpo">
        <nav className="panel-lateral">
          {PESTANAS.map((p) => (
            <button
              key={p.id}
              className={'item-nav' + (pestana === p.id ? ' activo' : '')}
              onClick={() => setPestana(p.id)}
            >
              <Icono nombre={p.icono} />
              {p.etiqueta}
            </button>
          ))}
        </nav>

        <main className="contenido">
          {pestana === 'piezas' && <Piezas recargarSenal={recargarSenal} onCambio={marcarCambio} />}
          {pestana === 'grupos' && <Grupos recargarSenal={recargarSenal} onCambio={marcarCambio} />}
          {pestana === 'disenos' && <Disenos recargarSenal={recargarSenal} onCambio={marcarCambio} />}
          {pestana === 'productos' && <Productos recargarSenal={recargarSenal} onCambio={marcarCambio} />}
          {pestana === 'pedidos' && <Pedidos recargarSenal={recargarSenal} />}
        </main>
      </div>
    </div>
  );
}

export default App;
