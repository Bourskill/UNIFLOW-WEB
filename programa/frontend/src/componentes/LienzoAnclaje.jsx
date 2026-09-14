import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import ClipperLib from 'clipper-lib';

// Puerto FIEL del lienzo de Anclajes del panel de Illustrator
// (programa/panel/js/main.js: dibujarLienzo/candidatosDe/sinMontonera) --
// SVG con el viewBox EN CENTÍMETROS (no Konva ni un canvas de píxeles: así
// cualquier coordenada del motor se dibuja sin convertir nada), un punto de
// ancla es una cruz+círculo, una zona es un rectángulo, y los "candidatos"
// (piquetes, extremos, bordes, vértices, y los 9 puntos de cada zona ya
// resuelta) son marcadores clicables que existen SIEMPRE que su clase esté
// visible en la leyenda -- no solo en un "modo de crear".
//
// La única acción de creación es "Zona" (ver Productos.jsx): al estar
// activa, un clic en cualquier parte de la pieza se engancha al candidato
// MÁS CERCANO, y un clic directo sobre un candidato lo usa exacto. Fuera de
// ese modo (o de "recolocar"/"cruzar"), clicar un candidato no hace nada, y
// clicar el vacío deselecciona -- igual que el original.

const PARTES_CAJA = [
  ['centro', 0.5, 0.5, 'centro'], ['arriba', 0.5, 0, 'borde superior'],
  ['abajo', 0.5, 1, 'borde inferior'], ['izquierda', 0, 0.5, 'borde izquierdo'],
  ['derecha', 1, 0.5, 'borde derecho'], ['supIzq', 0, 0, 'esquina sup. izq.'],
  ['supDer', 1, 0, 'esquina sup. der.'], ['infIzq', 0, 1, 'esquina inf. izq.'],
  ['infDer', 1, 1, 'esquina inf. der.'],
];
const NOMBRES_EXTREMO = {
  arriba: 'punto más alto', abajo: 'punto más bajo',
  izquierda: 'punto más a la izquierda', derecha: 'punto más a la derecha',
};
const PARTE_DESDE_ORIGEN = {
  centroArriba: 'arriba', centroAbajo: 'abajo', centroIzq: 'izquierda', centroDer: 'derecha',
};

// A propósito YA NO es el mismo valor que host.jsx (colocarLogoEnZonaCruz/
// crearZonaCruz, programa/panel/jsx/host.jsx sigue en 4/2.5) -- una zona de
// logo "en cruz" no es un cuadro único, es una cruz de dos brazos (uno
// para logos anchos, otro para altos) que se cruzan en el cuadrado central
// de lado "lado" -- acá z.ancho === z.alto === "lado" cuando cruz está
// activa (resolverZona ya lo resuelve así, motor/anclaje/resolver.js).
// Reducido a pedido a 4cm×2cm = 2 (el cuadrado central baja de 2.5cm a
// 2cm de lado, el brazo se mantiene en 4cm).
const RATIO_BRAZO = 4 / 2;

function r1(n) { return Math.round(n * 100) / 100; }

// Empuja un polígono cerrado hacia AFUERA una distancia fija -- el
// "desplazamiento" real del contorno para láser (compensa el grosor del
// corte; ver claude/CLAUDE.md sobre PROCESAR MOLDES.jsx y su offset de
// 1mm).
//
// LA VERSIÓN ANTERIOR (miter por vértice + bisel) era, en el fondo, un
// stroke-linejoin -- resuelve el ángulo de UN vértice a la vez, pero un
// piquete pegado angosto es un problema de TOPOLOGÍA DEL CONTORNO ENTERO:
// al empujar las dos paredes de una muesca angosta hacia afuera, esas dos
// paredes se cruzan entre sí más allá del vértice -- nada de lo que se
// haga vértice por vértice puede detectar ni deshacer un cruce que ocurre
// ENTRE vértices no adyacentes. El usuario lo notó de inmediato contra
// piezas reales: "se deforma mucho, no es fiel al molde".
//
// Eso es lo que Illustrator hace de verdad: construye una franja por cada
// arista y calcula la UNIÓN BOOLEANA de todas -- ahí se resuelven los
// cruces, con aritmética de intersección real. clipper-lib (puerto JS puro
// del Clipper 6 de Angus Johnson, misma librería que exportarPdf.js) hace
// exactamente eso -- confirmado leyendo su código fuente instalado antes
// de confiar en él (ClipperOffset.Execute() llama a DoOffset() y DESPUÉS a
// un Clipper.Execute(ctUnion, ...) real sobre el resultado).
//
// Probado a mano contra un piquete tipo aguja (ver geometriaSalientes.js):
// con jtMiter, 0.1cm de desplazamiento da una caja EXACTAMENTE 0.1cm más
// grande por lado (sin picos), y 3cm "traga" la muesca angosta en vez de
// dispararla -- el mismo comportamiento de un offset de polígono real.
const ESCALA_CLIPPER = 10000; // 1 unidad Clipper = 0.0001cm (1 micrón)

