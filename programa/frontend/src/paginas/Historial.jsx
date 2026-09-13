import { useEffect, useState } from 'react';
import { listarGeneraciones, reponerPieza } from '../api.js';
import { Boton, Tarjeta, Chip, Aviso } from '../componentes/ui.jsx';

function formatoFecha(iso) {
  return new Date(iso).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' });
}

function FilaGeneracion({ generacion, onReponer }) {
  const [abierta, setAbierta] = useState(false);
  const [reponiendo, setReponiendo] = useState(null);
  const [error, setError] = useState(null);

  async function reponer(piezaId) {
    setError(null);
    setReponiendo(piezaId);
    try {
      await onReponer(generacion.id, piezaId);
    } catch (e) {
      setError(e.message);
    } finally {
      setReponiendo(null);
    }
  }

  const repuestas = generacion.piezas.filter((p) => p.estado === 'repuesta').length;

  return (
    <Tarjeta className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-medium">{formatoFecha(generacion.creadoEn)}</div>
          <div className="text-xs text-muted-foreground">
            {generacion.piezas.length} pieza{generacion.piezas.length === 1 ? '' : 's'} · lienzo{' '}
            {generacion.anchoLienzoCm}×{generacion.altoLienzoCm}cm · utilización {generacion.utilizacion}%
            {repuestas > 0 && ' · ' + repuestas + ' repuesta' + (repuestas === 1 ? '' : 's')}
          </div>
        </div>
        <Boton variante="secundario" tamano="sm" onClick={() => setAbierta((v) => !v)}>
          {abierta ? 'Cerrar' : 'Ver piezas'}
        </Boton>
      </div>

      {abierta && (
        <div className="flex flex-col gap-1.5 border-t border-border pt-3">
          {generacion.piezas.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 rounded-md bg-surface-muted px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <span>{p.piezaId}</span>
                <Chip tono={p.estado === 'repuesta' ? 'activo' : 'neutro'}>{p.talla}</Chip>
                {p.estado === 'repuesta' && <Chip tono="activo">repuesta</Chip>}
              </div>
              <Boton
                variante="fantasma"
                tamano="sm"
                onClick={() => reponer(p.id)}
                disabled={reponiendo === p.id}
              >
                {reponiendo === p.id ? 'Generando…' : 'Reponer'}
              </Boton>
            </div>
          ))}
          {error && <Aviso tono="error">{error}</Aviso>}
        </div>
      )}
    </Tarjeta>
  );
}

// Historial de producción: cada corrida de nesting ya generada, y desde acá
// se reimprime UNA pieza puntual sin rehacer el lote completo -- el hallazgo
// más accionable de la investigación de referencia (Sublimifyer).
export function Historial({ recargarSenal }) {
  const [generaciones, setGeneraciones] = useState([]);

  async function recargar() {
    setGeneraciones(await listarGeneraciones());
  }

  useEffect(() => {
    recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recargarSenal]);

  async function reponer(generacionId, piezaId) {
    await reponerPieza(generacionId, piezaId);
    await recargar();
  }

  return (
    <div className="pagina flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Historial</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Cada lote ya generado. Si una pieza puntual sale mal o hay que reimprimirla, se repone
          sola desde acá, sin rehacer el lote entero.
        </p>
      </div>

      {generaciones.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no se generó ningún lote.</p>
      ) : (
        <div className="flex max-w-2xl flex-col gap-3">
          {generaciones.map((g) => (
            <FilaGeneracion key={g.id} generacion={g} onReponer={reponer} />
          ))}
        </div>
      )}
    </div>
  );
}
