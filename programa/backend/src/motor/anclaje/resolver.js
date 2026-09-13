"use strict";

// ============================================================
// RESOLUTOR — de relaciones a coordenadas, para UNA talla
// ============================================================
// Puerto EXACTO de UNIFLOW/programa/cerebro/src/anclaje/resolver.js. Solo
// cambia el envoltorio de módulo; la lógica y los comentarios de abajo son
// los originales.
//
// Esta es la idea central del enunciado, dicha con sus palabras:
//
//   «No quiero guardar posiciones. Quiero guardar relaciones que permitan
//    reconstruir las posiciones.»
//
// Aquí están las cuentas que reconstruyen. Entra el grafo de relaciones
// (que no cambia nunca) más la geometría REAL de la talla que toque, y sale
// la lista de puntos y cajas en centímetros. Para otra talla se vuelve a
// llamar con otra geometría: el grafo es el mismo.
//
// POR QUÉ ESTÁ SEPARADO DE LA IMPORTACIÓN DE ARCHIVOS (regla 8 original):
// no toca ningún archivo ni pieza real, es aritmética sobre datos, así que
// se prueba con `npm run prueba` en segundos en vez de subiendo un DXF.
//
// Coordenadas: cm desde la esquina superior izquierda de la pieza, Y hacia
// abajo. Es el mismo convenio que ya usaban calibracion.js/exportarPdf.js
// en este backend -- no se inventó uno nuevo al portar este motor.

import * as refs from './referencias.js';
import * as grafo from './grafo.js';

// ---- una medida: fija o proporcional ------------------------
// "10 cm" o "el 40% del ancho de la pieza". El enunciado pide las dos para
// el tamaño de la zona, para el desplazamiento y para la distancia del
// ancla, así que es la misma cuenta en los tres sitios.
function medir(m, dimensionBase) {
  if (!m) return 0;
  if (m.modo === "proporcional") return m.valor * (dimensionBase || 0);
  return m.valor;
}

// ---- un eje de un ancla -------------------------------------
// De dónde sale la coordenada, y qué se conserva al cambiar de talla:
//
//   fijo         → 3 cm desde la sisa siguen siendo 3 cm en la XL
//   proporcional → el 20% del ancho de la pieza sigue siendo el 20%
//
// Cada eje tiene SU referencia. Ahí está la mitad del enunciado resuelta
// sin mecanismos nuevos: la "intersección de dos referencias" del punto 7
// es tomar la X de una y la Y de otra, y el "centrado horizontal respecto
// a la pieza" del punto 13 es poner en X la referencia `contorno/centro`.
function resolverEje(eje, cual, ctx, geo, avisos) {
  if (!eje || !eje.ref) {
    return { ok: false, texto: "falta la referencia " + (cual === "x" ? "horizontal" : "vertical") };
  }
  var r = refs.resolverReferencia(eje.ref, ctx);
  if (!r.ok) return r;
  // Un rasgo emparejado por posición (porque cambió la cuenta entre tallas)
  // no es un error, pero hay que verlo.
  if (r.aviso && avisos) avisos.push(r.aviso);

  var base;
  if (eje.base === "referencia" && r.caja) {
    base = (cual === "x") ? r.caja.ancho : r.caja.alto;
  } else {
    base = (cual === "x") ? geo.pieza.ancho_cm : geo.pieza.alto_cm;
  }

  var valor = (cual === "x" ? r.punto.x : r.punto.y) + medir(eje, base);
  return { ok: true, valor: valor, descripcion: r.descripcion, base: base };
}

