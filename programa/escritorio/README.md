# UNIFLOW de escritorio

La misma app de la versión web, pero instalada en la PC: el servidor corre en la
propia PC y los datos quedan en una carpeta (de esta PC o compartida en la red),
sin Supabase ni Render y sin sus límites de tamaño o memoria.

## Instalar

Correr `dist/UNIFLOW Setup 1.0.0.exe` en cada PC. Al abrir UNIFLOW por primera
vez pide la carpeta de datos. Todas las PCs que elijan **la misma carpeta**
(por ejemplo una en `\\192.168.1.92\Documentos`) ven y editan los mismos datos.

- **Archivo → Abrir la carpeta de datos / Cambiar carpeta de datos…**
- El botón 📁 de la barra de arriba muestra la carpeta y permite **traer los
  datos de la versión web** (dirección del servidor de Render + su clave).

Qué hay en la carpeta:

```
datos/<colección>/<id>.json   un archivo por pieza, prenda, diseño, producción, pedido…
archivos/                     diseños, moldes, logos y tipografías, tal cual se subieron
eventos/<mes>-<pc>.jsonl      historial de cambios de cada PC
```

Copiar esa carpeta es hacer una copia de seguridad completa.

## Armar el instalador

```
cd programa/escritorio
npm install
node node_modules/electron/install.js   # solo si npm no bajó Electron
npm run instalador                       # deja el .exe en dist/
```

`npm run iniciar` abre la app sin instalar (para probar). `preparar.mjs` copia
el backend y arma la página antes de cada uno; si cambian las dependencias del
backend, hay que copiarlas a `package.json` de acá.

Para probar con otra carpeta sin tocar la elegida: `UNIFLOW.exe --carpeta="D:\prueba"`.
