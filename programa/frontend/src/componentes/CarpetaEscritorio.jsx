import { useEffect, useRef, useState } from 'react';
import { esEscritorio, datosDeEscritorio, resumenDeEscritorio, importarDesdeWeb, estadoImportacion } from '../api.js';
import { Boton, Input, Aviso, Campo } from './ui.jsx';

// Solo en la app de escritorio: muestra en qué carpeta están los datos (puede
// ser una compartida con otras PCs) y permite traerse todo lo que hay en la
// versión web. La primera vez, con la carpeta vacía, se abre sola.
const CLAVE_NO_PREGUNTAR = 'uniflow.escritorio.noImportar';
const CLAVE_DIRECCION = 'uniflow.escritorio.direccionWeb';

function leerLocal(clave) {
  try { return localStorage.getItem(clave) || ''; } catch { return ''; }
}
// "uniflow-mold.netlify.app" sin https:// también sirve.
function direccionCompleta(texto) {
  const t = texto.trim();
  return !t || /^https?:\/\//i.test(t) ? t : 'https://' + t;
}

export function CarpetaEscritorio() {
  const [abierto, setAbierto] = useState(false);
  const [carpeta, setCarpeta] = useState('');
  const escritorio = esEscritorio();

  useEffect(() => {
    if (!escritorio) return;
    datosDeEscritorio().then((d) => setCarpeta(d.carpeta)).catch(() => {});
    let noPreguntar = false;
    try { noPreguntar = localStorage.getItem(CLAVE_NO_PREGUNTAR) === '1'; } catch { /* sin almacenamiento */ }
    if (noPreguntar) return;
    resumenDeEscritorio()
      .then((r) => { if (Object.values(r).every((n) => n === 0)) setAbierto(true); })
      .catch(() => {});
  }, [escritorio]);

  if (!escritorio) return null;
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} title={carpeta || 'Carpeta de datos'}
        className="flex max-w-[260px] items-center gap-1.5 truncate rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:border-primary hover:text-foreground">
        <span aria-hidden>📁</span>
        <span className="truncate">{carpeta ? carpeta.split(/[\\/]/).slice(-2).join('\\') : 'Carpeta'}</span>
      </button>
      {abierto && <VentanaCarpeta carpeta={carpeta} onCerrar={() => setAbierto(false)} />}
    </>
  );
}

function VentanaCarpeta({ carpeta, onCerrar }) {
  const [origen, setOrigen] = useState(() => leerLocal(CLAVE_DIRECCION));
  const [clave, setClave] = useState('');
  const [estado, setEstado] = useState(null);
  const [error, setError] = useState(null);
  const sondeo = useRef(null);

  useEffect(() => () => clearInterval(sondeo.current), []);

  async function empezar() {
    setError(null);
    try {
      setEstado(await importarDesdeWeb(direccionCompleta(origen), clave));
      sondeo.current = setInterval(async () => {
        const e = await estadoImportacion().catch(() => null);
        if (!e) return;
        setEstado(e);
        if (e.estado !== 'trabajando') clearInterval(sondeo.current);
        // La próxima vez, la dirección ya está puesta (la del servidor encontrado).
        if (e.estado === 'listo' && e.servidor) {
          try { localStorage.setItem(CLAVE_DIRECCION, e.servidor); } catch { /* sin almacenamiento */ }
        }
      }, 700);
    } catch (e) {
      setError(e.message);
    }
  }
  function noPreguntarMas() {
    try { localStorage.setItem(CLAVE_NO_PREGUNTAR, '1'); } catch { /* sin almacenamiento */ }
    onCerrar();
  }

  const trabajando = estado?.estado === 'trabajando';
  const listo = estado?.estado === 'listo';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4" role="dialog" aria-modal="true" aria-label="Carpeta de datos">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-xl border border-border bg-surface p-5 shadow-xl">
        <div>
          <h2 className="text-base font-semibold">Carpeta de datos</h2>
          <p className="mt-1 break-all text-xs text-faint-foreground">{carpeta}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Todo se guarda acá: moldes, diseños, producciones, pedidos y tipografías. Si es una carpeta compartida
            (de red o de Drive), las otras PCs que la usen ven lo mismo. Para cambiarla: menú <b>Archivo → Cambiar carpeta de datos</b>.
          </p>
        </div>

        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <h3 className="text-sm font-semibold">Traer los datos de la versión web</h3>
          <p className="-mt-2 text-xs text-faint-foreground">
            Copia a esta carpeta todo lo que hay en la versión web (con sus archivos). Lo que ya esté en la carpeta con el
            mismo nombre se reemplaza por lo de la web.
          </p>
          <Campo etiqueta="Dirección de la versión web">
            <Input value={origen} onChange={(e) => setOrigen(e.target.value)} placeholder="uniflow-….netlify.app" disabled={trabajando} />
          </Campo>
          <p className="-mt-2 text-xs text-faint-foreground">
            La misma con la que entrás desde el navegador: el servidor se encuentra solo.
          </p>
          <Campo etiqueta="Clave de la versión web">
            <Input type="password" value={clave} onChange={(e) => setClave(e.target.value)} disabled={trabajando} autoComplete="off" />
          </Campo>
          {estado && (
            <div className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">
                {estado.estado === 'error' ? '' : estado.paso}
                {trabajando && estado.total > 0 ? ' · ' + estado.hechos + ' de ' + estado.total : ''}
              </span>
              {trabajando && estado.total > 0 && (
                <div className="h-1.5 overflow-hidden rounded bg-surface-muted">
                  <div className="h-full bg-primary transition-all" style={{ width: Math.round((100 * estado.hechos) / estado.total) + '%' }} />
                </div>
              )}
              {listo && (
                <span className="text-emerald-400">
                  ✓ Listo: {Object.entries(estado.registros || {}).filter(([, n]) => n).map(([c, n]) => n + ' ' + c).join(', ') || 'no había nada'}
                  {estado.total ? ' · ' + estado.total + ' archivos' : ''}
                </span>
              )}
              {estado.errores?.length > 0 && (
                <details className="text-danger"><summary>{estado.errores.length} archivos no se pudieron bajar</summary>
                  <ul className="mt-1 list-disc pl-5">{estado.errores.map((e, i) => <li key={i}>{e}</li>)}</ul>
                </details>
              )}
              {estado.estado === 'error' && <Aviso tono="error">{estado.error}</Aviso>}
            </div>
          )}
          {error && <Aviso tono="error">{error}</Aviso>}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          {listo ? (
            <Boton variante="primario" onClick={() => window.location.reload()}>Abrir con los datos nuevos</Boton>
          ) : (
            <Boton variante="primario" disabled={trabajando || !origen.trim() || !clave} onClick={empezar}>
              {trabajando ? 'Trayendo…' : 'Traer los datos'}
            </Boton>
          )}
          <Boton variante="fantasma" className="ml-auto" onClick={onCerrar} disabled={trabajando}>Cerrar</Boton>
          {!estado && <Boton variante="fantasma" onClick={noPreguntarMas}>Empezar de cero</Boton>}
        </div>
      </div>
    </div>
  );
}
