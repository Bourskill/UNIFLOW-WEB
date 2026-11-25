// Ajuste del texto (nombre / número / texto fijo) al espacio de su zona --
// puerto del ajuste del panel de Illustrator (host.jsx: ajustarZona,
// calibrarZona, medirBanda). Una sola implementación para TODO lo que
// muestra o imprime un texto: el PDF (exportarPdf.js), la vista previa de
// nesting y el lienzo de Diseño -- así lo que se ve es lo que se imprime.
//
// Dos modos, igual que `politica` en panel/esquemas/produccion.json:
//   - "llenar"    (nombre, texto fijo): el texto ocupa TODO EL ALTO de su zona
//                 y solo baja de cuerpo cuando el ancho no da.
//   - "calibrado" (número): la cifra OCUPA TODO EL ALTO de la zona, siempre:
//                 el alto de una cifra plana ("1", de la línea de base a su
//                 tope) es exactamente el alto de la zona, así todos los
//                 números de una zona salen a la misma altura. Las cifras
//                 redondas (0, 3, 6, 8, 9) sobresalen un poco arriba y abajo
//                 -- es su "desborde" óptico, el mismo de cualquier tipografía
//                 -- y PUEDEN salirse de la zona: no cuenta como "no cabe".
//                 (Pedido explícito: antes el cuerpo lo mandaba el ancho de
//                 un "55" y el número quedaba más bajo que la zona.)
//
// La ALTURA de un nombre o texto se mide con la banda de una mayúscula sin
// tilde ("H"), nunca con la tinta del propio dato: si no, "GARCÍA" saldría
// con menos cuerpo que "ESTIVEN" por culpa del acento. La de un número, con
// la banda de una cifra plana ("1"). El ANCHO sí es el de la tinta real
// (primer pixel a último), no el avance tipográfico.
//
// La escalera (solo nombres y textos, cuando no caben a lo ancho): tracking
// negativo -> reducir cuerpo -> condensar (el orden de host.jsx -- lo último
// deforma la letra). Un número NO tiene escalera: va a alto completo con su
// forma natural, y si es más ancho que la zona se sale por los costados
// (pedido explícito: el alto completo es la prioridad, sí o sí).
//
// Todo en cm. El "medidor" abstrae la fuente (ver medidorDeFontkit): este
// módulo no sabe de archivos ni de red.

// 0.5 pt, igual que TOL de host.jsx: por debajo no hay diferencia visible.
const TOLERANCIA_CM = 0.5 / 28.3465;
// Illustrator no admite cuerpos mayores de 1296 pt.
const CUERPO_MAXIMO_CM = 1296 / 28.3465;

// Un número que se sale más de esto (fracción del ancho de su zona) por los
// costados genera un aviso; menos, es el desborde normal y no se menciona.
const DESBORDE_NUMERO_AVISO = 0.25;

import { contornosDeTexto, grosorTotal, fraccionDeLaLetra, contornosResueltos } from './contornosTexto.js';

export const REGLAS_TEXTO = {
  trackingMinimo: -30, // milésimas de em, como el "tracking" de Illustrator
  condensacionMaxima: 90, // % mínimo de escala horizontal
  cuerpoMinimoFactor: 0.5, // nunca por debajo de la mitad del cuerpo base
  referenciaNumero: '55', // solo para saber que la zona es de números (el cuerpo sale del alto)
};

/**
 * El texto tal como se va a medir Y escribir: sin saltos de línea, tabulaciones
 * ni caracteres de ancho cero (una fuente no tiene glifo para ellos y saldrían
 * como un cuadrito), con los espacios sueltos colapsados y sin espacios en los
 * extremos. Siempre se usa ESTA versión para medir, dibujar y previsualizar.
 */
