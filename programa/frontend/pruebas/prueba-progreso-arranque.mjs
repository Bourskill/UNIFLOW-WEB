// Pruebas de las cuentas de la barra de progreso del inicio (src/utilidades/progresoArranque.js).
import {
  progresoTotal, avanceDespertando, imagenesDeDisenos, PESO_SERVIDOR, PESO_COLECCION, PESO_IMAGENES, GRUPOS_DE_DATOS,
} from '../src/utilidades/progresoArranque.js';

let fallos = 0, pasadas = 0;
function comprobar(desc, cond, detalle) {
  if (cond) { pasadas++; console.log('  ✓ ' + desc); }
  else { fallos++; console.log('  ✗ ' + desc + (detalle ? '\n      ' + detalle : '')); }
}
const todas = (estado) => Object.fromEntries(Object.keys(PESO_COLECCION).map((n) => [n, estado]));

console.log('\n--- Los pesos suman 100 y cada colección está en un paso ---');
{
  const suma = PESO_SERVIDOR + PESO_IMAGENES + Object.values(PESO_COLECCION).reduce((a, b) => a + b, 0);
  comprobar('servidor + colecciones + imágenes = 100', suma === 100, String(suma));
  const enPasos = GRUPOS_DE_DATOS.flatMap((g) => g.colecciones).sort().join();
  comprobar('todas las colecciones se muestran en algún paso, una sola vez', enPasos === Object.keys(PESO_COLECCION).sort().join(), enPasos);
}

console.log('\n--- Mientras el servidor despierta ---');
{
  comprobar('arranca en 0', progresoTotal({ servidorListo: false, msDespertando: 0 }) === 0);
  const a15 = avanceDespertando(15000), a60 = avanceDespertando(60000), a600 = avanceDespertando(600000);
  comprobar('avanza con el tiempo', a15 > 0 && a60 > a15);
  comprobar('pero nunca completa su tramo sin respuesta', a600 < PESO_SERVIDOR, String(a600));
  comprobar('al responder, el tramo del servidor queda completo', progresoTotal({ servidorListo: true }) === PESO_SERVIDOR);
}

console.log('\n--- Cargando datos ---');
{
  const soloPiezas = progresoTotal({ servidorListo: true, colecciones: { ...todas('cargando'), piezas: 'listo' } });
  comprobar('las piezas (lo más pesado) mueven mucho la barra', soloPiezas === PESO_SERVIDOR + PESO_COLECCION.piezas, String(soloPiezas));
  const sinFotos = progresoTotal({ servidorListo: true, colecciones: todas('listo'), imagenes: null });
  comprobar('todo cargado pero sin las imágenes: 90 %', sinFotos === 90, String(sinFotos));
  comprobar('mitad de las imágenes: 95 %', progresoTotal({ servidorListo: true, colecciones: todas('listo'), imagenes: { total: 10, listas: 5 } }) === 95);
  comprobar('todo listo: 100 %', progresoTotal({ servidorListo: true, colecciones: todas('listo'), imagenes: { total: 3, listas: 3 } }) === 100);
  comprobar('sin imágenes que bajar: también 100 %', progresoTotal({ servidorListo: true, colecciones: todas('listo'), imagenes: { total: 0, listas: 0 } }) === 100);
  comprobar('un error también cierra su tramo (la barra no se queda colgada)',
    progresoTotal({ servidorListo: true, colecciones: { ...todas('listo'), pedidos: 'error' }, imagenes: { total: 0, listas: 0 } }) === 100);
}

console.log('\n--- Qué imágenes se bajan antes ---');
{
  const disenos = [
    { imagenesPorPieza: { a: 'https://x/a.png', b: 'https://x/b.pdf', c: 'https://x/a.png' }, vistasPorPieza: { b: 'https://x/b-vista.png' } },
    { imagenesPorPieza: { d: 'https://x/d.pdf' } }, // PDF sin vista: no se baja
    { imagenesPorPieza: { e: 'data:image/png;base64,AAA' } }, // incrustada: ya está
  ];
  const urls = imagenesDeDisenos(disenos);
  comprobar('PNG sí, de un PDF su vista, sin repetidas', urls.join() === 'https://x/a.png,https://x/b-vista.png', urls.join());
  const muchas = [{ imagenesPorPieza: Object.fromEntries(Array.from({ length: 100 }, (_, i) => ['k' + i, 'https://x/' + i + '.png'])) }];
  comprobar('con tope (no se baja todo el banco de golpe)', imagenesDeDisenos(muchas).length === 40);
}

console.log('\n' + pasadas + ' pasadas, ' + fallos + ' fallos');
process.exit(fallos ? 1 : 0);