function areaDePath(path) {
  let area = 0;
  for (let i = 0; i < path.length; i++) {
    const a = path[i], b = path[(i + 1) % path.length];
    area += a.X * b.Y - b.X * a.Y;
  }
  return Math.abs(area) / 2;
}

function offsetPoligono(vertices, distancia) {
  if (vertices.length < 3 || !distancia) return vertices;
  const path = vertices.map((v) => ({ X: Math.round(v.x * ESCALA_CLIPPER), Y: Math.round(v.y * ESCALA_CLIPPER) }));

  const co = new ClipperLib.ClipperOffset();
  co.AddPath(path, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);
  const solucion = new ClipperLib.Paths();
  co.Execute(solucion, distancia * ESCALA_CLIPPER);
  if (!solucion.length) return vertices;

  let elegido = solucion[0];
  if (solucion.length > 1) {
    let mejorArea = areaDePath(elegido);
    for (const candidato of solucion.slice(1)) {
      const area = areaDePath(candidato);
      if (area > mejorArea) { mejorArea = area; elegido = candidato; }
    }
  }
  return elegido.map((p) => ({ x: p.X / ESCALA_CLIPPER, y: p.Y / ESCALA_CLIPPER }));
}

// Los candidatos que de verdad se pueden reencontrar en otra talla: nunca
// se inventa uno. El orden en que se agregan es la prioridad al deduplicar
// (sinMontonera): zona > piquete > extremo > borde > vértice -- un punto
// REAL del contorno gana al tirador gris del rectángulo que caiga encima.
export function candidatosDe(geo, zonasDeEstaPieza, zonaEditandoId, leyenda) {
  if (!geo) return [];
  const W = geo.pieza.ancho_cm, H = geo.pieza.alto_cm;
  const out = [];
  const rel = (x, y) => ({ rx: r1(x / W), ry: r1(y / H) });

  for (const z of zonasDeEstaPieza || []) {
    const caja = { x: z.x, y: z.y, ancho: z.ancho, alto: z.alto };
    const origenZona = z.origen || 'centro';
    const parteOrigen = PARTE_DESDE_ORIGEN[origenZona] || origenZona;
    for (const [parte, fx, fy, etiqueta] of PARTES_CAJA) {
      out.push({
        clase: 'zona', prioridad: 0, etiqueta: 'Zona ' + z.id + ' · ' + etiqueta,
        x: caja.x + caja.ancho * fx, y: caja.y + caja.alto * fy,
        ref: { tipo: 'zona', zona: z.id, parte },
        origenActual: z.id === zonaEditandoId && parte === parteOrigen,
      });
    }
  }

  if (leyenda.piquetes) {
    for (let i = 0; i < (geo.piquetes || []).length; i++) {
      const p = geo.piquetes[i];
      const rp = rel(p.x, p.y);
      out.push({
        clase: 'piquete', prioridad: 1, etiqueta: 'Piquete ' + (i + 1) + ' de ' + geo.piquetes.length,
        x: p.x, y: p.y,
        ref: { tipo: 'piquete', indice: i, total: geo.piquetes.length, parte: 'centro', rx: rp.rx, ry: rp.ry },
      });
    }
  }

  if (leyenda.extremos) {
    for (const k of ['arriba', 'abajo', 'izquierda', 'derecha']) {
      const e = geo.extremos ? geo.extremos[k] : null;
      if (!e) continue;
      out.push({ clase: 'extremo', prioridad: 2, etiqueta: 'El ' + NOMBRES_EXTREMO[k], x: e.x, y: e.y, ref: { tipo: 'extremo', parte: k } });
    }
    for (let i = 0; i < (geo.salientes || []).length; i++) {
      const s = geo.salientes[i];
      const rs = rel(s.x, s.y);
      out.push({
        clase: 'extremo', prioridad: 3,
        etiqueta: (s.esquina ? 'Esquina ' : 'Extremo ') + (i + 1) + ' de ' + geo.salientes.length,
        x: s.x, y: s.y,
        ref: { tipo: 'saliente', indice: i, total: geo.salientes.length, rx: rs.rx, ry: rs.ry },
      });
    }
  }

  if (leyenda.bordes) {
    for (const [parte, fx, fy, etiqueta] of PARTES_CAJA) {
      out.push({ clase: 'caja', prioridad: 4, etiqueta: 'Contorno · ' + etiqueta, x: W * fx, y: H * fy, ref: { tipo: 'contorno', parte } });
    }
  }

  if (leyenda.vertices) {
    for (let i = 0; i < geo.vertices.length; i++) {
      out.push({ clase: 'vertice', prioridad: 5, etiqueta: 'Vértice ' + (i + 1) + ' de ' + geo.vertices.length, x: geo.vertices[i].x, y: geo.vertices[i].y, ref: { tipo: 'vertice', indice: i, puntos: geo.vertices.length } });
    }
  }

  return sinMontonera(out, Math.max(W, H));
}

