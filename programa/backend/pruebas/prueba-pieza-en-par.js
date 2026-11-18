"use strict";

// ============================================================
// Pieza "en par" (GrupoPieza.par): una manga marcada en la prenda sale x2
// -- ella y su espejo -- sin que exista una segunda pieza en la Biblioteca.
// En cada producción, el otro lado lleva el MISMO diseño (sin reflejar) o
// uno PROPIO (producto.ladosPropios).

import { resolverPiezasDeGrupo, resolverPiezasDeGrupos } from '../src/dominio/resolverGrupo.js';
import { resolverPiezasDePedido } from '../src/motor/resolverPedido.js';

let fallos = 0, pasadas = 0;
function comprobar(desc, cond, detalle) {
  if (cond) { pasadas++; console.log('  ✓ ' + desc); }
  else { fallos++; console.log('  ✗ ' + desc + (detalle ? '\n      ' + detalle : '')); }
}

// Manga asimétrica (el pico arriba a la izquierda) y un delantero.
const manga = {
  id: 'pz-manga', nombre: 'OV F MANGAS', angulosPermitidos: [0, 180], tela: null,
  dimensionesPorTalla: { M: { anchoCm: 30, altoCm: 50 } },
  geometriaPorTalla: { M: { poligonoMm: [[0, 0], [300, 0], [300, 500], [0, 400]], boundingBoxMm: { anchoMm: 300, altoMm: 500 } } },
};
const delantero = {
  id: 'pz-del', nombre: 'Delantero', angulosPermitidos: [0, 180], tela: null,
  dimensionesPorTalla: { M: { anchoCm: 50, altoCm: 70 } },
  geometriaPorTalla: { M: { poligonoMm: [[0, 0], [500, 0], [500, 700], [0, 700]], boundingBoxMm: { anchoMm: 500, altoMm: 700 } } },
};
const piezas = [manga, delantero];
const grupo = { id: 'g1', nombre: 'OVER SIZE', piezas: [{ piezaId: 'pz-del', rol: 'Delantero' }, { piezaId: 'pz-manga', rol: 'Mangas', par: true }] };

console.log('\n--- La prenda: una pieza en par suma su otro lado ---');
{
  const lista = resolverPiezasDeGrupo(grupo, piezas);
  comprobar('salen 3 piezas: delantero, manga y el otro lado de la manga', lista.map((p) => p.nombre).join() === 'Delantero,Mangas,Mangas@espejo', lista.map((p) => p.nombre).join());
  const otro = lista[2];
  comprobar('el otro lado sabe de quién es', otro.ladoDe === 'Mangas' && otro.etiquetaRol === 'Mangas (otro lado)');
  comprobar('mismas medidas', otro.dimensionesPorTalla.M.anchoCm === 30 && otro.dimensionesPorTalla.M.altoCm === 50);
  const xs = otro.geometriaPorTalla.M.poligonoMm.map(([x, y]) => x + ',' + y).sort().join(' ');
  comprobar('contorno reflejado (el pico pasa a la derecha)', xs === ['0,0', '300,0', '0,500', '300,400'].sort().join(' '), xs);
  comprobar('la pieza de la Biblioteca no se toca', manga.geometriaPorTalla.M.poligonoMm[3][0] === 0);
  const sinPar = resolverPiezasDeGrupo({ ...grupo, piezas: grupo.piezas.map((gp) => ({ ...gp, par: false })) }, piezas);
  comprobar('sin marcar "en par": como siempre, una sola', sinPar.length === 2);

  const kit = resolverPiezasDeGrupos([grupo, { id: 'g2', nombre: 'Short', piezas: [{ piezaId: 'pz-del', rol: 'Delantero' }] }], piezas);
  const otroKit = kit.find((p) => p.ladoDe);
  comprobar('en un kit de varias prendas, clave y "ladoDe" van con la prenda delante',
    otroKit.nombre === 'g1::Mangas@espejo' && otroKit.ladoDe === 'g1::Mangas' && otroKit.rol === 'Mangas (otro lado)', JSON.stringify({ n: otroKit.nombre, l: otroKit.ladoDe, r: otroKit.rol }));
}

