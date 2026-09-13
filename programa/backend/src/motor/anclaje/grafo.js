"use strict";

// ============================================================
// EL GRAFO DE RELACIONES — orden de cálculo y ciclos
// ============================================================
// Puerto EXACTO de UNIFLOW/programa/cerebro/src/anclaje/grafo.js (el motor
// del panel de Illustrator) -- el usuario pidió explícitamente que el
// funcionamiento de zonas y anclajes sea fiel al de Illustrator, no una
// reinterpretación. Solo cambia el envoltorio de módulo (require/exports ->
// import/export); la lógica y los comentarios de abajo son los originales.
//
// Las zonas pueden apoyarse en otras zonas, y las anclas en otras anclas.
// Eso es lo que hace útil el sistema (punto 11 del enunciado: el sponsor
// cuelga del bolsillo, y el bolsillo de la moldería), y es también lo que
// puede volverse imposible de calcular:
//
//     Zona A depende de Zona B   y   Zona B depende de Zona A
//
// No hay por dónde empezar. Aquí se detecta ANTES de guardar nada, y se
// dice cuál es el ciclo exacto, no un "hay una dependencia circular".
//
// El resto del módulo es el orden topológico: la lista de nodos ordenada
// de forma que cuando le toque a uno, todo aquello de lo que depende ya
// esté resuelto. Es lo que convierte el grafo en una secuencia de cuentas.

import * as refs from './referencias.js';

// ---- normalización ------------------------------------------
// El archivo que escribe el panel puede venir con atajos (un eje escrito
// como texto en vez de como objeto). Se normaliza UNA VEZ, aquí, para que
// el resolutor no tenga que comprobar cada campo dos veces.

// Un eje: de dónde sale la coordenada y qué distancia conserva.
//   ref   : la referencia (ver referencias.js)
//   modo  : "fijo"          -> se suman `valor` centímetros
//           "proporcional"  -> se suma `valor` x la dimensión de la base
//   valor : centímetros, o fracción (0.2 = 20%)
//   base  : "pieza" (por defecto) o "referencia"
function normalizarEje(eje) {
  if (!eje) return null;
  var n = {
    ref   : eje.ref || null,
    modo  : eje.modo === "proporcional" ? "proporcional" : "fijo",
    valor : (typeof eje.valor === "number") ? eje.valor : 0,
    base  : eje.base === "referencia" ? "referencia" : "pieza"
  };
  return n;
}

function normalizarMedida(m, porDefecto) {
  if (typeof m === "number") return { modo: "fijo", valor: m };
  if (!m) return { modo: "fijo", valor: porDefecto || 0 };
  return {
    modo : m.modo === "proporcional" ? "proporcional" : "fijo",
    valor: (typeof m.valor === "number") ? m.valor : (porDefecto || 0)
  };
}

var ORIGENES = ["centro", "supIzq", "supDer", "infIzq", "infDer",
                "centroArriba", "centroAbajo", "centroIzq", "centroDer"];

// Cómo se combinan DOS anclas cruzadas para dar el punto de referencia de
// la zona (con una sola ancla esto no aplica: no hay nada que combinar).
//   "esquina" -> la X de anclaX y la Y de anclaY (el rectángulo que forman
//                los dos puntos tiene dos esquinas vacías; ésta es una).
//                Cruzar con las anclas cambiadas de sitio da la otra.
//   "medio"   -> el punto medio entre ambas anclas, sin importar el orden.
var MODOS_CRUCE = ["esquina", "medio"];

function normalizarAncla(a) {
  return {
    id     : String(a.id || ""),
    nombre : a.nombre || a.id || "",
    pieza  : a.pieza || "",
    x      : normalizarEje(a.x),
    y      : normalizarEje(a.y),
    nota   : a.nota || ""
  };
}

