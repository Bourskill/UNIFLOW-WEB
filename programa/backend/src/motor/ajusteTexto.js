// Ajuste del texto (nombre / número / texto fijo) al espacio de su zona --
// puerto del ajuste del panel de Illustrator (host.jsx: ajustarZona,
// calibrarZona, medirBanda). Una sola implementación para TODO lo que
// muestra o imprime un texto: el PDF (exportarPdf.js), la vista previa de
// nesting y el lienzo de Diseño -- así lo que se ve es lo que se imprime.
//
// Dos modos, igual que `politica` en panel/esquemas/produccion.json:
//   - "llenar"    (nombre, texto fijo): el texto ocupa TODO EL ALTO de su zona
//                 y solo baja de cuerpo cuando el ancho no da.
//   - "calibrado" (número): todos los números de una misma zona van al MISMO
//                 cuerpo (el que sale de medir los datos reales, percentil 85,
//                 o la cadena de referencia "55" si todavía no hay pedido);
//                 un dato que no cabe a ese cuerpo baja por la escalera.
//
// La ALTURA siempre se mide con la banda de una mayúscula sin tilde ("H"),
// nunca con la tinta del propio dato: si no, "GARCÍA" saldría con menos
// cuerpo que "ESTIVEN" por culpa del acento. El ANCHO sí es el de la tinta
// real (primer pixel a último), no el avance tipográfico.
//
// La escalera (solo cuando no cabe): tracking negativo -> reducir cuerpo ->
// condensar. Es el orden de host.jsx -- lo último deforma la letra.
//
// Todo en cm. El "medidor" abstrae la fuente (ver medidorDeFontkit): este
// módulo no sabe de archivos ni de red.

// 0.5 pt, igual que TOL de host.jsx: por debajo no hay diferencia visible.
const TOLERANCIA_CM = 0.5 / 28.3465;
// Illustrator no admite cuerpos mayores de 1296 pt.
const CUERPO_MAXIMO_CM = 1296 / 28.3465;

export const REGLAS_TEXTO = {
  trackingMinimo: -30, // milésimas de em, como el "tracking" de Illustrator
  condensacionMaxima: 90, // % mínimo de escala horizontal
  cuerpoMinimoFactor: 0.5, // nunca por debajo de la mitad del cuerpo base
  percentilCalibracion: 85, // el 15% más ancho se ajusta solo, no manda
  maxCandidatosCalibracion: 40,
  referenciaNumero: '55', // el caso más exigente de dos dígitos
};

function limitarCuerpo(cm) {
  if (!(cm > 0)) return 0.01;
  return Math.min(cm, CUERPO_MAXIMO_CM);
}

/**
 * Medidor sobre una fuente de fontkit. Mide igual que la saca pdf-lib al
 * escribir: glifo por glifo con su avance, SIN kerning (pdf-lib codifica
 * los ids de glifo y deja los avances de la fuente; el kerning de GPOS no se
 * aplica) -- por eso la vista previa del navegador apaga font-kerning.
 *
 * @param {object} fk  fuente de fontkit (fontkit.create(bytes))
 */
export function medidorDeFontkit(fk) {
  const upm = fk.unitsPerEm;
  const glifosH = fk.layout('H').glyphs;
  const bboxH = glifosH[0]?.bbox;
  const banda = bboxH && Number.isFinite(bboxH.minY) && bboxH.maxY > bboxH.minY
    ? { minY: bboxH.minY / upm, maxY: bboxH.maxY / upm }
    : { minY: 0, maxY: (fk.capHeight || upm * 0.7) / upm };

  return {
    banda,
    // Posiciones de tinta de cada glifo, en em, a tracking 0 y escala 100.
    glifos(texto) {
      const { glyphs } = fk.layout(texto);
      let x = 0;
      const salida = [];
      glyphs.forEach((g, i) => {
        const b = g.bbox;
        if (b && Number.isFinite(b.minX) && b.maxX > b.minX) {
          salida.push({
            indice: i,
            izq: (x + b.minX) / upm,
            der: (x + b.maxX) / upm,
            abajo: b.minY / upm,
            arriba: b.maxY / upm,
          });
        }
        x += g.advanceWidth;
      });
      return salida;
    },
  };
}

/**
 * Último recurso si no hay ninguna fuente con contornos reales: mide con el
 * avance tipográfico (sin sangrías laterales, ligeramente más ancho que la
 * tinta). Solo para la Helvetica estándar de pdf-lib, que no trae contornos.
 */
export function medidorDeAvances(fuentePdfLib, alturaMayuscula = 0.718) {
  return {
    banda: { minY: 0, maxY: alturaMayuscula },
    glifos(texto) {
      const ancho = fuentePdfLib.widthOfTextAtSize(texto, 1);
      if (!(ancho > 0)) return [];
      return [{ indice: 0, izq: 0, der: ancho, abajo: 0, arriba: alturaMayuscula }];
    },
  };
}

