"use strict";

// ============================================================
// REFERENCIAS — a qué se agarra un punto de ancla
// ============================================================
// Puerto EXACTO de UNIFLOW/programa/cerebro/src/anclaje/referencias.js.
// Solo cambia el envoltorio de módulo; la lógica y los comentarios de abajo
// son los originales del panel de Illustrator.
//
// Una referencia NO es una coordenada: es la descripción de un rasgo real
// de la geometría que se puede volver a encontrar en otra talla.
//
// REGLA 3 DEL PROYECTO, HECHA CÓDIGO: aquí no se adivina nada. El sistema
// no "reconoce" una sisa ni un cuello: reconoce lo que de verdad existe y
// es identificable sin interpretación —el contorno, sus vértices, los
// piquetes sueltos, los extremos— y el diseñador es quien dice cuál de
// esos rasgos es la sisa poniéndole nombre a SU ancla.
//
// Por eso cada referencia guarda además una HUELLA de verificación (el
// número de puntos del contorno, o cuántos piquetes había). Al resolver en
// otra talla se comprueba la huella: si la pieza gradada tiene otro número
// de vértices, el vértice 12 de la M no es el vértice 12 de la XL, y eso
// se dice en voz alta en vez de colocar el nombre en cualquier parte.
//
// Sistema de coordenadas: CENTÍMETROS DESDE LA ESQUINA SUPERIOR IZQUIERDA
// DE LA PIEZA, con la Y creciendo HACIA ABAJO. Es el mismo convenio que ya
// usa aplicarPlan() en host.jsx (y el que ya usaba CanvasZonas.jsx acá).
// La conversión a coordenadas de Illustrator (donde la Y crece hacia
// arriba) la hace el .jsx, no esta capa -- acá tampoco hace falta: el
// backend web solo consume el resultado en cm.
//
// GEOMETRÍA QUE ESPERA ESTE MÓDULO, por pieza:
//   { pieza: {ancho_cm, alto_cm}, vertices: [{x,y}], piquetes: [{x,y,
//     ancho_cm,alto_cm}], extremos: {arriba,abajo,izquierda,derecha:{x,y}},
//     salientes: [{x,y}] }
// `vertices` ya lo tiene UNIFLOW WEB (es el `poligonoMm` de cada Pieza,
// convertido a cm en el mismo sistema de coordenadas -- ver
// motor/geometriaAnclaje.js). `piquetes`/`extremos`/`salientes` NO se
// calculan todavía (el importador DXF/PDF no los extrae por separado del
// contorno); una referencia de esos tipos falla con un mensaje claro en
// vez de romper, exactamente como ya preveía este módulo para "esta talla
// no tiene el rasgo medido" -- no hizo falta tocar una sola línea de la
// lógica de abajo para ese caso.

// ---- partes de una caja -------------------------------------
// Toda referencia con área (el contorno de la pieza, un piquete, otra
// zona) se reduce a UN PUNTO eligiendo su parte. Cada parte es un punto
// completo (x, y); cuando la relación solo usa un eje, se toma el
// componente que toque. Así no hace falta un sistema de alineaciones:
// "centrado horizontalmente" es simplemente tomar la X de `centro`.
var PARTES = {
  centro       : function (c) { return { x: c.x + c.ancho / 2, y: c.y + c.alto / 2 }; },
  arriba       : function (c) { return { x: c.x + c.ancho / 2, y: c.y }; },
  abajo        : function (c) { return { x: c.x + c.ancho / 2, y: c.y + c.alto }; },
  izquierda    : function (c) { return { x: c.x,               y: c.y + c.alto / 2 }; },
  derecha      : function (c) { return { x: c.x + c.ancho,     y: c.y + c.alto / 2 }; },
  supIzq       : function (c) { return { x: c.x,               y: c.y }; },
  supDer       : function (c) { return { x: c.x + c.ancho,     y: c.y }; },
  infIzq       : function (c) { return { x: c.x,               y: c.y + c.alto }; },
  infDer       : function (c) { return { x: c.x + c.ancho,     y: c.y + c.alto }; }
};