export function normalizarTexto(texto) {
  return String(texto ?? '')
    .replace(/[\u200B-\u200F\u2028-\u202E\u2060\uFEFF]/g, '')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Los renglones de un nombre o texto: se parte por los saltos de línea (Enter
 * en el campo, o una celda de planilla con varios renglones) y cada renglón se
 * normaliza como arriba. Los renglones vacíos no cuentan.
 */
export function normalizarLineas(texto) {
  return String(texto ?? '')
    .replace(/\r\n?|[\u2028\u2029\u0085\u000B\u000C]/g, '\n')
    .split('\n')
    .map(normalizarTexto)
    .filter((l) => l !== '');
}

// Espacio entre renglones, en % del alto de la letra (la banda de
// mayúsculas): 0 = un renglón pegado al otro.
export const INTERLINEADO = { min: -50, max: 200, porDefecto: 30 };

function limitarInterlineado(pct) {
  const n = Number(pct);
  if (pct === null || pct === undefined || pct === '' || !Number.isFinite(n)) return INTERLINEADO.porDefecto;
  return Math.min(Math.max(n, INTERLINEADO.min), INTERLINEADO.max);
}

// Límites del estilo que se puede elegir en la zona (y que acepta la API).
export const ESPACIADO_MIL = { min: -200, max: 500 };
// El contorno es lo que ocupan TODOS los contornos juntos (contornosTexto.js).
export const CONTORNO_MAX_CM = 6;

function limitarEspaciado(mil) {
  const n = Number(mil);
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(n, ESPACIADO_MIL.min), ESPACIADO_MIL.max);
}

