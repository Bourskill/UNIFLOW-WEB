import { useState } from 'react';
import { Molderias } from './paginas/Molderias.jsx';
import { Disenos } from './paginas/Disenos.jsx';
import { Productos } from './paginas/Productos.jsx';
import { Pedidos } from './paginas/Pedidos.jsx';
import './App.css';

const PESTANAS = [
  { id: 'molderias', etiqueta: 'Molderías' },
  { id: 'disenos', etiqueta: 'Diseños' },
  { id: 'productos', etiqueta: 'Productos' },
  { id: 'pedidos', etiqueta: 'Pedidos' },
];

function App() {
  const [pestana, setPestana] = useState('molderias');
  const [recargarSenal, setRecargarSenal] = useState(0);
  const marcarCambio = () => setRecargarSenal((n) => n + 1);

  return (
    <div className="app">
      <header>
        <h1>UNIFLOW WEB</h1>
        <p>Moldería → Diseño → Producto → Pedido → generar. Cadena completa, sin ejemplos fijos.</p>
      </header>

      <nav className="pestanas">
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            className={pestana === p.id ? 'activa' : ''}
            onClick={() => setPestana(p.id)}
          >
            {p.etiqueta}
          </button>
        ))}
      </nav>

      {pestana === 'molderias' && <Molderias onCambio={marcarCambio} />}
      {pestana === 'disenos' && <Disenos recargarSenal={recargarSenal} onCambio={marcarCambio} />}
      {pestana === 'productos' && <Productos recargarSenal={recargarSenal} onCambio={marcarCambio} />}
      {pestana === 'pedidos' && <Pedidos recargarSenal={recargarSenal} />}
    </div>
  );
}

export default App;
