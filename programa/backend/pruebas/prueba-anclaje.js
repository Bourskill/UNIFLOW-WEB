"use strict";

// ============================================================
// Pruebas del motor de anclaje (puerto EXACTO de las pruebas del panel de
// Illustrator: UNIFLOW/programa/cerebro/pruebas/prueba-anclaje.js)
// ============================================================
// La pregunta que responden todas: SI CAMBIO DE TALLA, ¿la relación se
// mantiene? Por eso cada caso se resuelve DOS VECES, con la geometría de
// una M y con la de una XL, y se compara el resultado.
//
// Las geometrías son sintéticas a propósito: aquí se prueba la aritmética
// de las relaciones, no la lectura de un DXF/PDF real. Medir un archivo
// real es tarea de motor/geometriaAnclaje.js y de los importadores.
//
// Correr con: npm run prueba (desde programa/backend).

import * as grafo from '../src/motor/anclaje/grafo.js';
import * as resolver from '../src/motor/anclaje/resolver.js';
import * as refsMod from '../src/motor/anclaje/referencias.js';

var fallos = 0, pasadas = 0;
function comprobar(desc, cond, detalle) {
  if (cond) { pasadas++; console.log("  ✓ " + desc); }
  else { fallos++; console.log("  ✗ " + desc + (detalle ? "\n      " + detalle : "")); }
}
function casi(a, b, tol) { return Math.abs(a - b) <= (tol === undefined ? 0.011 : tol); }

// ---- dos tallas de la misma pieza ---------------------------
// Una espalda gradada: el ancho crece más que el largo, como en la
// realidad. Los piquetes acompañan al gradado.
function espalda(ancho, alto, sisaX, sisaY, nPiquetes, nVertices) {
  var piquetes = [{ x: sisaX, y: sisaY, ancho_cm: 0.3, alto_cm: 0.3 }];
  if (nPiquetes > 1) piquetes.push({ x: ancho - sisaX, y: sisaY, ancho_cm: 0.3, alto_cm: 0.3 });
  if (nPiquetes > 2) piquetes.push({ x: ancho / 2, y: alto, ancho_cm: 0.3, alto_cm: 0.3 });

  var vertices = [];
  for (var i = 0; i < nVertices; i++) {
    vertices.push({ x: (ancho * i) / Math.max(nVertices - 1, 1), y: (i % 2) * alto });
  }

  return {
    nombre  : "ESPALDA",
    pieza   : { ancho_cm: ancho, alto_cm: alto },
    vertices: vertices,
    piquetes: piquetes,
    extremos: {
      arriba:    { x: ancho / 2, y: 0 },
      abajo:     { x: ancho / 2, y: alto },
      izquierda: { x: 0, y: alto * 0.45 },
      derecha:   { x: ancho, y: alto * 0.45 }
    }
  };
}

var GEO_M  = { ESPALDA: espalda(60, 78, 5,   20,   2, 12) };
var GEO_XL = { ESPALDA: espalda(66, 82, 5.5, 21.5, 2, 12) };

// ============================================================
console.log("\n--- Distancia fija: se conserva en centímetros ---");
// «3 cm desde la sisa» tienen que seguir siendo 3 cm en la XL.

var fijo = {
  anclas: [{
    id: "A_SISA", nombre: "Bajo la sisa izquierda", pieza: "ESPALDA",
    x: { ref: { tipo: "piquete", indice: 0, total: 2 }, modo: "fijo", valor: 0 },
    y: { ref: { tipo: "piquete", indice: 0, total: 2 }, modo: "fijo", valor: 3 }
  }],
  zonas: []
};

var rM  = resolver.resolver(fijo, GEO_M,  { talla: "M" });
var rXL = resolver.resolver(fijo, GEO_XL, { talla: "XL" });

comprobar("Sin errores en ninguna de las dos tallas",
  rM.errores.length === 0 && rXL.errores.length === 0,
  "M=[" + rM.errores.join(" | ") + "] XL=[" + rXL.errores.join(" | ") + "]");
// La geometría da el piquete por su CENTRO, no por su esquina. Si el
// resolutor lo tratara como esquina, «centro» caería media caja más allá:
// 1.5 mm de desplazamiento en todas las zonas que colgaran de él. Salió en
// el simulador del navegador, con el número delante.
comprobar("El centro de un piquete es el centro, no la esquina",
  casi(rM.anclas.A_SISA.x, 5) && casi(rM.anclas.A_SISA.y, 20 + 3),
  "x=" + rM.anclas.A_SISA.x + " y=" + rM.anclas.A_SISA.y);
comprobar("En M el ancla cae 3 cm bajo el piquete",
  casi(rM.anclas.A_SISA.y, 20 + 3),
  "y=" + rM.anclas.A_SISA.y);
comprobar("En XL sigue cayendo 3 cm bajo SU piquete (no en el mismo sitio absoluto)",
  casi(rXL.anclas.A_SISA.y, 21.5 + 3) &&
  rXL.anclas.A_SISA.y !== rM.anclas.A_SISA.y,
  "M=" + rM.anclas.A_SISA.y + " XL=" + rXL.anclas.A_SISA.y);
comprobar("La distancia física es idéntica en las dos tallas",
  casi((rM.anclas.A_SISA.y - 20), (rXL.anclas.A_SISA.y - 21.5)));

