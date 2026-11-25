// Colores de los selectores (utilidades/colores.js): lo que se pega en
// cualquier formato común, y los últimos colores usados.
import { leerColor, coloresRecientes, recordarColor, MAX_RECIENTES } from '../src/utilidades/colores.js';

let pasadas = 0, fallos = 0;
function comprobar(desc, cond, detalle) {
  if (cond) { pasadas++; console.log('  ✓ ' + desc); } else { fallos++; console.log('  ✗ ' + desc + (detalle !== undefined ? '\n      ' + JSON.stringify(detalle) : '')); }
}

// localStorage de mentira (la prueba corre en Node).
const datos = new Map();
globalThis.localStorage = { getItem: (k) => (datos.has(k) ? datos.get(k) : null), setItem: (k, v) => datos.set(k, String(v)), removeItem: (k) => datos.delete(k) };

console.log('\n--- Pegar o escribir un color ---');
for (const [entrada, esperado] of [
  ['#FF0000', '#ff0000'], ['ff0000', '#ff0000'], ['  #1565C0; ', '#1565c0'], ['#f00', '#ff0000'], ['F0A', '#ff00aa'],
  ['rgb(255, 0, 0)', '#ff0000'], ['rgba(0,128,255,0.5)', '#0080ff'], ['12, 34, 56', '#0c2238'], ['#11223344', '#112233'],
]) comprobar(JSON.stringify(entrada) + ' → ' + esperado, leerColor(entrada) === esperado, leerColor(entrada));
for (const malo of ['', 'rojo', '#12', '#12345', 'rgb(300,0,0)', null]) comprobar('no es un color: ' + JSON.stringify(malo), leerColor(malo) === null, leerColor(malo));

console.log('\n--- Últimos colores usados ---');
comprobar('arranca vacío', coloresRecientes().length === 0);
recordarColor('#ff0000'); recordarColor('00FF00'); recordarColor('#ff0000');
comprobar('el último usado va primero y no se repite', JSON.stringify(coloresRecientes()) === JSON.stringify(['#ff0000', '#00ff00']), coloresRecientes());
recordarColor('no-es-color');
comprobar('lo que no es color no se guarda', coloresRecientes().length === 2);
for (let i = 0; i < 20; i++) recordarColor('#0000' + String(i).padStart(2, '0'));
comprobar('guarda como mucho ' + MAX_RECIENTES, coloresRecientes().length === MAX_RECIENTES && coloresRecientes()[0] === '#000019', coloresRecientes());

console.log('\n' + pasadas + ' pasadas, ' + fallos + ' fallos');
process.exit(fallos ? 1 : 0);