// Que clase de zona es. Cambia lo que hay que pedir y lo que se dibuja:
//   texto / numero  llevan un texto de muestra, y ancho y alto
//   logo            NO lleva texto. Tiene DOS formas, según z.cruz:
//     cruz=true  (por defecto) -- basta UNA medida ("lado"): la zona es una
//                CRUZ, no un cuadro -- el cuadro de "lado" x "lado" es solo
//                la intersección garantizada, y dos brazos (uno por eje,
//                con una proporción fija) dan margen para logos alargados
//                a lo ancho o a lo alto, sin encogerlos hasta el cuadro. El
//                encaje real vive en colocarLogoEnZonaCruz() (host.jsx,
//                programa\panel\), no aquí -- aquí "lado" se guarda y se
//                pasa como ancho=alto (ver resolver.js).
//     cruz=false -- como texto/numero: dos medidas, ancho y alto, y el
//                logo se encaja "contain" dentro de ese único rectángulo
//                (colocarLogoEnZonaSimple, host.jsx). Pensado para logos
//                que no necesitan margen extra por ser alargados (p.ej.
//                un sponsor con un tamaño exacto ya decidido).
var TIPOS_ZONA = ["texto", "numero", "logo"];

function normalizarZona(z) {
  var origen = z.origen || "centro";
  var valido = false;
  for (var i = 0; i < ORIGENES.length; i++) if (ORIGENES[i] === origen) valido = true;
  if (!valido) origen = "centro";

  var modoCruce = z.modoCruce || "esquina";
  var modoCruceValido = false;
  for (var mc = 0; mc < MODOS_CRUCE.length; mc++) if (MODOS_CRUCE[mc] === modoCruce) modoCruceValido = true;
  if (!modoCruceValido) modoCruce = "esquina";

  var off = z.offset || {};
  var tipo = z.tipo || "texto";
  var tipoOk = false;
  for (var t = 0; t < TIPOS_ZONA.length; t++) if (TIPOS_ZONA[t] === tipo) tipoOk = true;
  if (!tipoOk) tipo = "texto";

  return {
    id      : String(z.id || ""),
    nombre  : z.nombre || z.id || "",
    // DISTINTO de `nombre`: `nombre` siempre es igual al `id` (se
    // renombran juntos, ver renombrarNodo en main.js) y tiene que ser
    // único -- otras zonas lo usan para referenciarse. `grupo` es lo
    // contrario a propósito: puede repetirse en varias zonas (2026-08-25,
    // pedido del usuario -- un logo, número o nombre que se repite en
    // varias piezas de la misma plantilla). El panel sincroniza tipo,
    // contenido y logo entre zonas con el mismo grupo; la posición, el
    // tamaño y el ancla de cada una siguen siendo suyos.
    grupo   : z.grupo ? String(z.grupo) : null,
    pieza   : z.pieza || "",
    tipo    : tipo,
    // Un logo con cruz activa se define con UNA medida. Se guarda aparte
    // de ancho/alto para no perder lo que hubiera si se cambia de tipo (o
    // de modo cruz/sin-cruz) y se vuelve.
    lado    : normalizarMedida(z.lado, 8),
    // Solo tiene sentido para tipo "logo": si es true, la zona es una cruz
    // (una sola medida, "lado"); si es false, es un rectángulo normal con
    // ancho y alto propios, como texto/numero. Por defecto true -- es el
    // comportamiento más nuevo y el que sirve para la mayoría de escudos.
    cruz    : (z.cruz === false) ? false : true,
    anclaX  : z.anclaX || z.ancla || null,
    anclaY  : z.anclaY || z.ancla || z.anclaX || null,
    ancho   : normalizarMedida(z.ancho, 0),
    alto    : normalizarMedida(z.alto, 0),
    origen  : origen,
    modoCruce: modoCruce,
    offset  : {
      x: normalizarMedida(off.x, 0),
      y: normalizarMedida(off.y, 0)
    },
    // Lo que se escribirá dentro de la guía cuando la zona se materialice
    // en el .ai. Es el identificador que después lee leerZonas().
    muestra : z.muestra || null,
    // Solo tiene sentido para tipo "logo": la ruta del archivo elegido en
    // el panel. Se coloca UNA vez, al guardar zonas (host.jsx,
    // materializarAnclaje), igual que el texto de muestra — no es algo
    // que produción vuelva a tocar por jugador.
    logoRuta: z.logoRuta || null,
    nota    : z.nota || ""
  };
}

function normalizar(anclaje) {
  var a = anclaje || {};
  var anclas = [], zonas = [], i;
  for (i = 0; i < (a.anclas || []).length; i++) anclas.push(normalizarAncla(a.anclas[i]));
  for (i = 0; i < (a.zonas  || []).length; i++) zonas.push(normalizarZona(a.zonas[i]));
  return { version: a.version || 1, anclas: anclas, zonas: zonas };
}