// Los bordes de la caja del piquete también tienen que salir de su centro.
var bordePq = {
  anclas: [{ id: "A_B", pieza: "ESPALDA",
    x: { ref: { tipo: "piquete", indice: 0, total: 2, parte: "izquierda" }, modo: "fijo", valor: 0 },
    y: { ref: { tipo: "piquete", indice: 0, total: 2, parte: "abajo" },     modo: "fijo", valor: 0 } }],
  zonas: []
};
var bp = resolver.resolver(bordePq, GEO_M).anclas.A_B;
comprobar("El borde izquierdo del piquete está media caja a la izquierda de su centro",
  casi(bp.x, 5 - 0.15) && casi(bp.y, 20 + 0.15), "x=" + bp.x + " y=" + bp.y);

// ============================================================
console.log("\n--- Distancia proporcional: se conserva el porcentaje ---");

var prop = {
  anclas: [{
    id: "A_PROP", pieza: "ESPALDA",
    x: { ref: { tipo: "contorno", parte: "supIzq" }, modo: "proporcional", valor: 0.20 },
    y: { ref: { tipo: "contorno", parte: "supIzq" }, modo: "proporcional", valor: 0.35 }
  }],
  zonas: []
};
var pM  = resolver.resolver(prop, GEO_M).anclas.A_PROP;
var pXL = resolver.resolver(prop, GEO_XL).anclas.A_PROP;

comprobar("En M el 20% del ancho son 12 cm", casi(pM.x, 12), "x=" + pM.x);
comprobar("En XL el 20% del ancho son 13.2 cm", casi(pXL.x, 13.2), "x=" + pXL.x);
comprobar("La proporción es la misma aunque los centímetros cambien",
  casi(pM.x / 60, pXL.x / 66, 0.0005));
comprobar("Y también en el eje vertical",
  casi(pM.y / 78, pXL.y / 82, 0.0005));

// ============================================================
console.log("\n--- Una zona desde un solo punto de ancla ---");

var unAncla = {
  anclas: [{
    id: "A1", pieza: "ESPALDA",
    x: { ref: { tipo: "contorno", parte: "centro" }, modo: "fijo", valor: 0 },
    y: { ref: { tipo: "contorno", parte: "arriba" }, modo: "fijo", valor: 25 }
  }],
  zonas: [{
    id: "LOGO_PECHO", pieza: "ESPALDA", ancla: "A1",
    ancho: 10, alto: 5, origen: "centro",
    muestra: { texto: "LOGO" }
  }]
};
var z1 = resolver.resolver(unAncla, GEO_M).zonas.LOGO_PECHO;
comprobar("La zona mide lo que se pidió", casi(z1.ancho, 10) && casi(z1.alto, 5));
comprobar("Con origen «centro», el ancla queda en el centro de la zona",
  casi(z1.cx, 30) && casi(z1.cy, 25), "cx=" + z1.cx + " cy=" + z1.cy);
comprobar("La esquina superior izquierda sale de restar media zona",
  casi(z1.x, 25) && casi(z1.y, 22.5), "x=" + z1.x + " y=" + z1.y);

var esquinas = [
  ["supIzq", 30, 25], ["supDer", 20, 25], ["infIzq", 30, 20], ["infDer", 20, 20],
  ["centroArriba", 25, 25], ["centroAbajo", 25, 20]
];
var todasBien = true, detalleEsq = [];
for (var e = 0; e < esquinas.length; e++) {
  var copia = JSON.parse(JSON.stringify(unAncla));
  copia.zonas[0].origen = esquinas[e][0];
  var zz = resolver.resolver(copia, GEO_M).zonas.LOGO_PECHO;
  if (!casi(zz.x, esquinas[e][1]) || !casi(zz.y, esquinas[e][2])) {
    todasBien = false;
    detalleEsq.push(esquinas[e][0] + " → " + zz.x + "," + zz.y +
                    " (esperado " + esquinas[e][1] + "," + esquinas[e][2] + ")");
  }
}
comprobar("Los 6 puntos de referencia de la zona colocan la caja donde toca",
  todasBien, detalleEsq.join(" · "));

// ============================================================
console.log("\n--- Dos anclas: la intersección sale sola ---");
// El punto 7 del enunciado. Una da la X, la otra la Y; no hace falta
// proyectar rectas ni calcular cortes.

var dosAnclas = {
  anclas: [
    { id: "A_CUELLO", pieza: "ESPALDA",
      x: { ref: { tipo: "contorno", parte: "centro" }, modo: "fijo", valor: 0 },
      y: { ref: { tipo: "contorno", parte: "arriba" }, modo: "fijo", valor: 2 } },
    { id: "A_SISA", pieza: "ESPALDA",
      x: { ref: { tipo: "piquete", indice: 0, total: 2 }, modo: "fijo", valor: 0 },
      y: { ref: { tipo: "piquete", indice: 0, total: 2 }, modo: "fijo", valor: 0 } }
  ],
  zonas: [{
    id: "NUMERO_ESPALDA", pieza: "ESPALDA",
    anclaX: "A_CUELLO", anclaY: "A_SISA",
    ancho: 24, alto: 24, origen: "centroArriba"
  }]
};
var zi = resolver.resolver(dosAnclas, GEO_M).zonas.NUMERO_ESPALDA;
comprobar("La X viene del ancla del cuello", casi(zi.cx, 30), "cx=" + zi.cx);
comprobar("La Y viene del ancla de la sisa", casi(zi.y, 20), "y=" + zi.y);

var ziXL = resolver.resolver(dosAnclas, GEO_XL).zonas.NUMERO_ESPALDA;
comprobar("Al cambiar de talla, cada eje sigue a SU ancla",
  casi(ziXL.cx, 33) && casi(ziXL.y, 21.5),
  "cx=" + ziXL.cx + " y=" + ziXL.y);

