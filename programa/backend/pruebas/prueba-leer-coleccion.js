"use strict";

// ============================================================
// Leer una colección en tandas (dominio/almacen.js·leerColeccion), con un
// Supabase de mentira: lo que antes era UNA consulta enorme que Supabase
// cortaba por "statement timeout" ahora son varias chicas, y si una tanda
// igual se pasa de tiempo se reintenta con menos filas. Más lo que se manda
// de las piezas a la Biblioteca (rutas/api.js·piezaParaListar).

process.env.SUPABASE_URL ||= 'http://localhost:1';
process.env.SUPABASE_KEY ||= 'prueba';
process.env.CLAVE_ACCESO ||= 'clave-de-prueba-larga';
const { leerColeccion } = await import('../src/dominio/almacen.js');
const { piezaParaListar } = await import('../src/rutas/api.js');

let fallos = 0, pasadas = 0;
function comprobar(desc, cond, detalle) {
  if (cond) { pasadas++; console.log('  ✓ ' + desc); }
  else { fallos++; console.log('  ✗ ' + desc + (detalle ? '\n      ' + detalle : '')); }
}

// Supabase falso: `filas` en orden; si una consulta pide más de `maxPorConsulta`, "timeout".
function clienteFalso(filas, maxPorConsulta = Infinity) {
  const pedidos = [];
  return {
    pedidos,
    from: () => {
      const q = {
        select: () => q,
        order: () => q,
        range: (desde, hasta) => {
          const cuantas = hasta - desde + 1;
          pedidos.push(cuantas);
          if (cuantas > maxPorConsulta) {
            return Promise.resolve({ data: null, error: { message: 'canceling statement due to statement timeout' } });
          }
          return Promise.resolve({ data: filas.slice(desde, hasta + 1).map((d) => ({ datos: d })), error: null });
        },
      };
      return q;
    },
  };
}
const filas = (n) => Array.from({ length: n }, (_, i) => ({ id: 'p' + i }));

console.log('\n--- Lectura en tandas ---');
{
  const c = clienteFalso(filas(250));
  const todo = await leerColeccion('grupos', { cliente: c });
  comprobar('trae todas las filas, en orden', todo.length === 250 && todo[0].id === 'p0' && todo[249].id === 'p249');
  comprobar('en varias consultas chicas (100 + 100 + 50)', c.pedidos.join() === '100,100,100', c.pedidos.join());

  const p = clienteFalso(filas(20));
  const piezas = await leerColeccion('piezas', { cliente: p });
  comprobar('las piezas (filas pesadas) van de a pocas', piezas.length === 20 && Math.max(...p.pedidos) <= 8, p.pedidos.join());

  const vacia = clienteFalso([]);
  comprobar('colección vacía: lista vacía', (await leerColeccion('disenos', { cliente: vacia })).length === 0);
}

console.log('\n--- Si una tanda igual se pasa de tiempo, se achica y sigue ---');
{
  const c = clienteFalso(filas(30), 3);
  const todo = await leerColeccion('productos', { cliente: c });
  comprobar('termina con todas las filas, sin error', todo.length === 30 && todo.map((f) => f.id).join() === filas(30).map((f) => f.id).join());
  const c2 = clienteFalso(filas(30), 3);
  await leerColeccion('productos', { cliente: c2 });
  comprobar('y la próxima vez ya arranca con la tanda que anduvo', c2.pedidos[0] <= 3, c2.pedidos.join());

  const roto = { from: () => { const q = { select: () => q, order: () => q, range: () => Promise.resolve({ data: null, error: { message: 'permission denied' } }) }; return q; } };
  let mensaje = '';
  try { await leerColeccion('pedidos', { cliente: roto }); } catch (e) { mensaje = e.message; }
  comprobar('otro error (no de tiempo) sale tal cual, sin reintentar', /permission denied/.test(mensaje), mensaje);
}

console.log('\n--- Piezas para la Biblioteca: sin el peso del historial ---');
{
  const geo = { m: { poligonoMm: Array.from({ length: 5000 }, (_, i) => [i, i]) } };
  const pieza = {
    id: 'a', nombre: 'Delantero', version: 2, geometriaPorTalla: geo, dimensionesPorTalla: { m: { anchoCm: 50, altoCm: 70 } },
    archivoOriginal: 'data:application/pdf;base64,' + 'A'.repeat(100000), formatoOriginal: 'pdf',
    versiones: [
      { version: 1, creadoEn: '2026-01-01', motivo: null, geometriaPorTalla: geo, dimensionesPorTalla: { m: { anchoCm: 49, altoCm: 70 } } },
      { version: 2, creadoEn: '2026-02-01', motivo: 'Reprocesada', geometriaPorTalla: geo, dimensionesPorTalla: { m: { anchoCm: 50, altoCm: 70 } } },
    ],
  };
  const liviana = piezaParaListar(pieza);
  comprobar('la geometría actual sigue (la usa Diseño)', liviana.geometriaPorTalla === geo);
  comprobar('el historial conserva número, fecha, motivo y medidas',
    liviana.versiones.length === 2 && liviana.versiones[1].motivo === 'Reprocesada' && liviana.versiones[0].dimensionesPorTalla.m.anchoCm === 49);
  comprobar('pero sin el contorno de cada versión', liviana.versiones.every((v) => !('geometriaPorTalla' in v)));
  comprobar('un archivo viejo incrustado no se manda entero (pero se sabe que existe)', liviana.archivoOriginal === 'guardado');
  comprobar('la pieza guardada no se toca', pieza.versiones[0].geometriaPorTalla === geo && pieza.archivoOriginal.length > 1000);
  const tam = (o) => JSON.stringify(o).length;
  comprobar('pesa mucho menos', tam(liviana) < tam(pieza) / 3, tam(pieza) + ' → ' + tam(liviana) + ' caracteres');
  comprobar('una URL de Storage queda igual', piezaParaListar({ archivoOriginal: 'https://x.supabase.co/a.pdf' }).archivoOriginal === 'https://x.supabase.co/a.pdf');
}

console.log('\n' + pasadas + ' pasadas, ' + fallos + ' fallos');
process.exit(fallos ? 1 : 0);
