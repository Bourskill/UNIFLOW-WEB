import { Stage, Layer, Line, Group, Rect, Text, Image as ImagenKonva } from 'react-konva';
import { useImagenCargada } from './useImagenCargada.js';

const MAX_ANCHO_PX = 460;
const MAX_ALTO_PX = 480;
const PX_POR_CM_TOPE = 16; // una pieza chica no se agranda más que esto

// Konva pinta sobre un <canvas> real, no el DOM -- a diferencia de TrazosPreview
// (SVG), acá los `var(--color-*)` de index.css no se resuelven solos. Mismos
// valores que el tema oscuro, en literal.
const COLOR_PRIMARIO = '#4c8dff';
const COLOR_SOBRE_PRIMARIO = '#0d0f14';
const COLOR_TEXTO = '#e6e9f0';

const ETIQUETA_TIPO = { nombre: 'Nombre', numero: 'N°', texto: 'Texto' };

// Grosor mínimo VISIBLE en pantalla para el borde de contraste. El grosor
// real configurado (0.03cm por defecto) es el correcto para producción, pero
// a la escala de este canvas eso es menos de 1px -- no significa que el
// borde "no está", solo que a este zoom hay que exagerarlo para poder verlo.
const GROSOR_BORDE_MIN_PX = 1.5;

// El contorno real de la pieza (no un rectángulo) como fondo, y cada
// elemento (nombre/número/texto) como una caja arrastrable encima -- eso es
// lo que pedía el usuario en vez de tipear X/Y a ciegas en un formulario.
// Mismo sistema de coordenadas que ya usan calibracion.js/exportarPdf.js:
// cm medidos desde la esquina superior izquierda de la pieza, Y hacia abajo
// -- por eso acá se invierte Y del polígono (que viene en mm con Y hacia
// arriba) en vez de inventar una convención nueva. La escala (px por cm) se
// calcula para que la pieza siempre entre en un tamaño de canvas razonable
// -- una espalda de 76cm de alto no puede pintarse al mismo px/cm que un
// cuello de 8cm.
//
// Si se pasa `imagenUrl`, el diseño se pinta de fondo RECORTADO a la forma
// real del polígono (Konva `clipFunc`), no estirado a un rectángulo -- "el
// diseño va adentro del molde como máscara". `borde` agrega encima el
// contorno de contraste opcional para no perder los piquetes bajo el diseño
// (grosor real en cm, color a elección del usuario -- detectar el color
// dominante del diseño para elegir el contraste solo no está implementado,
// se deja a mano a propósito).
export function CanvasZonas({
  poligonoMm,
  anchoCm,
  altoCm,
  imagenUrl,
  borde,
  elementos,
  elementoActivoId,
  onSeleccionar,
  onMover,
  onCrear,
}) {
  const imagen = useImagenCargada(imagenUrl);

  if (!poligonoMm || poligonoMm.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border text-sm text-faint-foreground">
        Esta pieza todavía no tiene geometría cargada.
      </div>
    );
  }

  const pxPorCm = Math.min(MAX_ANCHO_PX / anchoCm, MAX_ALTO_PX / altoCm, PX_POR_CM_TOPE);

  const xs = poligonoMm.map((p) => p[0]);
  const ys = poligonoMm.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxY = Math.max(...ys);

  const puntosParesPx = poligonoMm.map(([x, y]) => [
    ((x - minX) / 10) * pxPorCm,
    ((maxY - y) / 10) * pxPorCm,
  ]);
  const puntosPx = puntosParesPx.flat();

  const anchoPx = anchoCm * pxPorCm;
  const altoPx = altoCm * pxPorCm;

  function recortarAlPoligono(ctx) {
    ctx.beginPath();
    ctx.moveTo(puntosParesPx[0][0], puntosParesPx[0][1]);
    for (let i = 1; i < puntosParesPx.length; i++) ctx.lineTo(puntosParesPx[i][0], puntosParesPx[i][1]);
    ctx.closePath();
  }

  function alClickearFondo(e) {
    if (e.target !== e.target.getStage() && e.target.name() !== 'fondo-pieza') return;
    const pos = e.target.getStage().getPointerPosition();
    onCrear((pos.x - 20) / pxPorCm, (pos.y - 20) / pxPorCm);
  }

  return (
    <div className="overflow-auto rounded-lg border border-border bg-surface-muted p-3">
      <Stage width={anchoPx + 40} height={altoPx + 40} onClick={alClickearFondo}>
        <Layer x={20} y={20}>
          <Rect name="fondo-pieza" x={0} y={0} width={anchoPx} height={altoPx} fill="transparent" />

          {imagen ? (
            <Group clipFunc={recortarAlPoligono}>
              <ImagenKonva image={imagen} x={0} y={0} width={anchoPx} height={altoPx} listening={false} />
            </Group>
          ) : (
            <Line
              points={puntosPx}
              closed
              stroke={COLOR_PRIMARIO}
              strokeWidth={1.5}
              fill="rgba(76,141,255,0.08)"
              listening={false}
            />
          )}

          {imagen && (
            <Line
              points={puntosPx}
              closed
              stroke={borde?.activo ? borde.colorHex : COLOR_PRIMARIO}
              strokeWidth={borde?.activo ? Math.max((borde.grosorCm || 0.03) * pxPorCm, GROSOR_BORDE_MIN_PX) : 1}
              opacity={borde?.activo ? 1 : 0.5}
              listening={false}
            />
          )}

          {elementos.map((el) => (
            <ZonaArrastrable
              key={el.id}
              elemento={el}
              activo={el.id === elementoActivoId}
              pxPorCm={pxPorCm}
              onSeleccionar={() => onSeleccionar(el.id)}
              onMover={onMover}
            />
          ))}
        </Layer>
      </Stage>
      <p className="mt-1 text-xs text-faint-foreground">
        Clic en el molde para agregar una zona ahí · arrastrá una zona para reposicionarla.
      </p>
    </div>
  );
}

function ZonaArrastrable({ elemento, activo, pxPorCm, onSeleccionar, onMover }) {
  const altoTextoPx = (elemento.referenciaProporcional?.altoCm || 3) * pxPorCm;
  const anchoAprox = elemento.tipo === 'numero' ? altoTextoPx * 1.4 : altoTextoPx * 3.2;
  const etiqueta =
    elemento.tipo === 'texto' && elemento.valorFijo ? elemento.valorFijo :
    elemento.valorEjemplo ? elemento.valorEjemplo :
    ETIQUETA_TIPO[elemento.tipo] || elemento.tipo;

  return (
    <Group
      x={elemento.posicion.xCm * pxPorCm}
      y={elemento.posicion.yCm * pxPorCm}
      draggable
      onClick={(e) => { e.cancelBubble = true; onSeleccionar(); }}
      onDragStart={(e) => { e.cancelBubble = true; onSeleccionar(); }}
      onDragEnd={(e) => onMover(elemento.id, e.target.x() / pxPorCm, e.target.y() / pxPorCm)}
    >
      <Rect
        width={anchoAprox}
        height={altoTextoPx}
        fill={activo ? COLOR_PRIMARIO : 'rgba(76,141,255,0.25)'}
        stroke={COLOR_PRIMARIO}
        strokeWidth={activo ? 2 : 1}
        cornerRadius={3}
      />
      <Text
        text={etiqueta}
        width={anchoAprox}
        height={altoTextoPx}
        align="center"
        verticalAlign="middle"
        fontSize={Math.min(altoTextoPx * 0.6, 13)}
        fill={activo ? COLOR_SOBRE_PRIMARIO : COLOR_TEXTO}
      />
    </Group>
  );
}