// Medidas de tinta de un texto ya "glifeado", a un cuerpo/tracking/escala.
// El tracking suma (indice * tracking) a la posición de cada glifo, y la
// escala horizontal estira TODO (posiciones, tracking incluido) -- tal como
// opera el operador Tz de PDF sobre Tc.
function medirTinta(glifos, cuerpo, trackingMil, escalaH) {
  const t = trackingMil / 1000;
  const h = escalaH / 100;
  let izq = Infinity, der = -Infinity, abajo = Infinity, arriba = -Infinity;
  for (const g of glifos) {
    izq = Math.min(izq, (g.izq + g.indice * t) * h);
    der = Math.max(der, (g.der + g.indice * t) * h);
    abajo = Math.min(abajo, g.abajo);
    arriba = Math.max(arriba, g.arriba);
  }
  return {
    izq: izq * cuerpo,
    der: der * cuerpo,
    ancho: (der - izq) * cuerpo,
    alto: (arriba - abajo) * cuerpo,
  };
}

/**
 * Cuerpo común de una zona "calibrada": el cuerpo al que cabe el candidato
 * del percentil elegido (no el más ancho de todos -- un solo "100" no tiene
 * que encoger a todo el equipo).
 *
 * @returns {number|null} cuerpo en cm, o null si ningún candidato se pudo medir
 */
export function calibrarCuerpo({ medidor, candidatos, anchoCm, altoCm, reglas = REGLAS_TEXTO }) {
  const unicos = [...new Set((candidatos || []).map(String).filter((c) => c !== ''))];
  // Se miden como mucho N, los más largos: el más ancho está entre ellos seguro.
  unicos.sort((a, b) => b.length - a.length);
  const medidos = unicos
    .slice(0, reglas.maxCandidatosCalibracion)
    .map((texto) => medirTinta(medidor.glifos(texto), 1, 0, 100).ancho)
    .filter((ancho) => ancho > 0)
    .sort((a, b) => a - b);
  if (medidos.length === 0) return null;

  let indice = Math.ceil((reglas.percentilCalibracion / 100) * medidos.length) - 1;
  indice = Math.max(0, Math.min(medidos.length - 1, indice));
  const alturaBanda = medidor.banda.maxY - medidor.banda.minY;
  return limitarCuerpo(Math.min(anchoCm / medidos[indice], altoCm / alturaBanda));
}

/**
 * Ajusta UN texto a su zona.
 *
 * @param {object} p
 * @param {object} p.medidor
 * @param {string} p.texto
 * @param {number} p.anchoCm  ancho de la zona
 * @param {number} p.altoCm   alto de la zona
 * @param {'llenar'|'calibrado'} p.modo
 * @param {number|null} [p.cuerpoCalibradoCm]  cuerpo común (modo calibrado)
 * @returns {{
 *   cuerpoCm: number, trackingMil: number, escalaH: number,
 *   dxCm: number, dyCm: number, cabe: boolean, pasos: string[],
 *   tintaCm: {ancho: number, alto: number}
 * } | null}  null si no hay nada que ajustar (texto vacío, zona sin tamaño,
 *   o texto sin tinta -- solo espacios)
 *
 * El texto se coloca así: el CENTRO de su tinta cae en el centro horizontal
 * de la zona, y el centro de la BANDA de mayúsculas en el centro vertical.
 * `dxCm`: el origen del texto (donde arranca el primer glifo) cae en
 * cxZona + dxCm. `dyCm`: la línea de base cae en cyZona + dyCm, con la Y
 * creciendo hacia ABAJO (igual que zonas y lienzo) -- la base queda debajo
 * del centro de la zona exactamente la mitad de la banda de mayúsculas.
 */