// ============================================================
console.log("\n--- modoCruce «medio»: el punto medio entre las dos anclas ---");
// A_CUELLO = (30, 2), A_SISA = (5, 20) en GEO_M. Con "esquina" (por
// defecto) la zona usa (30, 20) — ya probado arriba. Con "medio" tiene que
// usar el punto medio de los dos: ((30+5)/2, (2+20)/2) = (17.5, 11).

var conMedio = JSON.parse(JSON.stringify(dosAnclas));
conMedio.zonas[0].modoCruce = "medio";
var zm = resolver.resolver(conMedio, GEO_M).zonas.NUMERO_ESPALDA;
comprobar("«medio» promedia la X de las dos anclas", casi(zm.cx, 17.5), "cx=" + zm.cx);
comprobar("«medio» promedia la Y de las dos anclas", casi(zm.y, 11), "y=" + zm.y);

var zmXL = resolver.resolver(conMedio, GEO_XL).zonas.NUMERO_ESPALDA;
comprobar("«medio» sigue promediando en otra talla, con sus propias coordenadas",
  !casi(zmXL.cx, zm.cx, 0.001) && !casi(zmXL.y, zm.y, 0.001),
  "M cx=" + zm.cx + " y=" + zm.y + " · XL cx=" + zmXL.cx + " y=" + zmXL.y);

// Intercambiar anclaX/anclaY es como el panel ofrece "la otra esquina": no
// tiene que afectar a "medio", que por definición no distingue orden.
var medioAlReves = JSON.parse(JSON.stringify(conMedio));
medioAlReves.zonas[0].anclaX = "A_SISA";
medioAlReves.zonas[0].anclaY = "A_CUELLO";
var zmR = resolver.resolver(medioAlReves, GEO_M).zonas.NUMERO_ESPALDA;
comprobar("«medio» da el mismo punto sin importar cuál ancla es X y cuál es Y",
  casi(zmR.cx, zm.cx) && casi(zmR.y, zm.y),
  "directo=" + zm.cx + "," + zm.y + " al revés=" + zmR.cx + "," + zmR.y);

// Con un solo punto de ancla no hay nada que promediar: "medio" no debe
// romper ni cambiar el resultado de siempre.
var medioUnPunto = JSON.parse(JSON.stringify(unAncla));
medioUnPunto.zonas[0].modoCruce = "medio";
var zu = resolver.resolver(medioUnPunto, GEO_M).zonas.LOGO_PECHO;
comprobar("«medio» con un solo punto de ancla no cambia nada",
  casi(zu.cx, z1.cx) && casi(zu.cy, z1.cy), "cx=" + zu.cx + " cy=" + zu.cy);

// ============================================================
console.log("\n--- Desplazamiento posterior de la zona ---");

var conOffset = JSON.parse(JSON.stringify(unAncla));
conOffset.zonas[0].offset = { x: 0, y: 2 };
var zo = resolver.resolver(conOffset, GEO_M).zonas.LOGO_PECHO;
comprobar("2 cm hacia abajo mueven la zona sin romper la relación",
  casi(zo.cy, 27) && casi(zo.cx, 30), "cx=" + zo.cx + " cy=" + zo.cy);

var offProp = JSON.parse(JSON.stringify(unAncla));
offProp.zonas[0].offset = { x: 0, y: { modo: "proporcional", valor: 0.10 } };
var opM  = resolver.resolver(offProp, GEO_M).zonas.LOGO_PECHO;
var opXL = resolver.resolver(offProp, GEO_XL).zonas.LOGO_PECHO;
comprobar("Un desplazamiento proporcional crece con la pieza",
  casi(opM.cy, 25 + 7.8) && casi(opXL.cy, 25 + 8.2),
  "M=" + opM.cy + " XL=" + opXL.cy);

// ============================================================
console.log("\n--- Tamaño proporcional de la zona ---");

var zonaProp = JSON.parse(JSON.stringify(unAncla));
zonaProp.zonas[0].ancho = { modo: "proporcional", valor: 0.40 };
var apM  = resolver.resolver(zonaProp, GEO_M).zonas.LOGO_PECHO;
var apXL = resolver.resolver(zonaProp, GEO_XL).zonas.LOGO_PECHO;
comprobar("El 40% del ancho da 24 cm en M y 26.4 en XL",
  casi(apM.ancho, 24) && casi(apXL.ancho, 26.4),
  "M=" + apM.ancho + " XL=" + apXL.ancho);

// ============================================================
console.log("\n--- Cadena: moldería → ancla → zona → ancla → zona ---");
// El punto 11 del enunciado, literal: el sponsor cuelga del bolsillo y el
// bolsillo de la moldería.

var cadena = {
  anclas: [
    { id: "A1", pieza: "ESPALDA",
      x: { ref: { tipo: "contorno", parte: "izquierda" }, modo: "fijo", valor: 8 },
      y: { ref: { tipo: "contorno", parte: "arriba" },    modo: "fijo", valor: 30 } },
    { id: "A2", pieza: "ESPALDA",
      x: { ref: { tipo: "zona", zona: "BOLSILLO_IZQUIERDO", parte: "centro" }, modo: "fijo", valor: 0 },
      y: { ref: { tipo: "zona", zona: "BOLSILLO_IZQUIERDO", parte: "abajo"  }, modo: "fijo", valor: 3 } }
  ],
  zonas: [
    { id: "SPONSOR_INFERIOR", pieza: "ESPALDA", ancla: "A2",
      ancho: 12, alto: 4, origen: "centroArriba" },
    { id: "BOLSILLO_IZQUIERDO", pieza: "ESPALDA", ancla: "A1",
      ancho: 14, alto: 16, origen: "supIzq" }
  ]
};
var rc = resolver.resolver(cadena, GEO_M);
comprobar("Se resuelve entera aunque el orden de escritura esté al revés",
  rc.errores.length === 0 && rc.zonas.SPONSOR_INFERIOR,
  rc.errores.join(" | "));
