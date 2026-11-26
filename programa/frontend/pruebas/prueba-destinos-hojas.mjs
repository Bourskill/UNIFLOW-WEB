// Excel de varias hojas: a qué prenda/conjunto va cada hoja (utilidades/destinosDeHojas.js).
import { destinosDeImportacion, destinoSugerido, lineaDeDestino } from '../src/utilidades/destinosDeHojas.js';

let fallos = 0, pasadas = 0;
function comprobar(desc, cond, detalle) {
  if (cond) { pasadas++; console.log('  ✓ ' + desc); }
  else { fallos++; console.log('  ✗ ' + desc + (detalle ? '\n      ' + detalle : '')); }
}

const grupos = [
  { id: 'cam', nombre: 'Camiseta', piezas: [{ piezaId: 'p1', rol: 'FRENTE' }, { piezaId: 'p2', rol: 'ESPALDA' }] },
  { id: 'pan', nombre: 'Pantaloneta', piezas: [{ piezaId: 'p3', rol: 'PIERNA' }] },
  { id: 'camD', nombre: 'Camiseta dama', piezas: [{ piezaId: 'p4', rol: 'FRENTE' }] },
  { id: 'camC', nombre: 'Camiseta caballero', piezas: [{ piezaId: 'p5', rol: 'FRENTE' }] },
];
const productos = [
  { id: 'A', nombre: 'Kit titular', grupoIds: ['cam', 'pan'] },
  { id: 'B', nombre: 'Club Chelsea', grupoIds: ['camD', 'camC'], conjuntos: [{ id: 'd', nombre: 'Dama', grupoIds: ['camD'] }, { id: 'c', nombre: 'Caballero', grupoIds: ['camC'] }] },
  { id: 'C', nombre: 'Buzo', grupoIds: ['cam'] },
];

const destinos = destinosDeImportacion(productos, grupos, 'B');
comprobar('la producción actual va primero', destinos[0].productoId === 'B', destinos.map((d) => d.id).join(' '));
comprobar('con conjuntos: un destino por conjunto', destinos.filter((d) => d.productoId === 'B').map((d) => d.etiqueta).join('|') === 'Dama|Caballero');
comprobar('varias prendas sin conjuntos: toda la producción y cada prenda sola', destinos.filter((d) => d.productoId === 'A').map((d) => d.etiqueta).join('|') === 'Todas sus prendas|Solo Camiseta|Solo Pantaloneta');
comprobar('una sola prenda: un solo destino', destinos.filter((d) => d.productoId === 'C').length === 1);

const nombre = (h) => destinoSugerido(h, destinos)?.id;
comprobar('hoja "DAMA" → conjunto Dama', nombre('DAMA') === 'B|c|d', nombre('DAMA'));
comprobar('hoja "CABALLEROS 2024" → Caballero (sin importar el plural)', nombre('CABALLEROS 2024') === 'B|c|c', nombre('CABALLEROS 2024'));
comprobar('hoja "PANTALONETAS" → Solo Pantaloneta', nombre('PANTALONETAS') === 'A|g|pan', nombre('PANTALONETAS'));
{
  const conCmst = destinosDeImportacion([{ id: 'K', nombre: '7996', grupoIds: ['x', 'y'] }],
    [{ id: 'x', nombre: 'CMST CUELLO R MANGA', piezas: [{ rol: 'FRENTE' }] }, { id: 'y', nombre: 'PANTALONETA TUBULAR', piezas: [{ rol: 'PIERNA' }] }], 'K');
  comprobar('hoja "CAMISETAS" → la prenda "CMST …" (abreviatura)', destinoSugerido('CAMISETAS', conCmst)?.id === 'K|g|x', destinoSugerido('CAMISETAS', conCmst)?.id);
  comprobar('hoja "SHORTS" → la pantaloneta', destinoSugerido('SHORTS', conCmst)?.id === 'K|g|y', destinoSugerido('SHORTS', conCmst)?.id);
}
comprobar('hoja sin parecido → el primero de la producción actual', nombre('Hoja1') === 'B|c|d', nombre('Hoja1'));

const solo = lineaDeDestino(destinos.find((d) => d.id === 'A|g|pan'));
comprobar('"Solo Pantaloneta" excluye las piezas de la camiseta', solo.productoId === 'A' && solo.piezasExcluidas.join(',') === 'cam::FRENTE,cam::ESPALDA', JSON.stringify(solo));
const dama = lineaDeDestino(destinos.find((d) => d.id === 'B|c|d'));
comprobar('conjunto: la línea lleva su conjuntoId', dama.conjuntoId === 'd' && dama.piezasExcluidas.length === 0, JSON.stringify(dama));

console.log('\n' + pasadas + ' pasadas, ' + fallos + ' fallos');
process.exit(fallos ? 1 : 0);
