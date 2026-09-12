import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { router as apiRouter } from './rutas/api.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/api', apiRouter);

app.get('/api/salud', (req, res) => res.json({ ok: true }));

// Render (y la mayoría de hosts) inyectan PORT; PUERTO queda como alternativa
// en español para correrlo local sin depender del nombre de esa variable.
const PUERTO = process.env.PORT || process.env.PUERTO || 4000;
app.listen(PUERTO, () => {
  console.log('UNIFLOW WEB backend escuchando en http://localhost:' + PUERTO);
});
