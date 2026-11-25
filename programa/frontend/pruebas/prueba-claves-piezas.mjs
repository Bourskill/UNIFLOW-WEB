// Agregar o sacar una prenda de la producción no borra lo armado
// (utilidades/clavesDePiezas.js). Caso real: camiseta armada, se agrega la
// pantaloneta y se perdían todas las zonas y el diseño.
import { traductorDeClaves, anclajeTraducido, disenoTraducido, porClaveTraducido } from '../src/utilidades/clavesDePiezas.js';

let fallos = 0, pasadas = 0;
function comprobar(desc, cond, detalle) {
  if (cond) { pasadas++; console.log('  ✓ ' + desc); }
  else { fallos++; console.log('  ✗ ' + desc + (detalle ? '\n      ' + detalle : '')); }
}

const ref = (pieza) => ({ ref: { tipo: 'piquete', indice: 0, pieza }, modo: 'fijo', valor: 0 });
const camiseta = {
  anclas: [{ id: 'A1', pieza: 'ESPALDA', x: ref(), y: ref() }, { id: 'A2', pieza: 'MANGA@espejo', x: ref('ESPALDA'), y: ref() }],
  zonas: [{ id: 'Z1', pieza: 'ESPALDA', anclaX: 'A1', anclaY: 'A1' }, { id: 'Z2', pieza: 'MANGA@espejo', anclaX: 'A2', anclaY: 'A2' }],
};
const diseno = {
  imagenesPorPieza: { ESPALDA: 'e.pdf', 'MANGA@espejo': 'm.pdf' },
  vistasPorPieza: { ESPALDA: 'e.png' },
  ajusteArtePorPieza: { ESPALDA: { calce: [{ id: 'c1', destino: { x: ref(), y: ref() } }] } },
};

console.log('\n--- Agregar la pantaloneta a la camiseta ---');
{
  const t = traductorDeClaves(['cam'], ['cam', 'pant']);
  const a = anclajeTraducido(camiseta, t);
  comprobar('no se pierde ninguna zona ni ancla', a.zonas.length === 2 && a.anclas.length === 2);
  comprobar('quedan con la clave nueva de la camiseta', a.zonas.map((z) => z.pieza).join() === 'cam::ESPALDA,cam::MANGA@espejo');
  comprobar('y las referencias a otra pieza también', a.anclas[1].x.ref.pieza === 'cam::ESPALDA');
  const d = disenoTraducido(diseno, t);
  comprobar('el diseño sigue en sus piezas', d.imagenesPorPieza['cam::ESPALDA'] === 'e.pdf' && d.imagenesPorPieza['cam::MANGA@espejo'] === 'm.pdf' && d.vistasPorPieza['cam::ESPALDA'] === 'e.png');
  comprobar('con sus ajustes', !!d.ajusteArtePorPieza['cam::ESPALDA']?.calce?.length);
  comprobar('lados en par y tallas de trabajo, igual', porClaveTraducido({ MANGA: true }, t)['cam::MANGA'] === true);
}

console.log('\n--- Sacar una de dos prendas ---');
{
  const dos = anclajeTraducido(camiseta, traductorDeClaves(['cam'], ['cam', 'pant']));
  dos.anclas.push({ id: 'P1', pieza: 'pant::PANT DE', x: ref(), y: ref() });
  dos.zonas.push({ id: 'ZP', pieza: 'pant::PANT DE', anclaX: 'P1', anclaY: 'P1' });
  const t = traductorDeClaves(['cam', 'pant'], ['cam']);
  const a = anclajeTraducido(dos, t);
  comprobar('se va solo lo de la pantaloneta', a.zonas.map((z) => z.id).join() === 'Z1,Z2' && !a.anclas.some((x) => x.id === 'P1'));
  comprobar('la camiseta vuelve a sus claves de siempre', a.zonas[0].pieza === 'ESPALDA' && a.anclas[1].x.ref.pieza === 'ESPALDA');
  const d = disenoTraducido({ imagenesPorPieza: { 'cam::ESPALDA': 'e.pdf', 'pant::PANT DE': 'p.pdf' } }, t);
  comprobar('el diseño de la pantaloneta se quita, el de la camiseta queda', JSON.stringify(d.imagenesPorPieza) === '{"ESPALDA":"e.pdf"}');
}

console.log('\n--- De tres prendas a dos ---');
{
  const t = traductorDeClaves(['a', 'b', 'c'], ['a', 'c']);
  comprobar('las que siguen no cambian de clave', t('a::X') === 'a::X' && t('c::Y') === 'c::Y' && t('b::Z') === null);
  const zonaColgada = anclajeTraducido({ anclas: [{ id: 'B', pieza: 'b::Z' }], zonas: [{ id: 'Q', pieza: 'a::X', anclaX: 'B', anclaY: 'B' }] }, t);
  comprobar('una zona que colgaba de un ancla quitada, también se va', zonaColgada.zonas.length === 0);
}

console.log('\n' + pasadas + ' pasadas, ' + fallos + ' fallos');
process.exit(fallos ? 1 : 0);
