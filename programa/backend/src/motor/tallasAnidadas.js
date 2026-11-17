// Separa un "escalado anidado" (graded nest): UNA capa con la misma pieza en
// todas sus tallas dibujadas una dentro de otra, cada contorno con sus
// propios piquetes -- como sale de un programa de patronaje o de un
// Illustrator armado a mano para el taller (ver importarPdf.js·
// analizarPrendaPdf). El archivo no dice qué talla es cada contorno: solo se
// separan y se ordenan de MAYOR a MENOR; el nombre de cada talla lo pone el
// usuario (la lista de tallas de la prenda, de menor a mayor).
//
// Qué es qué, con las mismas reglas que el importador de una talla por capa
// (geometriaComun.js):
// - piquete: trazo de menos de PIQUETE_LARGO_MAX_CM de largo.
// - contorno: trazo largo con una caja de área real (no una línea suelta,
//   como un hilo o un doblez, que también puede ser larga).
// - lo demás (líneas largas sin área) se ignora y se cuenta, para avisar.
//
// A qué talla va cada piquete: al contorno sobre el que está apoyado (un
// extremo a menos de TOLERANCIA_APOYO_MM de su borde). Si queda apoyado en
// varios a la vez -- pasa seguido: en un cuello, todas las tallas comparten
// el borde de arriba y el piquete de centro cae en el mismo lugar --, decide
// el ORDEN de dibujo: el piquete es del último contorno dibujado antes que
// él, que es como lo deja Illustrator al agrupar contorno + piquetes por
// talla.

import { contornoYPiquetesDeTrazos, PIQUETE_LARGO_MAX_CM } from './geometriaComun.js';

export const TOLERANCIA_APOYO_MM = 1.0;
// Menos que esto en cualquiera de los dos lados = una línea, no una pieza.
const LADO_MINIMO_CONTORNO_MM = 3;

function medir(trazo, indice, mmPorUnidad) {
  const puntosMm = trazo.puntos.map(([x, y]) => [x * mmPorUnidad, y * mmPorUnidad]);
  let largoMm = 0;
  for (let i = 0; i < puntosMm.length - 1; i++) {
    largoMm += Math.hypot(puntosMm[i + 1][0] - puntosMm[i][0], puntosMm[i + 1][1] - puntosMm[i][1]);
  }
  const xs = puntosMm.map((p) => p[0]);
  const ys = puntosMm.map((p) => p[1]);
  const anchoMm = Math.max(...xs) - Math.min(...xs);
  const altoMm = Math.max(...ys) - Math.min(...ys);
  return { trazo, indice, puntosMm, largoCm: largoMm / 10, anchoMm, altoMm, areaCajaMm2: anchoMm * altoMm };
}

function distanciaPuntoSegmento([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay;
  const largo2 = dx * dx + dy * dy;
  const t = largo2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / largo2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Distancia mínima de cualquier punto del piquete al borde del contorno
// (cerrándolo: el último punto se une con el primero).
function distanciaAlContorno(piquete, contorno) {
  const c = contorno.puntosMm;
  let minimo = Infinity;
  for (const p of piquete.puntosMm) {
    for (let i = 0; i < c.length; i++) {
      const d = distanciaPuntoSegmento(p, c[i], c[(i + 1) % c.length]);
      if (d < minimo) minimo = d;
    }
  }
  return minimo;
}

/**
 * @param {{puntos: number[][], cerrado: boolean}[]} trazos  los trazos de UNA
 *   capa, en el orden en que se dibujan en el archivo, en unidades del archivo
 * @param {number} mmPorUnidad
 * @returns {{ tallas: object[], lineasIgnoradas: number, piquetesSinContorno: number }}
 *   tallas: una geometría por contorno (la misma forma que
 *   contornoYPiquetesDeTrazos), ordenadas de la talla MÁS GRANDE a la más chica.
 */
export function separarTallasAnidadas(trazos, mmPorUnidad) {
  const medidos = trazos.map((t, i) => medir(t, i, mmPorUnidad));
  const piquetes = medidos.filter((m) => m.largoCm < PIQUETE_LARGO_MAX_CM);
  const largos = medidos.filter((m) => m.largoCm >= PIQUETE_LARGO_MAX_CM);
  const contornos = largos.filter((m) => m.anchoMm >= LADO_MINIMO_CONTORNO_MM && m.altoMm >= LADO_MINIMO_CONTORNO_MM);
  const lineasIgnoradas = largos.length - contornos.length;

  if (contornos.length === 0) return { tallas: [], lineasIgnoradas, piquetesSinContorno: piquetes.length };

  const piquetesPorContorno = new Map(contornos.map((c) => [c, []]));
  let piquetesSinContorno = 0;
  for (const piquete of piquetes) {
    const apoyados = contornos.filter((c) => distanciaAlContorno(piquete, c) <= TOLERANCIA_APOYO_MM);
    const anteriores = (apoyados.length > 0 ? apoyados : contornos).filter((c) => c.indice < piquete.indice);
    let elegido;
    if (apoyados.length === 1) elegido = apoyados[0];
    else if (anteriores.length > 0) elegido = anteriores[anteriores.length - 1];
    else if (apoyados.length > 0) elegido = apoyados[0];
    if (!elegido) {
      // Ni apoyado en ningún contorno ni dibujado después de uno: no hay de
      // dónde sacar a qué talla pertenece -- mejor no adivinarlo.
      piquetesSinContorno++;
      continue;
    }
    piquetesPorContorno.get(elegido).push(piquete);
  }

  const tallas = contornos
    .slice()
    .sort((a, b) => b.areaCajaMm2 - a.areaCajaMm2)
    .map((c) => contornoYPiquetesDeTrazos([c.trazo, ...piquetesPorContorno.get(c).map((p) => p.trazo)], mmPorUnidad));

  return { tallas, lineasIgnoradas, piquetesSinContorno };
}
