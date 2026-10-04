// Pruebas de la caché compartida (src/datos/almacen.js), sin navegador ni red:
// los "servidores" son promesas que la prueba resuelve a mano, para poder
// comprobar QUÉ se ve mientras la petición todavía está en el aire.
import { crearAlmacen } from '../src/datos/almacen.js';

let fallos = 0, pasadas = 0;
function comprobar(desc, cond, detalle) {
  if (cond) { pasadas++; console.log('  ✓ ' + desc); }
  else { fallos++; console.log('  ✗ ' + desc + (detalle ? '\n      ' + detalle : '')); }
}

// Una petición controlada a mano.
function diferida() {
  let resolver, rechazar;
  const promesa = new Promise((res, rej) => { resolver = res; rechazar = rej; });
  return { promesa, resolver, rechazar };
}
const esperar = () => new Promise((r) => setImmediate(r));

function nuevo({ listar, avisos = [], ahora } = {}) {
  const llamadas = { piezas: 0, grupos: 0 };
  const almacen = crearAlmacen({
    listadores: {
      piezas: () => { llamadas.piezas++; return listar ? listar('piezas') : Promise.resolve([{ id: 'a' }, { id: 'b' }, { id: 'c' }]); },
      grupos: () => { llamadas.grupos++; return Promise.resolve([{ id: 'g1' }]); },
    },
    avisar: (a) => avisos.push(a),
    ...(ahora ? { ahora } : {}),
  });
  return { almacen, llamadas, avisos };
}

console.log('\n--- Primera carga: "cargando" solo mientras no hay nada; después, los datos ---');
{
  const { almacen } = nuevo();
  comprobar('antes de pedir: sin datos', almacen.leer('piezas').datos === null);
  const p = almacen.asegurar('piezas');
  comprobar('mientras llega: cargando = true', almacen.leer('piezas').cargando === true);
  await p;
  const e = almacen.leer('piezas');
  comprobar('llegaron los 3 registros y ya no está cargando', e.datos.length === 3 && e.cargando === false);
}

console.log('\n--- Actualizar por detrás: sin "Cargando…" y conservando la MISMA lista si nada cambió ---');
{
  const { almacen } = nuevo();
  await almacen.asegurar('piezas');
  const antes = almacen.leer('piezas');
  const vistos = [];
  almacen.suscribir('piezas', () => vistos.push(almacen.leer('piezas').cargando));
  await almacen.cargar('piezas'); // silencioso por defecto
  comprobar('nunca pasó por cargando = true', !vistos.includes(true), JSON.stringify(vistos));
  comprobar('misma referencia de la lista (nada se redibuja de más)', almacen.leer('piezas').datos === antes.datos);
}

console.log('\n--- Borrado optimista: la fila desaparece YA, antes de que el servidor responda ---');
{
  const { almacen } = nuevo();
  await almacen.asegurar('piezas');
  const servidor = diferida();
  const promesa = almacen.eliminar('piezas', 'b', () => servidor.promesa, { etiqueta: 'la pieza B' });
  comprobar('sin esperar al servidor, la lista ya no tiene "b"', almacen.leer('piezas').datos.map((r) => r.id).join() === 'a,c');
  servidor.resolver();
  comprobar('termina bien (true)', (await promesa) === true);
  comprobar('y sigue sin "b"', !almacen.leer('piezas').datos.some((r) => r.id === 'b'));
}

console.log('\n--- Si el servidor rechaza: vuelve a su lugar y se avisa ---');
{
  const avisos = [];
  const { almacen } = nuevo({ avisos });
  await almacen.asegurar('piezas');
  const servidor = diferida();
  const promesa = almacen.eliminar('piezas', 'b', () => servidor.promesa, { etiqueta: 'la pieza B' });
  comprobar('mientras tanto no está', almacen.leer('piezas').datos.length === 2);
  servidor.rechazar(new Error('sin conexión'));
  comprobar('devuelve false (no lanza)', (await promesa) === false);
  comprobar('volvió a su posición original (entre a y c)', almacen.leer('piezas').datos.map((r) => r.id).join() === 'a,b,c');
  comprobar('avisó con tono error y el motivo', avisos.length === 1 && avisos[0].tono === 'error' && /pieza B/.test(avisos[0].mensaje) && /sin conexión/.test(avisos[0].mensaje), JSON.stringify(avisos));
}

