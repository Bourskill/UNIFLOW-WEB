"use strict";

// ============================================================
// Pruebas de medidorFuentes.js: el servidor baja fuentes por URLs que llegan
// del cliente, así que solo puede bajar del Storage de SU Supabase, sin seguir
// redirecciones, con tope de tamaño, y solo guarda en memoria lo que de
// verdad es una fuente. El "Supabase" de la prueba es un servidor HTTP local.

import http from 'node:http';
import { readFileSync } from 'node:fs';
import { bytesDeFuente, obtenerMedidor, urlDeFuentePermitida } from '../src/motor/medidorFuentes.js';

let fallos = 0, pasadas = 0;
function comprobar(desc, cond, detalle) {
  if (cond) { pasadas++; console.log('  ✓ ' + desc); }
  else { fallos++; console.log('  ✗ ' + desc + (detalle ? '\n      ' + detalle : '')); }
}

const ARIMO = readFileSync(new URL('../assets/fuentes/Arimo-Bold.ttf', import.meta.url));
const visitas = {}; // ruta -> veces que el servidor la recibió
const PREFIJO = '/storage/v1/object/public/archivos/';

const servidor = http.createServer((req, res) => {
  const ruta = req.url.split('?')[0];
  visitas[req.url] = (visitas[req.url] || 0) + 1;
  if (ruta === PREFIJO + 'ok.ttf') { res.writeHead(200, { 'Content-Type': 'font/ttf' }); res.end(ARIMO); return; }
  if (ruta === PREFIJO + 'basura.ttf') { res.writeHead(200); res.end('<html>esto no es una fuente</html>'); return; }
  if (ruta === PREFIJO + 'enorme.ttf') {
    res.writeHead(200); // sin Content-Length: hay que cortar leyendo
    const trozo = Buffer.alloc(1024 * 1024, 1);
    let enviados = 0;
    const escribir = () => { while (enviados < 30 && res.write(trozo)) enviados++; if (enviados >= 30) res.end(); else res.once('drain', escribir); };
    res.on('error', () => {}); res.on('close', () => {});
    escribir();
    return;
  }
  if (ruta === PREFIJO + 'redir.ttf') { res.writeHead(302, { Location: '/interno?token=secreto' }); res.end(); return; }
  res.writeHead(404); res.end();
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const origen = 'http://127.0.0.1:' + servidor.address().port;
process.env.SUPABASE_URL = origen;

console.log('\n--- Qué URLs se aceptan (sin tocar la red) ---');
{
  comprobar('un archivo del Storage público de este Supabase', urlDeFuentePermitida(origen + PREFIJO + 'ok.ttf'));
  comprobar('otro host (ni el metadato de la nube ni un servicio interno)', !urlDeFuentePermitida('http://169.254.169.254/latest/meta-data/') && !urlDeFuentePermitida('http://127.0.0.1:9/x') && !urlDeFuentePermitida('https://evil.example/storage/v1/object/public/archivos/a.ttf'));
  comprobar('mismo host pero fuera del Storage público', !urlDeFuentePermitida(origen + '/interno?token=secreto') && !urlDeFuentePermitida(origen + '/rest/v1/piezas'));
  comprobar('esquemas raros (file:, data:) y basura', !urlDeFuentePermitida('file:///C:/Windows/win.ini') && !urlDeFuentePermitida('data:font/ttf;base64,AAAA') && !urlDeFuentePermitida('no es una url') && !urlDeFuentePermitida(''));
  const guardada = process.env.SUPABASE_URL;
  delete process.env.SUPABASE_URL;
  comprobar('sin SUPABASE_URL configurada no se acepta nada', !urlDeFuentePermitida(origen + PREFIJO + 'ok.ttf'));
  process.env.SUPABASE_URL = guardada;
}

console.log('\n--- Una URL no permitida ni siquiera se pide al servidor ---');
{
  let rechazo = null;
  try { await bytesDeFuente(origen + '/interno?token=secreto'); } catch (e) { rechazo = e.message; }
  comprobar('se rechaza', /no permitida/.test(rechazo || ''), String(rechazo));
  comprobar('y el servidor nunca recibió esa petición', !visitas['/interno?token=secreto']);
  const { fuenteUrl } = await obtenerMedidor(origen + '/interno?token=secreto');
  comprobar('obtenerMedidor cae a la fuente de base (devuelve fuenteUrl null)', fuenteUrl === null);
}

console.log('\n--- Una fuente válida del Storage se baja y se mide ---');
{
  const bytes = await bytesDeFuente(origen + PREFIJO + 'ok.ttf');
  comprobar('devuelve los bytes de la fuente', bytes.length === ARIMO.length);
  const { medidor, fuenteUrl } = await obtenerMedidor(origen + PREFIJO + 'ok.ttf');
  comprobar('obtenerMedidor la usa tal cual', fuenteUrl === origen + PREFIJO + 'ok.ttf' && medidor.glifos('PEÑA').length === 4);
}

console.log('\n--- Lo que no es una fuente, no se guarda (y se puede reintentar) ---');
{
  let rechazo = null;
  try { await bytesDeFuente(origen + PREFIJO + 'basura.ttf'); } catch (e) { rechazo = e.message; }
  comprobar('un 200 con HTML de error se rechaza', !!rechazo, String(rechazo));
  try { await bytesDeFuente(origen + PREFIJO + 'basura.ttf'); } catch { /* esperado */ }
  comprobar('y no queda guardado: el segundo intento vuelve a pedirla', visitas[PREFIJO + 'basura.ttf'] === 2, String(visitas[PREFIJO + 'basura.ttf']));
}

console.log('\n--- Tope de tamaño y redirecciones ---');
{
  let rechazo = null;
  try { await bytesDeFuente(origen + PREFIJO + 'enorme.ttf'); } catch (e) { rechazo = e.message; }
  comprobar('un archivo de más de 10 MB se corta', /10 MB/.test(rechazo || ''), String(rechazo));
  rechazo = null;
  try { await bytesDeFuente(origen + PREFIJO + 'redir.ttf'); } catch (e) { rechazo = e.message; }
  comprobar('una redirección no se sigue', !!rechazo, String(rechazo));
  comprobar('y el destino de la redirección nunca se pidió', !visitas['/interno?token=secreto']);
}

console.log('\n--- La memoria tiene tope: URLs de sobra desalojan a las menos usadas ---');
{
  for (let n = 0; n < 25; n++) await bytesDeFuente(origen + PREFIJO + 'ok.ttf?n=' + n);
  const antes = visitas[PREFIJO + 'ok.ttf?n=24'];
  await bytesDeFuente(origen + PREFIJO + 'ok.ttf?n=24');
  comprobar('la más reciente sigue en memoria (no vuelve a pedirse)', visitas[PREFIJO + 'ok.ttf?n=24'] === antes);
  await bytesDeFuente(origen + PREFIJO + 'ok.ttf?n=0');
  comprobar('la más antigua ya salió (se vuelve a pedir)', visitas[PREFIJO + 'ok.ttf?n=0'] === 2, String(visitas[PREFIJO + 'ok.ttf?n=0']));
}

servidor.closeAllConnections?.();
servidor.close();
console.log('\n' + pasadas + ' pasadas, ' + fallos + ' fallos');
process.exit(fallos ? 1 : 0);
