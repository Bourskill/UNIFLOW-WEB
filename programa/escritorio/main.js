// UNIFLOW de escritorio.
//
// Abre el mismo servidor de la versión web pero DENTRO de esta PC (escuchando
// solo en 127.0.0.1), con los datos en una carpeta elegida por el usuario --
// de esta PC, de la red o de Google Drive, compartida con otras PCs que tengan
// la app -- y muestra la app en una ventana. Sin Supabase ni Render: sin sus
// límites de tamaño ni de memoria, con los recursos de la PC.

import { app, BrowserWindow, dialog, Menu, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
// Puerto fijo (si está libre): la página guarda sus preferencias por dirección.
const PUERTO_PREFERIDO = 47320;

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let ventana = null;

// ---- configuración (en la carpeta de usuario de la app, no en la de datos) ----

const archivoConfig = () => path.join(app.getPath('userData'), 'config.json');
function leerConfig() {
  try { return JSON.parse(fs.readFileSync(archivoConfig(), 'utf8')); } catch { return {}; }
}
function guardarConfig(config) {
  fs.mkdirSync(path.dirname(archivoConfig()), { recursive: true });
  fs.writeFileSync(archivoConfig(), JSON.stringify(config, null, 2));
}

async function elegirCarpeta(actual) {
  const r = await dialog.showOpenDialog(ventana ?? undefined, {
    title: 'Elegí la carpeta de datos de UNIFLOW',
    buttonLabel: 'Usar esta carpeta',
    defaultPath: actual || path.join(app.getPath('documents'), 'UNIFLOW'),
    properties: ['openDirectory', 'createDirectory', 'promptToCreate'],
  });
  return r.canceled ? null : r.filePaths[0];
}

async function carpetaDeDatos() {
  // `UNIFLOW.exe --carpeta="D:\otra"`: abrir con esa carpeta sin cambiar la guardada
  // (un acceso directo por carpeta, o para pruebas).
  const porArgumento = process.argv.find((a) => a.startsWith('--carpeta='));
  if (porArgumento) {
    const carpeta = path.resolve(porArgumento.slice('--carpeta='.length).replace(/^"|"$/g, ''));
    fs.mkdirSync(carpeta, { recursive: true });
    return carpeta;
  }
  const config = leerConfig();
  if (config.carpeta && fs.existsSync(config.carpeta)) return config.carpeta;
  if (config.carpeta) {
    // Una carpeta de red que no está conectada ahora: no se elige otra sin preguntar.
    const r = await dialog.showMessageBox({
      type: 'warning',
      title: 'UNIFLOW',
      message: 'No encuentro la carpeta de datos',
      detail: config.carpeta + '\n\nSi es una carpeta de red o de Drive, revisá que esté conectada.',
      buttons: ['Reintentar', 'Elegir otra carpeta', 'Salir'],
      defaultId: 0,
      cancelId: 2,
    });
    if (r.response === 0) return carpetaDeDatos();
    if (r.response === 2) return null;
  } else {
    await dialog.showMessageBox({
      type: 'info',
      title: 'UNIFLOW',
      message: 'Elegí dónde guardar los datos',
      detail: 'Ahí van a quedar los moldes, diseños, producciones, pedidos y tipografías.\n\n' +
        'Puede ser una carpeta de esta PC, una carpeta compartida de la red o una carpeta de Google Drive: ' +
        'todas las PCs que usen la misma carpeta ven los mismos datos.',
      buttons: ['Elegir carpeta'],
    });
  }
  const elegida = await elegirCarpeta(config.carpeta);
  if (!elegida) return null;
  guardarConfig({ ...config, carpeta: elegida });
  return elegida;
}

async function cambiarCarpeta() {
  const config = leerConfig();
  const elegida = await elegirCarpeta(config.carpeta);
  if (!elegida || elegida === config.carpeta) return;
  guardarConfig({ ...config, carpeta: elegida });
  app.relaunch();
  app.exit(0);
}

// ---- servidor -----------------------------------------------------------------

async function arrancarServidor(carpeta) {
  process.env.UNIFLOW_CARPETA = carpeta;
  process.env.UNIFLOW_FRONTEND = path.join(aqui, 'app', 'frontend');
  const servidor = path.join(aqui, 'app', 'backend', 'src', 'server.js');
  if (!fs.existsSync(servidor)) throw new Error('Falta la copia del servidor (' + servidor + '): corré "npm run preparar".');
  const { iniciarServidor } = await import(pathToFileURL(servidor).href);
  try {
    return await iniciarServidor({ puerto: PUERTO_PREFERIDO, host: '127.0.0.1' });
  } catch (error) {
    if (error.code !== 'EADDRINUSE') throw error;
    return iniciarServidor({ puerto: 0, host: '127.0.0.1' });
  }
}

// ---- ventana y menú -----------------------------------------------------------

function armarMenu(carpeta) {
  const esMac = process.platform === 'darwin';
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'Archivo',
      submenu: [
        { label: 'Abrir la carpeta de datos', click: () => shell.openPath(carpeta) },
        { label: 'Cambiar carpeta de datos…', click: cambiarCarpeta },
        { type: 'separator' },
        esMac ? { role: 'close', label: 'Cerrar' } : { role: 'quit', label: 'Salir' },
      ],
    },
    {
      label: 'Editar',
      submenu: [
        { role: 'undo', label: 'Deshacer' }, { role: 'redo', label: 'Rehacer' }, { type: 'separator' },
        { role: 'cut', label: 'Cortar' }, { role: 'copy', label: 'Copiar' }, { role: 'paste', label: 'Pegar' },
        { role: 'selectAll', label: 'Seleccionar todo' },
      ],
    },
    {
      label: 'Ver',
      submenu: [
        { role: 'reload', label: 'Recargar' },
        { role: 'toggleDevTools', label: 'Herramientas de desarrollo' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Tamaño normal' }, { role: 'zoomIn', label: 'Acercar' }, { role: 'zoomOut', label: 'Alejar' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Pantalla completa' },
      ],
    },
  ]));
}

function abrirVentana(puerto) {
  const origen = 'http://127.0.0.1:' + puerto;
  ventana = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    title: 'UNIFLOW',
    backgroundColor: '#0d0f14',
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  ventana.once('ready-to-show', () => { ventana.maximize(); ventana.show(); });
  // Los enlaces a otras páginas se abren en el navegador, no adentro de la app.
  ventana.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(origen)) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow' };
  });
  ventana.webContents.on('will-navigate', (evento, url) => {
    if (!url.startsWith(origen)) { evento.preventDefault(); shell.openExternal(url); }
  });
  ventana.on('closed', () => { ventana = null; });
  ventana.loadURL(origen);
}

app.on('second-instance', () => {
  if (!ventana) return;
  if (ventana.isMinimized()) ventana.restore();
  ventana.focus();
});

app.on('window-all-closed', () => app.quit());

app.whenReady().then(async () => {
  try {
    const carpeta = await carpetaDeDatos();
    if (!carpeta) { app.quit(); return; }
    const puerto = await arrancarServidor(carpeta);
    armarMenu(carpeta);
    abrirVentana(puerto);
  } catch (error) {
    dialog.showErrorBox('UNIFLOW no pudo arrancar', (error && error.stack) || String(error));
    app.quit();
  }
});
