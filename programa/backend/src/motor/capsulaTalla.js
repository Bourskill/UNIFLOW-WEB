// La talla de la pieza, como se marca a mano en Illustrator: la letra en
// negro dentro de una cápsula blanca (efecto "Forma > Rectángulo redondeado"
// relativo, 1 mm por lado, esquinas redondas), que se lee sobre cualquier
// color. Con una sola letra queda casi un círculo; con XXL, una píldora.
//
// La zona de la talla es el tamaño máximo: la letra se ajusta a la zona
// menos el margen (resolverPedido.js) y la cápsula la envuelve con ese margen.
// ESPEJO de programa/frontend/src/utilidades/capsulaTalla.js: el lienzo y el
// PDF tienen que dibujar la misma cápsula (lo comprueba la prueba).

export const MARGEN_CAPSULA_CM = 0.1;
export const COLOR_CAPSULA = '#ffffff';
export const COLOR_TALLA = '#000000';

// Lo que se escribe en la cápsula: la talla siempre en mayúscula y, en la
// línea femenina, con un guion al final (XS-, S-, M-…). genero sale de la zona
// (generoTalla: 'masculino' | 'femenino'; sin elegir, masculino).
export function textoDeTalla(talla, genero) {
  const t = String(talla ?? '').trim().toUpperCase();
  if (!t) return '';
  return genero === 'femenino' && !t.endsWith('-') ? t + '-' : t;
}

/**
 * Medidas de la cápsula para un texto ya ajustado (ajusteTexto.js): ancho =
 * tinta + margen, alto = banda de mayúsculas + margen (así S y XL quedan del
 * mismo alto), radio = la mitad del lado corto. Centrada en el centro de la zona.
 */
export function medidasDeCapsula(ajuste, margenCm = MARGEN_CAPSULA_CM) {
  const banda = ajuste.altoBandaCm ?? ajuste.tintaCm?.alto ?? 0;
  const tinta = ajuste.tintaCm?.ancho ?? 0;
  const alto = banda + 2 * margenCm;
  const radio = alto / 2;
  // Las puntas son medio círculo: para que las esquinas de la primera y la
  // última letra (XL, XXL...) queden adentro, la cápsula se alarga lo justo.
  const alcance = Math.sqrt(Math.max(radio * radio - (banda / 2) ** 2, 0));
  let ancho = Math.max(tinta + 2 * (radio - alcance), alto);
  // Una letra sola (o casi): un círculo, como la marca a mano.
  if (ancho < alto * 1.15) ancho = alto;
  return { anchoCm: ancho, altoCm: alto, radioCm: radio };
}

/**
 * El contorno de la cápsula como trazado (cm, centro en 0,0, Y hacia abajo):
 * cuatro tramos rectos y cuatro cuartos de círculo en curvas Bézier.
 */
export function caminoDeCapsula({ anchoCm, altoCm, radioCm }) {
  const k = 0.5522847498 * radioCm; // cuarto de círculo en Bézier
  const x0 = -anchoCm / 2, x1 = anchoCm / 2, y0 = -altoCm / 2, y1 = altoCm / 2, r = radioCm;
  return [
    ['M', x0 + r, y0],
    ['L', x1 - r, y0],
    ['C', x1 - r + k, y0, x1, y0 + r - k, x1, y0 + r],
    ['L', x1, y1 - r],
    ['C', x1, y1 - r + k, x1 - r + k, y1, x1 - r, y1],
    ['L', x0 + r, y1],
    ['C', x0 + r - k, y1, x0, y1 - r + k, x0, y1 - r],
    ['L', x0, y0 + r],
    ['C', x0, y0 + r - k, x0 + r - k, y0, x0 + r, y0],
    ['Z'],
  ];
}

// ---- la talla no se sale del molde ------------------------------------------
// La zona de la talla es su tamaño máximo; si cerca de un borde (o de una
// curva) esa caja se sale de la pieza, se achica desde su centro lo justo
// para quedar adentro. Con la caja adentro, la cápsula (que nunca es más
// grande que la caja) también. Si el centro mismo cae fuera de la pieza no se
// adivina nada: queda como está.