function limitarContorno(cm) {
  const n = Number(cm);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, CONTORNO_MAX_CM);
}

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
  // La banda de las cifras: la de un "1" (plano arriba y abajo, sin el
  // desborde de las redondas). Sin "1" en la fuente, la de mayúsculas.
  const bbox1 = fk.hasGlyphForCodePoint(0x31) ? fk.layout('1').glyphs[0]?.bbox : null;
  const bandaNumeros = bbox1 && Number.isFinite(bbox1.minY) && bbox1.maxY > bbox1.minY
    ? { minY: bbox1.minY / upm, maxY: bbox1.maxY / upm }
    : banda;

  return {
    banda,
    bandaNumeros,
    /** Caracteres del texto que esta fuente NO trae (se imprimirían como un cuadrito vacío). */
    sinGlifo(texto) {
      const faltan = new Set();
      for (const caracter of texto) {
        if (/\s/.test(caracter)) continue;
        if (!fk.hasGlyphForCodePoint(caracter.codePointAt(0))) faltan.add(caracter);
      }
      return [...faltan];
    },
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
    bandaNumeros: { minY: 0, maxY: alturaMayuscula },
    sinGlifo() { return []; },
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

// Varios renglones al mismo cuerpo/tracking/escala: el ancho es el del
// renglón más ancho; el alto, de la tinta de arriba del primero a la de abajo
// del último (paso = distancia entre líneas de base, en em).
function medirBloque(glifosPorLinea, cuerpo, trackingMil, escalaH, paso) {
  const lineas = glifosPorLinea.map((g) => medirTinta(g, cuerpo, trackingMil, escalaH));
  if (lineas.length === 1) return { ...lineas[0], lineas };
  return {
    lineas,
    ancho: Math.max(...lineas.map((l) => l.ancho)),
    alto: (lineas.length - 1) * paso * cuerpo + Math.max(...lineas.map((l) => l.alto)),
  };
}

function bandaDe(medidor, modo) {
  return modo === 'calibrado' ? (medidor.bandaNumeros || medidor.banda) : medidor.banda;
}

/**
 * Cuerpo común de una zona "calibrada" (números): el que hace que una cifra
 * plana mida EXACTAMENTE el alto de la zona. Ya no depende del ancho de los
 * datos -- el número que no entra a lo ancho se resuelve solo, en su propio
 * ajuste (tracking, condensar y, recién al final, achicar), sin bajarle la
 * altura a todos los demás.
 *
 * `candidatos` y `anchoCm` se siguen recibiendo para no cambiar quién la
 * llama; solo se usan para saber si hay algo que medir.
 *
 * @returns {number|null} cuerpo en cm, o null si ningún candidato se pudo medir
 */
// eslint-disable-next-line no-unused-vars
export function calibrarCuerpo({ medidor, candidatos, anchoCm, altoCm, reglas = REGLAS_TEXTO }) {
  const hayAlgo = (candidatos || []).some((c) => String(c) !== '' && medidor.glifos(String(c)).length > 0);
  if (!hayAlgo || !(altoCm > 0)) return null;
  const banda = bandaDe(medidor, 'calibrado');
  return limitarCuerpo(altoCm / (banda.maxY - banda.minY));
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
 *   texto: string, sinGlifo: string[],
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
export function ajustarTexto(parametros) {
  // Contornos "enlazados" (en % del alto de la letra, contornosTexto.js): su
  // grosor depende del tamaño final de la letra, y el espacio que dejan
  // cambia ese tamaño -- se busca el punto en que coinciden (converge rápido:
  // cada vuelta corrige una fracción chica de la anterior).
  const fraccion = Number(parametros.contornoRelativo) || 0;
  if (!(fraccion > 0)) return ajustarTextoNucleo(parametros);
  const base = Number(parametros.contornoCm) || 0;
  let extra = 0, a = null;
  for (let i = 0; i < 12; i++) {
    a = ajustarTextoNucleo({ ...parametros, contornoCm: base + extra });
    if (!a) return a;
    const nuevo = fraccion * a.altoBandaCm;
    if (Math.abs(nuevo - extra) < 1e-5) break;
    extra = nuevo;
  }
  return a && { ...a, contornoEnlazadoCm: extra };
}

function ajustarTextoNucleo({
  medidor, texto, anchoCm, altoCm, modo, cuerpoCalibradoCm = null, reglas = REGLAS_TEXTO,
  espaciadoMil = 0, contornoCm = 0, alineacion = 'centro', interlineado = INTERLINEADO.porDefecto,
  alineacionV = 'centro',
}) {
  // Estilo elegido en la zona (panel de Diseño): el espaciado entre letras
  // es el punto de partida del tracking, y el contorno de color ocupa
  // espacio por fuera de la letra -- un nombre o texto deja ese margen
  // adentro de su zona para no salirse con el borde puesto. Un número no:
  // va a alto completo igual (su contorno desborda como sus cifras redondas).
  const espaciado = limitarEspaciado(espaciadoMil);
  const contorno = limitarContorno(contornoCm);
  if (modo !== 'calibrado' && contorno > 0) {
    anchoCm = Math.max(anchoCm - 2 * contorno, 0.01);
    altoCm = Math.max(altoCm - 2 * contorno, 0.01);
  }
  const esNumero = modo === 'calibrado';
  // Un nombre o texto puede ir en varios renglones (uno encima del otro); un
  // número o una talla, siempre en uno.
  const renglones = (esNumero ? [normalizarTexto(texto)] : normalizarLineas(texto))
    .map((l) => ({ texto: l, glifos: medidor.glifos(l) }))
    .filter((r) => r.texto !== '' && r.glifos.length > 0);
  if (renglones.length === 0 || !(anchoCm > 0) || !(altoCm > 0)) return null;
  const valor = renglones.map((r) => r.texto).join('\n');
  const glifosPorLinea = renglones.map((r) => r.glifos);
  const n = renglones.length;

  const banda = bandaDe(medidor, modo);
  const alturaBanda = banda.maxY - banda.minY;
  // Entre renglones: de línea de base a línea de base, en em.
  const paso = alturaBanda * (1 + limitarInterlineado(interlineado) / 100);
  // El alto que ocupan las bandas de todos los renglones, por em de cuerpo.
  const altoBloque = alturaBanda + (n - 1) * paso;
  // Medido YA con el espaciado elegido: si no, un nombre con letras más
  // abiertas no entraría y perdería su espaciado en el primer paso.
  const ancho1 = medirBloque(glifosPorLinea, 1, espaciado, 100, paso).ancho;
  const pasos = [];

  let cuerpo;
  if (esNumero) {
    // Un número siempre ocupa todo el alto (ver arriba); el cuerpo común de
    // la zona, si viene, es ese mismo valor.
    cuerpo = limitarCuerpo(cuerpoCalibradoCm > 0 ? cuerpoCalibradoCm : altoCm / alturaBanda);
    pasos.push('cifra al alto de la zona: ' + cuerpo.toFixed(2) + ' cm');
  } else {
    cuerpo = limitarCuerpo(Math.min(anchoCm / ancho1, altoCm / altoBloque));
    pasos.push('al alto de la zona: ' + cuerpo.toFixed(2) + ' cm');
  }
  const nominal = cuerpo;
  let tracking = espaciado;
  let escalaH = 100;
  let tinta = medirBloque(glifosPorLinea, cuerpo, tracking, escalaH, paso);
  // El alto se compara por la BANDA (mayúsculas, o cifras planas), no por la
  // tinta: una letra o cifra redonda (G, O, S, 0, 8) o una tilde sobresalen
  // unas décimas por arriba/abajo -- es la tipografía de toda la vida (y en
  // un número se deja salir de la zona a propósito), no un texto que no cabe.
  // Un número nunca se ajusta por el ancho: su alto completo es lo único que
  // manda, y si es más ancho que la zona se sale por los costados (pedido
  // explícito: "no importa si se desborda del ancho"). Para él, "cabe" es
  // solo el alto -- que por construcción siempre da.
  const cabe = () => (esNumero || tinta.ancho <= anchoCm + TOLERANCIA_CM) && altoBloque * cuerpo <= altoCm + TOLERANCIA_CM;
  const remedir = () => { tinta = medirBloque(glifosPorLinea, cuerpo, tracking, escalaH, paso); };

  const reducirCuerpo = () => {
    if (cabe() || !(reglas.cuerpoMinimoFactor < 1)) return;
    const k = Math.min(anchoCm / tinta.ancho, altoCm / tinta.alto);
    cuerpo = limitarCuerpo(Math.max(cuerpo * k, nominal * reglas.cuerpoMinimoFactor));
    pasos.push('cuerpo ' + cuerpo.toFixed(2) + ' cm (base ' + nominal.toFixed(2) + ')');
    remedir();
  };
  const condensar = () => {
    if (cabe() || !(reglas.condensacionMaxima < 100) || !(tinta.ancho > anchoCm)) return;
    const necesaria = Math.floor(escalaH * (anchoCm / tinta.ancho));
    escalaH = Math.max(reglas.condensacionMaxima, Math.min(100, necesaria));
    pasos.push('condensado al ' + escalaH + '%');
    remedir();
  };

  // Paso 1: tracking negativo.
  // (Con un espaciado propio más abierto que eso, se cierra hasta el mínimo
  // antes de achicar la letra: que el nombre entre manda sobre el estilo.)
  if (!cabe() && tracking > reglas.trackingMinimo && tinta.ancho > anchoCm) {
    tracking = Math.min(tracking, reglas.trackingMinimo);
    pasos.push('tracking ' + tracking);
    remedir();
  }
  // Pasos 2 y 3 (solo nombres y textos): achicar y, recién después,
  // condensar -- condensar deforma la letra. Un número no pasa por ninguno.
  if (!esNumero) { reducirCuerpo(); condensar(); }

  // Colocación en horizontal según la alineación de la zona: la tinta
  // pegada al borde izquierdo, centrada, o pegada al borde derecho (con
  // borde de color, la que llega al borde de la zona es la línea del borde:
  // anchoCm ya descuenta su grosor). Un número más ancho que su zona se sale
  // solo por el lado contrario al de la alineación.
  // Con varios renglones, cada uno se alinea por su propia tinta.
  const dxDe = (t) => (alineacion === 'izquierda' ? -anchoCm / 2 - t.izq
    : alineacion === 'derecha' ? anchoCm / 2 - t.der
    : -(t.izq + t.der) / 2);
  // En vertical, la banda (de mayúsculas, o de cifras planas) centrada: un
  // número a alto completo queda con la base de la cifra en el borde de
  // abajo y su tope en el de arriba. Varios renglones: el bloque entero
  // centrado, cada renglón un paso más abajo que el anterior.
  const centroBanda = ((banda.minY + banda.maxY) / 2) * cuerpo;
  // Alineación vertical (zona de nombre o texto): un nombre largo baja de
  // cuerpo y, en vez de quedar centrado, se pega arriba o abajo de su zona --
  // así todos los nombres arrancan a la misma altura. Un número va a alto
  // completo: no tiene para dónde moverse.
  const sobra = Math.max(altoCm - altoBloque * cuerpo, 0);
  const corrimientoV = esNumero ? 0 : alineacionV === 'arriba' ? -sobra / 2 : alineacionV === 'abajo' ? sobra / 2 : 0;
  const lineas = renglones.map((r, i) => ({
    texto: r.texto,
    dxCm: dxDe(tinta.lineas[i]),
    dyCm: centroBanda + (i - (n - 1) / 2) * paso * cuerpo + corrimientoV,
    // Dónde empieza y termina su tinta, desde su origen (cm).
    tintaCm: { izq: tinta.lineas[i].izq, der: tinta.lineas[i].der },
  }));
  return {
    texto: valor, // el texto normalizado que se midió: es EL que hay que dibujar (renglones separados por \n)
    // Cada renglón con su origen respecto del centro de la zona (como dxCm/dyCm).
    lineas,
    sinGlifo: medidor.sinGlifo(valor),
    cuerpoCm: cuerpo,
    trackingMil: tracking,
    escalaH,
    dxCm: lineas[0].dxCm,
    dyCm: lineas[0].dyCm,
    cabe: cabe(),
    pasos,
    tintaCm: { ancho: tinta.ancho, alto: tinta.alto },
    // Alto de la banda (mayúsculas o cifras) al cuerpo final: la cápsula de
    // la talla se mide con esto, así S y XL quedan del mismo alto.
    altoBandaCm: alturaBanda * cuerpo,
    // Cuánto se sale un número por los costados de su zona (0 si no se sale).
    desbordeAnchoCm: Math.max(0, tinta.ancho - anchoCm),
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
// Textos que comparten cuerpo: misma zona Y misma caja Y misma fuente. Aunque
// dos zonas distintas llegaran con la misma clave, nunca se mezclan cajas ni
// tipografías (la clave sola no basta como garantía).
function grupoDeCalibracion(t) {
  return [t.zonaClave, t.anchoCm, t.altoCm, t.fuenteUrl || ''].join('|');
}

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
    const grupo = grupoDeCalibracion(t);
    if (!candidatosPorZona.has(grupo)) candidatosPorZona.set(grupo, []);
    candidatosPorZona.get(grupo).push(normalizarTexto(t.texto));
  }
  const cuerpoPorZona = new Map();
  for (const t of todos) {
    const grupo = grupoDeCalibracion(t);
    if (t.modo !== 'calibrado' || !t.zonaClave || cuerpoPorZona.has(grupo)) continue;
    const { medidor } = medidores.get(t.fuenteUrl || '');
    cuerpoPorZona.set(
      grupo,
      calibrarCuerpo({ medidor, candidatos: candidatosPorZona.get(grupo), anchoCm: t.anchoCm, altoCm: t.altoCm, reglas })
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
        cuerpoCalibradoCm: t.modo === 'calibrado' ? cuerpoPorZona.get(grupoDeCalibracion(t)) : null,
        reglas,
        espaciadoMil: t.espaciadoMil || 0,
        contornoCm: grosorTotal(contornosDeTexto(t)),
        alineacion: t.alineacion || 'centro',
        interlineado: t.interlineado,
        alineacionV: t.alineacionV || 'centro',
        contornoRelativo: fraccionDeLaLetra(contornosDeTexto(t)),
      });
      // El texto que se escribe en el PDF es el mismo que se midió. Los
      // contornos enlazados, ya con su grosor para el tamaño final de la letra.
      const contornos = ajuste && fraccionDeLaLetra(contornosDeTexto(t)) > 0
        ? contornosResueltos(contornosDeTexto(t), ajuste.altoBandaCm) : t.contornos;
      return { ...t, texto: ajuste ? ajuste.texto : t.texto, fuenteUrl, ajuste, ...(contornos ? { contornos } : {}) };
    }),
  }));
}

