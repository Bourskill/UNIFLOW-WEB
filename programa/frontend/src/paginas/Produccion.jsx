import { useEffect, useState } from 'react';
import { listarMolderias, anidarDesdeMolderia, generarPdf } from '../api.js';
import { TALLAS } from '../constantes.js';
import { VistaPreviaNesting } from '../componentes/VistaPreviaNesting.jsx';

function lineaVacia() {
  return { talla: TALLAS[0], cantidad: 1 };
}

export function Produccion({ recargarSenal }) {
  const [molderias, setMolderias] = useState([]);
  const [molderiaId, setMolderiaId] = useState('');
  const [lineas, setLineas] = useState([lineaVacia()]);
  const [anchoLienzoCm, setAnchoLienzoCm] = useState(160);
  const [resultado, setResultado] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    listarMolderias().then((datos) => {
      setMolderias(datos);
      if (datos.length > 0 && !molderiaId) setMolderiaId(datos[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recargarSenal]);

  function actualizarLinea(indice, cambios) {
    setLineas((prev) => prev.map((l, i) => (i === indice ? { ...l, ...cambios } : l)));
  }

  function agregarLinea() {
    setLineas((prev) => [...prev, lineaVacia()]);
  }

  function quitarLinea(indice) {
    setLineas((prev) => prev.filter((_, i) => i !== indice));
  }

  async function anidar() {
    setError(null);
    setResultado(null);
    if (!molderiaId) {
      setError('Elegí una moldería primero.');
      return;
    }
    setCargando(true);
    try {
      const datos = await anidarDesdeMolderia(
        molderiaId,
        lineas.map((l) => ({ talla: l.talla, cantidad: Number(l.cantidad) })),
        Number(anchoLienzoCm)
      );
      setResultado(datos);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }

  async function descargarPdf() {
    if (resultado) await generarPdf(resultado);
  }

  const molderiaSeleccionada = molderias.find((m) => m.id === molderiaId);

  return (
    <div className="pagina">
      <h2>Producción</h2>

      {molderias.length === 0 ? (
        <p>Todavía no hay ninguna moldería cargada — creá una primero en la pestaña "Molderías".</p>
      ) : (
        <>
          <div className="tarjeta">
            <label>
              Moldería
              <select value={molderiaId} onChange={(e) => setMolderiaId(e.target.value)}>
                {molderias.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
            </label>

            {molderiaSeleccionada && (
              <p className="metricas">
                Piezas: {molderiaSeleccionada.piezas.map((p) => p.nombre).join(', ')}
              </p>
            )}

            <label>
              Ancho del lienzo/rollo (cm)
              <input
                type="number"
                min="1"
                value={anchoLienzoCm}
                onChange={(e) => setAnchoLienzoCm(e.target.value)}
              />
            </label>

            <h4>Líneas (talla + cantidad de prendas)</h4>
            {lineas.map((linea, indice) => (
              <div className="fila-linea" key={indice}>
                <select
                  value={linea.talla}
                  onChange={(e) => actualizarLinea(indice, { talla: e.target.value })}
                >
                  {TALLAS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="1"
                  value={linea.cantidad}
                  onChange={(e) => actualizarLinea(indice, { cantidad: e.target.value })}
                />
                {lineas.length > 1 && (
                  <button type="button" onClick={() => quitarLinea(indice)}>
                    Quitar
                  </button>
                )}
              </div>
            ))}

            <div className="acciones">
              <button type="button" onClick={agregarLinea}>
                + Agregar línea
              </button>
              <button type="button" className="primario" onClick={anidar} disabled={cargando}>
                {cargando ? 'Anidando…' : 'Anidar'}
              </button>
              <button type="button" onClick={descargarPdf} disabled={!resultado}>
                Generar PDF
              </button>
            </div>

            {error && <p className="error">{error}</p>}
            {resultado && (
              <p className="metricas">
                Lienzo {resultado.anchoLienzoCm}×{resultado.altoLienzoCm} cm · utilización{' '}
                {resultado.utilizacion}%
              </p>
            )}
          </div>

          {resultado && <VistaPreviaNesting resultado={resultado} />}
        </>
      )}
    </div>
  );
}
