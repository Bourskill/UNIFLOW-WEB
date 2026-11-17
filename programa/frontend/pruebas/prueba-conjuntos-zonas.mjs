// Pruebas de los conjuntos de zonas (src/utilidades/conjuntosZonas.js):
// qué zonas forman un conjunto, y cómo se pegan en otra pieza.
import { conjuntoDeZona, importarConjunto } from '../src/utilidades/conjuntosZonas.js';

let fallos = 0, pasadas = 0;
function comprobar(desc, cond, detalle) {
  if (cond) { pasadas++; console.log('  ✓ ' + desc); }
  else { fallos++; console.log('  ✗ ' + desc + (detalle ? '\n      ' + detalle : '')); }
}

const fijo = (ref, valor = 0) => ({ ref, modo: 'fijo', valor });
const piquete = { tipo: 'piquete', indice: 0, total: 1, parte: 'centro' };
const zonaRef = (zona, parte = 'abajo') => ({ tipo: 'zona', zona, parte });
function zona(id, anclaX, anclaY = anclaX, extra = {}) {
  return { id, nombre: id, pieza: 'ESPALDA', tipo: 'texto', anclaX, anclaY, offset: { x: fijo(null, 0), y: fijo(null, 1.5) }, ...extra };
}

// ESPALDA: ESCUDO pegado al piquete; NUMERO pegado debajo del escudo; NOMBRE
// debajo del número. SUELTA, pegada al contorno, sin nadie colgando.
// En MANGA, otra zona sin relación.
const anclaje = {
  anclas: [
    { id: 'A1', pieza: 'ESPALDA', x: fijo(piquete, 2), y: fijo(piquete, 3) },
    { id: 'A2', pieza: 'ESPALDA', x: fijo(zonaRef('ESCUDO')), y: fijo(zonaRef('ESCUDO')) },
    { id: 'A3', pieza: 'ESPALDA', x: fijo(zonaRef('NUMERO')), y: fijo(zonaRef('NUMERO'), 0.5) },
    { id: 'A4', pieza: 'ESPALDA', x: fijo({ tipo: 'contorno', parte: 'centro' }), y: fijo({ tipo: 'contorno', parte: 'centro' }) },
    { id: 'A5', pieza: 'MANGA', x: fijo(piquete), y: fijo(piquete) },
  ],
  zonas: [
    zona('ESCUDO', 'A1', 'A1', { tipo: 'logo', logoRuta: 'https://x/escudo.png' }),
    zona('NUMERO', 'A2'),
    zona('NOMBRE', 'A3'),
    zona('SUELTA', 'A4'),
    { ...zona('MANGA_1', 'A5'), pieza: 'MANGA' },
  ],
};

console.log('\n--- Qué zonas forman un conjunto ---');
{
  const c = conjuntoDeZona(anclaje, 'NUMERO');
  comprobar('desde la del medio salen las 3 de la cadena', c && c.zonas.map((z) => z.id).sort().join() === 'ESCUDO,NOMBRE,NUMERO', JSON.stringify(c?.zonas.map((z) => z.id)));
  comprobar('con sus 3 anclas (A1, A2, A3), sin las de otras zonas', c && c.anclas.map((a) => a.id).sort().join() === 'A1,A2,A3');
  comprobar('desde la raíz (ESCUDO) sale el mismo conjunto', conjuntoDeZona(anclaje, 'ESCUDO')?.zonas.length === 3);
  comprobar('desde la última (NOMBRE) también', conjuntoDeZona(anclaje, 'NOMBRE')?.zonas.length === 3);
  comprobar('una zona sola (SUELTA) no es un conjunto', conjuntoDeZona(anclaje, 'SUELTA') === null);
  comprobar('lo devuelto es una copia (no comparte objetos con el anclaje)', c.zonas[0] !== anclaje.zonas[0]);
}