// Muchos puntos caen en el mismo sitio (una esquina de la caja suele
// coincidir con un vértice, el punto más alto con un saliente...). Se
// quedan por prioridad, no todos superpuestos sin poder clicar el que hace
// falta.
function sinMontonera(lista, maxDim) {
  const MIN = maxDim * 0.02;
  const ordenada = [...lista].sort((a, b) => a.prioridad - b.prioridad);
  const salida = [];
  for (const c of ordenada) {
    const pisa = salida.some((s) => Math.hypot(c.x - s.x, c.y - s.y) < MIN);
    if (!pisa) salida.push(c);
  }
  return salida;
}

const COLOR = {
  piquete: '#f5a623', extremo: '#4ade80', caja: '#6b7389', vertice: '#6b7389',
  zona: '#4c8dff', zonaOrigen: '#4ade80',
  ancla: '#4c8dff', zonaRect: '#4c8dff', zonaFuera: '#f87171',
};

// El tamaño REAL en píxeles del archivo de un logo -- lo único que permite
// calcular el mismo encaje "contain" que host.jsx/exportarPdf.js (sin esto,
// la vista previa solo puede APROXIMAR metiendo la imagen en un cuadrado, y
// esa aproximación es justo lo que no respetaba los límites reales de la
// cruz: un logo ancho podía dibujarse más grande de lo que el molde de
// verdad permite). Se carga una vez por URL; mientras carga, no se dibuja
// nada todavía (el marco de la cruz/rectángulo sigue mostrando el límite).
function useTamanoNaturalDeImagen(url) {
  const [tam, setTam] = useState(null);
  useEffect(() => {
    if (!url) { setTam(null); return undefined; }
    let cancelado = false;
    const img = new window.Image();
    img.onload = () => { if (!cancelado) setTam({ w: img.naturalWidth, h: img.naturalHeight }); };
    img.onerror = () => { if (!cancelado) setTam(null); };
    img.src = url;
    return () => { cancelado = true; };
  }, [url]);
  return tam;
}

// Mismo cálculo que colocarLogoEnZonaCruz()/colocarLogoEnZonaSimple() de
// host.jsx (y exportarPdf.js, que es quien de verdad produce el PDF):
// "contain", nunca deformar. Con cruz, el logo puede exceder el cuadrado
// central "lado" por UN solo eje (el brazo, RATIO_BRAZO veces más largo) --
// se prueba el encaje contra los dos brazos y se usa el que da más tamaño.
function medidaLogoAjustada({ cruz, lado, ancho, alto, natural }) {
  if (!natural || !natural.w || !natural.h) return null;
  const { w: pw, h: ph } = natural;
  let escala;
  if (cruz) {
    const brazo = lado * RATIO_BRAZO;
    const escalaVertical = Math.min(lado / pw, brazo / ph);
    const escalaHorizontal = Math.min(brazo / pw, lado / ph);
    escala = Math.max(escalaVertical, escalaHorizontal);
  } else {
    escala = Math.min(ancho / pw, alto / ph);
  }
  return { w: pw * escala, h: ph * escala };
}

