import { useEffect, useState } from 'react';
import { entrarConClave, leerClaveGuardada, EVENTO_SIN_CLAVE } from '../api.js';
import { Boton, Campo, Input, Tarjeta, Aviso } from './ui.jsx';

// Pantalla de entrada: el backend exige la clave compartida del taller (ver
// backend/src/acceso.js). Si ya hay una guardada en este navegador, se entra
// directo; si el servidor la rechaza más adelante (api.js dispara
// EVENTO_SIN_CLAVE ante un 401), se vuelve a esta pantalla.
export function Acceso({ children }) {
  const [conClave, setConClave] = useState(() => !!leerClaveGuardada());
  const [clave, setClave] = useState('');
  const [error, setError] = useState(null);
  const [comprobando, setComprobando] = useState(false);

  useEffect(() => {
    const sinClave = () => setConClave(false);
    window.addEventListener(EVENTO_SIN_CLAVE, sinClave);
    return () => window.removeEventListener(EVENTO_SIN_CLAVE, sinClave);
  }, []);

  async function entrar(evento) {
    evento.preventDefault();
    setError(null);
    setComprobando(true);
    try {
      if (await entrarConClave(clave)) {
        setClave('');
        setConClave(true);
      } else {
        setError('Clave incorrecta.');
      }
    } catch (e) {
      setError('No se pudo comprobar la clave: ' + e.message + '. Si el servidor estaba dormido, probá de nuevo en un minuto.');
    } finally {
      setComprobando(false);
    }
  }

  if (conClave) return children;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
      <Tarjeta className="w-full max-w-sm">
        <form onSubmit={entrar} className="flex flex-col gap-4">
          <div>
            <h1 className="text-lg font-semibold">UNIFLOW WEB</h1>
            <p className="mt-1 text-sm text-muted-foreground">Ingresá la clave del taller para entrar.</p>
          </div>
          <Campo etiqueta="Clave de acceso">
            <Input
              type="password"
              autoComplete="current-password"
              autoFocus
              value={clave}
              onChange={(e) => setClave(e.target.value)}
            />
          </Campo>
          {error && <Aviso tono="error">{error}</Aviso>}
          <Boton type="submit" variante="primario" disabled={!clave || comprobando}>
            {comprobando ? 'Comprobando…' : 'Entrar'}
          </Boton>
        </form>
      </Tarjeta>
    </div>
  );
}