comprobar("El bolsillo cuelga de la moldería",
  casi(rc.zonas.BOLSILLO_IZQUIERDO.x, 8) && casi(rc.zonas.BOLSILLO_IZQUIERDO.y, 30));
comprobar("El sponsor queda 3 cm bajo el bolsillo, centrado con él",
  casi(rc.zonas.SPONSOR_INFERIOR.y, 30 + 16 + 3) &&
  casi(rc.zonas.SPONSOR_INFERIOR.cx, 8 + 7),
  "y=" + rc.zonas.SPONSOR_INFERIOR.y + " cx=" + rc.zonas.SPONSOR_INFERIOR.cx);

var rcXL = resolver.resolver(cadena, GEO_XL);
comprobar("En otra talla la cadena entera se recoloca sin tocar nada",
  casi(rcXL.zonas.SPONSOR_INFERIOR.y, 30 + 16 + 3) &&
  rcXL.zonas.SPONSOR_INFERIOR.cx !== rc.zonas.SPONSOR_INFERIOR.cx ||
  casi(rcXL.zonas.SPONSOR_INFERIOR.cx, 15),
  "cx=" + rcXL.zonas.SPONSOR_INFERIOR.cx);

var orden = grafo.ordenar(grafo.normalizar(cadena)).orden;
comprobar("El orden topológico pone el bolsillo antes que el sponsor",
  orden.indexOf("zona:BOLSILLO_IZQUIERDO") < orden.indexOf("ancla:A2") &&
  orden.indexOf("ancla:A2") < orden.indexOf("zona:SPONSOR_INFERIOR"),
  orden.join(" → "));

// ============================================================
console.log("\n--- Centrado horizontal respecto a la pieza (punto 13) ---");

var mixto = {
  anclas: [{
    id: "A_MIXTA", pieza: "ESPALDA",
    x: { ref: { tipo: "contorno", parte: "centro" }, modo: "fijo", valor: 0 },
    y: { ref: { tipo: "piquete", indice: 0, total: 2 }, modo: "fijo", valor: 6 }
  }],
  zonas: [{ id: "SPONSOR", pieza: "ESPALDA", ancla: "A_MIXTA",
            ancho: 20, alto: 4, origen: "centro" }]
};
var mM  = resolver.resolver(mixto, GEO_M).zonas.SPONSOR;
var mXL = resolver.resolver(mixto, GEO_XL).zonas.SPONSOR;
comprobar("Sigue centrado en las dos tallas, aunque la pieza cambie de ancho",
  casi(mM.cx, 30) && casi(mXL.cx, 33));
comprobar("Y la vertical la sigue mandando el piquete",
  casi(mM.cy, 20 + 6) && casi(mXL.cy, 21.5 + 6));

// ============================================================
console.log("\n--- Dependencias circulares (punto 16) ---");

var ciclo = {
  anclas: [
    { id: "AA", pieza: "ESPALDA",
      x: { ref: { tipo: "zona", zona: "Z_B", parte: "centro" }, modo: "fijo", valor: 0 },
      y: { ref: { tipo: "zona", zona: "Z_B", parte: "centro" }, modo: "fijo", valor: 0 } },
    { id: "AB", pieza: "ESPALDA",
      x: { ref: { tipo: "zona", zona: "Z_A", parte: "centro" }, modo: "fijo", valor: 0 },
      y: { ref: { tipo: "zona", zona: "Z_A", parte: "centro" }, modo: "fijo", valor: 0 } }
  ],
  zonas: [
    { id: "Z_A", pieza: "ESPALDA", ancla: "AA", ancho: 5, alto: 5 },
    { id: "Z_B", pieza: "ESPALDA", ancla: "AB", ancho: 5, alto: 5 }
  ]
};
var rCiclo = resolver.resolver(ciclo, GEO_M);
comprobar("Un ciclo se detecta y bloquea", rCiclo.errores.length > 0);
comprobar("El mensaje NOMBRA el ciclo, no dice solo que lo hay",
  /Dependencia circular/.test(rCiclo.errores.join(" ")) &&
  /Z_A/.test(rCiclo.errores.join(" ")) && /Z_B/.test(rCiclo.errores.join(" ")),
  rCiclo.errores.join(" | "));
comprobar("Nada del ciclo se resuelve a medias",
  !rCiclo.zonas.Z_A && !rCiclo.zonas.Z_B);

// ============================================================
console.log("\n--- No adivinar sobre geometría (regla 3) ---");
// Un vértice se identifica por índice. Si la talla nueva tiene otro número
// de vértices, el índice 7 ya no es el mismo punto: se PARA.

var porVertice = {
  anclas: [{
    id: "A_V", pieza: "ESPALDA",
    x: { ref: { tipo: "vertice", indice: 7, puntos: 12 }, modo: "fijo", valor: 0 },
    y: { ref: { tipo: "vertice", indice: 7, puntos: 12 }, modo: "fijo", valor: 0 }
  }],
  zonas: [{ id: "Z_V", pieza: "ESPALDA", ancla: "A_V", ancho: 4, alto: 4 }]
};
comprobar("Con el mismo número de vértices, resuelve",
  resolver.resolver(porVertice, GEO_M).errores.length === 0);

