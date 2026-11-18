import { useEffect, useRef, useState } from 'react';
import { verificarSalud, entrarConClave, leerClaveGuardada, EVENTO_SIN_CLAVE } from '../api.js';
import { almacen } from '../datos/index.js';
import {
  progresoTotal, imagenesDeDisenos, GRUPOS_DE_DATOS, PESO_COLECCION,
} from '../utilidades/progresoArranque.js';
import { Boton, Input, Aviso } from './ui.jsx';

// Pantalla de inicio: en vez de entrar a una app vacía con "Cargando…" en
// cada lado (y un puntito que dice "Despertando el servidor…"), se ve qué
// está pasando y cuánto falta:
//   1. despertar el servidor (Render gratis se duerme: hasta ~1 minuto),
//   2. la clave del taller (solo si este navegador no la tiene guardada),
//   3. traer moldes, diseños y pedidos a la caché, y bajar las imágenes de
//      los diseños,
// con una barra de progreso real. Mientras carga, la app ya se va armando
// debajo, así al terminar aparece lista, sin otro "Cargando…".
// Reemplaza a la vieja pantalla de Acceso: si el servidor rechaza la clave
// más adelante (401), se vuelve al paso de la clave.

const INTERVALO_SALUD_MS = 2000;
const TOPE_DESPERTAR_MS = 150000; // 2,5 min sin respuesta: algo más que "dormido"
const NOMBRE_COLECCION = {
  piezas: ['pieza', 'piezas'], grupos: ['prenda', 'prendas'], disenos: ['diseño', 'diseños'],
  productos: ['producción', 'producciones'], plantillas: ['plantilla', 'plantillas'], fuentes: ['fuente', 'fuentes'],
  pedidos: ['pedido', 'pedidos'], generaciones: ['corrida', 'corridas'],
};

function bajarImagen(url) {
  return new Promise((listo) => {
    const img = new Image();
    const tope = setTimeout(listo, 10000); // una imagen lenta no frena la entrada
    img.onload = img.onerror = () => { clearTimeout(tope); listo(); };
    img.src = url;
  });
}

function segundos(ms) {
  return (ms / 1000).toLocaleString('es', { maximumFractionDigits: ms < 10000 ? 1 : 0 }) + ' s';
}