// Una zona, memoizada: durante un arrastre, la ÚNICA zona cuyas props
// cambian de verdad cuadro a cuadro es la que se está arrastrando -- todas
// las demás (y sus candidatos/anclas, ver más abajo) reciben exactamente
// los mismos props que ya tenían, así que React.memo las salta enteras en
// vez de volver a generar y reconciliar su JSX en cada mousemove. Esa
// reconciliación de más (no el arrastre en sí) era la otra causa real de
// que se sintiera con delay.
const ZonaEnLienzo = memo(function ZonaEnLienzo({
  zona: z, seleccionada, arrastrando, modo, W, H, R, F, mostrarSola,
  onSeleccionarZona, iniciarArrastreZona,
}) {
  const fuera = z.x < 0 || z.y < 0 || z.x + z.ancho > W + 0.01 || z.y + z.alto > H + 0.01;
  const esLogo = z.tipo === 'logo';
  const enCruz = esLogo && z.cruz !== false;
  // Girar (web-only, no viene del puerto): pivota sobre el CENTRO real de
  // la zona (z.cx/z.cy, que sí resuelve el motor), no sobre la esquina --
  // así el punto de referencia no se corre al girar.
  const transformZona = z.rotacion ? 'rotate(' + z.rotacion + ' ' + z.cx + ' ' + z.cy + ')' : undefined;
  const natural = useTamanoNaturalDeImagen(esLogo ? z.logoRuta : null);
  const medida = esLogo && z.logoRuta
    ? medidaLogoAjustada({ cruz: enCruz, lado: z.ancho, ancho: z.ancho, alto: z.alto, natural })
    : null;

  return (
    <g transform={transformZona}
      onClick={(e) => { e.stopPropagation(); onSeleccionarZona(z.id); }}
      onMouseDown={(e) => { e.stopPropagation(); onSeleccionarZona(z.id); iniciarArrastreZona(z.id, e); }}
      style={{ cursor: modo ? 'pointer' : (arrastrando ? 'grabbing' : 'grab') }}>
      {enCruz ? (
        // Cruz: dos brazos que se cruzan en el cuadrado central de lado
        // z.ancho (=== z.alto con cruz activa) -- mismo dibujo que
        // crearZonaCruz() de host.jsx, para que el límite real de dónde
        // puede caber el logo se vea, no solo se explique.
        (() => {
          const lado = z.ancho, brazo = lado * RATIO_BRAZO;
          const stroke = fuera ? COLOR.zonaFuera : COLOR.zonaRect;
          const sw = seleccionada ? R * 0.5 : R * 0.28;
          return (
            <>
              <rect x={z.cx - lado / 2} y={z.cy - brazo / 2} width={lado} height={brazo} fill="rgba(76,141,255,0.1)" stroke={stroke} strokeWidth={sw} vectorEffect="non-scaling-stroke" />
              <rect x={z.cx - brazo / 2} y={z.cy - lado / 2} width={brazo} height={lado} fill="rgba(76,141,255,0.1)" stroke={stroke} strokeWidth={sw} vectorEffect="non-scaling-stroke" />
              {/* El tamaño real del archivo (natural) recién se conoce
                  cuando termina de cargar la imagen -- hasta entonces se ve
                  el marco de la cruz solo, nunca un cuadrado de más. */}
              {medida && (
                <image href={z.logoRuta} x={z.cx - medida.w / 2} y={z.cy - medida.h / 2} width={medida.w} height={medida.h} preserveAspectRatio="none" />
              )}
            </>
          );
        })()
      ) : (
        <rect
          x={z.x} y={z.y} width={z.ancho} height={z.alto}
          fill={fuera ? 'rgba(248,113,113,0.15)' : 'rgba(76,141,255,0.18)'}
          stroke={fuera ? COLOR.zonaFuera : COLOR.zonaRect}
          strokeWidth={seleccionada ? R * 0.5 : R * 0.28}
          vectorEffect="non-scaling-stroke"
        />
      )}
      {esLogo && z.logoRuta && !enCruz && medida && (
        <image href={z.logoRuta} x={z.cx - medida.w / 2} y={z.cy - medida.h / 2} width={medida.w} height={medida.h} preserveAspectRatio="none" />
      )}
      {(seleccionada || mostrarSola) && (!esLogo || !z.logoRuta) && (
        <text x={z.cx} y={z.cy + F * 0.35} textAnchor="middle" fontSize={F} fill="#e6e9f0" stroke="#0d0f14" strokeWidth={F / 6} paintOrder="stroke">
          {esLogo ? 'LOGO' : z.etiqueta}
        </text>
      )}
    </g>
  );
});