var GEO_RARA = { ESPALDA: espalda(66, 82, 5.5, 21.5, 2, 14) };   // 14 vértices, no 12
var rRara = resolver.resolver(porVertice, GEO_RARA);
comprobar("Con otro número de vértices, NO coloca nada y lo dice",
  rRara.errores.length > 0 && !rRara.zonas.Z_V,
  rRara.errores.join(" | "));
comprobar("El mensaje dice los dos números, para poder comprobarlo",
  /14/.test(rRara.errores.join(" ")) && /12/.test(rRara.errores.join(" ")));

var porPiquete = {
  anclas: [{
    id: "A_P", pieza: "ESPALDA",
    x: { ref: { tipo: "piquete", indice: 1, total: 2 }, modo: "fijo", valor: 0 },
    y: { ref: { tipo: "piquete", indice: 1, total: 2 }, modo: "fijo", valor: 0 } }],
  zonas: []
};
var GEO_3PIQ = { ESPALDA: espalda(66, 82, 5.5, 21.5, 3, 12) };
comprobar("Si la talla trae otro número de piquetes, tampoco se adivina",
  resolver.resolver(porPiquete, GEO_3PIQ).errores.length > 0);

// ============================================================
console.log("\n--- Errores de configuración, antes de guardar ---");

var rota = {
  anclas: [{ id: "A1", pieza: "ESPALDA",
             x: { ref: { tipo: "ancla", ancla: "NO_EXISTE" }, modo: "fijo", valor: 0 },
             y: { ref: { tipo: "contorno", parte: "arriba" }, modo: "fijo", valor: 0 } }],
  zonas: [{ id: "Z1", pieza: "ESPALDA", ancla: "A1", ancho: 3, alto: 3 },
          { id: "Z1", pieza: "ESPALDA", ancla: "A1", ancho: 3, alto: 3 }]
};
var v = grafo.validar(grafo.normalizar(rota));
comprobar("Un identificador repetido es error", /repetido/.test(v.errores.join(" ")));
comprobar("Apuntar a algo que no existe es error", /no existe/.test(v.errores.join(" ")));

// ============================================================
console.log("\n--- Aviso cuando una zona se sale de la pieza ---");

var sale = {
  anclas: [{ id: "A_B", pieza: "ESPALDA",
             x: { ref: { tipo: "contorno", parte: "centro" }, modo: "fijo", valor: 0 },
             y: { ref: { tipo: "contorno", parte: "abajo" },  modo: "fijo", valor: 0 } }],
  zonas: [{ id: "Z_BAJA", pieza: "ESPALDA", ancla: "A_B", ancho: 10, alto: 8, origen: "centro" }]
};
var rSale = resolver.resolver(sale, GEO_M);
comprobar("Se avisa, con los centímetros que sobresalen",
  rSale.avisos.length > 0 && /4 cm por abajo/.test(rSale.avisos.join(" ")),
  rSale.avisos.join(" | "));
comprobar("Pero la zona SÍ se resuelve: salirse no es un error de cálculo",
  !!rSale.zonas.Z_BAJA && rSale.errores.length === 0);

// ============================================================
console.log("\n--- Comparar dos tallas de un vistazo ---");

var comp = resolver.comparar(cadena, GEO_M, GEO_XL, "M", "XL");
comprobar("La comparación trae una fila por zona con su desplazamiento",
  comp.filas.length === 2 && typeof comp.filas[0].dx === "number");

// ============================================================
console.log("\n--- Describir referencias para la interfaz ---");
// Los índices se cuentan DESDE 1 al escribirlos: el lienzo decía «Piquete 1
// de 3» y el editor «piquete nº 0». La misma cosa con dos nombres.
comprobar("El piquete 0 se escribe como «el piquete 1 de 3»",
  refsMod.describirReferencia({ tipo: "piquete", indice: 0, total: 3 }) === "el piquete 1 de 3",
  refsMod.describirReferencia({ tipo: "piquete", indice: 0, total: 3 }));
comprobar("Y el vértice, igual",
  refsMod.describirReferencia({ tipo: "vertice", indice: 6, puntos: 12 }) === "el vértice 7 de 12",
  refsMod.describirReferencia({ tipo: "vertice", indice: 6, puntos: 12 }));
comprobar("Un extremo se dice con palabras, no con la clave interna",
  refsMod.describirReferencia({ tipo: "extremo", parte: "arriba" }) ===
  "el punto más alto del contorno");

// ============================================================
console.log("\n--- Salientes del contorno ---");
// Los sitios donde el contorno "da la vuelta". Mismo trato que los
// piquetes: orden estable e huella que se comprueba.

function conSalientes(n) {
  var g = espalda(60, 78, 5, 20, 2, 12);
  g.salientes = [];
  for (var i = 0; i < n; i++) g.salientes.push({ x: 5 + i * 4, y: 10 + i * 3 });
  return { ESPALDA: g };
}

var porSaliente = {
  anclas: [{ id: "A_S", pieza: "ESPALDA",
    x: { ref: { tipo: "saliente", indice: 2, total: 6 }, modo: "fijo", valor: 0 },
    y: { ref: { tipo: "saliente", indice: 2, total: 6 }, modo: "fijo", valor: 2 } }],
  zonas: [{ id: "Z_S", pieza: "ESPALDA", ancla: "A_S", ancho: 6, alto: 4 }]
};

var rs = resolver.resolver(porSaliente, conSalientes(6));
comprobar("Un ancla sobre un saliente resuelve",
  rs.errores.length === 0 && casi(rs.anclas.A_S.x, 13) && casi(rs.anclas.A_S.y, 18),
  "x=" + (rs.anclas.A_S || {}).x + " y=" + (rs.anclas.A_S || {}).y);