export function Arranque({ children }) {
  // servidor → (clave) → cargando → listo ; caido si el servidor nunca responde
  const [fase, setFase] = useState('servidor');
  const [msServidor, setMsServidor] = useState(0);
  const [servidorTardo, setServidorTardo] = useState(null); // ms que tardó en responder
  const [colecciones, setColecciones] = useState({});
  const [imagenes, setImagenes] = useState(null);
  const [puedeSaltar, setPuedeSaltar] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const [intento, setIntento] = useState(0);

  // ---- 1. Despertar el servidor --------------------------------------------
  useEffect(() => {
    if (fase !== 'servidor') return undefined;
    let cancelado = false;
    let temporizador;
    const inicio = Date.now();
    async function probar() {
      const ok = await verificarSalud();
      if (cancelado) return;
      if (ok) {
        setServidorTardo(Date.now() - inicio);
        setFase(leerClaveGuardada() ? 'cargando' : 'clave');
      } else if (Date.now() - inicio > TOPE_DESPERTAR_MS) {
        setFase('caido');
      } else {
        temporizador = setTimeout(probar, INTERVALO_SALUD_MS);
      }
    }
    probar();
    const reloj = setInterval(() => setMsServidor(Date.now() - inicio), 200);
    return () => { cancelado = true; clearTimeout(temporizador); clearInterval(reloj); };
  }, [fase, intento]);

  // ---- 3. Traer los datos a la caché -----------------------------------------
  useEffect(() => {
    if (fase !== 'cargando') return undefined;
    let cancelado = false;
    setPuedeSaltar(false);
    const saltar = setTimeout(() => !cancelado && setPuedeSaltar(true), 2000);
    const estados = {};
    for (const n of almacen.nombres) estados[n] = almacen.leer(n).datos !== null ? 'listo' : 'cargando';
    setColecciones({ ...estados });

    const terminar = (n) => {
      if (cancelado) return;
      estados[n] = almacen.leer(n).datos !== null ? 'listo' : 'error';
      setColecciones({ ...estados });
    };
    const cargas = almacen.nombres.map((n) => almacen.asegurar(n).then(() => terminar(n), () => terminar(n)));

    // Las imágenes de los diseños, apenas se sabe cuáles son.
    const fotos = almacen.asegurar('disenos').then(async () => {
      const urls = imagenesDeDisenos(almacen.leer('disenos').datos || []);
      if (cancelado) return;
      let listas = 0;
      setImagenes({ total: urls.length, listas });
      await Promise.all(urls.map((u) => bajarImagen(u).then(() => {
        listas += 1;
        if (!cancelado) setImagenes({ total: urls.length, listas });
      })));
    });

    Promise.all([...cargas, fotos]).then(() => {
      if (cancelado) return;
      // Con algún error, se queda a la vista para que se lea (y se pueda entrar igual).
      if (!Object.values(estados).includes('error')) setTimeout(() => !cancelado && setFase('listo'), 400);
    });
    return () => { cancelado = true; clearTimeout(saltar); };
  }, [fase, intento]);

  // La pantalla se desvanece al terminar (la app ya está armada debajo).
  useEffect(() => {
    if (fase !== 'listo') return undefined;
    setSaliendo(true);
    const t = setTimeout(() => setSaliendo(false), 350);
    return () => clearTimeout(t);
  }, [fase]);

  // Si el servidor rechaza la clave en cualquier momento: de vuelta al paso de la clave.
  useEffect(() => {
    const sinClave = () => setFase('clave');
    window.addEventListener(EVENTO_SIN_CLAVE, sinClave);
    return () => window.removeEventListener(EVENTO_SIN_CLAVE, sinClave);
  }, []);

  function reintentar() {
    setServidorTardo(null);
    setMsServidor(0);
    setIntento((n) => n + 1);
    setFase('servidor');
  }

  const cargandoOListo = fase === 'cargando' || fase === 'listo';
  // Una vez armada, la app NO se desarma si el servidor vuelve a pedir la
  // clave: la clave se pide encima y lo que se estaba haciendo (zonas sin
  // guardar, por ejemplo) sigue intacto debajo.
  const [yaMontada, setYaMontada] = useState(false);
  useEffect(() => { if (cargandoOListo) setYaMontada(true); }, [cargandoOListo]);
  const appMontada = cargandoOListo || yaMontada;
  const pantallaVisible = fase !== 'listo' || saliendo;
  const servidorListo = servidorTardo !== null;
  const progreso = fase === 'listo' ? 100 : progresoTotal({
    servidorListo,
    msDespertando: msServidor,
    colecciones: fase === 'cargando' ? colecciones : {},
    imagenes: fase === 'cargando' ? imagenes : null,
  });
  const hayErrores = Object.values(colecciones).includes('error');

  return (
    <>
      {appMontada && children}
      {pantallaVisible && (
        <div
          className={'fixed inset-0 z-50 flex items-center justify-center bg-background p-4 text-foreground transition-opacity duration-300 ' +
            (fase === 'listo' ? 'pointer-events-none opacity-0' : 'opacity-100')}
          role="status" aria-live="polite"
        >
          <div className="w-full max-w-md">
            <div className="mb-6 flex items-center gap-2.5 text-base font-semibold tracking-tight">
              <span className="h-6 w-6 rounded-md bg-primary" />
              UNIFLOW WEB
            </div>

            <div className="mb-1.5 flex items-baseline justify-between text-xs">
              <span className="text-muted-foreground">
                {fase === 'servidor' ? 'Conectando…' : fase === 'clave' ? 'Esperando la clave' : fase === 'caido' ? 'Sin conexión'
                  : hayErrores ? 'Cargado con problemas' : 'Preparando todo…'}
              </span>
              <span className="tabular-nums text-faint-foreground">{progreso} %</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-muted"
              role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progreso} aria-label="Progreso del inicio">
              <div
                className={'h-full rounded-full transition-[width] duration-500 ease-out ' + (fase === 'caido' ? 'bg-danger' : 'bg-primary')}
                style={{ width: progreso + '%' }}
              />
            </div>

            <ol className="mt-6 flex flex-col gap-3 text-sm">
              <Paso
                estado={servidorListo ? 'listo' : fase === 'caido' ? 'error' : 'cargando'}
                titulo="Servidor"
                detalle={servidorListo
                  ? (servidorTardo < 3000 ? 'Despierto' : 'Despierto (tardó ' + segundos(servidorTardo) + ')')
                  : fase === 'caido' ? 'No respondió en ' + segundos(TOPE_DESPERTAR_MS)
                    : msServidor < 4000 ? 'Conectando…' : 'Despertando… ' + segundos(msServidor)}
              />
              {fase === 'servidor' && msServidor >= 6000 && (
                <li className="-mt-1 ml-7 text-xs text-faint-foreground">
                  El servidor gratuito se duerme cuando nadie lo usa: despertarlo tarda hasta un minuto. Después anda rápido.
                </li>
              )}
              <Paso
                estado={fase === 'clave' ? 'actual' : cargandoOListo ? 'listo' : 'pendiente'}
                titulo="Acceso"
                detalle={fase === 'clave' ? (yaMontada ? 'El servidor pidió la clave de nuevo · tu trabajo sigue abierto' : 'Ingresá la clave del taller') : cargandoOListo ? 'Clave del taller' : ''}
              />
              {fase === 'clave' && <FormularioClave onEntrar={() => setFase('cargando')} />}
              {GRUPOS_DE_DATOS.map((g) => (
                <PasoDatos key={g.id} grupo={g} colecciones={fase === 'cargando' || fase === 'listo' ? colecciones : {}} />
              ))}
              <Paso
                estado={!appMontada || !imagenes ? 'pendiente' : imagenes.listas >= imagenes.total ? 'listo' : 'cargando'}
                titulo="Imágenes de los diseños"
                detalle={imagenes ? (imagenes.total === 0 ? 'No hay' : imagenes.listas + ' de ' + imagenes.total) : ''}
              />
            </ol>

            {fase === 'caido' && (
              <div className="mt-6 flex flex-col gap-3">
                <Aviso tono="error">
                  El servidor no responde. Puede estar reiniciándose o caído (Render). Probá de nuevo en un momento.
                </Aviso>
                <Boton variante="primario" onClick={reintentar}>Reintentar</Boton>
              </div>
            )}
            {fase === 'cargando' && (hayErrores || puedeSaltar) && (
              <div className="mt-6 flex flex-wrap items-center gap-2">
                {hayErrores && <Boton variante="secundario" tamano="sm" onClick={() => setIntento((n) => n + 1)}>Reintentar lo que falló</Boton>}
                <Boton variante={hayErrores ? 'primario' : 'fantasma'} tamano="sm" className="ml-auto" onClick={() => setFase('listo')}>
                  {hayErrores ? 'Entrar igual' : 'Entrar ya (sigue cargando por detrás)'}
                </Boton>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Marca({ estado }) {
  if (estado === 'listo') {
    return (
      <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400" aria-label="Listo">
        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M3.5 8.5l3 3 6-7" /></svg>
      </span>
    );
  }
  if (estado === 'error') {
    return <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-danger-soft text-xs font-bold text-danger" aria-label="Error">!</span>;
  }
  if (estado === 'cargando' || estado === 'actual') {
    return (
      <span className="flex h-5 w-5 flex-none items-center justify-center" aria-label="En curso">
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      </span>
    );
  }
  return <span className="flex h-5 w-5 flex-none items-center justify-center" aria-label="Pendiente"><span className="h-1.5 w-1.5 rounded-full bg-border" /></span>;
}

function Paso({ estado, titulo, detalle }) {
  return (
    <li className="flex items-center gap-2">
      <Marca estado={estado} />
      <span className={estado === 'pendiente' ? 'text-faint-foreground' : 'text-foreground'}>{titulo}</span>
      {detalle && <span className={'ml-auto text-xs ' + (estado === 'error' ? 'text-danger' : 'text-faint-foreground')}>{detalle}</span>}
    </li>
  );
}

function PasoDatos({ grupo, colecciones }) {
  const estados = grupo.colecciones.map((n) => colecciones[n]);
  const estado = estados.includes('error') ? 'error'
    : estados.every((e) => e === 'listo') ? 'listo'
      : estados.some((e) => e === 'cargando' || e === 'listo') ? 'cargando' : 'pendiente';
  let detalle = '';
  if (estado === 'error') {
    const fallaron = grupo.colecciones.filter((n) => colecciones[n] === 'error').map((n) => NOMBRE_COLECCION[n][1]);
    detalle = 'No se pudo traer: ' + fallaron.join(', ');
  } else if (estado !== 'pendiente') {
    // Cuántos hay de cada cosa, a medida que llegan (las más pesadas primero en el texto).
    detalle = grupo.colecciones
      .filter((n) => colecciones[n] === 'listo' && PESO_COLECCION[n] >= 5)
      .map((n) => {
        const cuantos = almacen.leer(n).datos?.length || 0;
        return cuantos + ' ' + NOMBRE_COLECCION[n][cuantos === 1 ? 0 : 1];
      })
      .join(' · ') || 'Cargando…';
  }
  return <Paso estado={estado} titulo={grupo.titulo} detalle={detalle} />;
}

function FormularioClave({ onEntrar }) {
  const [clave, setClave] = useState('');
  const [error, setError] = useState(null);
  const [comprobando, setComprobando] = useState(false);
  const campo = useRef(null);
  useEffect(() => { campo.current?.focus(); }, []);

  async function entrar(evento) {
    evento.preventDefault();
    setError(null);
    setComprobando(true);
    try {
      if (await entrarConClave(clave)) {
        setClave('');
        onEntrar();
      } else {
        setError('Clave incorrecta.');
      }
    } catch (e) {
      setError('No se pudo comprobar la clave: ' + e.message + '.');
    } finally {
      setComprobando(false);
    }
  }

  return (
    <li className="ml-7">
      <form onSubmit={entrar} className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Input ref={campo} type="password" autoComplete="current-password" placeholder="Clave de acceso"
            aria-label="Clave de acceso" value={clave} onChange={(e) => setClave(e.target.value)} />
          <Boton type="submit" variante="primario" disabled={!clave || comprobando}>
            {comprobando ? 'Comprobando…' : 'Entrar'}
          </Boton>
        </div>
        {error && <Aviso tono="error">{error}</Aviso>}
      </form>
    </li>
  );
}
