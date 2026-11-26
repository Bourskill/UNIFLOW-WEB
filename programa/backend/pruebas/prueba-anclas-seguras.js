// Anclas que no fallan entre tallas (anclaje/referencias.js). Caso real
// (pantaloneta femenina): el piquete de abajo viene en el archivo una vez en
// casi todas las tallas, DOS veces (a medio centímetro) en la 2XL y ninguna
// en la 5XL. Antes, el diseño de esas tallas no se veía.
import { resolverReferencia } from '../src/motor/anclaje/referencias.js';

let fallos = 0, pasadas = 0;
function comprobar(desc, cond, detalle) {
  if (cond) { pasadas++; console.log('  ✓ ' + desc); }
  else { fallos++; console.log('  ✗ ' + desc + (detalle ? '\n      ' + detalle : '')); }
}
const cerca = (a, b, t = 1e-6) => Math.abs(a - b) <= t;

// Una pieza de W x H con su contorno y estos piquetes (posición relativa).
function pieza(W, H, piquetesRel) {
  return {
    pieza: { ancho_cm: W, alto_cm: H },
    vertices: [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }],
    piquetes: piquetesRel.map(([rx, ry]) => ({ x: rx * W, y: ry * H, ancho_cm: 0.3, alto_cm: 0.3, rx, ry })),
  };
}
const ref = { tipo: 'piquete', indice: 0, total: 2, parte: 'centro', rx: 0.54, ry: 1 };
const resolverEn = (geo) => resolverReferencia(ref, { geometria: { P: geo }, pieza: 'P' });

console.log('\n--- El mismo piquete dibujado dos veces ---');
{
  const r = resolverEn(pieza(80.6, 60.9, [[0.538, 1.004], [0.538, 0.996], [0.538, 0.056]]));
  comprobar('se resuelve (antes: "dos piquetes casi igual de cerca")', r.ok, r.texto);
  comprobar('sobre ese piquete', r.ok && cerca(r.punto.x, 0.538 * 80.6, 0.01) && Math.abs(r.punto.y - 60.9) < 0.3, JSON.stringify(r.punto));
  comprobar('y avisa que se emparejó', r.ok && /emparej/.test(r.aviso || ''));
}

console.log('\n--- Dos piquetes de verdad distintos igual de cerca ---');
{
  const r = resolverEn(pieza(80, 60, [[0.44, 1], [0.64, 1], [0.5, 0.05]]));
  comprobar('no elige uno a ojo: va al mismo lugar relativo de la pieza', r.ok && cerca(r.punto.x, 0.54 * 80, 1e-6) && cerca(r.punto.y, 60, 1e-6), JSON.stringify(r));
  comprobar('y lo avisa', r.ok && /mismo lugar/.test(r.aviso || ''));
}

console.log('\n--- El piquete no está en esta talla ---');
{
  const r = resolverEn(pieza(88.4, 65.4, [[0.534, 0.052]]));
  comprobar('se resuelve igual, en el mismo lugar relativo, pegado al contorno', r.ok && cerca(r.punto.x, 0.54 * 88.4, 1e-6) && cerca(r.punto.y, 65.4, 1e-6), JSON.stringify(r));
  comprobar('avisando que hay que revisar esa talla', r.ok && /Revisá esa talla/.test(r.aviso || ''));
  const sin = resolverEn(pieza(88.4, 65.4, []));
  comprobar('también si la talla no tiene ningún piquete', sin.ok && cerca(sin.punto.y, 65.4, 1e-6));
  const viejo = resolverReferencia({ tipo: 'piquete', indice: 0, total: 2 }, { geometria: { P: pieza(88.4, 65.4, [[0.5, 0.05]]) }, pieza: 'P' });
  comprobar('un ancla vieja sin posición guardada sigue diciendo que no puede', !viejo.ok);
}

