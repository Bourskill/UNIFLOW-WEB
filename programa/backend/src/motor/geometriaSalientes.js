// Puntos donde un diseñador querría anclar algo, más allá de los piquetes
// SUELTOS (trazos aparte) y los vértices en sí: dos mecanismos, portados de
// programa/panel/jsx/host.jsx (piquetesPegadosDeTrazo/puntosNotables)
// leyendo el código real antes de escribir una sola línea.
//
// EL CRITERIO QUE FALTABA (host.jsx lo documenta como "el fallo que se
// repitió tres rondas, y no era de detección: era mío, de criterio"): hay
// DOS clases de piquete y "su función es la misma" -- SUELTO (un trazo
// corto aparte, ya portado en geometriaComun.js) y PEGADO (recortado en el
// propio contorno: el trazo entra hacia dentro y vuelve a salir, sin ser un
// trazo aparte). Sin el segundo, una pieza donde TODOS los piquetes son
// pegados sale con "0 piquetes" aunque el molde sí los tenga -- exactamente
// el reporte real de host.jsx: "9 trazo(s), 1 son del molde, 0 miden menos
// de 2.5cm" (nueve trazos = las nueve tallas, ni un piquete suelto: en esa
// pieza todos eran pegados).
//
// Los dos mecanismos de host.jsx (piquetes pegados y "salientes") operan
// sobre pathPoints -- el ANCHOR de cada nodo -- y solo tocan las manecillas
// Bézier en un sitio (esquinasDeNodos, para medir esquinas), y hasta ESO
// tiene un modo de respaldo por vértice vecino cuando la manecilla está
// pegada al nodo (recta). Es decir: es geometría discreta sobre una lista
// de puntos, no algo atado a curvas Bézier reales -- exactamente lo que ya
// tenemos de un DXF/PDF tesselado (el polígono del contorno, muchos puntos
// por curva). Se portó tal cual, usando SIEMPRE el modo de respaldo de
// esquinasDeNodos (acá nunca hay manecillas que leer), con los umbrales
// absolutos convertidos a mm.

const PIQUETE_MUESCA_ANCHO_MAX_MM = 12;
const PIQUETE_MUESCA_FONDO_MIN_MM = 1.2;
const PIQUETE_MUESCA_FONDO_MAX_MM = 12;
// Qué tan de vuelta tiene que venir un trazo, visto desde la punta, para
// contar como "aguja" (piquete cortado sobre el propio contorno). 0.80 =
// unos 37 grados o menos entre el vecino de antes y el de después.
const PIQUETE_AGUJA_COS_MIN = 0.80;
export const GRADOS_ESQUINA = 18;

// Área con signo (fórmula del cordón de zapato): dice en qué sentido está
// dibujado el polígono. Solo interesa el signo.
function sentidoDeGiro(puntos) {
  let area = 0;
  const n = puntos.length;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = puntos[i];
    const [bx, by] = puntos[(i + 1) % n];
    area += ax * by - bx * ay;
  }
  return area; // > 0 antihorario, < 0 horario
}

// Distancia de un punto a la recta que pasa por otros dos, y de qué lado
// cae (el signo del producto cruzado es el lado).
function ladoYDistancia(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const largo = Math.hypot(dx, dy);
  if (!(largo > 0)) return null;
  const cruz = dx * (py - ay) - dy * (px - ax);
  return { dist: Math.abs(cruz) / largo, cruz, cuerda: largo };
}

function anguloEntreVectores(x1, y1, x2, y2) {
  const l1 = Math.hypot(x1, y1), l2 = Math.hypot(x2, y2);
  if (!(l1 > 0) || !(l2 > 0)) return 0;
  let cos = (x1 * x2 + y1 * y2) / (l1 * l2);
  if (cos > 1) cos = 1;
  else if (cos < -1) cos = -1;
  return (Math.acos(cos) * 180) / Math.PI;
}

