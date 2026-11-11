# UNIFLOW WEB

Automatización de producción de uniformes deportivos: de la moldería y el diseño base al PDF listo
para sublimación/corte, con nesting real (piezas de distintas prendas y talles compartiendo un
mismo lienzo) y trazabilidad por pieza para poder reimprimir una sola sin rehacer el lote.

## Estructura

```
programa/
  backend/    Node + Express — dominio, motor de calibración/nesting, generación de PDF (pdf-lib)
  frontend/   React + Vite + react-konva — vista previa interactiva del nesting
```

## Correrlo en local

```bash
# Backend — http://localhost:4000
cd programa/backend
npm install
npm run dev

# Frontend — http://localhost:5173
cd programa/frontend
npm install
npm run dev
```

El backend necesita un `programa/backend/.env` (copiar `.env.example`) con las claves de Supabase y
`CLAVE_ACCESO`; la web pide esa clave al entrar. El frontend busca el backend en `http://localhost:4000/api` por defecto. Para apuntar a otro
backend, copiá `programa/frontend/.env.example` a `.env.local` y ajustá `VITE_API_URL`.

## Deploy

- **Backend → Render**: hay un `render.yaml` en la raíz (Blueprint). Apunta a `programa/backend`,
  build `npm install`, start `npm start`, health check `/api/salud`. Variables obligatorias:
  `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_KEY`, `CLAVE_ACCESO` (la clave que pide la web,
  mínimo 12 caracteres; sin ella el backend no arranca) y `ORIGENES_PERMITIDOS` (la URL de Netlify).
  Después de cargar `SUPABASE_SERVICE_KEY`, correr una vez el bloque "Endurecer permisos" de
  `programa/backend/supabase-schema.sql` para cerrar el acceso directo con la clave anon.
- **Frontend → Netlify**: hay un `netlify.toml` en la raíz (`base = programa/frontend`,
  `publish = dist`). Configurar la variable de entorno `VITE_API_URL` en Netlify apuntando a la URL
  pública que dé Render (ej. `https://uniflow-web-backend.onrender.com/api`).

## Estado

Es un motor v0: el nesting es un heurístico simple (shelf packing) y el PDF dibuja un rectángulo
por pieza — todavía no hay geometría real de moldería. Sirve para validar el flujo completo
(calibrar → anidar → generar PDF → reponer una pieza), no como producto terminado.