// ---- comprobaciones de forma --------------------------------
// Antes de mirar el grafo hay que comprobar que los nodos son válidos: un
// id repetido convierte cualquier referencia en ambigua, y una zona sin
// ancla no tiene de dónde salir.
function validar(anclaje) {
  var errores = [], avisos = [];
  var vistos = {}, i;

  for (i = 0; i < anclaje.anclas.length; i++) {
    var a = anclaje.anclas[i];
    if (!a.id) { errores.push("Hay un punto de ancla sin identificador."); continue; }
    if (vistos["ancla:" + a.id]) {
      errores.push("El identificador de ancla «" + a.id + "» está repetido.");
    }
    vistos["ancla:" + a.id] = true;
    if (!a.pieza) errores.push("El ancla «" + a.id + "» no dice a qué pieza pertenece.");
    if (!a.x || !a.x.ref) errores.push("El ancla «" + a.id + "» no tiene referencia horizontal.");
    if (!a.y || !a.y.ref) errores.push("El ancla «" + a.id + "» no tiene referencia vertical.");
  }

  for (i = 0; i < anclaje.zonas.length; i++) {
    var z = anclaje.zonas[i];
    if (!z.id) { errores.push("Hay una zona sin identificador."); continue; }
    if (vistos["zona:" + z.id]) {
      errores.push("El identificador de zona «" + z.id + "» está repetido.");
    }
    vistos["zona:" + z.id] = true;
    if (!z.pieza) errores.push("La zona «" + z.id + "» no dice a qué pieza pertenece.");
    if (!z.anclaX) errores.push("La zona «" + z.id + "» no tiene ancla para la posición horizontal.");
    if (!z.anclaY) errores.push("La zona «" + z.id + "» no tiene ancla para la posición vertical.");
    if (z.tipo === "logo" && z.cruz) {
      if (!(z.lado.valor > 0)) avisos.push("La zona «" + z.id + "» tiene lado 0.");
    } else {
      if (!(z.ancho.valor > 0)) avisos.push("La zona «" + z.id + "» tiene ancho 0.");
      if (!(z.alto.valor  > 0)) avisos.push("La zona «" + z.id + "» tiene alto 0.");
    }
  }

  // Referencias a nodos que no existen. Se comprueba aquí y no al resolver
  // porque es un error de configuración, no de geometría: no depende de la
  // talla y hay que verlo al editar.
  var enlaces = arcos(anclaje);
  for (i = 0; i < enlaces.length; i++) {
    if (!vistos[enlaces[i].hacia]) {
      errores.push("«" + etiqueta(enlaces[i].desde) + "» apunta a «" +
                   etiqueta(enlaces[i].hacia) + "», que no existe.");
    }
  }

  return { errores: errores, avisos: avisos };
}

function etiqueta(clave) {
  var p = String(clave).split(":");
  return (p[0] === "zona" ? "zona " : "ancla ") + p.slice(1).join(":");
}

// ---- arcos del grafo ----------------------------------------
// Un arco va del nodo que necesita al nodo del que depende.
function arcos(anclaje) {
  var salida = [], i, d;

  for (i = 0; i < anclaje.anclas.length; i++) {
    var a = anclaje.anclas[i];
    var claveA = "ancla:" + a.id;
    d = a.x ? refs.dependenciaDe(a.x.ref) : null;
    if (d) salida.push({ desde: claveA, hacia: d, porQue: "X" });
    d = a.y ? refs.dependenciaDe(a.y.ref) : null;
    if (d) salida.push({ desde: claveA, hacia: d, porQue: "Y" });
  }

  for (i = 0; i < anclaje.zonas.length; i++) {
    var z = anclaje.zonas[i];
    var claveZ = "zona:" + z.id;
    if (z.anclaX) salida.push({ desde: claveZ, hacia: "ancla:" + z.anclaX, porQue: "X" });
    if (z.anclaY && z.anclaY !== z.anclaX) {
      salida.push({ desde: claveZ, hacia: "ancla:" + z.anclaY, porQue: "Y" });
    }
  }
  return salida;
}

