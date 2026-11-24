// Los nombres de las tallas de una prenda, leídos del documento de Illustrator
// que viaja dentro del PDF (ver arteNativo.js·leerDocumentoAi).
//
// En el PDF común cada capa (MANGA, ESPALDAS…) trae sus tallas como contornos
// anidados SIN nombre. Pero en Illustrator cada talla es un grupo (o una
// subcapa) llamado "XS", "S", "M"…, y ese nombre queda guardado en el
// documento nativo: en el identificador del grupo (%_/XMLUID : (M_0000…)),
// o en el nombre de la subcapa ((M) Ln). Con eso, la lista de tallas se
// completa sola al importar.

// Una cadena de PostScript: (MANGA PU\321O) -> "MANGA PUÑO".
function cadenaPs(texto) {
  const bytes = texto
    .replace(/\\([0-7]{1,3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)))
    .replace(/\\([()\\])/g, '$1');
  // Illustrator guarda los nombres en UTF-8 (la Ñ son dos bytes); si no lo
  // son, quedan como vinieron.
  const utf8 = Buffer.from(bytes, 'latin1').toString('utf8');
  return utf8.includes('�') ? bytes : utf8;
}

// El identificador XML de un objeto con nombre: los caracteres que no valen en
// XML van como _xHH_ ("5XL" empieza con número: _x35_XL), y al final un número
// para que no se repita (_0000011835…).
export function nombreDeIdXml(id) {
  return id
    .replace(/_\d{8,}_?$/, '')
    .replace(/_x([0-9a-f]{2,4})_/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .trim();
}

const OPERADOR_TRAZO = /^((?:-?\d*\.?\d+\s+)+)[mlLcCvVyY]$/;

function nuevaCapa(nombre) {
  return { nombre, grupos: [] };
}

/**
 * Por cada capa de primer nivel: sus grupos (o subcapas) de primer nivel, en el
 * orden del archivo, con su nombre (si tiene) y el área de su caja (para
 * emparejarlos con los contornos, que se ordenan de mayor a menor).
 * @returns {Map<string, {nombre: string|null, area: number}[]>}
 */
export function gruposPorCapa(textoAi) {
  const resultado = new Map();
  const lineas = textoAi.split(/\r?\n/);
  const pilaCapas = []; // capas abiertas (la 0 es la de primer nivel)
  let profundidad = 0; // grupos abiertos dentro de la capa de primer nivel
  let grupo = null; // el grupo (o subcapa) de primer nivel que se está leyendo
  let pendiente = null; // grupo recién cerrado, esperando su nombre
  const caja = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const abrirGrupo = (nombre = null) => {
    grupo = { nombre, ...caja };
  };
  const cerrarGrupo = () => {
    const g = grupo;
    grupo = null;
    const area = g.x1 > g.x0 ? (g.x1 - g.x0) * (g.y1 - g.y0) : 0;
    const registro = { nombre: g.nombre, area };
    pilaCapas[0].grupos.push(registro);
    return registro;
  };

  for (const linea of lineas) {
    if (linea.startsWith('%AI5_BeginLayer')) {
      if (pilaCapas.length === 0) {
        pilaCapas.push(nuevaCapa(null));
        profundidad = 0;
      } else {
        // Una subcapa: cuenta como un "grupo" de la capa de arriba.
        pilaCapas.push(nuevaCapa(null));
        if (pilaCapas.length === 2 && profundidad === 0) abrirGrupo();
      }
      pendiente = null;
      continue;
    }
    if (linea.startsWith('%AI5_EndLayer')) {
      const capa = pilaCapas.pop();
      if (pilaCapas.length === 0) {
        if (capa?.nombre != null) resultado.set(capa.nombre, capa.grupos);
      } else if (pilaCapas.length === 1 && grupo && profundidad === 0) {
        grupo.nombre = capa.nombre;
        cerrarGrupo();
      }
      continue;
    }
    if (pilaCapas.length === 0) continue;

    const nombreCapa = linea.match(/^\((.*)\) Ln$/);
    if (nombreCapa) {
      pilaCapas[pilaCapas.length - 1].nombre = cadenaPs(nombreCapa[1]);
      continue;
    }
    if (pilaCapas.length > 1) {
      // Dentro de una subcapa: solo importa la caja.
      const m = linea.match(OPERADOR_TRAZO);
      if (m && grupo) sumarPuntos(grupo, m[1]);
      continue;
    }

    if (linea === 'u' || linea === '*u') {
      pendiente = null;
      if (profundidad === 0) abrirGrupo();
      profundidad++;
      continue;
    }
    if (linea === 'U' || linea === '*U') {
      profundidad = Math.max(profundidad - 1, 0);
      if (profundidad === 0 && grupo) pendiente = cerrarGrupo();
      continue;
    }
    const id = linea.match(/^%_\/XMLUID : \((.*)\) ; \(AI10_ArtUID\)/);
    if (id && pendiente && profundidad === 0) {
      pendiente.nombre = nombreDeIdXml(cadenaPs(id[1]));
      pendiente = null;
      continue;
    }
    const m = linea.match(OPERADOR_TRAZO);
    if (m) {
      if (profundidad === 0) pendiente = null; // un trazo suelto: lo que sigue ya no es del grupo
      if (grupo) sumarPuntos(grupo, m[1]);
    }
  }
  return resultado;
}

function sumarPuntos(grupo, numeros) {
  const n = numeros.trim().split(/\s+/).map(Number);
  for (let i = 0; i + 1 < n.length; i += 2) {
    const x = n[i], y = n[i + 1];
    if (x < grupo.x0) grupo.x0 = x;
    if (x > grupo.x1) grupo.x1 = x;
    if (y < grupo.y0) grupo.y0 = y;
    if (y > grupo.y1) grupo.y1 = y;
  }
}

const clave = (nombre) => String(nombre || '').trim().toUpperCase();

/**
 * Los nombres de talla de una capa, de MAYOR a menor (como los contornos que
 * devuelve analizarPrendaPdf), o null si no se puede saber con seguridad:
 * todos los grupos tienen que tener nombre de talla y ser tantos como contornos.
 */
export function nombresDeTallasDeCapa(grupos, nombreCapa, cantidad, pareceTalla) {
  const lista = grupos.get(nombreCapa) ?? [...grupos].find(([n]) => clave(n) === clave(nombreCapa))?.[1];
  if (!lista || lista.length !== cantidad || cantidad < 2) return null;
  if (!lista.every((g) => g.nombre && pareceTalla(g.nombre) && g.area > 0)) return null;
  const nombres = [...lista].sort((a, b) => b.area - a.area).map((g) => g.nombre.toUpperCase());
  return new Set(nombres).size === nombres.length ? nombres : null;
}