function dentroDelPoligono([x, y], poli) {
  let dentro = false;
  for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) {
    const [xi, yi] = poli[i], [xj, yj] = poli[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

// Puntos sobre el borde de la caja (girada como la zona: grados antihorarios).
function bordeDeCaja(cx, cy, ancho, alto, grados) {
  const a = ((grados || 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const puntos = [];
  const N = 8;
  for (let i = 0; i < N; i++) {
    const t = i / N - 0.5;
    for (const [dx, dy] of [[t * ancho, -alto / 2], [ancho / 2, t * alto], [-t * ancho, alto / 2], [-ancho / 2, -t * alto]]) {
      puntos.push([cx + dx * c + dy * s, cy - dx * s + dy * c]);
    }
  }
  return puntos;
}

function cajaAdentro(cx, cy, ancho, alto, grados, poli) {
  if (!bordeDeCaja(cx, cy, ancho, alto, grados).every((p) => dentroDelPoligono(p, poli))) return false;
  // Una punta del molde que se mete en la caja (molde cóncavo) también es salirse.
  const a = ((grados || 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return !poli.some(([x, y]) => {
    const dx = x - cx, dy = y - cy;
    const u = dx * c - dy * s, v = dx * s + dy * c;
    return Math.abs(u) < ancho / 2 - 1e-6 && Math.abs(v) < alto / 2 - 1e-6;
  });
}

function distanciaAlTramo([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

// ¿El tramo p-q (ya en coordenadas de la caja) pasa por DENTRO de la caja
// |u| < hw, |v| < hh? Recorte de Liang-Barsky.
function tramoCruzaCaja([pu, pv], [qu, qv], hw, hh) {
  const du = qu - pu, dv = qv - pv;
  let t0 = 0, t1 = 1;
  for (const [p, q] of [[-du, pu + hw], [du, hw - pu], [-dv, pv + hh], [dv, hh - pv]]) {
    if (p === 0) { if (q <= 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t0) t0 = r; } else if (r < t1) t1 = r;
    if (t0 >= t1) return false;
  }
  return true;
}

/**
 * Cuánto CORRER la cápsula de la talla (cm) para que entre entera en el molde
 * sin achicarla: la talla mide lo mismo en todas las piezas y tallas. Se corre
 * LO MENOS POSIBLE, derecho desde el borde más cercano (la talla va pegada al
 * borde para que la tape la costura: correrla de más o de costado la deja a la
 * vista), y queda siempre a AIRE_AL_BORDE_CM del corte. Si no entra cerca (pieza
 * muy angosta), se busca hacia el centro de la pieza; si ni así entra, se queda
 * donde mejor entra. contorno: vértices de la pieza en cm ([x, y] o {x, y}).
 * @returns {{dx:number, dy:number}}
 */
// Aire entre la cápsula y el borde de corte: nada (pedido explícito). La
// cápsula puede quedar pegada al borde, nunca afuera; la cápsula blanca ya
// deja 1 mm alrededor de la letra.
export const AIRE_AL_BORDE_CM = 0;
// Hasta dónde se busca el corrimiento más corto (cm), y en cuántas direcciones.
const ALCANCE_CM = 3;
const DIRECCIONES = 72;

export function corrimientoDentroDelMolde({ cx, cy, ancho: anchoCaja, alto: altoCaja, rotacionGrados = 0 }, contorno) {
  const nada = { dx: 0, dy: 0 };
  // Con su aire al borde: la cápsula no toca la línea de corte.
  const ancho = anchoCaja + 2 * AIRE_AL_BORDE_CM, alto = altoCaja + 2 * AIRE_AL_BORDE_CM;
  if (!Array.isArray(contorno) || contorno.length < 3 || !(ancho > 0) || !(alto > 0)) return nada;
  const poli = contorno.map((p) => (Array.isArray(p) ? p : [p.x, p.y]));
  if (cajaAdentro(cx, cy, ancho, alto, rotacionGrados, poli)) return nada;
  // Exacto y rápido (se calcula mientras se arrastra la zona): la caja entra
  // si su centro está en la pieza y ningún tramo del borde le cruza por
  // dentro (tocarla sí vale: queda pegada). Solo cuentan los tramos que
  // están al alcance de la búsqueda.
  const a = ((rotacionGrados || 0) * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const medio = Math.hypot(ancho, alto) / 2 + ALCANCE_CM + 0.1;
  const tramos = [];
  for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) {
    if (distanciaAlTramo([cx, cy], poli[j], poli[i]) < medio) tramos.push([poli[j], poli[i]]);
  }
  // Una centésima de milímetro de holgura: pegada, pero sin pisar la línea.
  const hw = ancho / 2 + 1e-3, hh = alto / 2 + 1e-3;
  const local = ([x, y], ox, oy) => { const ex = x - ox, ey = y - oy; return [ex * cos - ey * sin, ex * sin + ey * cos]; };
  const entra = (dx, dy) => {
    const ox = cx + dx, oy = cy + dy;
    if (!dentroDelPoligono([ox, oy], poli)) return false;
    return !tramos.some(([p, q]) => tramoCruzaCaja(local(p, ox, oy), local(q, ox, oy), hw, hh));
  };

  // El corrimiento más corto: se agranda el radio de a poco y, en el primero
  // donde alguna dirección entra, se afina la distancia de cada una de ellas.
  const PASO = 0.05;
  const dirs = Array.from({ length: DIRECCIONES }, (_, i) => [Math.cos((2 * Math.PI * i) / DIRECCIONES), Math.sin((2 * Math.PI * i) / DIRECCIONES)]);
  for (let r = PASO; r <= ALCANCE_CM + 1e-9; r += PASO) {
    const buenas = dirs.filter(([ux, uy]) => entra(ux * r, uy * r));
    if (!buenas.length) continue;
    let mejor = null;
    for (const [ux, uy] of buenas) {
      let afuera = r - PASO, adentro = r;
      for (let i = 0; i < 16; i++) {
        const m = (afuera + adentro) / 2;
        if (entra(ux * m, uy * m)) adentro = m; else afuera = m;
      }
      if (!mejor || adentro < mejor.d - 1e-9) mejor = { d: adentro, dx: ux * adentro, dy: uy * adentro };
    }
    return { dx: mejor.dx, dy: mejor.dy };
  }

  const xs = poli.map((p) => p[0]), ys = poli.map((p) => p[1]);
  const centro = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  // Lejos del borde: el primer punto del camino hacia el centro donde entra entera...
  const N = 60;
  let hasta = null;
  for (let i = 1; i <= N; i++) {
    const t = i / N;
    if (cajaAdentro(cx + (centro[0] - cx) * t, cy + (centro[1] - cy) * t, ancho, alto, rotacionGrados, poli)) { hasta = t; break; }
  }
  if (hasta === null) {
    // ...o, si no entra en ningún lado, el más cerca del borde con el centro adentro.
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      if (dentroDelPoligono([cx + (centro[0] - cx) * t, cy + (centro[1] - cy) * t], poli)) return { dx: (centro[0] - cx) * t, dy: (centro[1] - cy) * t };
    }
    return nada;
  }
  // ...afinado: lo justo, sin correrla de más.
  let afuera = hasta - 1 / N, adentro = hasta;
  for (let i = 0; i < 20; i++) {
    const m = (afuera + adentro) / 2;
    if (cajaAdentro(cx + (centro[0] - cx) * m, cy + (centro[1] - cy) * m, ancho, alto, rotacionGrados, poli)) adentro = m; else afuera = m;
  }
  return { dx: (centro[0] - cx) * adentro, dy: (centro[1] - cy) * adentro };
}

/**
 * Cuánto achicar la caja de la talla (1 = nada) para que entre en el molde.
 * contorno: los vértices de la pieza en cm ([x, y] o {x, y}), mismas
 * coordenadas que la zona.
 */
export function escalaDentroDelMolde({ cx, cy, ancho, alto, rotacionGrados = 0 }, contorno) {
  if (!Array.isArray(contorno) || contorno.length < 3 || !(ancho > 0) || !(alto > 0)) return 1;
  const poli = contorno.map((p) => (Array.isArray(p) ? p : [p.x, p.y]));
  if (!dentroDelPoligono([cx, cy], poli)) return 1;
  if (cajaAdentro(cx, cy, ancho, alto, rotacionGrados, poli)) return 1;
  let adentro = 0, afuera = 1;
  for (let i = 0; i < 24; i++) {
    const medio = (adentro + afuera) / 2;
    if (cajaAdentro(cx, cy, ancho * medio, alto * medio, rotacionGrados, poli)) adentro = medio; else afuera = medio;
  }
  return Math.max(adentro, 0.05);
}