// Nombres legibles, para la interfaz y para los mensajes de error.
var NOMBRES_PARTE = {
  centro: "centro", arriba: "borde superior", abajo: "borde inferior",
  izquierda: "borde izquierdo", derecha: "borde derecho",
  supIzq: "esquina superior izquierda", supDer: "esquina superior derecha",
  infIzq: "esquina inferior izquierda", infDer: "esquina inferior derecha"
};

function partesDisponibles() {
  var lista = [];
  for (var k in PARTES) if (Object.prototype.hasOwnProperty.call(PARTES, k)) lista.push(k);
  return lista;
}

function puntoDeCaja(caja, parte) {
  var f = PARTES[parte || "centro"];
  if (!f) f = PARTES.centro;
  return f(caja);
}

// ---- errores con causa --------------------------------------
// No se lanza un Error genérico: se devuelve un objeto que dice qué
// referencia falló y por qué, para poder enseñarlo en el panel al lado de
// la zona afectada.
function fallo(texto, detalle) {
  return { ok: false, texto: texto, detalle: detalle || null };
}
function logro(punto, caja, descripcion, aviso) {
  return { ok: true, punto: punto, caja: caja || null,
           descripcion: descripcion || "", aviso: aviso || null };
}

// ============================================================
// ENCONTRAR EL MISMO RASGO EN OTRA TALLA
// ============================================================
// EL PROBLEMA REAL, visto en produccion: un ancla puesta sobre el extremo
// nº 6 de una L dejaba de resolver en la 4XL porque alli el detector
// encontraba 8 y no 9. La pieza era la misma y la sisa estaba en el mismo
// sitio, pero el sistema decia que no sabia cual era. Inservible.
//
// La culpa es de identificar el rasgo SOLO por su puesto en una lista que
// produce un detector con umbrales: basta que una curva sea un pelin mas
// suave en otra talla para que un punto entre o salga, y todos los indices
// posteriores se corren.
//
// La identidad buena es DONDE ESTA, no en que puesto quedo. Al crear el
// ancla se guarda tambien su posicion RELATIVA en la pieza (rx, ry de 0 a
// 1). Al resolver:
//
//   1. si el numero de rasgos coincide, manda el indice: es exacto.
//   2. si no coincide, se busca el mas cercano a esa posicion relativa. Si
//      hay uno claramente mas cerca que los demas, se usa Y SE AVISA.
//   3. si no hay ninguno cerca, o hay dos igual de cerca, se PARA.
//
// El paso 3 mantiene la promesa: no se coloca a ojo. El paso 2 es el que
// hace el sistema utilizable, porque el caso normal es que el rasgo siga
// donde estaba y solo haya cambiado la cuenta.
var TOLERANCIA_REL = 0.09;   // 9% de la pieza
var MARGEN_DUDA    = 1.6;    // el elegido tiene que estar 1.6x mas cerca que el siguiente

function emparejarPorPosicion(lista, ref, queEs, nombrePieza) {
  if (typeof ref.rx !== "number" || typeof ref.ry !== "number") {
    return fallo(
      "«" + nombrePieza + "» tiene " + lista.length + " " + queEs + "(s) en esta talla y el " +
      "ancla se definió sobre una pieza con " + ref.total + ". Ese ancla es anterior a la " +
      "versión que guarda la posición, así que no puedo emparejarlo.",
      "Vuelve a colocarlo: los nuevos sí sobreviven a que cambie la cuenta.");
  }

  var mejor = -1, dMejor = 0, dSegundo = -1, i;
  for (i = 0; i < lista.length; i++) {
    var rx = (typeof lista[i].rx === "number") ? lista[i].rx : 0;
    var ry = (typeof lista[i].ry === "number") ? lista[i].ry : 0;
    var dx = rx - ref.rx, dy = ry - ref.ry;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (mejor < 0 || d < dMejor) { dSegundo = dMejor; dMejor = d; mejor = i; }
    else if (dSegundo < 0 || d < dSegundo) { dSegundo = d; }
  }

  if (mejor < 0 || dMejor > TOLERANCIA_REL) {
    return fallo(
      "En esta talla no hay ningún " + queEs + " donde estaba el de «" + nombrePieza + "»" +
      (mejor >= 0 ? (" (el más cercano queda a " + Math.round(dMejor * 100) + "% de la pieza)") : "") + ".",
      "El contorno cambió de forma entre tallas. Mira esa pieza en la moldería.");
  }
  if (lista.length > 1 && dSegundo >= 0 && dSegundo < dMejor * MARGEN_DUDA) {
    return fallo(
      "En esta talla hay dos " + queEs + "s casi igual de cerca de donde pusiste el ancla " +
      "sobre «" + nombrePieza + "». No elijo por ti.",
      "Usa un piquete, o mueve el ancla a un punto que no tenga otro al lado.");
  }
  return { ok: true, indice: mejor, distancia: dMejor };
}