/**
 * Avisos para el usuario sobre textos YA ajustados (pieza por pieza, con el
 * pedido a la vista antes de generar nada): un texto que no cabe en su zona
 * aun con toda la escalera (el panel de Illustrator avisaba "NO cabe en su
 * guía"), o que lleva caracteres que su fuente no trae (saldrían como un
 * cuadrito vacío), o que quedó sin nada que dibujar.
 *
 * @param {object[]} piezas  salida de ajustarTextosDePiezas
 * @returns {{tipo: string, pieza: string, texto: string, mensaje: string}[]}
 */
export function advertenciasDeTextos(piezas) {
  const avisos = [];
  for (const pieza of piezas) {
    for (const t of pieza.textos || []) {
      if (!t.modo) continue; // un texto de una generación guardada antes del ajuste
      const donde = pieza.piezaId + (pieza.talla ? ' (' + String(pieza.talla).toUpperCase() + ')' : '');
      const a = t.ajuste;
      if (!a) {
        avisos.push({ tipo: 'sin-tinta', pieza: donde, texto: String(t.texto ?? ''), mensaje: donde + ': el texto «' + String(t.texto ?? '') + '» no tiene nada que dibujar y se omite.' });
        continue;
      }
      if (a.sinGlifo.length) {
        avisos.push({ tipo: 'sin-glifo', pieza: donde, texto: a.texto, mensaje: donde + ': «' + a.texto + '» lleva ' + a.sinGlifo.join(' ') + ', que la fuente no trae -- saldría como un cuadrito vacío.' });
      }
      // Un número se sale por los costados a propósito (manda su alto); solo
      // se avisa cuando el desborde ya es grande -- un dato fuera de lo común
      // para esa zona, que conviene mirar antes de imprimir.
      // La talla va en su cápsula, que crece con la letra (capsulaTalla.js):
      // que la letra pase el ancho de su zona es lo esperado, no un error.
      if (t.capsula) continue;
      if (t.modo === 'calibrado' && a.desbordeAnchoCm > t.anchoCm * DESBORDE_NUMERO_AVISO) {
        avisos.push({ tipo: 'desborda-ancho', pieza: donde, texto: a.texto, mensaje: donde + ': el número «' + a.texto + '» mide ' + a.tintaCm.ancho.toFixed(1) + ' cm de ancho y su zona ' + t.anchoCm.toFixed(1) + ' cm -- se sale bastante por los costados; revisalo antes de imprimir.' });
      }
      if (!a.cabe) {
        avisos.push({ tipo: 'no-cabe', pieza: donde, texto: a.texto, mensaje: donde + ': «' + a.texto + '» no cabe en su zona (mide ' + a.tintaCm.ancho.toFixed(1) + ' cm de ancho, la zona ' + t.anchoCm.toFixed(1) + ' cm) -- revisalo antes de imprimir.' });
      }
    }
  }
  return avisos;
}