var rs2 = resolver.resolver(porSaliente, conSalientes(7));
comprobar("Con otro número de salientes NO se coloca nada y se dice",
  rs2.errores.length > 0 && !rs2.zonas.Z_S,
  rs2.errores.join(" | "));
comprobar("El mensaje dice los dos números",
  /7/.test(rs2.errores.join(" ")) && /6/.test(rs2.errores.join(" ")));

comprobar("Una pieza sin salientes lo dice, no falla en silencio",
  resolver.resolver(porSaliente, conSalientes(0)).errores.length > 0);

comprobar("Se describe contando desde 1",
  refsMod.describirReferencia({ tipo: "saliente", indice: 2, total: 6 }) === "el extremo 3 de 6",
  refsMod.describirReferencia({ tipo: "saliente", indice: 2, total: 6 }));

// ============================================================
console.log("\n--- Cuando cambia la CUENTA de rasgos entre tallas ---");
// El caso que rompió en producción: un ancla sobre el extremo 3 de una L
// dejaba de resolver en la 4XL porque allí el detector encontraba 8 y no 9.
// La pieza era la misma y el punto seguía donde estaba.

function geoConSalientes(ancho, alto, puntos) {
  var g = espalda(ancho, alto, 5, 20, 2, 12);
  g.salientes = [];
  for (var i = 0; i < puntos.length; i++) {
    g.salientes.push({ x: puntos[i][0] * ancho, y: puntos[i][1] * alto,
                       rx: puntos[i][0], ry: puntos[i][1] });
  }
  return { ESPALDA: g };
}

var NUEVE = [[0.10,0.08],[0.30,0.05],[0.50,0.12],[0.70,0.05],[0.90,0.08],
             [0.92,0.35],[0.88,0.96],[0.12,0.96],[0.08,0.35]];
var OCHO  = [[0.10,0.08],[0.30,0.05],[0.70,0.05],[0.90,0.08],
             [0.92,0.35],[0.88,0.96],[0.12,0.96],[0.08,0.35]];

var sobreEl6 = {
  anclas: [{ id: "A_SISA", pieza: "ESPALDA",
    x: { ref: { tipo: "saliente", indice: 5, total: 9, rx: 0.92, ry: 0.35 }, modo: "fijo", valor: 0 },
    y: { ref: { tipo: "saliente", indice: 5, total: 9, rx: 0.92, ry: 0.35 }, modo: "fijo", valor: 3 } }],
  zonas: [{ id: "Z", pieza: "ESPALDA", ancla: "A_SISA", ancho: 10, alto: 5 }]
};

var rL = resolver.resolver(sobreEl6, geoConSalientes(60, 78, NUEVE), { talla: "L" });
comprobar("Con la misma cuenta resuelve por índice, exacto",
  rL.errores.length === 0 && casi(rL.anclas.A_SISA.x, 55.2),
  "x=" + (rL.anclas.A_SISA || {}).x);

var r4 = resolver.resolver(sobreEl6, geoConSalientes(70, 85, OCHO), { talla: "4XL" });
comprobar("Con OTRA cuenta ya no se rinde: empareja por posición",
  r4.errores.length === 0 && !!r4.zonas.Z,
  r4.errores.join(" | "));
comprobar("Y cae en el punto correcto de la talla nueva",
  casi(r4.anclas.A_SISA.x, 0.92 * 70) && casi(r4.anclas.A_SISA.y, 0.35 * 85 + 3),
  "x=" + (r4.anclas.A_SISA || {}).x + " y=" + (r4.anclas.A_SISA || {}).y);
comprobar("Pero lo AVISA: no se empareja en silencio",
  /emparejó por posición/.test(r4.avisos.join(" ")),
  r4.avisos.join(" | "));

// Si el punto ya no está, se para. La promesa se mantiene.
var LEJOS = [[0.10,0.08],[0.30,0.05],[0.50,0.12],[0.70,0.05],[0.90,0.08],[0.12,0.96],[0.88,0.96]];
var rLejos = resolver.resolver(sobreEl6, geoConSalientes(70, 85, LEJOS), { talla: "4XL" });
comprobar("Si en la talla nueva no hay nada donde estaba, se PARA",
  rLejos.errores.length > 0 && !rLejos.zonas.Z,
  rLejos.errores.join(" | "));

// Y si hay dos igual de cerca, tampoco elige por su cuenta.
var DOBLE = [[0.10,0.08],[0.30,0.05],[0.50,0.12],[0.70,0.05],[0.90,0.08],
             [0.915,0.35],[0.925,0.355],[0.88,0.96],[0.12,0.96],[0.08,0.35]];
var rDoble = resolver.resolver(sobreEl6, geoConSalientes(70, 85, DOBLE), { talla: "4XL" });
comprobar("Con dos candidatos igual de cerca, no elige por ti",
  rDoble.errores.length > 0,
  rDoble.errores.join(" | "));

// ============================================================
console.log("\n--- Zonas de logo: una sola medida ---");
// Un logo se encaja dentro conservando su proporción, así que no hacen
// falta ancho y alto: basta el lado del cuadrado en el que cabe.

var conLogo = {
  anclas: [{ id: "A_P", pieza: "ESPALDA",
    x: { ref: { tipo: "contorno", parte: "centro" }, modo: "fijo", valor: 0 },
    y: { ref: { tipo: "contorno", parte: "arriba" }, modo: "fijo", valor: 20 } }],
  zonas: [{ id: "LOGO_PECHO", pieza: "ESPALDA", ancla: "A_P",
            tipo: "logo", lado: 9, origen: "centro" }]
};
var zl = resolver.resolver(conLogo, GEO_M).zonas.LOGO_PECHO;
comprobar("Con tipo logo, la zona es un cuadrado del lado pedido",
  casi(zl.ancho, 9) && casi(zl.alto, 9), zl.ancho + " x " + zl.alto);
