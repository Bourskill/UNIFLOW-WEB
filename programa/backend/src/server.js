import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { router as apiRouter } from './rutas/api.js';

// Red de seguridad final: si algo se escapa del manejador de errores de abajo
// (ej. un error fuera de una request), lo logueamos en vez de dejar que Node
// tumbe el proceso — un backend caído en Render tarda ~30-50s en volver.
process.on('unhandledRejection', (error) => {
  console.error('unhandledRejection:', error);
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/api', apiRouter);

app.get('/api/salud', (req, res) => res.json({ ok: true }));

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