console.log('\n--- Una lista que llega del servidor en el medio NO resucita lo que se está borrando ---');
{
  // El servidor todavía lista "b" porque su DELETE no terminó.
  const { almacen } = nuevo();
  await almacen.asegurar('piezas');
  const servidor = diferida();
  const borrado = almacen.eliminar('piezas', 'b', () => servidor.promesa);
  await almacen.cargar('piezas'); // llega [a, b, c] del servidor
  comprobar('"b" sigue fuera mientras su borrado está en curso', !almacen.leer('piezas').datos.some((r) => r.id === 'b'));
  servidor.resolver();
  await borrado;
}

console.log('\n--- Un cambio mientras una carga estaba en vuelo fuerza una segunda carga ---');
{
  const respuestas = [diferida(), diferida()];
  let n = 0;
  const { almacen, llamadas } = nuevo({ listar: () => respuestas[n++].promesa });
  const primera = almacen.cargar('piezas');
  almacen.guardarLocal('piezas', { id: 'z' }); // colección aún vacía de datos: no hace nada
  almacen.invalidar(['piezas']); // pide otra vez mientras la primera sigue en vuelo
  respuestas[0].resolver([{ id: 'a' }]);
  await primera;
  await esperar();
  comprobar('se pidió una segunda vez para no quedarse con la respuesta vieja', llamadas.piezas === 2, 'llamadas = ' + llamadas.piezas);
  respuestas[1].resolver([{ id: 'a' }, { id: 'nuevo' }]);
  await esperar(); await esperar();
  comprobar('y quedó la respuesta más reciente', almacen.leer('piezas').datos.map((r) => r.id).join() === 'a,nuevo');
}

console.log('\n--- guardarLocal: inserta lo nuevo y reemplaza lo existente por id ---');
{
  const { almacen } = nuevo();
  await almacen.asegurar('piezas');
  almacen.guardarLocal('piezas', { id: 'd', n: 1 });
  almacen.guardarLocal('piezas', { id: 'a', n: 2 });
  const l = almacen.leer('piezas').datos;
  comprobar('"d" agregada al final', l[3]?.id === 'd');
  comprobar('"a" reemplazada en su lugar', l[0].id === 'a' && l[0].n === 2 && l.length === 4);
}

console.log('\n--- Errores: sin datos se ven; con datos a la vista, un fallo de fondo no los tumba ---');
{
  let falla = true;
  const { almacen } = nuevo({ listar: () => (falla ? Promise.reject(new Error('Supabase caído')) : Promise.resolve([{ id: 'a' }])) });
  await almacen.asegurar('piezas');
  comprobar('primera carga fallida: error visible y sin datos', almacen.leer('piezas').error === 'Supabase caído' && almacen.leer('piezas').datos === null);
  falla = false;
  await almacen.asegurar('piezas');
  comprobar('al volver a mirar, reintenta y se recupera', almacen.leer('piezas').datos?.length === 1 && almacen.leer('piezas').error === null);
  falla = true;
  await almacen.cargar('piezas');
  comprobar('un fallo de fondo con datos a la vista los deja como estaban', almacen.leer('piezas').datos?.length === 1 && almacen.leer('piezas').error === null);
}

console.log('\n--- Vigencia: una copia vieja se refresca por detrás al volver a mirarla ---');
{
  let reloj = 0;
  const { almacen, llamadas } = nuevo({ ahora: () => reloj });
  await almacen.asegurar('piezas');
  reloj = 5000; await almacen.asegurar('piezas');
  comprobar('a los 5 s sigue valiendo (no pide)', llamadas.piezas === 1);
  reloj = 31000; await almacen.asegurar('piezas');
  comprobar('a los 31 s pide de nuevo, sin mostrar "Cargando…"', llamadas.piezas === 2 && almacen.leer('piezas').cargando === false);
}

console.log('\n--- invalidar toca solo lo que ya se había cargado ---');
{
  const { almacen, llamadas } = nuevo();
  await almacen.asegurar('piezas');
  await almacen.invalidar();
  comprobar('piezas se pidió otra vez', llamadas.piezas === 2);
  comprobar('grupos (nunca pedida) no se pidió', llamadas.grupos === 0);
}

console.log('\n' + pasadas + ' pasadas, ' + fallos + ' fallos');
process.exit(fallos ? 1 : 0);