comprobar("Un logo no lleva texto de muestra", zl.muestra === null);

var conLogoProp = JSON.parse(JSON.stringify(conLogo));
conLogoProp.zonas[0].lado = { modo: "proporcional", valor: 0.25 };
var zlM  = resolver.resolver(conLogoProp, GEO_M).zonas.LOGO_PECHO;
var zlXL = resolver.resolver(conLogoProp, GEO_XL).zonas.LOGO_PECHO;
comprobar("Proporcional, el lado sale del lado MENOR de la pieza",
  casi(zlM.ancho, 15) && casi(zlXL.ancho, 16.5),
  "M=" + zlM.ancho + " XL=" + zlXL.ancho);
comprobar("Y sigue siendo cuadrada en las dos tallas",
  casi(zlM.ancho, zlM.alto) && casi(zlXL.ancho, zlXL.alto));

var conTexto = JSON.parse(JSON.stringify(conLogo));
conTexto.zonas[0].tipo = "texto";
conTexto.zonas[0].ancho = 24; conTexto.zonas[0].alto = 6;
conTexto.zonas[0].muestra = { contenido: "NAME" };
var zt = resolver.resolver(conTexto, GEO_M).zonas.LOGO_PECHO;
comprobar("Una zona de texto sí usa ancho y alto por separado",
  casi(zt.ancho, 24) && casi(zt.alto, 6) && zt.muestra !== null);

console.log("\n--- Zonas de logo SIN cruz: ancho y alto propios, como texto ---");
// El toggle z.cruz permite pedir un logo (sponsor) que no necesita el
// margen extra de la cruz: entonces se comporta como un rectángulo normal.

var conLogoSinCruz = JSON.parse(JSON.stringify(conLogo));
conLogoSinCruz.zonas[0].cruz = false;
conLogoSinCruz.zonas[0].ancho = 20;
conLogoSinCruz.zonas[0].alto = 8;
var zlsc = resolver.resolver(conLogoSinCruz, GEO_M).zonas.LOGO_PECHO;
comprobar("Con cruz desactivada, usa ancho y alto propios (no 'lado')",
  casi(zlsc.ancho, 20) && casi(zlsc.alto, 8), zlsc.ancho + " x " + zlsc.alto);
comprobar("Sigue sin llevar texto de muestra", zlsc.muestra === null);
comprobar("El resuelto trae cruz:false para que host.jsx sepa qué encaje usar",
  zlsc.cruz === false);
comprobar("Con cruz activa (por defecto), el resuelto trae cruz:true",
  zl.cruz === true);

console.log("\n--- grupo: distinto de nombre, se puede repetir ---");
// El sincronizado en sí (tipo/contenido/logo entre zonas del mismo grupo)
// vive en la UI (Productos.jsx) -- aquí solo se prueba que grafo.js lo
// NORMALIZA y lo deja pasar sin exigir que sea único, a diferencia de `id`.
var conGrupo = grafo.normalizar({
  anclas: [{ id: "A1", pieza: "ESPALDA",
    x: { ref: { tipo: "piquete", indice: 0, total: 2 }, modo: "fijo", valor: 0 },
    y: { ref: { tipo: "piquete", indice: 0, total: 2 }, modo: "fijo", valor: 0 } }],
  zonas: [
    { id: "Z1", pieza: "ESPALDA", anclaX: "A1", anclaY: "A1", tipo: "logo", grupo: "PATROCINADOR" },
    { id: "Z2", pieza: "ESPALDA", anclaX: "A1", anclaY: "A1", tipo: "logo", grupo: "PATROCINADOR" }
  ]
});
comprobar("grupo se guarda tal cual", conGrupo.zonas[0].grupo === "PATROCINADOR");
comprobar("dos zonas SÍ pueden compartir grupo (no es como id)",
  conGrupo.zonas[0].grupo === conGrupo.zonas[1].grupo);
var vGrupo = grafo.validar(conGrupo);
comprobar("compartir grupo no cuenta como error de validación",
  vGrupo.errores.length === 0, vGrupo.errores.join(" | "));
var sinGrupo = grafo.normalizar({ anclas: [], zonas: [{ id: "Z3", pieza: "ESPALDA", tipo: "texto" }] });
comprobar("sin grupo, queda null (no undefined, no cadena vacía)",
  sinGrupo.zonas[0].grupo === null);

console.log("\n--- Heredar la referencia de la zona borrada (no congelar en cm fijos) ---");
// El caso del usuario, dibujado: zona A cuelga de un piquete a través de su
// ancla A1; zona B cuelga de A2, que a su vez depende de la caja de zona A
// (no de un piquete directamente). Al borrar zona A, A2 tiene que HEREDAR
// la MISMA referencia de A1 (el piquete), sumándole la distancia que ya
// había entre A1 y A2 -- como si zona A nunca hubiera existido.
//
// La prueba de fondo: resolver la cadena COMPLETA (sin borrar nada) en dos
// tallas distintas da la posición real de ZONA_B en cada una. Si el
// colapso es correcto, resolver la versión SIN zonaA (ya heredada) en esa
// MISMA talla XL tiene que dar EXACTAMENTE la misma posición.

