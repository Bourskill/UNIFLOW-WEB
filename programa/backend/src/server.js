import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { router as apiRouter } from './rutas/api.js';
import { exigirClaveDeAcceso } from './acceso.js';

// Red de seguridad final: si algo se escapa del manejador de errores de abajo
// (ej. un error fuera de una request), lo logueamos en vez de dejar que Node
// tumbe el proceso — un backend caído en Render tarda ~30-50s en volver.
process.on('unhandledRejection', (error) => {
  console.error('unhandledRejection:', error);
});

const app = express();
// Render pone un proxy delante: sin esto, req.ip sería siempre la IP del
// proxy y el freno a intentos fallidos de acceso.js bloquearía a todos a
// la vez en vez de a quien prueba claves.
app.set('trust proxy', 1);

// CORS: solo los orígenes del frontend propio (ORIGENES_PERMITIDOS, separados
// por coma -- en Render, la URL de Netlify). Sin la variable, solo el Vite
// local. Esto no reemplaza a la clave de acceso de abajo (CORS lo hace
// cumplir el navegador, no el servidor; curl lo ignora), pero evita que otra
// página web lea respuestas de esta API desde el navegador de alguien.
const origenesPermitidos = (process.env.ORIGENES_PERMITIDOS || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);
app.use(cors({ origin: origenesPermitidos }));

// Rutas abiertas: el health check (Render y EstadoServidor.jsx) y la fuente
// de base, que el navegador baja por URL directa (@font-face/FontFace no
// manda encabezados propios) y es un archivo OFL público de todas formas.
// Van ANTES del control de acceso.
app.get('/api/salud', (req, res) => res.json({ ok: true }));
const RUTAS_ABIERTAS = new Set(['/salud', '/fuentes/base']);
app.use('/api', exigirClaveDeAcceso(RUTAS_ABIERTAS));
// Lo usa la pantalla de entrada del frontend para comprobar la clave: si el
// control de arriba la dejó pasar, es válida.
app.get('/api/acceso', (req, res) => res.json({ ok: true }));

// Los diseños suben imagen por pieza como data URL embebida en el JSON (no
// un archivo aparte), y las Piezas en PDF viajan en base64 dentro del mismo
// body -- ambos casos pueden pasar varios MB fácil. 10mb se quedaba corto
// con una sola imagen de diseño en buena resolución ("request entity too
// large"); 50mb da margen real sin abrir la puerta a payloads absurdos.
app.use(express.json({ limit: '50mb' }));
app.use('/api', apiRouter);

// Manejador de errores final: cualquier error de una ruta (ver el wrapper en
// api.js) cae acá en vez de tumbar el proceso. Sin esto, un timeout pasajero
// de Supabase se llevaba puesto todo el backend, no solo esa petición.
app.use((error, req, res, next) => {
  console.error('Error no manejado en ' + req.method + ' ' + req.originalUrl + ':', error);
  if (res.headersSent) return next(error);
  res.status(500).json({ error: error.message || 'Error interno del servidor' });
});

// Render (y la mayoría de hosts) inyectan PORT; PUERTO queda como alternativa
// en español para correrlo local sin depender del nombre de esa variable.
const PUERTO = process.env.PORT || process.env.PUERTO || 4000;
app.listen(PUERTO, () => {
  console.log('UNIFLOW WEB backend escuchando en http://localhost:' + PUERTO);
});
