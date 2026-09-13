import { Stage, Layer, Line, Group, Rect, Text } from 'react-konva';

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
export function CanvasZonas({ poligonoMm, anchoCm, altoCm, elementos, elementoActivoId, onSeleccionar, onMover, onCrear }) {
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

  const puntosPx = poligonoMm.flatMap(([x, y]) => [
    ((x - minX) / 10) * pxPorCm,
    ((maxY - y) / 10) * pxPorCm,
  ]);

  const anchoPx = anchoCm * pxPorCm;
  const altoPx = altoCm * pxPorCm;

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
          <Line
            points={puntosPx}
            closed
            stroke={COLOR_PRIMARIO}
            strokeWidth={1.5}
            fill="rgba(76,141,255,0.08)"
            listening={false}
          />
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
    elemento.tipo === 'texto' && elemento.valorFijo ? elemento.valorFijo : ETIQUETA_TIPO[elemento.tipo] || elemento.tipo;

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