var conCadena = {
  anclas: [
    { id: "A1", nombre: "A1", pieza: "ESPALDA",
      x: { ref: { tipo: "piquete", indice: 0, total: 2 }, modo: "fijo", valor: 3 },
      y: { ref: { tipo: "piquete", indice: 0, total: 2 }, modo: "fijo", valor: 5 } },
    { id: "A2", nombre: "A2", pieza: "ESPALDA",
      x: { ref: { tipo: "zona", zona: "ZONA_A", parte: "derecha" }, modo: "fijo", valor: 2 },
      y: { ref: { tipo: "zona", zona: "ZONA_A", parte: "centro" }, modo: "fijo", valor: 0 } }
  ],
  zonas: [
    { id: "ZONA_A", pieza: "ESPALDA", anclaX: "A1", anclaY: "A1",
      tipo: "texto", ancho: 10, alto: 4, origen: "centro",
      muestra: { contenido: "NAME" } },
    { id: "ZONA_B", pieza: "ESPALDA", anclaX: "A2", anclaY: "A2",
      tipo: "numero", ancho: 6, alto: 6, origen: "centro",
      muestra: { contenido: "10" } }
  ]
};

var rCadena_M  = resolver.resolver(conCadena, GEO_M,  { talla: "M"  });
var rCadena_XL = resolver.resolver(conCadena, GEO_XL, { talla: "XL" });
comprobar("La cadena original resuelve sin errores en M",
  rCadena_M.errores.length === 0, rCadena_M.errores.join(" | "));
comprobar("...y en XL",
  rCadena_XL.errores.length === 0, rCadena_XL.errores.join(" | "));

// Heredar: A2 adopta la MISMA ref que A1 (el piquete), modo "fijo" (el de
// A1), con valor = A1.valor + (resuelto.A2 - resuelto.A1), calculado con
// los datos de LA TALLA EN LA QUE SE BORRA (M): no hace falta la geometría
// de ninguna otra talla para heredar bien.
var puntoA1 = rCadena_M.anclas.A1, puntoA2 = rCadena_M.anclas.A2;
var heredado = JSON.parse(JSON.stringify(conCadena));
var a2Heredada = heredado.anclas[1];
a2Heredada.x = { ref: conCadena.anclas[0].x.ref, modo: "fijo",
                 valor: conCadena.anclas[0].x.valor + (puntoA2.x - puntoA1.x) };
a2Heredada.y = { ref: conCadena.anclas[0].y.ref, modo: "fijo",
                 valor: conCadena.anclas[0].y.valor + (puntoA2.y - puntoA1.y) };

// Con la zona A y su ancla TODAVÍA presentes, heredar no debería mover nada.
var rHeredadoAntes = resolver.resolver(heredado, GEO_M, { talla: "M" });
comprobar("Recién heredada, el punto de A2 no se mueve ni un mm",
  casi(rHeredadoAntes.anclas.A2.x, puntoA2.x) && casi(rHeredadoAntes.anclas.A2.y, puntoA2.y),
  "antes=" + puntoA2.x + "," + puntoA2.y + " después=" +
  rHeredadoAntes.anclas.A2.x + "," + rHeredadoAntes.anclas.A2.y);

// Ahora sí, se borra la zona A y su ancla -- el caso real.
heredado.zonas = heredado.zonas.filter(function (z) { return z.id !== "ZONA_A"; });
heredado.anclas = heredado.anclas.filter(function (a) { return a.id !== "A1"; });
var rSinA_M = resolver.resolver(heredado, GEO_M, { talla: "M" });
comprobar("Sin la zona A ni su ancla, ZONA_B sigue resolviendo en M (no quedó huérfana)",
  rSinA_M.errores.length === 0, rSinA_M.errores.join(" | "));
comprobar("Y en EXACTAMENTE el mismo sitio de antes de borrar, en M",
  casi(rSinA_M.zonas.ZONA_B.cx, rCadena_M.zonas.ZONA_B.cx) &&
  casi(rSinA_M.zonas.ZONA_B.cy, rCadena_M.zonas.ZONA_B.cy),
  "antes=" + rCadena_M.zonas.ZONA_B.cx + "," + rCadena_M.zonas.ZONA_B.cy +
  " después=" + rSinA_M.zonas.ZONA_B.cx + "," + rSinA_M.zonas.ZONA_B.cy);

// LA PRUEBA QUE IMPORTA: en OTRA talla (XL), sin haber vuelto a mirar la
// geometría de zona A para nada, ZONA_B tiene que caer EXACTAMENTE donde
// caía en la cadena original completa.
var rSinA_XL = resolver.resolver(heredado, GEO_XL, { talla: "XL" });
comprobar("Sin la zona A, en OTRA talla (XL) ZONA_B sigue resolviendo",
  rSinA_XL.errores.length === 0, rSinA_XL.errores.join(" | "));
comprobar("...y cae EXACTAMENTE donde caía la cadena original en esa misma talla XL " +
  "(sigue gradando con el piquete, no se quedó fija)",
  casi(rSinA_XL.zonas.ZONA_B.cx, rCadena_XL.zonas.ZONA_B.cx) &&
  casi(rSinA_XL.zonas.ZONA_B.cy, rCadena_XL.zonas.ZONA_B.cy),
  "cadena original en XL=" + rCadena_XL.zonas.ZONA_B.cx + "," + rCadena_XL.zonas.ZONA_B.cy +
  " heredada resuelta en XL=" + rSinA_XL.zonas.ZONA_B.cx + "," + rSinA_XL.zonas.ZONA_B.cy);

console.log("\n" + pasadas + " pasadas · " + fallos + " fallidas\n");
if (fallos > 0) process.exit(1);