// ---- la caja de una zona a partir de su punto de referencia --
// El punto 8 del enunciado: el usuario decide qué representa el punto.
// Sin sistema de alineaciones: una resta y ya.
function cajaDesdeOrigen(px, py, ancho, alto, origen) {
  var x = px, y = py;
  switch (origen) {
    case "supIzq":       x = px;             y = py;             break;
    case "supDer":       x = px - ancho;     y = py;             break;
    case "infIzq":       x = px;             y = py - alto;      break;
    case "infDer":       x = px - ancho;     y = py - alto;      break;
    case "centroArriba": x = px - ancho / 2; y = py;             break;
    case "centroAbajo":  x = px - ancho / 2; y = py - alto;      break;
    case "centroIzq":    x = px;             y = py - alto / 2;  break;
    case "centroDer":    x = px - ancho;     y = py - alto / 2;  break;
    default:             x = px - ancho / 2; y = py - alto / 2;  break;   // centro
  }
  return { x: x, y: y, ancho: ancho, alto: alto };
}

function r2(n) { return Math.round(n * 100) / 100; }

// ============================================================
// RESOLVER TODO EL GRAFO
// ============================================================
// geometria = { "ESPALDAS": { pieza:{ancho_cm,alto_cm}, vertices:[],
//                             piquetes:[], extremos:{} }, ... }
//
// NO LANZA EXCEPCIONES por datos: un ancla que no se puede resolver en
// esta talla deja fuera a sus zonas y se anota el motivo, pero las demás
// se resuelven igual. Regla 6: se para lo que hay que parar, se dice por
// qué, y no se adivina lo que falta.
function resolver(anclajeBruto, geometria, opciones) {
  opciones = opciones || {};
  var anclaje = grafo.normalizar(anclajeBruto);
  var comprobado = grafo.validar(anclaje);
  var orden = grafo.ordenar(anclaje);

  var salida = {
    talla     : opciones.talla || null,
    anclas    : {},      // id -> { x, y, pieza, nombre }
    zonas     : {},      // id -> { x, y, ancho, alto, pieza, nombre }
    lista     : { anclas: [], zonas: [] },
    errores   : comprobado.errores.slice(),
    avisos    : comprobado.avisos.slice(),
    sinResolver: [],     // nodos que no salieron, con su motivo
    orden     : orden.orden.slice()
  };

  // Un ciclo no se puede resolver de ninguna manera: no hay por dónde
  // empezar. Se bloquea entero y se dice cuál es el ciclo.
  for (var c = 0; c < orden.ciclos.length; c++) {
    var camino = [];
    for (var k = 0; k < orden.ciclos[c].length; k++) camino.push(grafo.etiqueta(orden.ciclos[c][k]));
    camino.push(camino[0]);
    salida.errores.push("Dependencia circular: " + camino.join(" → ") +
                        ". Ninguno de esos elementos tiene un punto de partida.");
  }

  var porId = { ancla: {}, zona: {} }, i;
  for (i = 0; i < anclaje.anclas.length; i++) porId.ancla[anclaje.anclas[i].id] = anclaje.anclas[i];
  for (i = 0; i < anclaje.zonas.length;  i++) porId.zona[anclaje.zonas[i].id]  = anclaje.zonas[i];

  var ctx = { geometria: geometria || {}, pieza: null, anclas: salida.anclas, zonas: salida.zonas };

  for (var o = 0; o < orden.orden.length; o++) {
    var clave = orden.orden[o];
    var partes = clave.split(":");
    var tipo = partes[0], id = partes.slice(1).join(":");

    if (tipo === "ancla") resolverAncla(porId.ancla[id], ctx, salida);
    else                  resolverZona(porId.zona[id],  ctx, salida, porId);
  }

  return salida;
}

function noSePudo(salida, clase, nodo, motivo, detalle) {
  salida.sinResolver.push({
    tipo: clase, id: nodo.id, pieza: nodo.pieza,
    motivo: motivo, detalle: detalle || null
  });
  salida.errores.push((clase === "ancla" ? "Ancla «" : "Zona «") + nodo.id + "»: " + motivo);
}

