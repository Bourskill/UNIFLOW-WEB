// Puntos de calce del arte (colocarArte.js): puntos marcados sobre el arte y
// enganchados a puntos del molde. En cada talla el arte se ubica para que
// caigan justo ahí -- así el diseño sigue de una pieza a la otra en la costura.
import { colocarArte, conCalceResuelto, anclasDeCalce, normalizarAjusteArte } from '../src/motor/colocarArte.js';
import { resolverPiezasDePedido } from '../src/motor/resolverPedido.js';

let fallos = 0, pasadas = 0;
function comprobar(desc, cond, detalle) {
  if (cond) { pasadas++; console.log('  ✓ ' + desc); }
  else { fallos++; console.log('  ✗ ' + desc + (detalle ? '\n      ' + detalle : '')); }
}
const cerca = (a, b, t = 1e-6) => Math.abs(a - b) < t;
// Dónde cae un punto (u, v) del arte con ese rectángulo.
const dondeCae = (r, u, v) => [r.x + u * r.ancho, r.y + v * r.alto];

console.log('\n--- La cuenta ---');
{
  const img = { anchoImagen: 2000, altoImagen: 1000 }; // 2:1
  const ajuste = { calceCm: [{ u: 0.1, v: 0.5, x: 3, y: 12 }, { u: 0.9, v: 0.5, x: 35, y: 12 }] };
  const r = colocarArte({ anchoCm: 38, altoCm: 50, ...img, ajuste });
  const [x1, y1] = dondeCae(r, 0.1, 0.5), [x2, y2] = dondeCae(r, 0.9, 0.5);
  comprobar('con dos puntos, los dos caen justo en el molde', cerca(x1, 3) && cerca(y1, 12) && cerca(x2, 35) && cerca(y2, 12), [x1, y1, x2, y2].join(' '));
  comprobar('y la escala sale de ellos, sin deformar (2:1)', cerca(r.ancho, 40) && cerca(r.alto, 20), r.ancho + ' x ' + r.alto);

  const uno = colocarArte({ anchoCm: 38, altoCm: 50, ...img, ajuste: { base: 'encajar', escala: 50, calceCm: [{ u: 0.5, v: 0, x: 19, y: 4 }] } });
  const [ux, uy] = dondeCae(uno, 0.5, 0);
  comprobar('con un punto: cae en el molde y la escala es la del ajuste', cerca(ux, 19) && cerca(uy, 4) && cerca(uno.ancho, 19), ux + ' ' + uy + ' ' + uno.ancho);

  const sinCalce = colocarArte({ anchoCm: 38, altoCm: 50, ...img, ajuste: { calce: [{ id: 'c1', u: 0.1, v: 0.5, destino: null }] } });
  const normal = colocarArte({ anchoCm: 38, altoCm: 50, ...img, ajuste: {} });
  comprobar('puntos sin enganchar: el arte queda como siempre', JSON.stringify(sinCalce) === JSON.stringify(normal));
  comprobar('el ajuste guarda sus puntos (y descarta los rotos)',
    normalizarAjusteArte({ calce: [{ id: 'c1', u: 0.2, v: 0.3, destino: null }, { u: 'x' }] }).calce.length === 1);
}

console.log('\n--- En el pedido, talla por talla ---');
{
  // Un frente rectangular que crece con la talla; los puntos de calce, en los
  // dos bordes laterales a 10 cm de arriba (la costura del costado).
  const tallas = { S: [40, 60], XL: [50, 66] };
  const pieza = {
    id: 'p1', nombre: 'FRENTE', tallaUnica: false, angulosPermitidos: [0, 180],
    dimensionesPorTalla: Object.fromEntries(Object.entries(tallas).map(([t, [a, h]]) => [t, { anchoCm: a, altoCm: h }])),
    geometriaPorTalla: Object.fromEntries(Object.entries(tallas).map(([t, [a, h]]) => [t, {
      poligonoMm: [[0, 0], [a * 10, 0], [a * 10, h * 10], [0, h * 10]], boundingBoxMm: { anchoMm: a * 10, altoMm: h * 10 }, piquetesMm: [],
    }])),
  };
  const grupo = { id: 'g1', nombre: 'CAMISETA', piezas: [{ piezaId: 'p1', rol: 'Frente' }] };
  const lado = (parte) => ({ x: { ref: { tipo: 'contorno', parte }, modo: 'fijo', valor: 0 }, y: { ref: { tipo: 'contorno', parte }, modo: 'fijo', valor: 10 } });
  const ajuste = { calce: [
    { id: 'c1', u: 0.05, v: 0.2, destino: lado('supIzq') },
    { id: 'c2', u: 0.95, v: 0.2, destino: lado('supDer') },
    { id: 'c3', u: 0.5, v: 0.9, destino: null },
  ] };
  comprobar('solo los puntos enganchados se vuelven anclas', anclasDeCalce('Frente', ajuste).length === 2);
  const diseno = { id: 'd1', imagenesPorPieza: { Frente: 'data:image/png;base64,AAAA' }, ajusteArtePorPieza: { Frente: ajuste } };
  const producto = { id: 'pr1', nombre: 'Titular', grupoIds: ['g1'], disenoId: 'd1', anclaje: { anclas: [], zonas: [] } };
  const piezas = resolverPiezasDePedido({
    pedido: { lineas: ['S', 'XL'].map((talla, i) => ({ id: 'l' + i, productoId: 'pr1', talla, nombre: '', numero: '' })) },
    productos: [producto], grupos: [grupo], piezas: [pieza], disenos: [diseno], fuentes: [],
  });
  for (const p of piezas) {
    const [a] = tallas[p.talla];
    const r = colocarArte({ anchoCm: p.anchoCm, altoCm: p.altoCm, anchoImagen: 1000, altoImagen: 1000, ajuste: p.ajusteArte });
    const [x1, y1] = dondeCae(r, 0.05, 0.2), [x2, y2] = dondeCae(r, 0.95, 0.2);
    comprobar('talla ' + p.talla + ': el arte toca la costura en los dos lados (0 y ' + a + ' cm, a 10 cm de arriba)',
      cerca(x1, 0) && cerca(y1, 10) && cerca(x2, a) && cerca(y2, 10), [x1, y1, x2, y2].map((n) => n.toFixed(3)).join(' '));
  }
  // Un destino que no sale (referencia a una zona que no existe): se omite, el pedido sigue.
  const roto = { calce: [{ id: 'c1', u: 0.5, v: 0.5, destino: { x: { ref: { tipo: 'zona', zona: 'NO' } }, y: { ref: { tipo: 'zona', zona: 'NO' } } } }] };
  const otra = resolverPiezasDePedido({
    pedido: { lineas: [{ id: 'l', productoId: 'pr1', talla: 'S', nombre: '', numero: '' }] },
    productos: [producto], grupos: [grupo], piezas: [pieza], disenos: [{ ...diseno, ajusteArtePorPieza: { Frente: roto } }], fuentes: [],
  });
  comprobar('un destino que no se puede resolver no frena el pedido', otra.length === 1 && otra[0].ajusteArte.calceCm.length === 0);
  comprobar('sin calce, el ajuste sigue igual', conCalceResuelto('Frente', null, {}) === null);
}

console.log('\n' + pasadas + ' pasadas, ' + fallos + ' fallos');
process.exit(fallos ? 1 : 0);
