// Heredar diseño y zonas entre prendas, enlazadas (utilidades/enlacePrendas.js).
import { emparejarPiezas, copiarEnlazado, sincronizarEnlaces, desenlazarZona, disenoCopiado, enlazadasCon } from '../src/utilidades/enlacePrendas.js';

let fallos = 0, pasadas = 0;
function comprobar(desc, cond, detalle) {
  if (cond) { pasadas++; console.log('  ✓ ' + desc); }
  else { fallos++; console.log('  ✗ ' + desc + (detalle ? '\n      ' + detalle : '')); }
}

console.log('\n--- Emparejar piezas por rol ---');
{
  const m = emparejarPiezas(
    [{ clave: 'd::FRENTE', rol: 'FRENTE' }, { clave: 'd::ESPALDA', rol: 'ESPALDA' }, { clave: 'd::MANGA', rol: 'MANGA' }],
    [{ clave: 'c::Espalda', rol: 'Espalda' }, { clave: 'c::FRENTE', rol: 'FRENTE' }, { clave: 'c::MANGA LARGA', rol: 'MANGA LARGA' }, { clave: 'c::CUELLO', rol: 'CUELLO' }]);
  comprobar('mismo rol (sin mayúsculas)', m['c::FRENTE'] === 'd::FRENTE' && m['c::Espalda'] === 'd::ESPALDA', JSON.stringify(m));
  comprobar('parecido: MANGA LARGA ← MANGA', m['c::MANGA LARGA'] === 'd::MANGA', JSON.stringify(m));
  comprobar('sin par: null', m['c::CUELLO'] === null);
  // El caso real (7993): roles con VOLEY y MASC/FEM en todas.
  const masc = ['TAPACUELLOS VOLEY MASC', 'ESPALDA VOLEY MASC', 'FRENTE R VOLEY MASC', 'CUELLO REDONDOS VOLEY MASC', 'SISA VOLEY MASC'].map((r) => ({ clave: 'm::' + r, rol: r }));
  const fem = ['TAPACUELLOS VOLEY FEM', 'ESPALDAS VOLEY FEM', 'SIZA VOLEY FEM', 'CUELLO R VOLEY FEM', 'FRENTE R VOLEY FEM'].map((r) => ({ clave: 'f::' + r, rol: r }));
  const r = emparejarPiezas(masc, fem);
  const esperado = { 'f::TAPACUELLOS VOLEY FEM': 'm::TAPACUELLOS VOLEY MASC', 'f::ESPALDAS VOLEY FEM': 'm::ESPALDA VOLEY MASC', 'f::SIZA VOLEY FEM': 'm::SISA VOLEY MASC',
    'f::CUELLO R VOLEY FEM': 'm::CUELLO REDONDOS VOLEY MASC', 'f::FRENTE R VOLEY FEM': 'm::FRENTE R VOLEY MASC' };
  comprobar('7993 MASC → FEM: cada pieza con la suya (ESPALDAS, SISA/SIZA, CUELLO R)', JSON.stringify(r) === JSON.stringify(esperado), JSON.stringify(r));
}

// Dama (d) con un número en la espalda colgado de un ancla, y un nombre que cuelga de la zona del número.
const base = {
  anclas: [
    { id: 'A1', nombre: 'A1', pieza: 'd::ESPALDA', x: { ref: { tipo: 'contorno', parte: 'centro' }, modo: 'fijo', valor: 0 }, y: { ref: { tipo: 'extremo', parte: 'arriba', rx: 0.3, ry: 0 }, modo: 'fijo', valor: 8 } },
    { id: 'A2', nombre: 'A2', pieza: 'd::ESPALDA', x: { ref: { tipo: 'zona', zona: 'NUMERO', parte: 'centro' }, modo: 'fijo', valor: 0 }, y: { ref: { tipo: 'zona', zona: 'NUMERO', parte: 'arriba' }, modo: 'fijo', valor: -2 } },
    { id: 'A3', nombre: 'A3', pieza: 'd::FRENTE', x: { ref: { tipo: 'contorno', parte: 'izquierda' }, modo: 'proporcional', valor: 0.3 }, y: { ref: { tipo: 'contorno', parte: 'arriba' }, modo: 'fijo', valor: 10 } },
  ],
  zonas: [
    { id: 'NUMERO', nombre: 'NUMERO', pieza: 'd::ESPALDA', tipo: 'numero', anclaX: 'A1', anclaY: 'A1', ancho: 20, alto: 25, campoPedido: 'numero' },
    { id: 'NOMBRE', nombre: 'NOMBRE', pieza: 'd::ESPALDA', tipo: 'texto', anclaX: 'A2', anclaY: 'A2', ancho: 24, alto: 5, campoPedido: 'nombre' },
    { id: 'ESCUDO', nombre: 'ESCUDO', pieza: 'd::FRENTE', tipo: 'logo', anclaX: 'A3', anclaY: 'A3', ancho: 7, alto: 7, logoRuta: '/x.png' },
  ],
};
const pares = { 'c::ESPALDA': 'd::ESPALDA', 'c::FRENTE': 'd::FRENTE' };

