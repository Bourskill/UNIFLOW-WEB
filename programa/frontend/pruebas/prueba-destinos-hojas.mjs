// Excel de varias hojas: a qué prenda/conjunto va cada hoja (utilidades/destinosDeHojas.js).
import { destinosDeImportacion, destinoSugerido, lineaDeDestino, separarPorPrenda } from '../src/utilidades/destinosDeHojas.js';

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
{
  // El Excel real: hojas «Niña», «Femenino», «Masculino».
  const gs = [
    { id: 'm', nombre: 'T SHIRT VOLEY MASC', piezas: [{ rol: 'FRENTE' }] },
    { id: 'f', nombre: 'CAMISETA VOLEY FEM', piezas: [{ rol: 'FRENTE' }] },
    { id: 'n', nombre: 'LYCRA NIÑA', piezas: [{ rol: 'FRENTE' }] },
  ];
  const sinConj = destinosDeImportacion([{ id: 'V', nombre: 'NEGRO', grupoIds: ['m', 'f', 'n'] }], gs, 'V');
  const a = (h) => destinoSugerido(h, sinConj)?.id;
  comprobar('sin conjuntos: «Niña» → solo LYCRA NIÑA', a('Niña') === 'V|g|n', a('Niña'));
  comprobar('sin conjuntos: «Femenino» → solo la camiseta FEM', a('Femenino') === 'V|g|f', a('Femenino'));
  comprobar('sin conjuntos: «Masculino» → solo la de MASC', a('Masculino') === 'V|g|m', a('Masculino'));
  const conConj = destinosDeImportacion([{ id: 'V', nombre: 'NEGRO', grupoIds: ['m', 'f', 'n'], conjuntos: [
    { id: 'cd', nombre: 'Dama', grupoIds: ['f'] }, { id: 'cc', nombre: 'Caballero', grupoIds: ['m'] }, { id: 'cn', nombre: 'Niña', grupoIds: ['n'] }] }], gs, 'V');
  const b = (h) => destinoSugerido(h, conConj)?.id;
  comprobar('con conjuntos: «Femenino» → Dama, «Masculino» → Caballero, «Niña» → Niña',
    b('Femenino') === 'V|c|cd' && b('Masculino') === 'V|c|cc' && b('Niña') === 'V|c|cn', [b('Femenino'), b('Masculino'), b('Niña')].join());
}
{
  // Una sola hoja con columna PRENDA (Lista_de_camisetas_NEGRO MASC.xlsx).
  const hoja = { nombre: 'Masculino', filas: [
    ['NUMERO', 'TALLA', 'NOMBRE', 'PRENDA'], ['14', 'XL', '', 'CAMISA'], ['14', 'XL', '', 'PANTALONETA'],
    ['4', 'L', '', 'camisa'], ['31', 'XL', '', 'CAMISA'], ['', '', '', ''], ['36', 'L', '', 'PANTALONETA']] };
  const partes = separarPorPrenda([hoja]);
  comprobar('columna PRENDA: un listado por prenda (sin importar mayúsculas)', partes.map((p) => p.nombre).join('|') === 'Masculino · CAMISA|Masculino · PANTALONETA', partes.map((p) => p.nombre).join('|'));
  comprobar('cada listado con la cabecera y solo sus filas', partes[0].filas.length === 4 && partes[1].filas.length === 3 && partes[1].filas[0][3] === 'PRENDA');
  comprobar('sin columna PRENDA queda igual', separarPorPrenda([{ nombre: 'X', filas: [['NOMBRE', 'TALLA'], ['A', 'M']] }])[0].filas.length === 2);
  const gs = [
    { id: 'm', nombre: 'CMST RANG MASC', piezas: [{ rol: 'FRENTE' }, { rol: 'ESPALDA' }] },
    { id: 'p', nombre: 'PANTALONETA TUBULAR MASC', piezas: [{ rol: 'PIERNA' }] },
    { id: 'f', nombre: 'CMST V MANGA FEM', piezas: [{ rol: 'FRENTE' }] },
  ];
  const sinConj = destinosDeImportacion([{ id: 'V', nombre: 'NEGRO', grupoIds: ['m', 'p', 'f'] }], gs, 'V');
  comprobar('sin conjuntos: CAMISA → solo la camiseta MASC, PANTALONETA → solo la pantaloneta',
    destinoSugerido(partes[0].pistas, sinConj)?.id === 'V|g|m' && destinoSugerido(partes[1].pistas, sinConj)?.id === 'V|g|p',
    [destinoSugerido(partes[0].pistas, sinConj)?.id, destinoSugerido(partes[1].pistas, sinConj)?.id].join());
  const conConj = destinosDeImportacion([{ id: 'V', nombre: 'NEGRO', grupoIds: ['m', 'p', 'f'], conjuntos: [
    { id: 'cc', nombre: 'Caballero', grupoIds: ['m', 'p'] }, { id: 'cd', nombre: 'Dama', grupoIds: ['f'] }] }], gs, 'V');
  comprobar('conjunto de varias prendas: también cada una sola', conConj.map((d) => d.etiqueta).join('|') === 'Caballero|Caballero · solo CMST RANG MASC|Caballero · solo PANTALONETA TUBULAR MASC|Dama', conConj.map((d) => d.etiqueta).join('|'));
  // La producción elegida en el pedido gana aunque otra tenga una camiseta "MASC" (pista de la hoja).
  const dos = destinosDeImportacion([{ id: 'A', nombre: '7996', grupoIds: ['c7996', 'p'] }, { id: 'B', nombre: '7963', grupoIds: ['m', 'p'] }],
    [...gs, { id: 'c7996', nombre: 'CMST CUELLO R MANGA', piezas: [{ rol: 'FRENTE' }] }], 'A');
  comprobar('la producción del pedido gana: CAMISA → su camiseta, no la MASC de otra', destinoSugerido(partes[0].pistas, dos)?.id === 'A|g|c7996', destinoSugerido(partes[0].pistas, dos)?.id);
  const pant = destinoSugerido(partes[1].pistas, conConj);
  comprobar('con conjuntos: PANTALONETA de «Masculino» → Caballero · solo pantaloneta, sin la camiseta',
    pant?.id === 'V|c|cc|g|p' && lineaDeDestino(pant).conjuntoId === 'cc' && lineaDeDestino(pant).piezasExcluidas.join() === 'm::FRENTE,m::ESPALDA', JSON.stringify(pant));
}
comprobar('hoja sin parecido → el primero de la producción actual', nombre('Hoja1') === 'B|c|d', nombre('Hoja1'));

const solo = lineaDeDestino(destinos.find((d) => d.id === 'A|g|pan'));
comprobar('"Solo Pantaloneta" excluye las piezas de la camiseta', solo.productoId === 'A' && solo.piezasExcluidas.join(',') === 'cam::FRENTE,cam::ESPALDA', JSON.stringify(solo));
const dama = lineaDeDestino(destinos.find((d) => d.id === 'B|c|d'));
comprobar('conjunto: la línea lleva su conjuntoId', dama.conjuntoId === 'd' && dama.piezasExcluidas.length === 0, JSON.stringify(dama));

console.log('\n' + pasadas + ' pasadas, ' + fallos + ' fallos');
process.exit(fallos ? 1 : 0);
