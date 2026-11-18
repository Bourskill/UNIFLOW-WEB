// Pruebas de src/utilidades/producciones.js: recientes en Diseño, tallas para exportar.
import { ordenarPorReciente, tallasDeProduccion, nombreDeExportacion } from '../src/utilidades/producciones.js';

let fallos = 0, pasadas = 0;
function comprobar(desc, cond, detalle) {
  if (cond) { pasadas++; console.log('  ✓ ' + desc); }
  else { fallos++; console.log('  ✗ ' + desc + (detalle ? '\n      ' + detalle : '')); }
}

console.log('\n--- Las más recientes primero ---');
{
  const lista = [
    { id: 'vieja1' }, { id: 'vieja2' },
    { id: 'a', actualizadoEn: '2026-11-10T10:00:00Z' },
    { id: 'b', creadoEn: '2026-11-12T10:00:00Z', actualizadoEn: '2026-11-18T09:00:00Z' },
    { id: 'c', creadoEn: '2026-11-15T10:00:00Z' },
  ];
  const orden = ordenarPorReciente(lista).map((p) => p.id).join();
  comprobar('por última vez guardada; las sin fecha al final, la última agregada primero', orden === 'b,c,a,vieja2,vieja1', orden);
  comprobar('no toca la lista original', lista[0].id === 'vieja1');
}

console.log('\n--- Tallas con la prenda completa ---');
{
  const piezas = [
    { id: 'p1', dimensionesPorTalla: { S: {}, M: {}, L: {}, XL: {} } },
    { id: 'p2', dimensionesPorTalla: { S: {}, M: {}, L: {} } },
    { id: 'p3', tallaUnica: true, dimensionesPorTalla: { U: {} } },
  ];
  const grupos = [{ id: 'g1', piezas: [{ piezaId: 'p1' }, { piezaId: 'p3' }] }, { id: 'g2', piezas: [{ piezaId: 'p2' }] }];
  comprobar('una prenda: todas sus tallas, en orden', tallasDeProduccion({ grupoIds: ['g1'] }, grupos, piezas).join() === 'S,M,L,XL');
  comprobar('un kit: solo las que tienen todas las piezas', tallasDeProduccion({ grupoIds: ['g1', 'g2'] }, grupos, piezas).join() === 'S,M,L');
  comprobar('prenda borrada: ninguna', tallasDeProduccion({ grupoIds: ['nada'] }, grupos, piezas).length === 0);
}

console.log('\n--- Nombre del archivo ---');
comprobar('sin acentos ni espacios', nombreDeExportacion({ nombre: 'Camiseta Peña 2026' }, ['S', 'M']) === 'Camiseta_Pena_2026_S-M.pdf',
  nombreDeExportacion({ nombre: 'Camiseta Peña 2026' }, ['S', 'M']));

console.log('\n' + pasadas + ' pasadas, ' + fallos + ' fallos');
process.exit(fallos ? 1 : 0);