console.log('\n--- Copiar enlazado ---');
const { anclaje: copiado, zonas: nuevas } = copiarEnlazado(base, pares);
{
  comprobar('copia las 3 zonas', nuevas === 3 && copiado.zonas.length === 6, nuevas);
  const num = copiado.zonas.find((z) => z.pieza === 'c::ESPALDA' && z.tipo === 'numero');
  const nom = copiado.zonas.find((z) => z.pieza === 'c::ESPALDA' && z.tipo === 'texto');
  const anclaNum = copiado.anclas.find((a) => a.id === num.anclaX);
  const anclaNom = copiado.anclas.find((a) => a.id === nom.anclaX);
  comprobar('el número copiado cuelga de un ancla nueva en la pieza nueva', anclaNum && anclaNum.id !== 'A1' && anclaNum.pieza === 'c::ESPALDA' && anclaNum.y.ref.rx === 0.3);
  comprobar('el nombre copiado cuelga del número COPIADO, no del original', anclaNom.pieza === 'c::ESPALDA' && anclaNom.x.ref.zona === num.id && anclaNom.y.ref.zona === num.id, JSON.stringify(anclaNom));
  comprobar('original y copia comparten enlace', num.enlace && copiado.zonas.find((z) => z.id === 'NUMERO').enlace === num.enlace);
  comprobar('los ids no chocan', new Set([...copiado.anclas, ...copiado.zonas].map((x) => x.id)).size === copiado.anclas.length + copiado.zonas.length);
  comprobar('el original no se movió', JSON.stringify(copiado.anclas.find((a) => a.id === 'A1').y) === JSON.stringify(base.anclas[0].y));
  const otraVez = copiarEnlazado(copiado, pares);
  comprobar('copiar de nuevo no repite nada', otraVez.zonas === 0 && otraVez.anclaje.zonas.length === 6);
  comprobar('sabe con quién está enlazada', enlazadasCon(copiado, num).map((z) => z.id).join() === 'NUMERO');
}

console.log('\n--- Lo que cambia en una pasa a la otra ---');
{
  const s = (f) => sincronizarEnlaces(copiado, f(copiado));
  const num = (a, pieza) => a.zonas.find((z) => z.pieza === pieza && z.tipo === 'numero');
  const masGrande = s((a) => ({ ...a, zonas: a.zonas.map((z) => (z.id === 'NUMERO' ? { ...z, alto: 30, offset: { x: 1, y: 2 } } : z)) }));
  comprobar('agrandar y mover el número de Dama cambia el de Caballero', num(masGrande, 'c::ESPALDA').alto === 30 && num(masGrande, 'c::ESPALDA').offset?.y === 2);
  comprobar('…sin cambiarle la pieza ni el ancla', num(masGrande, 'c::ESPALDA').pieza === 'c::ESPALDA' && num(masGrande, 'c::ESPALDA').anclaX === num(copiado, 'c::ESPALDA').anclaX);
  const anclaC = num(copiado, 'c::ESPALDA').anclaX;
  const bajada = s((a) => ({ ...a, anclas: a.anclas.map((x) => (x.id === anclaC ? { ...x, y: { ...x.y, valor: 12 } } : x)) }));
  comprobar('bajar el ancla en Caballero la baja en Dama', bajada.anclas.find((x) => x.id === 'A1').y.valor === 12);
  const otraAncla = s((a) => ({ ...a, anclas: [...a.anclas, { id: 'A9', pieza: 'd::ESPALDA', x: { ref: { tipo: 'contorno', parte: 'izquierda' }, modo: 'fijo', valor: 3 }, y: { ref: { tipo: 'contorno', parte: 'abajo' }, modo: 'fijo', valor: 3 } }],
    zonas: a.zonas.map((z) => (z.id === 'NUMERO' ? { ...z, anclaX: 'A9', anclaY: 'A9' } : z)) }));
  const nc = num(otraAncla, 'c::ESPALDA'), anc = otraAncla.anclas.find((x) => x.id === nc.anclaX);
  comprobar('colgarlo de un ancla nueva crea su par en la otra pieza', anc.pieza === 'c::ESPALDA' && anc.x.valor === 3 && anc.id !== 'A9', JSON.stringify(anc));
  const cargaOtra = sincronizarEnlaces(copiado, { anclas: base.anclas, zonas: base.zonas });
  comprobar('cargar otra producción no sincroniza nada', cargaOtra.zonas.length === 3);
  const dosALaVez = s((a) => ({ ...a, zonas: a.zonas.map((z) => (z.tipo === 'numero' ? { ...z, alto: 40 + (z.id === 'NUMERO' ? 1 : 0) } : z)) }));
  comprobar('si cambiaron las dos a la vez, cada una queda como quedó', num(dosALaVez, 'd::ESPALDA').alto === 41 && num(dosALaVez, 'c::ESPALDA').alto === 40);
  const suelta = desenlazarZona(copiado, num(copiado, 'c::ESPALDA').id);
  const tras = sincronizarEnlaces(suelta, { ...suelta, zonas: suelta.zonas.map((z) => (z.id === 'NUMERO' ? { ...z, alto: 50 } : z)) });
  comprobar('desenlazada, ya no la sigue', num(tras, 'c::ESPALDA').alto === 25 && !num(tras, 'c::ESPALDA').enlace);
}

console.log('\n--- El diseño ---');
{
  const d = { imagenesPorPieza: { 'd::FRENTE': '/f.pdf', 'd::ESPALDA': '/e.pdf', 'c::MANGA': '/m.png' }, vistasPorPieza: { 'd::FRENTE': '/f.png' }, fondoPorPieza: { 'c::ESPALDA': { tipo: 'solido' } } };
  const { cambios, piezas } = disenoCopiado(d, { ...pares, 'c::MANGA': 'd::MANGA' });
  comprobar('copia imagen y vista', cambios.imagenesPorPieza['c::FRENTE'] === '/f.pdf' && cambios.vistasPorPieza['c::FRENTE'] === '/f.png' && piezas === 2);
  comprobar('el fondo propio del destino se reemplaza por el del origen (el general)', !('c::ESPALDA' in cambios.fondoPorPieza));
  comprobar('una pieza de origen sin nada no borra lo del destino', cambios.imagenesPorPieza['c::MANGA'] === '/m.png');
}

console.log('\n' + pasadas + ' pasadas, ' + fallos + ' fallos');
process.exit(fallos ? 1 : 0);