// ---- orden topológico (Kahn) --------------------------------
// Se van sacando los nodos que ya no dependen de nada pendiente. Lo que
// quede al final está metido en un ciclo.
function ordenar(anclaje) {
  var nodos = [], i;
  for (i = 0; i < anclaje.anclas.length; i++) if (anclaje.anclas[i].id) nodos.push("ancla:" + anclaje.anclas[i].id);
  for (i = 0; i < anclaje.zonas.length;  i++) if (anclaje.zonas[i].id)  nodos.push("zona:"  + anclaje.zonas[i].id);

  var existe = {};
  for (i = 0; i < nodos.length; i++) existe[nodos[i]] = true;

  var enlaces = arcos(anclaje);
  var pendientes = {}, hijos = {};
  for (i = 0; i < nodos.length; i++) { pendientes[nodos[i]] = 0; hijos[nodos[i]] = []; }

  for (i = 0; i < enlaces.length; i++) {
    var e = enlaces[i];
    // Un arco a un nodo inexistente ya lo denunció validar(): aquí se
    // ignora para poder ordenar el resto en vez de bloquearlo todo.
    if (!existe[e.desde] || !existe[e.hacia]) continue;
    pendientes[e.desde]++;
    hijos[e.hacia].push(e.desde);
  }

  var cola = [], orden = [];
  for (i = 0; i < nodos.length; i++) if (pendientes[nodos[i]] === 0) cola.push(nodos[i]);

  while (cola.length) {
    var n = cola.shift();
    orden.push(n);
    for (i = 0; i < hijos[n].length; i++) {
      pendientes[hijos[n][i]]--;
      if (pendientes[hijos[n][i]] === 0) cola.push(hijos[n][i]);
    }
  }

  var atrapados = [];
  for (i = 0; i < nodos.length; i++) {
    if (pendientes[nodos[i]] > 0) atrapados.push(nodos[i]);
  }

  return {
    orden  : orden,
    ciclos : atrapados.length ? buscarCiclos(atrapados, enlaces) : []
  };
}

// Los nodos atrapados dicen QUE hay un ciclo; esto dice CUÁL. Se recorre
// en profundidad desde cada atrapado hasta volver a pisar el mismo nodo, y
// se devuelve ese camino. Un mensaje que dice
//   "SPONSOR → BOLSILLO → SPONSOR"
// se corrige solo; un "dependencia circular detectada" hay que investigarlo.
function buscarCiclos(atrapados, enlaces) {
  var salidas = {};
  for (var i = 0; i < enlaces.length; i++) {
    if (!salidas[enlaces[i].desde]) salidas[enlaces[i].desde] = [];
    salidas[enlaces[i].desde].push(enlaces[i].hacia);
  }

  var encontrados = [], yaContado = {};

  for (var a = 0; a < atrapados.length; a++) {
    if (yaContado[atrapados[a]]) continue;
    var camino = recorrer(atrapados[a], atrapados[a], [], {}, salidas, 0);
    if (!camino) continue;
    for (var c = 0; c < camino.length; c++) yaContado[camino[c]] = true;
    encontrados.push(camino);
  }
  return encontrados;
}

function recorrer(actual, objetivo, camino, visitados, salidas, prof) {
  if (prof > 64) return null;                 // red de seguridad
  camino = camino.concat([actual]);
  var siguientes = salidas[actual] || [];
  for (var i = 0; i < siguientes.length; i++) {
    if (siguientes[i] === objetivo) return camino;
    if (visitados[siguientes[i]]) continue;
    visitados[siguientes[i]] = true;
    var r = recorrer(siguientes[i], objetivo, camino, visitados, salidas, prof + 1);
    if (r) return r;
  }
  return null;
}

// La cadena de la que cuelga un nodo, hacia arriba, hasta la moldería.
// Es lo que se enseña en el panel: "Moldería → A1 → BOLSILLO → A2 → SPONSOR".
function cadenaDe(anclaje, clave, prof) {
  prof = prof || 0;
  if (prof > 32) return [clave];
  var enlaces = arcos(anclaje);
  for (var i = 0; i < enlaces.length; i++) {
    if (enlaces[i].desde === clave) {
      return cadenaDe(anclaje, enlaces[i].hacia, prof + 1).concat([clave]);
    }
  }
  return ["molderia", clave];
}

export {
  ORIGENES,
  MODOS_CRUCE,
  TIPOS_ZONA,
  normalizar,
  validar,
  arcos,
  ordenar,
  etiqueta,
  cadenaDe
};
