// App de escritorio: datos y archivos en una carpeta (dominio/almacenLocal.js),
// que puede ser compartida entre varias PCs (carpeta de red, Drive). Se prueba
// el servidor entero en ese modo, y una "segunda PC" (otro proceso) que escribe
// en la misma carpeta mientras tanto.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'uniflow-carpeta-'));
process.env.UNIFLOW_CARPETA = carpeta;
delete process.env.CLAVE_ACCESO;

let fallos = 0, pasadas = 0;
function comprobar(desc, cond, detalle) {
  if (cond) { pasadas++; console.log('  ✓ ' + desc); }
  else { fallos++; console.log('  ✗ ' + desc + (detalle ? '\n      ' + detalle : '')); }
}

const { iniciarServidor } = await import('../src/server.js');
const puerto = await iniciarServidor({ puerto: 0, host: '127.0.0.1' });
const base = 'http://127.0.0.1:' + puerto + '/api';
const json = async (ruta, opciones = {}) => {
  const r = await fetch(base + ruta, { ...opciones, headers: { 'Content-Type': 'application/json', ...opciones.headers } });
  return { status: r.status, cuerpo: r.status === 204 ? null : await r.json() };
};

console.log('\n--- El servidor en modo escritorio ---');
{
  const salud = await json('/salud');
  comprobar('dice que es la app de escritorio', salud.cuerpo.escritorio === true);
  const sinClave = await json('/pedidos');
  comprobar('no pide clave', sinClave.status === 200 && Array.isArray(sinClave.cuerpo), JSON.stringify(sinClave));
  // (fetch no deja cambiar el Host: un pedido a mano, como el de una página que se hace pasar por otra dirección)
  const http = await import('node:http');
  const estado = await new Promise((listo) => {
    http.get({ host: '127.0.0.1', port: puerto, path: '/api/pedidos', headers: { Host: 'evil.example' } }, (r) => { r.resume(); listo(r.statusCode); });
  });
  comprobar('rechaza pedidos que no van dirigidos a esta PC', estado === 403, estado);
}

console.log('\n--- Registros en la carpeta ---');
let idPedido;
{
  const creado = await json('/pedidos', { method: 'POST', body: JSON.stringify({ cliente: 'Club A', lineas: [] }) });
  idPedido = creado.cuerpo.id;
  comprobar('crear guarda un archivo por registro', creado.status === 201 &&
    fs.existsSync(path.join(carpeta, 'datos', 'pedidos', idPedido + '.json')));
  await json('/pedidos/' + idPedido, { method: 'PUT', body: JSON.stringify({ cliente: 'Club A2', lineas: [] }) });
  const lista = await json('/pedidos');
  comprobar('editar y volver a leer', lista.cuerpo.length === 1 && lista.cuerpo[0].cliente === 'Club A2', JSON.stringify(lista.cuerpo));
  comprobar('no quedan archivos temporales', !fs.readdirSync(path.join(carpeta, 'datos', 'pedidos')).some((n) => n.endsWith('.tmp')));
  const eventos = fs.readdirSync(path.join(carpeta, 'eventos'));
  comprobar('el historial va en un archivo de esta PC', eventos.length === 1 && eventos[0].endsWith('.jsonl'), eventos.join());
}

console.log('\n--- Otra PC usando la misma carpeta ---');
{
  // Otro proceso (otra PC) crea un pedido y borra el nuestro, directo en la carpeta compartida.
  const script = `
    process.env.UNIFLOW_CARPETA = ${JSON.stringify(carpeta)};
    const a = await import(${JSON.stringify(new URL('../src/dominio/almacenLocal.js', import.meta.url).href)});
    await a.crearRegistro('pedidos', { id: 'de-la-otra-pc', cliente: 'Club B', lineas: [] });
    await a.borrarRegistro('pedidos', ${JSON.stringify(idPedido)});
  `;
  execFileSync(process.execPath, ['--input-type=module', '-e', script]);
  await new Promise((r) => setTimeout(r, 1100));
  const lista = await json('/pedidos');
  comprobar('se ve lo que guardó y borró la otra PC', lista.cuerpo.map((p) => p.cliente).join() === 'Club B', JSON.stringify(lista.cuerpo));
  const uno = await json('/pedidos');
  comprobar('y lo leído se reutiliza mientras no cambie', uno.cuerpo.length === 1);
}

