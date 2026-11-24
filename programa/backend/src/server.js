import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { router as apiRouter } from './rutas/api.js';
import { exigirClaveDeAcceso } from './acceso.js';
import { modoEscritorio } from './dominio/almacen.js';

// El mismo servidor corre en dos lugares:
// - la versión web (Render): `node src/server.js`, datos en Supabase, con clave;
// - la app de escritorio (programa/escritorio): la abre Electron con
//   UNIFLOW_CARPETA (datos en una carpeta de la PC o de la red), escuchando
//   solo en esta PC, sin clave, y sirviendo también la app (UNIFLOW_FRONTEND).

// Red de seguridad final: si algo se escapa del manejador de errores de abajo
// (ej. un error fuera de una request), lo logueamos en vez de dejar que Node
// tumbe el proceso — un backend caído en Render tarda ~30-50s en volver.
process.on('unhandledRejection', (error) => {
  console.error('unhandledRejection:', error);
});

export async function crearApp() {
  const app = express();
  // Render pone un proxy delante: sin esto, req.ip sería siempre la IP del
  // proxy y el freno a intentos fallidos de acceso.js bloquearía a todos a
  // la vez en vez de a quien prueba claves.
  if (!modoEscritorio) app.set('trust proxy', 1);

  if (modoEscritorio) {
    // Sin clave, el servidor solo puede atender a esta PC: además de escuchar
    // en 127.0.0.1, se rechaza cualquier pedido que no venga dirigido a esa
    // dirección (una página web maliciosa no puede usarlo de puente).
    app.use((req, res, next) => {
      const host = (req.get('host') || '').replace(/:\d+$/, '');
      if (host === '127.0.0.1' || host === 'localhost') return next();
      res.status(403).end();
    });
  } else {
    // CORS: solo los orígenes del frontend propio (ORIGENES_PERMITIDOS, separados
    // por coma -- en Render, la URL de Netlify). Sin la variable, solo el Vite
    // local. Esto no reemplaza a la clave de acceso de abajo (CORS lo hace
    // cumplir el navegador, no el servidor; curl lo ignora), pero evita que otra
    // página web lea respuestas de esta API desde el navegador de alguien.
    const origenesPermitidos = (process.env.ORIGENES_PERMITIDOS || 'http://localhost:5173,http://127.0.0.1:5173')
      .split(',')
      .map((o) => o.trim().replace(/\/+$/, ''))
      .filter(Boolean);
    app.use(cors({ origin: origenesPermitidos, exposedHeaders: ['X-Uniflow-Partes'] }));
  }

  // Rutas abiertas: el health check (Render y EstadoServidor.jsx) y la fuente
  // de base, que el navegador baja por URL directa (@font-face/FontFace no
  // manda encabezados propios) y es un archivo OFL público de todas formas.
  // Van ANTES del control de acceso.
  app.get('/api/salud', (req, res) => res.json({ ok: true, escritorio: modoEscritorio }));
  const RUTAS_ABIERTAS = new Set(['/salud', '/fuentes/base']);
  app.use('/api', exigirClaveDeAcceso(RUTAS_ABIERTAS));
  // Lo usa la pantalla de entrada del frontend para comprobar la clave: si el
  // control de arriba la dejó pasar, es válida.
  app.get('/api/acceso', (req, res) => res.json({ ok: true }));

  // Los archivos de la carpeta (y su subida directa) van ANTES del lector de
  // JSON: el cuerpo de una subida es el archivo tal cual, sin límite.
  if (modoEscritorio) {
    const { router: rutasEscritorio } = await import('./rutas/escritorio.js');
    app.use('/api', rutasEscritorio);
  }

  // Los archivos pesados ya no pasan por acá (se suben directo a Storage o a
  // la carpeta, ver /archivos/firma); queda margen para los moldes que se
  // analizan en el servidor.
  app.use(express.json({ limit: '100mb' }));
  app.use('/api', apiRouter);

  // La app de escritorio sirve también la página (el frontend ya armado).
  const frontend = process.env.UNIFLOW_FRONTEND;
  if (frontend && fs.existsSync(path.join(frontend, 'index.html'))) {
    app.use(express.static(frontend, { index: 'index.html' }));
    app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile(path.join(frontend, 'index.html')));
  }

  // Manejador de errores final: cualquier error de una ruta (ver el wrapper en
  // api.js) cae acá en vez de tumbar el proceso. Sin esto, un timeout pasajero
  // de Supabase se llevaba puesto todo el backend, no solo esa petición.
  app.use((error, req, res, next) => {
    console.error('Error no manejado en ' + req.method + ' ' + req.originalUrl + ':', error);
    if (res.headersSent) return next(error);
    res.status(500).json({ error: error.message || 'Error interno del servidor' });
  });
  return app;
}

/** Arranca el servidor; devuelve el puerto en el que quedó escuchando. */
export async function iniciarServidor({ puerto, host } = {}) {
  const app = await crearApp();
  return new Promise((listo, fallo) => {
    const servidor = app.listen(puerto ?? 0, host, () => listo(servidor.address().port));
    servidor.on('error', fallo);
    // PDF de producciones grandes: que la conexión no se corte mientras se arma.
    servidor.requestTimeout = 0;
    servidor.headersTimeout = 120000;
  });
}

// `node src/server.js` (Render, o el backend de desarrollo).
const esPrincipal = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esPrincipal) {
  // Render (y la mayoría de hosts) inyectan PORT; PUERTO queda como alternativa
  // en español para correrlo local sin depender del nombre de esa variable.
  const PUERTO = Number(process.env.PORT || process.env.PUERTO || 4000);
  const puerto = await iniciarServidor({ puerto: PUERTO, host: modoEscritorio ? '127.0.0.1' : undefined });
  console.log('UNIFLOW WEB backend escuchando en http://localhost:' + puerto);
}