export function ajustarTexto({ medidor, texto, anchoCm, altoCm, modo, cuerpoCalibradoCm = null, reglas = REGLAS_TEXTO }) {
  const valor = String(texto ?? '');
  if (valor === '' || !(anchoCm > 0) || !(altoCm > 0)) return null;
  const glifos = medidor.glifos(valor);
  if (glifos.length === 0) return null;

  const alturaBanda = medidor.banda.maxY - medidor.banda.minY;
  const ancho1 = medirTinta(glifos, 1, 0, 100).ancho;
  const pasos = [];

  let cuerpo;
  if (modo === 'calibrado' && cuerpoCalibradoCm > 0) {
    cuerpo = limitarCuerpo(cuerpoCalibradoCm);
  } else {
    cuerpo = limitarCuerpo(Math.min(anchoCm / ancho1, altoCm / alturaBanda));
    pasos.push('al alto de la zona: ' + cuerpo.toFixed(2) + ' cm');
  }
  const nominal = cuerpo;
  let tracking = 0;
  let escalaH = 100;
  let tinta = medirTinta(glifos, cuerpo, tracking, escalaH);
  // El alto se compara por la BANDA de mayúsculas, no por la tinta: una letra
  // redonda (G, O, S) o una tilde sobresalen unas décimas por arriba/abajo y
  // eso es la tipografía de toda la vida, no un texto que no cabe.
  const cabe = () => tinta.ancho <= anchoCm + TOLERANCIA_CM && alturaBanda * cuerpo <= altoCm + TOLERANCIA_CM;
  const remedir = () => { tinta = medirTinta(glifos, cuerpo, tracking, escalaH); };

  // Paso 1: tracking negativo.
  if (!cabe() && reglas.trackingMinimo < 0 && tinta.ancho > anchoCm) {
    tracking = reglas.trackingMinimo;
    pasos.push('tracking ' + tracking);
    remedir();
  }
  // Paso 2: reducir el cuerpo, con el factor exacto sobre la medida actual.
  if (!cabe() && reglas.cuerpoMinimoFactor < 1) {
    const k = Math.min(anchoCm / tinta.ancho, altoCm / tinta.alto);
    cuerpo = limitarCuerpo(Math.max(cuerpo * k, nominal * reglas.cuerpoMinimoFactor));
    pasos.push('cuerpo ' + cuerpo.toFixed(2) + ' cm (base ' + nominal.toFixed(2) + ')');
    remedir();
  }
  // Paso 3: condensar -- el último, porque deforma la letra.
  if (!cabe() && reglas.condensacionMaxima < 100 && tinta.ancho > anchoCm) {
    const necesaria = Math.floor(escalaH * (anchoCm / tinta.ancho));
    escalaH = Math.max(reglas.condensacionMaxima, Math.min(100, necesaria));
    pasos.push('condensado al ' + escalaH + '%');
    remedir();
  }

  // Colocación: tinta centrada en horizontal, banda de mayúsculas centrada en vertical.
  const centroBanda = ((medidor.banda.minY + medidor.banda.maxY) / 2) * cuerpo;
  return {
    cuerpoCm: cuerpo,
    trackingMil: tracking,
    escalaH,
    dxCm: -(tinta.izq + tinta.der) / 2,
    dyCm: centroBanda,
    cabe: cabe(),
    pasos,
    tintaCm: { ancho: tinta.ancho, alto: tinta.alto },
  };
}

/**
 * Ajusta todos los textos de un conjunto de piezas ya resueltas
 * (resolverPedido.js). Los textos "calibrados" se agrupan por zona: todos los
 * números de la misma zona (y talla) comparten cuerpo, calibrado con los
 * datos reales del pedido.
 *
 * @param {object[]} piezas
 * @param {(fuenteUrl: string|null) => Promise<{medidor: object, fuenteUrl: string|null}>} obtenerMedidor
 *   devuelve el medidor Y la fuente efectivamente usada (null = la de base:
 *   si una fuente propia no se pudo bajar, cae a la base y el texto se
 *   imprime con ella, no con una que no se midió)
 * @returns {Promise<object[]>} piezas nuevas; cada texto con `ajuste` (o null)
 */
export async function ajustarTextosDePiezas(piezas, obtenerMedidor, reglas = REGLAS_TEXTO) {
  const todos = piezas.flatMap((p) => p.textos || []);
  const medidores = new Map();
  for (const t of todos) {
    const clave = t.fuenteUrl || '';
    if (!medidores.has(clave)) medidores.set(clave, await obtenerMedidor(t.fuenteUrl || null));
  }

  // Candidatos por zona calibrada: todos los datos reales de esa zona/talla.
  const candidatosPorZona = new Map();
  for (const t of todos) {
    if (t.modo !== 'calibrado' || !t.zonaClave) continue;
    if (!candidatosPorZona.has(t.zonaClave)) candidatosPorZona.set(t.zonaClave, []);
    candidatosPorZona.get(t.zonaClave).push(t.texto);
  }
  const cuerpoPorZona = new Map();
  for (const t of todos) {
    if (t.modo !== 'calibrado' || !t.zonaClave || cuerpoPorZona.has(t.zonaClave)) continue;
    const { medidor } = medidores.get(t.fuenteUrl || '');
    cuerpoPorZona.set(
      t.zonaClave,
      calibrarCuerpo({ medidor, candidatos: candidatosPorZona.get(t.zonaClave), anchoCm: t.anchoCm, altoCm: t.altoCm, reglas })
    );
  }

  return piezas.map((pieza) => ({
    ...pieza,
    textos: (pieza.textos || []).map((t) => {
      const { medidor, fuenteUrl } = medidores.get(t.fuenteUrl || '');
      const ajuste = ajustarTexto({
        medidor,
        texto: t.texto,
        anchoCm: t.anchoCm,
        altoCm: t.altoCm,
        modo: t.modo,
        cuerpoCalibradoCm: t.modo === 'calibrado' ? cuerpoPorZona.get(t.zonaClave) : null,
        reglas,
      });
      return { ...t, fuenteUrl, ajuste };
    }),
  }));
}