function avisoDeEmparejado(queEs, ref, indice, total, distancia) {
  return "se emparejó por posición con el " + queEs + " " + (indice + 1) + " de " + total +
         " (se puso sobre el " + ((ref.indice || 0) + 1) + " de " + ref.total + ", y está a " +
         Math.round(distancia * 100) + "% de allí). Compruébalo.";
}

// ---- caja del contorno de la pieza --------------------------
// Por definición, la esquina superior izquierda de la pieza es el origen.
function cajaDePieza(geo) {
  return { x: 0, y: 0, ancho: geo.pieza.ancho_cm, alto: geo.pieza.alto_cm };
}

// ============================================================
// RESOLVER UNA REFERENCIA
// ============================================================
// ctx = {
//   geometria : { "ESPALDAS": geo, ... }   geometría medida de cada pieza
//   pieza     : "ESPALDAS"                 pieza a la que pertenece el nodo
//   anclas    : { id: {x,y} }              anclas YA resueltas
//   zonas     : { id: {x,y,ancho,alto} }   zonas YA resueltas
// }
//
// Devuelve { ok, punto, caja, descripcion } o { ok:false, texto }.
function resolverReferencia(ref, ctx) {
  if (!ref || !ref.tipo) return fallo("La referencia no dice de qué tipo es.");

  // Una referencia puede apuntar a otra pieza (por ejemplo, centrar algo
  // de la manga respecto al ancho de la espalda). Por defecto, la suya.
  var nombrePieza = ref.pieza || ctx.pieza;
  var geo = ctx.geometria ? ctx.geometria[nombrePieza] : null;

  switch (ref.tipo) {

    // ---- el contorno de la pieza ---------------------------
    // El más simple y el único que NUNCA falla: la caja de la pieza existe
    // en todas las tallas. Es el que resuelve "centrado horizontalmente
    // respecto a la pieza" del punto 13 del enunciado.
    case "contorno":
      if (!geo) return fallo("No tengo la geometría de la pieza «" + nombrePieza + "».");
      return logro(puntoDeCaja(cajaDePieza(geo), ref.parte), cajaDePieza(geo),
                   "contorno de " + nombrePieza + " · " + (NOMBRES_PARTE[ref.parte] || "centro"));

    // ---- un extremo del contorno ---------------------------
    // El punto más alto / bajo / izquierdo / derecho del trazo real, que no
    // es lo mismo que la esquina de la caja: en una manga, el punto más
    // alto está en mitad de la copa, no en la esquina.
    case "extremo":
      if (!geo) return fallo("No tengo la geometría de la pieza «" + nombrePieza + "».");
      if (!geo.extremos || !geo.extremos[ref.parte]) {
        return fallo("La pieza «" + nombrePieza + "» no tiene medido el extremo «" +
                     ref.parte + "».");
      }
      var e = geo.extremos[ref.parte];
      return logro({ x: e.x, y: e.y }, null,
                   "extremo " + ref.parte + " de " + nombrePieza);

    // ---- un vértice del contorno ---------------------------
    // Los vértices son los puntos de ancla del trazo. Se identifican por su
    // ÍNDICE, que es estable entre tallas porque el gradado mueve los
    // mismos puntos en vez de redibujarlos... pero eso hay que
    // COMPROBARLO, no suponerlo. De ahí la huella `puntos`.
    case "vertice":
      if (!geo) return fallo("No tengo la geometría de la pieza «" + nombrePieza + "».");
      var vs = geo.vertices || [];
      if (!vs.length) return fallo("La pieza «" + nombrePieza + "» no tiene vértices medidos.");
      if (typeof ref.puntos === "number" && ref.puntos !== vs.length) {
        return fallo(
          "El contorno de «" + nombrePieza + "» tiene " + vs.length + " vértices y este " +
          "ancla se definió sobre uno de " + ref.puntos + ". El vértice nº " + ref.indice +
          " de una talla no es el mismo de la otra: no lo doy por bueno.",
          "Vuelve a colocar el ancla sobre un piquete o sobre el contorno, que son " +
          "referencias que sí sobreviven al gradado.");
      }
      if (!(ref.indice >= 0) || ref.indice >= vs.length) {
        return fallo("El vértice nº " + ref.indice + " no existe en «" + nombrePieza +
                     "» (tiene " + vs.length + ").");
      }
      var v = vs[ref.indice];
      return logro({ x: v.x, y: v.y }, null,
                   "vértice " + ref.indice + " de " + nombrePieza);

    // ---- un saliente del contorno --------------------------
    // Los sitios donde el contorno "da la vuelta": punta del hombro, fondo
    // de sisa, ancho de pecho. Los mide host.jsx recorriendo la CURVA, no
    // los nodos, y los ordena por angulo -- el mismo criterio estable que
    // los piquetes. Y con la misma huella: si la talla nueva tiene otro
    // numero de salientes, el 3 de una no es el 3 de la otra.
    case "saliente":
      if (!geo) return fallo("No tengo la geometría de la pieza «" + nombrePieza + "».");
      var sl = geo.salientes || [];
      if (!sl.length) {
        return fallo("La pieza «" + nombrePieza + "» no tiene salientes reconocibles: su " +
                     "contorno no da la vuelta en ningún sitio marcado.");
      }
      var iSl = ref.indice, avisoSl = null;
      if (typeof ref.total === "number" && ref.total !== sl.length) {
        var emSl = emparejarPorPosicion(sl, ref, "extremo", nombrePieza);
        if (!emSl.ok) return emSl;
        iSl = emSl.indice;
        avisoSl = avisoDeEmparejado("extremo", ref, iSl, sl.length, emSl.distancia);
      }
      if (!(iSl >= 0) || iSl >= sl.length) {
        return fallo("El extremo nº " + (iSl + 1) + " no existe en «" + nombrePieza +
                     "» (tiene " + sl.length + ").");
      }
      return logro({ x: sl[iSl].x, y: sl[iSl].y }, null,
                   "extremo " + (iSl + 1) + " de " + nombrePieza, avisoSl);

    // ---- un piquete ----------------------------------------
    // Los piquetes son sub-trazos sueltos DE VERDAD dentro de la pieza (el
    // proyecto ya los conoce: molde + contorno láser + piquetes). Se
    // ordenan de forma estable —por ángulo alrededor del centro de la
    // pieza— y se identifican por posición en ese orden. La huella es
    // cuántos había: si la talla nueva trae otro número, el piquete 3 ya no
    // es el mismo y se dice.
    case "piquete":
      if (!geo) return fallo("No tengo la geometría de la pieza «" + nombrePieza + "».");
      var ps = geo.piquetes || [];
      if (!ps.length) {
        return fallo("La pieza «" + nombrePieza + "» no tiene piquetes reconocibles en esta talla.");
      }
      var iPq = ref.indice, avisoPq = null;
      if (typeof ref.total === "number" && ref.total !== ps.length) {
        var emPq = emparejarPorPosicion(ps, ref, "piquete", nombrePieza);
        if (!emPq.ok) return emPq;
        iPq = emPq.indice;
        avisoPq = avisoDeEmparejado("piquete", ref, iPq, ps.length, emPq.distancia);
      }
      if (!(iPq >= 0) || iPq >= ps.length) {
        return fallo("El piquete nº " + (iPq + 1) + " no existe en «" + nombrePieza +
                     "» (tiene " + ps.length + ").");
      }
      var pq = ps[iPq];
      // OJO CON EL ORIGEN: la geometría da el piquete por su CENTRO (así lo
      // mide host.jsx: (bb[0]+bb[2])/2), mientras que puntoDeCaja() espera
      // la esquina superior izquierda. Sin restar media caja, la parte
      // "centro" caía media anchura más allá — 1.5 mm de más en un piquete
      // de 3 mm, en todas las zonas que colgaran de él.
      var anPq = pq.ancho_cm || 0, alPq = pq.alto_cm || 0;
      var cajaPq = { x: pq.x - anPq / 2, y: pq.y - alPq / 2, ancho: anPq, alto: alPq };
      return logro(puntoDeCaja(cajaPq, ref.parte || "centro"), cajaPq,
                   "piquete " + (iPq + 1) + " de " + nombrePieza, avisoPq);

    // ---- otra zona (punto 10, 11 y 12 del enunciado) -------
    // Una zona ya resuelta es una caja, y una caja tiene centro, bordes y
    // esquinas: exactamente las referencias que pide el enunciado. Así se
    // encadena  moldería → ancla → zona → ancla → zona  sin ningún
    // mecanismo nuevo.
    case "zona":
      var zc = ctx.zonas ? ctx.zonas[ref.zona] : null;
      if (!zc) {
        return fallo("La zona «" + ref.zona + "» no está resuelta todavía (o no existe).");
      }
      return logro(puntoDeCaja(zc, ref.parte), zc,
                   "zona " + ref.zona + " · " + (NOMBRES_PARTE[ref.parte] || "centro"));

    // ---- otro punto de ancla -------------------------------
    // Es lo que permite que una zona tome la X de un ancla y la Y de otra:
    // la intersección del punto 7 del enunciado sale sola, sin proyectar
    // rectas ni calcular cortes.
    case "ancla":
      var ac = ctx.anclas ? ctx.anclas[ref.ancla] : null;
      if (!ac) {
        return fallo("El punto de ancla «" + ref.ancla + "» no está resuelto todavía (o no existe).");
      }
      return logro({ x: ac.x, y: ac.y }, null, "ancla " + ref.ancla);
  }

  return fallo("Tipo de referencia desconocido: «" + ref.tipo + "».");
}