function resolverAncla(a, ctx, salida) {
  if (!a) return;
  var geo = ctx.geometria[a.pieza];
  if (!geo) {
    noSePudo(salida, "ancla", a, "no tengo la geometría de la pieza «" + a.pieza +
             "» en esta talla.");
    return;
  }
  ctx.pieza = a.pieza;

  var propios = [];
  var rx = resolverEje(a.x, "x", ctx, geo, propios);
  if (!rx.ok) { noSePudo(salida, "ancla", a, rx.texto, rx.detalle); return; }
  var ry = resolverEje(a.y, "y", ctx, geo, propios);
  if (!ry.ok) { noSePudo(salida, "ancla", a, ry.texto, ry.detalle); return; }
  // Sin repetir: los dos ejes suelen agarrarse al MISMO rasgo, así que el
  // mismo aviso llegaba dos veces por ancla.
  var dichos = {};
  for (var av = 0; av < propios.length; av++) {
    if (dichos[propios[av]]) continue;
    dichos[propios[av]] = true;
    salida.avisos.push("Ancla «" + a.id + "»: " + propios[av]);
  }

  var punto = {
    id: a.id, nombre: a.nombre, pieza: a.pieza,
    x: r2(rx.valor), y: r2(ry.valor),
    desdeX: rx.descripcion, desdeY: ry.descripcion
  };
  salida.anclas[a.id] = punto;
  salida.lista.anclas.push(punto);

  fueraDeLaPieza(salida, geo, "El ancla «" + a.id + "»",
                 { x: punto.x, y: punto.y, ancho: 0, alto: 0 });
}

function resolverZona(z, ctx, salida, porId) {
  if (!z) return;
  var geo = ctx.geometria[z.pieza];
  if (!geo) {
    noSePudo(salida, "zona", z, "no tengo la geometría de la pieza «" + z.pieza +
             "» en esta talla.");
    return;
  }
  ctx.pieza = z.pieza;

  var ax = salida.anclas[z.anclaX];
  var ay = salida.anclas[z.anclaY];
  if (!ax) {
    noSePudo(salida, "zona", z, "su ancla horizontal «" + z.anclaX +
             "» no se pudo resolver en esta talla.");
    return;
  }
  if (!ay) {
    noSePudo(salida, "zona", z, "su ancla vertical «" + z.anclaY +
             "» no se pudo resolver en esta talla.");
    return;
  }

  // Un LOGO con cruz activa (z.cruz, por defecto true) se define con una
  // sola medida ("lado"). Aquí se resuelve como un cuadrado ancho=alto=lado
  // -- es la intersección garantizada de la cruz, no la zona completa. Los
  // brazos de la cruz (para logos alargados) solo existen dentro de
  // colocarLogoEnZonaCruz() (host.jsx, programa\panel\), que recibe este
  // mismo "lado" y calcula los brazos con una proporción fija; aquí no hace
  // falta saber nada de eso, ancho=alto=lado basta para posicionar la zona
  // y para el chequeo de "se sale de la pieza". Con cruz desactivada, un
  // logo se resuelve exactamente como texto/numero: ancho y alto propios.
  var ancho, alto;
  if (z.tipo === "logo" && z.cruz) {
    ancho = alto = medir(z.lado, Math.min(geo.pieza.ancho_cm, geo.pieza.alto_cm));
  } else {
    ancho = medir(z.ancho, geo.pieza.ancho_cm);
    alto  = medir(z.alto,  geo.pieza.alto_cm);
  }

  // DE DÓNDE SALE EL PUNTO DE REFERENCIA cuando hay dos anclas cruzadas
  // (con una sola, ax === ay y da igual el modo):
  //   "esquina" (por defecto) -> la X de anclaX y la Y de anclaY. El
  //     rectángulo que forman ambas anclas tiene dos esquinas vacías;
  //     ésta es una — la otra sale de intercambiar anclaX/anclaY en el
  //     panel, no de un modo aparte.
  //   "medio" -> el punto medio entre las dos anclas, sin que importe cuál
  //     es anclaX y cuál es anclaY.
  var px, py;
  if (z.modoCruce === "medio" && z.anclaX !== z.anclaY) {
    px = (ax.x + ay.x) / 2 + medir(z.offset.x, geo.pieza.ancho_cm);
    py = (ax.y + ay.y) / 2 + medir(z.offset.y, geo.pieza.alto_cm);
  } else {
    // El desplazamiento posterior (puntos 5 y 9 del enunciado): la
    // relación con el ancla se conserva, y encima se corre lo que haga
    // falta. Fijo o proporcional, igual que todo lo demás.
    px = ax.x + medir(z.offset.x, geo.pieza.ancho_cm);
    py = ay.y + medir(z.offset.y, geo.pieza.alto_cm);
  }

  var caja = cajaDesdeOrigen(px, py, ancho, alto, z.origen);
  var res = {
    id: z.id, nombre: z.nombre, pieza: z.pieza,
    x: r2(caja.x), y: r2(caja.y), ancho: r2(caja.ancho), alto: r2(caja.alto),
    cx: r2(caja.x + caja.ancho / 2), cy: r2(caja.y + caja.alto / 2),
    origen: z.origen, anclaX: z.anclaX, anclaY: z.anclaY, modoCruce: z.modoCruce,
    tipo: z.tipo,
    muestra: (z.tipo === "logo") ? null : (z.muestra || null),
    // Solo se usan cuando tipo==="logo"; en los demás casos van como null,
    // sin problema (grafo.normalizarZona() ya los deja así por defecto).
    logoRuta: (z.tipo === "logo") ? (z.logoRuta || null) : null,
    cruz: (z.tipo === "logo") ? !!z.cruz : null,
    referencia: { x: r2(px), y: r2(py) }
  };

  salida.zonas[z.id] = res;
  salida.lista.zonas.push(res);

  fueraDeLaPieza(salida, geo, "La zona «" + z.id + "»", caja);
}