// Candidatos y anclas, memoizados por el mismo motivo que ZonaEnLienzo: sus
// props (cands/anclasResueltas) no cambian durante un arrastre puramente
// posicional, así que React.memo los salta enteros en cada mousemove.
const CandidatosCapa = memo(function CandidatosCapa({ cands, modo, onElegirCandidato, R }) {
  return cands.map((c, i) => (
    <g key={i} onClick={(e) => { e.stopPropagation(); onElegirCandidato(c); }} style={{ cursor: modo ? 'pointer' : 'default' }}>
      {c.clase === 'caja' ? (
        <rect x={c.x - R} y={c.y - R} width={R * 2} height={R * 2} fill={COLOR.caja} stroke="#0d0f14" strokeWidth={R * 0.15} />
      ) : c.clase === 'extremo' ? (
        <polygon
          points={`${c.x},${c.y - R * 1.4} ${c.x + R * 1.4},${c.y} ${c.x},${c.y + R * 1.4} ${c.x - R * 1.4},${c.y}`}
          fill={COLOR.extremo} stroke="#0d0f14" strokeWidth={R * 0.15}
        />
      ) : c.clase === 'vertice' ? (
        <circle cx={c.x} cy={c.y} r={R * 0.8} fill="none" stroke={COLOR.vertice} strokeWidth={R * 0.25} />
      ) : c.clase === 'zona' ? (
        <circle cx={c.x} cy={c.y} r={R * 1.1} fill={c.origenActual ? COLOR.zonaOrigen : COLOR.zona} stroke="#0d0f14" strokeWidth={R * 0.15} />
      ) : (
        <circle cx={c.x} cy={c.y} r={R * 1.5} fill={COLOR.piquete} stroke="#0d0f14" strokeWidth={R * 0.15} />
      )}
      <title>{c.etiqueta} ({c.x}, {c.y} cm)</title>
    </g>
  ));
});

const AnclasCapa = memo(function AnclasCapa({ anclasResueltas, anclaSeleccionadaId, onSeleccionarAncla, R }) {
  return anclasResueltas.map((a) => {
    const elegida = a.id === anclaSeleccionadaId;
    const r2c = R * 2;
    return (
      <g
        key={a.id}
        onClick={(e) => { e.stopPropagation(); onSeleccionarAncla(a.id); }}
        style={{ cursor: 'pointer' }}
      >
        <circle cx={a.x} cy={a.y} r={r2c * 2.2} fill="transparent" />
        <circle cx={a.x} cy={a.y} r={r2c} fill="none" stroke={COLOR.ancla} strokeWidth={elegida ? R * 0.5 : R * 0.3} vectorEffect="non-scaling-stroke" />
        <line x1={a.x - r2c * 2} y1={a.y} x2={a.x + r2c * 2} y2={a.y} stroke={COLOR.ancla} strokeWidth={elegida ? R * 0.5 : R * 0.3} vectorEffect="non-scaling-stroke" />
        <line x1={a.x} y1={a.y - r2c * 2} x2={a.x} y2={a.y + r2c * 2} stroke={COLOR.ancla} strokeWidth={elegida ? R * 0.5 : R * 0.3} vectorEffect="non-scaling-stroke" />
        <title>{a.id} — X desde {a.desdeX}, Y desde {a.desdeY}</title>
      </g>
    );
  });
});

