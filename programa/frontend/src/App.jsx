import { useState } from 'react';
import { VistaPreviaNesting } from './componentes/VistaPreviaNesting.jsx';
import { anidarVistaPrevia, generarPdf } from './api.js';
import './App.css';

// Piezas de ejemplo para probar el motor de principio a fin sin depender
// todavía de un editor de moldería real. Se reemplaza por datos de un
// producto/pedido real cuando exista esa parte del flujo.
const PIEZAS_EJEMPLO = [
  { id: 'p1', piezaId: 'Espalda', lineaPedidoId: 'l1', talla: 'M', anchoCm: 45, altoCm: 55, rotable: true },
  { id: 'p2', piezaId: 'Frente', lineaPedidoId: 'l1', talla: 'M', anchoCm: 45, altoCm: 50, rotable: true },
  { id: 'p3', piezaId: 'Manga izquierda', lineaPedidoId: 'l1', talla: 'M', anchoCm: 25, altoCm: 30, rotable: true },
  { id: 'p4', piezaId: 'Manga derecha', lineaPedidoId: 'l1', talla: 'M', anchoCm: 25, altoCm: 30, rotable: true },
  { id: 'p5', piezaId: 'Espalda', lineaPedidoId: 'l2', talla: 'XL', anchoCm: 52, altoCm: 62, rotable: true },
  { id: 'p6', piezaId: 'Frente', lineaPedidoId: 'l2', talla: 'XL', anchoCm: 52, altoCm: 57, rotable: true },
];

function App() {
  const [resultado, setResultado] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  async function calcularVistaPrevia() {
    setCargando(true);
    setError(null);
    try {
      const datos = await anidarVistaPrevia(PIEZAS_EJEMPLO, 160);
      setResultado(datos);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }

  async function descargarPdf() {
    if (!resultado) return;
    await generarPdf(resultado);
  }

  return (
    <div className="app">
      <header>
        <h1>UNIFLOW WEB</h1>
        <p>Motor de nesting — vista previa antes de imprimir/cortar.</p>
      </header>

      <section className="controles">
        <button onClick={calcularVistaPrevia} disabled={cargando}>
          {cargando ? 'Calculando…' : 'Anidar piezas de ejemplo'}
        </button>
        <button onClick={descargarPdf} disabled={!resultado}>
          Generar PDF
        </button>
        {error && <p className="error">{error}</p>}
        {resultado && (
          <p className="metricas">
            Lienzo {resultado.anchoLienzoCm}×{resultado.altoLienzoCm} cm ·
            utilización {resultado.utilizacion}%
          </p>
        )}
      </section>

      {resultado && <VistaPreviaNesting resultado={resultado} />}
    </div>
  );
}

export default App;