const diseno = {
  id: 'd1', grupoIds: ['g1'],
  imagenesPorPieza: { Mangas: 'https://x/manga-izq.png', 'Mangas@espejo': 'https://x/manga-der.png', Delantero: 'https://x/del.png' },
  fondo: { tipo: 'solido', color1: '#111111' },
  fondoPorPieza: { 'Mangas@espejo': { tipo: 'solido', color1: '#ff0000' } },
};
const ancla = (id, pieza) => ({
  id, pieza,
  x: { ref: { tipo: 'contorno', parte: 'supIzq' }, modo: 'fijo', valor: 15 },
  y: { ref: { tipo: 'contorno', parte: 'supIzq' }, modo: 'fijo', valor: 20 },
});
const anclaje = {
  anclas: [ancla('A1', 'Mangas'), ancla('A2', 'Mangas@espejo')],
  zonas: [
    { id: 'zNum', pieza: 'Mangas', ancla: 'A1', tipo: 'texto', campoPedido: 'numero', ancho: 8, alto: 8, origen: 'centro' },
    { id: 'zDer', pieza: 'Mangas@espejo', ancla: 'A2', tipo: 'texto', campoPedido: 'fijo', valorFijo: 'DER', ancho: 8, alto: 4, origen: 'centro' },
  ],
};
const pedido = (productoId) => ({ lineas: [{ id: 'l1', productoId, talla: 'M', nombre: 'PEÑA', numero: '7' }] });
const textos = (p) => (p.textos || []).map((t) => t.texto).join(',');

console.log('\n--- Pedido con el MISMO diseño en los dos lados ---');
{
  const prod = { id: 'pr1', nombre: 'Titular', grupoIds: ['g1'], disenoId: 'd1', anclaje, bordeContraste: null };
  const salida = resolverPiezasDePedido({ pedido: pedido('pr1'), productos: [prod], grupos: [grupo], piezas, disenos: [diseno], fuentes: [] });
  comprobar('se cortan 3 piezas (las mangas x2)', salida.length === 3, salida.map((p) => p.piezaId).join());
  const [izq, der] = [salida.find((p) => p.piezaId === 'Mangas'), salida.find((p) => p.piezaId === 'Mangas (otro lado)')];
  comprobar('el otro lado tiene su etiqueta legible', !!der);
  comprobar('lleva la MISMA imagen que su par (sin reflejar)', der?.imagenDataUrl === 'https://x/manga-izq.png', der?.imagenDataUrl);
  comprobar('y el mismo fondo', der?.fondo?.color1 === '#111111');
  comprobar('y las mismas zonas (el número), no las del lado propio', textos(der) === '7' && textos(izq) === '7', textos(der));
  comprobar('su contorno de corte es el reflejado', der?.contornoCm?.some((v) => v.x === 30 && v.y === 10) && izq?.contornoCm?.some((v) => v.x === 0 && v.y === 10));
}

console.log('\n--- Pedido con diseño PROPIO en el otro lado ---');
{
  const prod = { id: 'pr2', nombre: 'Suplente', grupoIds: ['g1'], disenoId: 'd1', anclaje, ladosPropios: { Mangas: true }, bordeContraste: null };
  const salida = resolverPiezasDePedido({ pedido: pedido('pr2'), productos: [prod], grupos: [grupo], piezas, disenos: [diseno], fuentes: [] });
  const der = salida.find((p) => p.piezaId === 'Mangas (otro lado)');
  comprobar('usa SU imagen', der?.imagenDataUrl === 'https://x/manga-der.png', der?.imagenDataUrl);
  comprobar('su fondo propio', der?.fondo?.color1 === '#ff0000');
  comprobar('y sus zonas propias', textos(der) === 'DER', textos(der));
}

console.log('\n--- Sacar la manga del pedido saca los dos lados ---');
{
  const prod = { id: 'pr3', nombre: 'Sin mangas', grupoIds: ['g1'], disenoId: null, anclaje: { anclas: [], zonas: [] }, bordeContraste: null };
  const p = { lineas: [{ id: 'l1', productoId: 'pr3', talla: 'M', piezasExcluidas: ['Mangas'] }] };
  const salida = resolverPiezasDePedido({ pedido: p, productos: [prod], grupos: [grupo], piezas, disenos: [], fuentes: [] });
  comprobar('queda solo el delantero', salida.map((x) => x.piezaId).join() === 'Delantero', salida.map((x) => x.piezaId).join());
}

console.log('\n' + pasadas + ' pasadas, ' + fallos + ' fallos');
process.exit(fallos ? 1 : 0);