console.log('\n--- Misma cantidad, pero el orden cambió con la talla ---');
{
  // Espalda femenina: en la XL el extremo nº 4 es la sisa izquierda; en la
  // 2XL, con la misma cantidad (8), el nº 4 es un punto del cuello.
  const geo = (W, H, rel) => ({
    pieza: { ancho_cm: W, alto_cm: H },
    vertices: [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }],
    salientes: rel.map(([rx, ry]) => ({ x: rx * W, y: ry * H, rx, ry })),
  });
  const xl = [[0, 0.99], [1, 0.99], [1, 0.34], [0, 0.34], [0.88, 0.05], [0.66, 0], [0.35, 0.02], [0.12, 0.05]];
  const dosXl = [[0, 0.99], [1, 0.99], [1, 0.34], [0.88, 0.05], [0, 0.34], [0.66, 0], [0.35, 0.02], [0.12, 0.05]];
  const sisaIzq = { tipo: 'saliente', indice: 3, total: 8, rx: 0, ry: 0.34 };
  const enXl = resolverReferencia(sisaIzq, { geometria: { P: geo(54.6, 72.7, xl) }, pieza: 'P' });
  const en2xl = resolverReferencia(sisaIzq, { geometria: { P: geo(56.6, 74.2, dosXl) }, pieza: 'P' });
  comprobar('en la XL, por número, sin aviso', enXl.ok && cerca(enXl.punto.x, 0) && !enXl.aviso);
  comprobar('en la 2XL sigue siendo la sisa, no el cuello (antes: el diseño se iba)', en2xl.ok && cerca(en2xl.punto.x, 0) && cerca(en2xl.punto.y, 0.34 * 74.2, 1e-6), JSON.stringify(en2xl.punto));
  comprobar('y avisa que se emparejó por posición', en2xl.ok && /emparej/.test(en2xl.aviso || ''));
}

console.log('\n--- Lo que ya andaba, igual ---');
{
  const r = resolverEn(pieza(78, 58.9, [[0.539, 0.996], [0.539, 0.058]]));
  comprobar('misma cuenta de piquetes: manda el índice, sin aviso', r.ok && !r.aviso && cerca(r.punto.x, 0.539 * 78, 1e-6));
}

console.log('\n--- El punto más alto con los dos hombros empatados (frente 7993 MASC) ---');
{
  const { geometriaParaAnclaje } = await import('../src/motor/geometriaAnclaje.js');
  // Un frente con dos hombros igual de altos; en una talla el archivo trae
  // primero el hombro izquierdo, en la otra el derecho.
  const frente = (W, H, derechoPrimero) => {
    const izq = [W * 0.3, H], der = [W * 0.7, H];
    const puntos = [[0, 0], [W, 0], [W, H * 0.7], ...(derechoPrimero ? [der, [W * 0.5, H * 0.85], izq] : [izq, [W * 0.5, H * 0.85], der].reverse()), [0, H * 0.7]];
    return { nombre: 'F', dimensionesPorTalla: { T: { anchoCm: W / 10, altoCm: H / 10 } }, geometriaPorTalla: { T: { poligonoMm: puntos } } };
  };
  const enTalla = (derechoPrimero, refExtra) => {
    const geo = geometriaParaAnclaje(frente(540, 750, derechoPrimero), 'T');
    return resolverReferencia({ tipo: 'extremo', parte: 'arriba', ...refExtra }, { geometria: { P: geo }, pieza: 'P' });
  };
  const izqA = enTalla(false, { rx: 0.3, ry: 0 }), izqB = enTalla(true, { rx: 0.3, ry: 0 });
  comprobar('con el hombro elegido (rx/ry): el mismo en las dos tallas', izqA.ok && izqB.ok && cerca(izqA.punto.x, 16.2, 0.01) && cerca(izqB.punto.x, 16.2, 0.01), izqA.punto?.x + ' / ' + izqB.punto?.x);
  const der = enTalla(true, { rx: 0.7, ry: 0 });
  comprobar('y el derecho si se eligió el derecho', der.ok && cerca(der.punto.x, 37.8, 0.01), der.punto?.x);
  const viejaA = enTalla(false, {}), viejaB = enTalla(true, {});
  comprobar('un ancla vieja (sin rx/ry) sigue como antes: el primero del archivo', viejaA.ok && viejaB.ok && cerca(viejaA.punto.x, 37.8, 0.01) && cerca(viejaB.punto.x, 37.8, 0.01), viejaA.punto?.x + ' / ' + viejaB.punto?.x);
  const geo = geometriaParaAnclaje(frente(540, 750, false), 'T');
  comprobar('arriba quedan los dos hombros como lugares empatados', geo.extremosEmpatados.arriba?.length === 2 && geo.extremosEmpatados.arriba.map((p) => p.x.toFixed(1)).sort().join() === '16.2,37.8', JSON.stringify(geo.extremosEmpatados.arriba));
  const unico = geometriaParaAnclaje({ nombre: 'M', dimensionesPorTalla: { T: { anchoCm: 40, altoCm: 30 } }, geometriaPorTalla: { T: { poligonoMm: [[0, 0], [400, 0], [200, 300]] } } }, 'T');
  comprobar('con un solo punto más alto no se marca empate', !unico.extremosEmpatados.arriba, JSON.stringify(unico.extremosEmpatados));
}

console.log('\n' + pasadas + ' pasadas, ' + fallos + ' fallos');
process.exit(fallos ? 1 : 0);