// ============================================================
// PIQUETES PEGADOS AL CONTORNO
// ============================================================
// `puntos`: el polígono del CONTORNO ya elegido (geometriaComun.js ·
// contornoYPiquetesDeTrazos), en mm, SIN repetir el primer punto al final
// -- se recorre siempre como ciclo (% n).
export function piquetesPegadosDe(puntos) {
  const salida = [];
  const n = puntos.length;
  if (n < 4) return salida;

  const giro = sentidoDeGiro(puntos);
  if (giro === 0) return salida;

  const tomados = new Set();

  // PASO 1 -- AGUJA: el trazo se desvía hacia dentro y vuelve casi sobre su
  // propia huella (un piquete "unido": un solo trazo, molde+piquete). La
  // señal de verdad es el GIRO visto desde la punta (si el vecino de antes
  // y el de después quedan casi en la misma dirección, el trazo fue y
  // volvió), no que dos puntos coincidan al pixel -- eso casi nunca pasa
  // con datos reales. Se prueba primero porque es el caso más inequívoco:
  // una esquina normal de 90° da un coseno cercano a 0, no cercano a 1.
  for (let ia = 0; ia < n; ia++) {
    const iEntrada = (ia - 1 + n) % n, iPunta = ia, iSalida = (ia + 1) % n;
    if (tomados.has(iEntrada) || tomados.has(iPunta) || tomados.has(iSalida)) continue;

    const [ex, ey] = puntos[iEntrada];
    const [tx, ty] = puntos[iPunta];
    const [sx, sy] = puntos[iSalida];

    const vax = ex - tx, vay = ey - ty;
    const vbx = sx - tx, vby = sy - ty;
    const largoA = Math.hypot(vax, vay), largoB = Math.hypot(vbx, vby);
    if (!(largoA > 0) || !(largoB > 0)) continue; // vecino pegado a la punta: no hay dirección que medir

    const cosEntreVecinos = (vax * vbx + vay * vby) / (largoA * largoB);
    if (cosEntreVecinos < PIQUETE_AGUJA_COS_MIN) continue;

    // El fondo de la aguja: el promedio de lo que se alejan sus dos brazos
    // de la punta.
    const fondoAguja = (largoA + largoB) / 2;
    if (fondoAguja < PIQUETE_MUESCA_FONDO_MIN_MM || fondoAguja > PIQUETE_MUESCA_FONDO_MAX_MM) continue;

    // El sentido "hacia adentro" se mide un nodo más afuera a cada lado
    // (entrada/salida son casi el mismo punto: no definen un lado).
    const iAntes = (ia - 2 + n) % n, iDespues = (ia + 2) % n;
    const [wax, way] = puntos[iAntes];
    const [wbx, wby] = puntos[iDespues];
    const ld = ladoYDistancia(tx, ty, wax, way, wbx, wby);
    if (!ld) continue;

    const haciaDentro = giro > 0 ? ld.cruz > 0 : ld.cruz < 0;
    if (!haciaDentro) continue;

    tomados.add(iEntrada); tomados.add(iPunta); tomados.add(iSalida);
    salida.push({
      xMm: tx, yMm: ty,
      anchoMm: Math.hypot(ex - sx, ey - sy),
      altoMm: fondoAguja,
    });
  }

  // PASO 2 -- MUESCA (V o U): "tramo" = cuántos nodos forman el fondo. Se
  // prueba PRIMERO el tramo ancho (2, una U) -- si se probara 1 primero,
  // una sola muesca en U saldría contada dos veces (cada nodo del fondo
  // forma su propia media V contra su vecino), y dos piquetes donde hay
  // uno corren la numeración de todos los demás.
  for (let tramo = 2; tramo >= 1; tramo--) {
    for (let i = 0; i < n; i++) {
      const iAnt = (i - 1 + n) % n;
      const iSig = (i + tramo) % n;

      let choca = false;
      for (let t = 0; t < tramo; t++) if (tomados.has((i + t) % n)) choca = true;
      if (choca) continue;

      const [ax, ay] = puntos[iAnt];
      const [bx, by] = puntos[iSig];

      let peorDist = -1, peorCruz = 0, cuerda = -1, fx = 0, fy = 0;
      for (let t = 0; t < tramo; t++) {
        const k = (i + t) % n;
        const [px, py] = puntos[k];
        const ld = ladoYDistancia(px, py, ax, ay, bx, by);
        if (!ld) { peorDist = -1; break; }
        cuerda = ld.cuerda;
        if (ld.dist > peorDist) { peorDist = ld.dist; peorCruz = ld.cruz; fx = px; fy = py; }
      }
      if (peorDist < 0) continue;

      if (!(cuerda > 0) || cuerda > PIQUETE_MUESCA_ANCHO_MAX_MM) continue;
      if (peorDist < PIQUETE_MUESCA_FONDO_MIN_MM || peorDist > PIQUETE_MUESCA_FONDO_MAX_MM) continue;

      // ¿Va hacia adentro? En antihorario el interior queda a la izquierda
      // de la marcha (cruz > 0); en horario, a la derecha.
      const haciaDentro = giro > 0 ? peorCruz > 0 : peorCruz < 0;
      if (!haciaDentro) continue;

      for (let t = 0; t < tramo; t++) tomados.add((i + t) % n);
      salida.push({ xMm: fx, yMm: fy, anchoMm: cuerda, altoMm: peorDist });
    }
  }

  return salida;
}

