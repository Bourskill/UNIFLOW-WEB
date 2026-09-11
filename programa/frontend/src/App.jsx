import { useState } from 'react';
import { Molderias } from './paginas/Molderias.jsx';
import { Produccion } from './paginas/Produccion.jsx';
import './App.css';

function App() {
  const [pestana, setPestana] = useState('molderias');
  const [recargarSenal, setRecargarSenal] = useState(0);

  return (
    <div className="app">
      <header>
        <h1>UNIFLOW WEB</h1>
        <p>Moldería real → nesting real → PDF. Sin datos de ejemplo.</p>
      </header>

      <nav className="pestanas">
        <button
          className={pestana === 'molderias' ? 'activa' : ''}
          onClick={() => setPestana('molderias')}
        >
          Molderías
        </button>
        <button
          className={pestana === 'produccion' ? 'activa' : ''}
          onClick={() => setPestana('produccion')}
        >
          Producción
        </button>
      </nav>

      {pestana === 'molderias' && (
        <Molderias onCambio={() => setRecargarSenal((n) => n + 1)} />
      )}
      {pestana === 'produccion' && <Produccion recargarSenal={recargarSenal} />}
    </div>
  );
}

export default App;