console.log('\n--- Archivos sin límite de tamaño ---');
{
  const firma = await json('/archivos/firma', { method: 'POST', body: JSON.stringify({ contentType: 'application/pdf', nombre: 'diseno-frente' }) });
  comprobar('el permiso de subida apunta a la carpeta', firma.status === 200 && firma.cuerpo.urlSubida.startsWith('/api/archivos-locales/'), JSON.stringify(firma.cuerpo));
  const grande = Buffer.alloc(120 * 1024 * 1024, 7); // 120 MB: más que el límite de Supabase y del JSON
  grande.write('%PDF-1.7');
  const subida = await fetch('http://127.0.0.1:' + puerto + firma.cuerpo.urlSubida, { method: 'PUT', body: grande, headers: { 'content-type': 'application/pdf' } });
  comprobar('sube un archivo de 120 MB', subida.ok, subida.status);
  const bajada = await fetch('http://127.0.0.1:' + puerto + firma.cuerpo.url);
  const bytes = Buffer.from(await bajada.arrayBuffer());
  comprobar('y se baja igual', bytes.length === grande.length && bytes.subarray(0, 8).toString() === '%PDF-1.7' && bajada.headers.get('content-type') === 'application/pdf');
  const interno = await fetch(firma.cuerpo.url); // como lo lee el backend al armar un PDF
  comprobar('el backend lo lee del disco con la URL guardada', interno.ok && (await interno.arrayBuffer()).byteLength === grande.length);
  const malo = await fetch('http://127.0.0.1:' + puerto + '/api/archivos-locales/..%2F..%2Fsecreto.txt');
  comprobar('no deja salir de la carpeta', malo.status === 400 || malo.status === 404, malo.status);
}

console.log('\n--- Traerse los datos de la versión web ---');
{
  // Una "versión web" de mentira: su respaldo por colección y su Storage.
  const http = await import('node:http');
  const web = http.createServer((req, res) => {
    // Como el servidor real: /api/salud abierto; el resto de la API pide clave, los archivos públicos no.
    if (req.url === '/api/salud') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":true}'); }
    if (req.url.startsWith('/api/') &&req.headers.authorization !== 'Bearer clave-web-correcta') { res.writeHead(401); return res.end('{}'); }
    const m = req.url.match(/^\/api\/respaldo\/(\w+)$/);
    if (m) {
      const datos = {
        disenos: [{ id: 'd1', nombre: 'Rayas', imagenesPorPieza: { Frente: 'http://' + req.headers.host + '/storage/v1/object/public/archivos/diseno-frente-abc.pdf' } }],
        productos: [{ id: 'p1', nombre: 'Titular', disenoId: 'd1' }, { id: 'p2', nombre: 'Suplente', disenoId: 'd1' }],
      }[m[1]] || [];
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(datos));
    }
    if (req.url === '/storage/v1/object/public/archivos/diseno-frente-abc.pdf') { res.writeHead(200); return res.end('%PDF-diseño'); }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => web.listen(0, '127.0.0.1', r));
  const origen = 'http://127.0.0.1:' + web.address().port;
  const mala = await json('/escritorio/importar', { method: 'POST', body: JSON.stringify({ origen, clave: 'otra' }) });
  let estado;
  for (let i = 0; i < 50; i++) { estado = (await json('/escritorio/importar')).cuerpo; if (estado.estado !== 'trabajando') break; await new Promise((r) => setTimeout(r, 100)); }
  comprobar('con la clave equivocada lo dice', mala.status === 202 && estado.estado === 'error' && /clave/.test(estado.error), JSON.stringify(estado));
  await json('/escritorio/importar', { method: 'POST', body: JSON.stringify({ origen, clave: 'clave-web-correcta' }) });
  for (let i = 0; i < 50; i++) { estado = (await json('/escritorio/importar')).cuerpo; if (estado.estado !== 'trabajando') break; await new Promise((r) => setTimeout(r, 100)); }
  comprobar('importa todo', estado.estado === 'listo' && estado.registros.productos === 2 && estado.total === 1 && estado.errores.length === 0, JSON.stringify(estado));
  const disenos = (await json('/disenos')).cuerpo;
  const url = disenos[0]?.imagenesPorPieza?.Frente || '';
  comprobar('los archivos quedan en la carpeta y apuntan a ella', url === '/api/archivos-locales/diseno-frente-abc.pdf' &&
    fs.readFileSync(path.join(carpeta, 'archivos', 'diseno-frente-abc.pdf'), 'utf8') === '%PDF-diseño', url);
  comprobar('en el mismo orden que en la web', (await json('/productos')).cuerpo.map((p) => p.nombre).join() === 'Titular,Suplente');
  web.close();
}

fs.rmSync(carpeta, { recursive: true, force: true });
console.log('\n' + pasadas + ' pasadas, ' + fallos + ' fallos');
process.exit(fallos ? 1 : 0);