console.log('\n--- Pegarlo en otra pieza, a un punto elegido ---');
{
  const conjunto = conjuntoDeZona(anclaje, 'ESCUDO');
  const destino = { tipo: 'extremo', parte: 'arriba' };
  const { anclaje: nuevo, idsZonasNuevas } = importarConjunto(anclaje, conjunto, 'FRENTE', destino);
  const nuevas = nuevo.zonas.filter((z) => idsZonasNuevas.includes(z.id));
  comprobar('se suman 3 zonas, las de antes siguen', nuevo.zonas.length === anclaje.zonas.length + 3);
  comprobar('los nombres no chocan con los que ya había', new Set(nuevo.zonas.map((z) => z.id)).size === nuevo.zonas.length);
  comprobar('todas quedan en la pieza destino', nuevas.every((z) => z.pieza === 'FRENTE'));
  const anclasNuevas = nuevo.anclas.filter((a) => nuevas.some((z) => z.anclaX === a.id || z.anclaY === a.id));
  comprobar('sin choque de nombres de ancla', new Set(nuevo.anclas.map((a) => a.id)).size === nuevo.anclas.length);
  const raiz = nuevas.find((z) => z.id.startsWith('ESCUDO'));
  const anclaRaiz = nuevo.anclas.find((a) => a.id === raiz.anclaX);
  comprobar('la raíz queda pegada al punto elegido, sin distancia extra',
    anclaRaiz.x.ref.tipo === 'extremo' && anclaRaiz.x.valor === 0 && anclaRaiz.y.ref.parte === 'arriba' && anclaRaiz.y.valor === 0);
  const numero = nuevas.find((z) => z.id.startsWith('NUMERO'));
  const anclaNumero = nuevo.anclas.find((a) => a.id === numero.anclaX);
  comprobar('el número sigue pegado al escudo NUEVO (no al viejo)', anclaNumero.x.ref.tipo === 'zona' && anclaNumero.x.ref.zona === raiz.id);
  const nombre = nuevas.find((z) => z.id.startsWith('NOMBRE'));
  const anclaNombre = nuevo.anclas.find((a) => a.id === nombre.anclaX);
  comprobar('y conserva la distancia interna (0.5 cm debajo del número)', anclaNombre.y.ref.zona === numero.id && anclaNombre.y.valor === 0.5);
  comprobar('el contenido viaja con el conjunto (logo del escudo)', raiz.logoRuta === 'https://x/escudo.png');
  comprobar('el original no se tocó', anclaje.zonas.length === 5 && anclaje.anclas[0].x.ref.tipo === 'piquete');
  comprobar('las anclas importadas son exactamente las que usan sus zonas', anclasNuevas.length === 3);
}

console.log('\n--- Pegarlo en un producto vacío conserva los nombres ---');
{
  const conjunto = conjuntoDeZona(anclaje, 'ESCUDO');
  const { anclaje: nuevo } = importarConjunto({ anclas: [], zonas: [] }, conjunto, 'FRENTE', piquete);
  comprobar('ESCUDO, NUMERO y NOMBRE se llaman igual', nuevo.zonas.map((z) => z.id).sort().join() === 'ESCUDO,NOMBRE,NUMERO');
  comprobar('anclas A1, A2, A3', nuevo.anclas.map((a) => a.id).sort().join() === 'A1,A2,A3');
}

console.log('\n--- Un cruce entre dos puntos externos queda en un solo punto ---');
{
  const conCruce = {
    anclas: [
      { id: 'A1', pieza: 'ESPALDA', x: fijo(piquete), y: fijo(piquete) },
      { id: 'A2', pieza: 'ESPALDA', x: fijo({ tipo: 'contorno', parte: 'derecha' }), y: fijo({ tipo: 'contorno', parte: 'derecha' }) },
      { id: 'A3', pieza: 'ESPALDA', x: fijo(zonaRef('FRANJA')), y: fijo(zonaRef('FRANJA')) },
    ],
    zonas: [zona('FRANJA', 'A1', 'A2', { modoCruce: 'medio' }), zona('TEXTO', 'A3')],
  };
  const conjunto = conjuntoDeZona(conCruce, 'TEXTO');
  const { anclaje: nuevo } = importarConjunto({ anclas: [], zonas: [] }, conjunto, 'FRENTE', piquete);
  const franja = nuevo.zonas.find((z) => z.id === 'FRANJA');
  comprobar('la franja queda pegada a una sola ancla', franja.anclaX === franja.anclaY && franja.modoCruce === 'esquina');
  comprobar('el ancla sobrante no se copia', nuevo.anclas.length === 2, nuevo.anclas.map((a) => a.id).join());
}

console.log('\n' + pasadas + ' pasadas, ' + fallos + ' fallos');
process.exit(fallos ? 1 : 0);