export function LienzoAnclaje({
  geo, anclasResueltas, zonasResueltas, anclaSeleccionadaId, zonaSeleccionadaId,
  onSeleccionarAncla, onSeleccionarZona, onDeseleccionar,
  leyenda, modo, onElegirCandidato, onArrastrarZona, senalServidor,
  imagenUrl, borde,
}) {
  const svgRef = useRef(null);
  const idRecorte = 'recorte-' + useId().replace(/[^a-zA-Z0-9]/g, '');
  // Arrastrar una zona sobre el molde (además de "Mover X/Y" en el panel,
  // no en vez de -- pedido explícito del usuario: posicionar a ojo y
  // corregir el decimal a mano si hace falta). Es puramente visual hasta
  // soltar: onArrastrarZona (Productos.jsx·moverZona) recién ahí suma el
  // delta al offset real, en cm redondeados a 1 decimal.
  const [arrastre, setArrastre] = useState(null); // { id, inicio: {x,y}, delta: {x,y} }
  // Espejo del estado en un ref: alSoltar necesita el delta MÁS RECIENTE
  // (no el de cuando arrancó el efecto), pero llamar a onArrastrarZona
  // (efecto real: cambia anclaje.zonas en Productos.jsx) DENTRO de un
  // actualizador de setState es impuro -- React StrictMode lo detecta
  // llamándolo dos veces en desarrollo, y el offset terminaba duplicado.
  // El ref evita necesitar el actualizador para leer el valor vigente.
  const arrastreRef = useRef(null);
  // getScreenCTM() fuerza al navegador a resolver el layout vigente --
  // llamarlo en cada mousemove de un arrastre (junto con el setState de
  // cada frame) es el otro motivo real de que se sintiera poco fluido. La
  // posición/escala del SVG en pantalla no cambia mientras se arrastra, así
  // que la matriz se toma UNA vez al empezar y se reusa hasta soltar.
  const matrizArrastreRef = useRef(null);
  // true entre mousedown y mouseup: mientras es true, `arrastre` se sigue
  // actualizando con cada mousemove. Al soltar pasa a false, pero
  // `arrastre` NO se limpia todavía -- ver el efecto de abajo sobre por
  // qué (el motivo real de que soltar la zona no se sintiera instantáneo).
  const arrastrandoRef = useRef(false);

  // Todos los hooks van ANTES de cualquier return condicionado a `geo` --
  // si `geo` pasa de null a un valor real (o al revés) sin desmontar este
  // componente, un hook después de un return temprano rompería el orden de
  // hooks entre renders (regla de React, no un detalle de estilo).
  const cands = useMemo(
    () => (geo ? candidatosDe(geo, zonasResueltas, zonaSeleccionadaId, leyenda) : []),
    [geo, zonasResueltas, zonaSeleccionadaId, leyenda]
  );
  const puntos = useMemo(
    () => (geo ? geo.vertices.map((v) => v.x + ',' + v.y).join(' ') : ''),
    [geo]
  );
  // Memoizado por el mismo motivo que cands -- no recalcular el offset
  // (aunque sea O(n), no O(n²)) en cada mousemove de un arrastre que no
  // tiene nada que ver con este borde.
  const puntosBorde = useMemo(() => (
    geo && borde?.activo && borde.desplazamientoCm
      ? offsetPoligono(geo.vertices, borde.desplazamientoCm).map((v) => v.x + ',' + v.y).join(' ')
      : puntos
  ), [geo, borde?.activo, borde?.desplazamientoCm, puntos]);

  const puntoEnCm = useCallback((ev) => {
    const svg = svgRef.current;
    try {
      const pt = svg.createSVGPoint();
      pt.x = ev.clientX; pt.y = ev.clientY;
      const m2 = svg.getScreenCTM();
      if (!m2) return null;
      const r = pt.matrixTransform(m2.inverse());
      return { x: r1(r.x), y: r1(r.y) };
    } catch { return null; }
  }, []);

  useEffect(() => {
    if (!arrastre) return undefined;
    function alMover(ev) {
      const svg = svgRef.current;
      const matriz = matrizArrastreRef.current;
      const actual = arrastreRef.current;
      if (!svg || !matriz || !actual) return;
      let p;
      try {
        const pt = svg.createSVGPoint();
        pt.x = ev.clientX; pt.y = ev.clientY;
        const r = pt.matrixTransform(matriz);
        p = { x: r1(r.x), y: r1(r.y) };
      } catch { return; }
      const nuevo = { ...actual, delta: { x: r1(p.x - actual.inicio.x), y: r1(p.y - actual.inicio.y) } };
      arrastreRef.current = nuevo;
      setArrastre(nuevo);
    }
    function alSoltar() {
      // OJO -- acá estaba el motivo real de que "soltar" no se sintiera
      // instantáneo: limpiar `arrastre` en este momento hace que la zona
      // vuelva a pintarse con sus coordenadas VIEJAS (las de zonasResueltas,
      // que todavía no sabe nada del nuevo offset) durante los ~100-500ms
      // que tarda POST /anclaje/resolver en volver con la posición nueva --
      // un salto "atrás, y después adelante" bien visible. La solución no es
      // de renderizado: es no soltar el delta visual hasta que YA HAYA
      // datos nuevos del servidor que lo reemplacen (ver el efecto de más
      // abajo, que mira zonasResueltas).
      window.removeEventListener('mousemove', alMover);
      window.removeEventListener('mouseup', alSoltar);
      arrastrandoRef.current = false;
      matrizArrastreRef.current = null;
      const final = arrastreRef.current;
      if (final && (Math.abs(final.delta.x) >= 0.05 || Math.abs(final.delta.y) >= 0.05)) {
        onArrastrarZona?.(final.id, final.delta.x, final.delta.y);
      } else {
        arrastreRef.current = null;
        setArrastre(null);
      }
    }
    window.addEventListener('mousemove', alMover);
    window.addEventListener('mouseup', alSoltar);
    return () => {
      window.removeEventListener('mousemove', alMover);
      window.removeEventListener('mouseup', alSoltar);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrastre?.id]);

  // Suelta el "congelado" visual recién cuando llega una respuesta NUEVA
  // de verdad del servidor (senalServidor = el objeto `resuelto` de
  // Productos.jsx, que solo cambia de referencia dentro del .then() de
  // POST /anclaje/resolver) -- así la transición es invisible (se sigue
  // viendo la posición soltada todo el tiempo, sin saltos) en vez de
  // depender de la latencia de red para sentirse bien.
  //
  // OJO: NO se puede usar `zonasResueltas` para esto (se probó y falló) --
  // ese array se reconstruye en CADA render de Productos.jsx, incluido el
  // render que dispara moverZona() ANTES de que la respuesta del servidor
  // exista siquiera (mismo `resuelto` viejo, referencia de array nueva) --
  // usarlo como señal soltaba el congelado de inmediato, reproduciendo
  // exactamente el salto que se quería evitar. `senalServidor` (el propio
  // `resuelto`) solo cambia cuando el `.then()` de la promesa realmente
  // corre.
  //
  // `arrastrandoRef` evita soltarlo por error mientras ya hay un arrastre
  // NUEVO en curso (la respuesta del anterior llegando tarde no debe pisar
  // la vista previa del que se está arrastrando ahora). Caso borde no
  // cubierto, a propósito por ser muy raro: dos arrastres seguidos donde la
  // respuesta del SEGUNDO llega antes que la del primero (reordenamiento de
  // red) -- soltaría el congelado del segundo un instante antes de tiempo.
  const senalServidorAnteriorRef = useRef(senalServidor);
  useEffect(() => {
    const cambio = senalServidorAnteriorRef.current !== senalServidor;
    senalServidorAnteriorRef.current = senalServidor;
    if (cambio && !arrastrandoRef.current && arrastreRef.current) {
      arrastreRef.current = null;
      setArrastre(null);
    }
  }, [senalServidor]);

  // Estable entre renders (solo cambia si `modo` cambia): es un prop de
  // ZonaEnLienzo (memoizado), así que si esta función fuera una closure
  // nueva en cada render de LienzoAnclaje, React.memo dejaría de servir de
  // nada -- todas las zonas volverían a reconciliarse en cada mousemove
  // igual que antes.
  const iniciarArrastreZona = useCallback((id, ev) => {
    if (modo) return; // en modo crear/recolocar/cruzar, el clic es para elegir un candidato
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!ctm) return;
    matrizArrastreRef.current = ctm.inverse();
    const p = puntoEnCm(ev);
    if (!p) return;
    arrastrandoRef.current = true;
    const inicial = { id, inicio: p, delta: { x: 0, y: 0 } };
    arrastreRef.current = inicial;
    setArrastre(inicial);
  }, [modo, puntoEnCm]);

  function alClickearSvg(ev) {
    if (!modo) { onDeseleccionar(); return; }
    const p = puntoEnCm(ev);
    if (!p) return;
    let mejor = null, mejorD = -1;
    for (const c of cands) {
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (mejor === null || d < mejorD) { mejor = c; mejorD = d; }
    }
    if (mejor) onElegirCandidato(mejor, r1(mejorD));
  }

  if (!geo) {
    return (
      <div className="flex h-52 items-center justify-center rounded-lg border border-dashed border-border text-sm text-faint-foreground">
        Elegí una pieza para verla.
      </div>
    );
  }

  const W = geo.pieza.ancho_cm, H = geo.pieza.alto_cm;
  const m = Math.max(W, H) * 0.06;
  const R = Math.max(W, H) / 90;
  const F = Math.max(W, H) / 32;

  return (
    <div className={'overflow-hidden rounded-lg border bg-surface-muted ' + (modo ? 'border-primary cursor-crosshair' : 'border-border')}>
      <svg
        ref={svgRef}
        viewBox={(-m) + ' ' + (-m) + ' ' + (W + m * 2) + ' ' + (H + m * 2)}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: 380, display: 'block' }}
        onClick={alClickearSvg}
      >
        <rect x={0} y={0} width={W} height={H} fill="none" stroke="#2b303d" strokeWidth={R * 0.4} />

        {imagenUrl && (
          <>
            {/* El diseño se recorta a la forma REAL del molde (máscara SVG),
                no a un rectángulo -- mismo pedido de la pasada anterior,
                ahora en el lienzo fiel de Illustrator. */}
            <clipPath id={idRecorte}><polygon points={puntos} /></clipPath>
            <image href={imagenUrl} x={0} y={0} width={W} height={H} clipPath={'url(#' + idRecorte + ')'} preserveAspectRatio="xMidYMid slice" />
          </>
        )}
        {!imagenUrl && (
          <polygon points={puntos} fill="rgba(76,141,255,0.06)" stroke="#4c8dff" strokeWidth={R * 0.5} vectorEffect="non-scaling-stroke" />
        )}
        {/* El contorno para láser es independiente de que haya diseño o no --
            es el corte real, no un adorno del arte. Antes vivía adentro del
            "if (imagenUrl)" y desaparecía sin diseño elegido. */}
        {borde?.activo ? (
          <polygon
            points={puntosBorde} fill="none"
            stroke={borde.colorHex}
            strokeWidth={Math.max((borde.grosorCm || 0.03), R * 0.25)}
            vectorEffect="non-scaling-stroke"
          />
        ) : imagenUrl && (
          <polygon points={puntos} fill="none" stroke="#4c8dff" strokeWidth={R * 0.3} opacity={0.5} vectorEffect="non-scaling-stroke" />
        )}

        {zonasResueltas.map((zOriginal) => {
          const arrastrando = arrastre && arrastre.id === zOriginal.id;
          // Mientras se arrastra, el delta es puramente visual (no toca
          // anclaje.zonas hasta soltar) -- se suma acá para que la zona siga
          // al puntero, y en TODO lo que dependa de su posición (fuera de
          // pieza, la cruz del logo, dónde pivota "Girar"). Para cualquier
          // OTRA zona (el caso común mientras se arrastra), `zona` sigue
          // siendo la MISMA referencia que ya tenía -> React.memo la salta.
          const zona = arrastrando
            ? { ...zOriginal, x: zOriginal.x + arrastre.delta.x, y: zOriginal.y + arrastre.delta.y,
                cx: zOriginal.cx + arrastre.delta.x, cy: zOriginal.cy + arrastre.delta.y }
            : zOriginal;
          return (
            <ZonaEnLienzo
              key={zona.id}
              zona={zona}
              seleccionada={zona.id === zonaSeleccionadaId}
              arrastrando={arrastrando}
              modo={modo}
              W={W} H={H} R={R} F={F}
              mostrarSola={zonasResueltas.length <= 1}
              onSeleccionarZona={onSeleccionarZona}
              iniciarArrastreZona={iniciarArrastreZona}
            />
          );
        })}

        <CandidatosCapa cands={cands} modo={modo} onElegirCandidato={onElegirCandidato} R={R} />
        <AnclasCapa anclasResueltas={anclasResueltas} anclaSeleccionadaId={anclaSeleccionadaId} onSeleccionarAncla={onSeleccionarAncla} R={R} />
      </svg>
    </div>
  );
}
