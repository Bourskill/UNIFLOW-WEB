// Control de acceso: una clave compartida del taller (CLAVE_ACCESO en las
// variables de entorno de Render). Antes de esto no había ningún control --
// cualquiera que conociera la URL del backend podía leer, editar o borrar
// toda la moldería, los diseños y los pedidos.
//
// Es deliberadamente simple (un equipo chico, una sola clave). Cuando haga
// falta saber QUIÉN hizo cada cosa en el historial, el paso siguiente es
// Supabase Auth con cuentas individuales; este middleware es el único lugar
// que habría que cambiar del lado del servidor.
//
// El frontend la manda como `Authorization: Bearer <clave>` en cada pedido
// (ver frontend/src/api.js).

import { createHash, timingSafeEqual } from 'node:crypto';

const LARGO_MINIMO = 12;

const clave = process.env.CLAVE_ACCESO || '';
if (clave.length < LARGO_MINIMO) {
  // Falla al arrancar en vez de levantar un backend abierto: nunca se sirve
  // la API sin clave por olvidarse de configurarla.
  throw new Error(
    'Falta CLAVE_ACCESO (o tiene menos de ' + LARGO_MINIMO + ' caracteres) en las variables de entorno. ' +
    'Es la clave que la web pide para entrar -- definila en programa/backend/.env y en Render.'
  );
}

// Se comparan los hash (mismo largo siempre) con timingSafeEqual: el tiempo
// de respuesta no revela cuántos caracteres de la clave se acertaron.
const hashClave = createHash('sha256').update(clave).digest();

export function claveValida(candidata) {
  if (typeof candidata !== 'string' || !candidata) return false;
  return timingSafeEqual(createHash('sha256').update(candidata).digest(), hashClave);
}

// Freno básico a probar claves a lo bestia: tras 10 intentos fallidos desde
// la misma IP en 15 minutos, esa IP queda bloqueada hasta que pase la
// ventana. En memoria (un solo proceso en Render); se pierde al reiniciar,
// lo cual está bien para esto.
const VENTANA_MS = 15 * 60 * 1000;
const MAX_FALLOS = 10;
const fallosPorIp = new Map(); // ip -> { cuenta, desde }

function bloqueada(ip) {
  const registro = fallosPorIp.get(ip);
  if (!registro) return false;
  if (Date.now() - registro.desde > VENTANA_MS) {
    fallosPorIp.delete(ip);
    return false;
  }
  return registro.cuenta >= MAX_FALLOS;
}

function anotarFallo(ip) {
  const registro = fallosPorIp.get(ip);
  if (!registro || Date.now() - registro.desde > VENTANA_MS) {
    fallosPorIp.set(ip, { cuenta: 1, desde: Date.now() });
  } else {
    registro.cuenta++;
  }
  if (fallosPorIp.size > 10000) fallosPorIp.clear(); // tope de memoria
}

export function exigirClaveDeAcceso(rutasAbiertas) {
  return (req, res, next) => {
    if (req.method === 'OPTIONS' || rutasAbiertas.has(req.path)) return next();

    const ip = req.ip || req.socket.remoteAddress || '';
    if (bloqueada(ip)) {
      return res.status(429).json({ error: 'Demasiados intentos con una clave incorrecta. Probá de nuevo en unos minutos.' });
    }

    const encabezado = req.get('authorization') || '';
    const candidata = encabezado.startsWith('Bearer ') ? encabezado.slice(7) : '';
    if (!claveValida(candidata)) {
      if (candidata) anotarFallo(ip);
      return res.status(401).json({ error: 'Clave de acceso incorrecta o ausente', requiereClave: true });
    }
    next();
  };
}