// Una zona que se sale del molde no es un error de configuración: es una
// consecuencia legítima de haber cambiado de talla, y el diseñador tiene
// que verla. Se avisa con el desbordamiento medido, no con un "revisa".
function fueraDeLaPieza(salida, geo, quien, caja) {
  var W = geo.pieza.ancho_cm, H = geo.pieza.alto_cm;
  var fuera = [];
  if (caja.x < -0.01)                     fuera.push(r2(-caja.x) + " cm por la izquierda");
  if (caja.y < -0.01)                     fuera.push(r2(-caja.y) + " cm por arriba");
  if (caja.x + caja.ancho > W + 0.01)     fuera.push(r2(caja.x + caja.ancho - W) + " cm por la derecha");
  if (caja.y + caja.alto  > H + 0.01)     fuera.push(r2(caja.y + caja.alto  - H) + " cm por abajo");
  if (fuera.length) {
    salida.avisos.push(quien + " se sale del contorno de " + (geo.nombre || "la pieza") +
                       ": " + fuera.join(", ") + ".");
  }
}

// ---- comparar dos tallas ------------------------------------
// Lo que de verdad hay que poder mirar antes de producir: la misma zona
// resuelta en dos tallas, una al lado de la otra. Si algo se descoloca al
// gradar, se ve aquí y no en la prenda cortada.
function comparar(anclaje, geometriaA, geometriaB, tallaA, tallaB) {
  var a = resolver(anclaje, geometriaA, { talla: tallaA });
  var b = resolver(anclaje, geometriaB, { talla: tallaB });
  var filas = [];

  for (var i = 0; i < a.lista.zonas.length; i++) {
    var za = a.lista.zonas[i];
    var zb = b.zonas[za.id];
    filas.push({
      zona  : za.id,
      pieza : za.pieza,
      a     : { talla: tallaA, x: za.cx, y: za.cy, ancho: za.ancho, alto: za.alto },
      b     : zb ? { talla: tallaB, x: zb.cx, y: zb.cy, ancho: zb.ancho, alto: zb.alto } : null,
      dx    : zb ? r2(zb.cx - za.cx) : null,
      dy    : zb ? r2(zb.cy - za.cy) : null
    });
  }
  return { a: a, b: b, filas: filas };
}

export {
  medir,
  cajaDesdeOrigen,
  resolver,
  comparar
};