// ============================================================
// PUNTOS NOTABLES DEL CONTORNO ("salientes")
// ============================================================
// Los sitios a los que un diseñador querría anclar más allá de un piquete:
// la punta de un hombro, el fondo de una sisa, el pico de un cuello en V.
// Dos clases, buscadas de DOS formas -- una sola no las encuentra:
//   ESQUINAS  el trazo cambia de dirección de golpe. host.jsx las mide con
//             las manecillas Bézier del nodo (o, si la manecilla está
//             pegada al nodo -- un tramo recto --, con el vértice vecino).
//             Acá no hay manecillas: se usa siempre ese modo de respaldo,
//             que es exactamente comparar contra el vértice vecino.
//   VUELTAS   el contorno deja de subir y empieza a bajar sin hacer
//             esquina -- curvas suaves, sin ángulo que medir en un solo
//             vértice. Se buscan con una ventana medida en mm reales (no
//             en cantidad de puntos): un lado recto tiene pocos vértices y
//             una curva tiene muchos, así que "N vértices antes/después"
//             daría ventanas de tamaño real completamente distinto.
function esquinasDeVertices(puntos, gradosMinimos) {
  const n = puntos.length;
  const salida = [];
  if (n < 3) return salida;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = puntos[i];
    const [px, py] = puntos[(i - 1 + n) % n];
    const [sx, sy] = puntos[(i + 1) % n];
    const ix = ax - px, iy = ay - py;
    const ox = sx - ax, oy = sy - ay;
    const giro = anguloEntreVectores(ix, iy, ox, oy);
    if (giro < gradosMinimos) continue;
    salida.push({ xMm: ax, yMm: ay, fuerza: 1000 + giro, esquina: true });
  }
  return salida;
}

function vueltasDeMuestreo(puntos, anchoMm, altoMm) {
  const n = puntos.length;
  const salida = [];
  if (n < 8) return salida;
  const maxDim = Math.max(anchoMm, altoMm);
  const PROM = maxDim * 0.01;
  const VENTANA = maxDim * 0.02;

  // Cuántos vértices hay que apartarse para recorrer VENTANA mm. Se mide
  // sobre el terreno en vez de suponer que los vértices están repartidos
  // parejo (un lado recto tiene pocos, una curva tiene muchos).
  function alejarse(desde, paso) {
    let rec = 0, j = desde;
    for (let k = 0; k < n; k++) {
      const sig = (j + paso + n) % n;
      const dx = puntos[sig][0] - puntos[j][0], dy = puntos[sig][1] - puntos[j][1];
      rec += Math.hypot(dx, dy);
      j = sig;
      if (rec >= VENTANA) break;
    }
    return puntos[j];
  }

  for (let i = 0; i < n; i++) {
    const [pax, pay] = alejarse(i, -1);
    const [pbx, pby] = puntos[i];
    const [pcx, pcy] = alejarse(i, 1);

    const esY = (pby - pay) * (pcy - pby) <= 0 && (Math.abs(pby - pay) > PROM || Math.abs(pcy - pby) > PROM);
    const esX = (pbx - pax) * (pcx - pbx) <= 0 && (Math.abs(pbx - pax) > PROM || Math.abs(pcx - pbx) > PROM);
    if (!esY && !esX) continue;

    salida.push({
      xMm: pbx, yMm: pby, esquina: false,
      fuerza: Math.max(
        Math.abs(pby - pay) + Math.abs(pcy - pby),
        Math.abs(pbx - pax) + Math.abs(pcx - pbx)
      ),
    });
  }
  return salida;
}

// Junta esquinas y vueltas, quita las que se pisan (se queda la de más
// "fuerza" -- una esquina siempre gana a una vuelta) y las deja en un
// orden estable entre tallas: por ángulo alrededor del centro de la pieza,
// desde las 12 y en sentido horario -- mismo criterio que los piquetes.
export function puntosNotablesDe(puntos, anchoMm, altoMm, gradosMinimos = GRADOS_ESQUINA) {
  const brutos = [...esquinasDeVertices(puntos, gradosMinimos), ...vueltasDeMuestreo(puntos, anchoMm, altoMm)];
  if (!brutos.length) return [];

  const maxDim = Math.max(anchoMm, altoMm);
  const SEP = maxDim * 0.025;

  brutos.sort((a, b) => b.fuerza - a.fuerza);
  const elegidos = [];
  for (const c of brutos) {
    if (elegidos.length >= 40) break;
    const pisa = elegidos.some((e) => Math.hypot(c.xMm - e.xMm, c.yMm - e.yMm) < SEP);
    if (!pisa) elegidos.push(c);
  }

  const cx = anchoMm / 2, cy = altoMm / 2;
  for (const e of elegidos) {
    const ex = e.xMm - cx, ey = e.yMm - cy;
    let ang = Math.atan2(ex, -ey);
    if (ang < 0) ang += Math.PI * 2;
    e._ang = ang;
  }
  elegidos.sort((a, b) => a._ang - b._ang);

  return elegidos.map((e) => ({ xMm: e.xMm, yMm: e.yMm, esquina: !!e.esquina }));
}