// Texto corto para la interfaz, sin necesidad de resolver nada.
//
// Los índices se cuentan DESDE 1 al escribirlos. Internamente van desde 0
// —es la posición en el arreglo— pero el lienzo dice «Piquete 1 de 3» y el
// editor decía «piquete nº 0»: la misma cosa con dos nombres. Quien mira
// la pantalla no tiene por qué saber que existe un arreglo.
function describirReferencia(ref) {
  if (!ref || !ref.tipo) return "sin referencia";
  var parte = NOMBRES_PARTE[ref.parte] || null;
  var deN;
  switch (ref.tipo) {
    case "contorno": return "el contorno de la pieza" + (parte ? " · " + parte : "");
    case "extremo":  return "el " + nombreDeExtremo(ref.parte);
    case "vertice":
      deN = (typeof ref.puntos === "number") ? (" de " + ref.puntos) : "";
      return "el vértice " + ((ref.indice || 0) + 1) + deN;
    case "saliente":
      deN = (typeof ref.total === "number") ? (" de " + ref.total) : "";
      return "el extremo " + ((ref.indice || 0) + 1) + deN;
    case "piquete":
      deN = (typeof ref.total === "number") ? (" de " + ref.total) : "";
      return "el piquete " + ((ref.indice || 0) + 1) + deN + (parte ? " · " + parte : "");
    case "zona":     return "la zona " + ref.zona + (parte ? " · " + parte : "");
    case "ancla":    return "el ancla " + ref.ancla;
  }
  return ref.tipo;
}

function nombreDeExtremo(parte) {
  if (parte === "arriba")    return "punto más alto del contorno";
  if (parte === "abajo")     return "punto más bajo del contorno";
  if (parte === "izquierda") return "punto más a la izquierda del contorno";
  if (parte === "derecha")   return "punto más a la derecha del contorno";
  return "extremo del contorno";
}

// De qué otro nodo depende una referencia (para el grafo). Las referencias
// a la geometría no dependen de nada: son la raíz.
function dependenciaDe(ref) {
  if (!ref) return null;
  if (ref.tipo === "zona"  && ref.zona)  return "zona:"  + ref.zona;
  if (ref.tipo === "ancla" && ref.ancla) return "ancla:" + ref.ancla;
  return null;
}

export {
  NOMBRES_PARTE as PARTES_NOMBRE,
  partesDisponibles,
  puntoDeCaja,
  cajaDePieza,
  resolverReferencia,
  describirReferencia,
  dependenciaDe
};
