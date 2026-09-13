import { Stage, Layer, Line, Group, Rect, Text, Circle, Image as ImagenKonva } from 'react-konva';
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
// Las anclas son OTRA clase de objeto que las zonas (un punto, no una caja
// de contenido) -- un color distinto evita confundirlas de un vistazo,
// igual que en el panel de Illustrator (cruz + círculo, como guía).
const COLOR_ANCLA = '#f5a623';

const ETIQUETA_CAMPO = { nombre: 'Nombre', numero: 'N°', fijo: 'Texto' };

// Grosor mínimo VISIBLE en pantalla para el borde de contraste. El grosor
// real configurado (0.03cm por defecto) es el correcto para producción, pero
// a la escala de este canvas eso es menos de 1px -- no significa que el
// borde "no está", solo que a este zoom hay que exagerarlo para poder verlo.
const GROSOR_BORDE_MIN_PX = 1.5;

// El contorno real de la pieza (no un rectángulo) como fondo, con las
// ANCLAS (puntos, cruz+círculo como en Illustrator) y las ZONAS (cajas de
// contenido, ancladas a una o dos anclas) encima -- puerto fiel del sistema
// de zonas/anclajes de Illustrator (ver motor/anclaje/ en el backend). Ni
// las anclas ni las zonas guardan su posición en cm sueltos: lo que se
// guarda es la RELACIÓN (a qué se agarran); lo que este componente dibuja
// son las posiciones YA RESUELTAS para la talla de trabajo elegida
// (vienen de POST /anclaje/resolver, ver Productos.jsx) -- por eso
// arrastrar una ancla o una zona no mueve directamente su x/y: convierte el
// arrastre a un ajuste (delta en cm) sobre su referencia, para no romper la
// relación con la que gradúa.
//
// Mismo sistema de coordenadas que ya usaba este componente antes de tener
// anclas: cm medidos desde la esquina superior izquierda de la pieza, Y
// hacia abajo -- por eso se invierte Y del polígono (que viene en mm con Y
// hacia arriba) en vez de inventar una convención nueva.
export function CanvasZonas({
  poligonoMm,
  anchoCm,
  altoCm,
  imagenUrl,
  borde,
  anclas,
  zonas,
  anclaActivaId,
  zonaActivaId,
  onSeleccionarAncla,
  onSeleccionarZona,
  modoElegirVertice,
  onElegirVertice,
  onCrearAncla,
  onMoverAncla,
  onMoverZona,
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
    if (modoElegirVertice) return; // en ese modo, solo los puntos del contorno responden
    if (e.target !== e.target.getStage() && e.target.name() !== 'fondo-pieza') return;
    const pos = e.target.getStage().getPointerPosition();
    onCrearAncla((pos.x - 20) / pxPorCm, (pos.y - 20) / pxPorCm);
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
              listening={modoElegirVertice ? false : true}
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

          {modoElegirVertice &&
            puntosParesPx.map(([x, y], indice) => (
              <Circle
                key={indice}
                x={x}
                y={y}
                radius={4}
                fill={COLOR_ANCLA}
                stroke={COLOR_SOBRE_PRIMARIO}
                strokeWidth={1}
                onClick={(e) => {
                  e.cancelBubble = true;
                  onElegirVertice(indice, puntosParesPx.length);
                }}
              />
            ))}

          {(zonas || []).map((z) => (
            <ZonaArrastrable
              key={z.id}
              zona={z}
              activo={z.id === zonaActivaId}
              pxPorCm={pxPorCm}
              onSeleccionar={() => onSeleccionarZona(z.id)}
              onMover={onMoverZona}
            />
          ))}

          {!modoElegirVertice &&
            (anclas || []).map((a) => (
              <AnclaArrastrable
                key={a.id}
                ancla={a}
                activo={a.id === anclaActivaId}
                pxPorCm={pxPorCm}
                onSeleccionar={() => onSeleccionarAncla(a.id)}
                onMover={onMoverAncla}
              />
            ))}
        </Layer>
      </Stage>
      <p className="mt-1 text-xs text-faint-foreground">
        {modoElegirVertice
          ? 'Hacé clic en un punto del contorno para anclar ahí.'
          : 'Clic en el molde para agregar un ancla ahí · arrastrá un ancla o una zona para ajustarla.'}
      </p>
    </div>
  );
}

// Cruz + círculo, como dibujaba host.jsx (dibujarMarcaDeAncla): una guía,
// no un cuadro de contenido -- distinta de una zona a propósito.
function AnclaArrastrable({ ancla, activo, pxPorCm, onSeleccionar, onMover }) {
  const R = 6;
  const x = ancla.x * pxPorCm;
  const y = ancla.y * pxPorCm;
  return (
    <Group
      x={x}
      y={y}
      draggable
      onClick={(e) => { e.cancelBubble = true; onSeleccionar(); }}
      onDragStart={(e) => { e.cancelBubble = true; onSeleccionar(); }}
      onDragEnd={(e) => {
        const dxCm = (e.target.x() - x) / pxPorCm;
        const dyCm = (e.target.y() - y) / pxPorCm;
        e.target.position({ x: 0, y: 0 }); // el reposicionamiento real llega por props tras resolver de nuevo
        onMover(ancla.id, dxCm, dyCm);
      }}
    >
      <Circle radius={R} stroke={COLOR_ANCLA} strokeWidth={activo ? 2.5 : 1.5} fill="rgba(245,166,35,0.15)" />
      <Line points={[-R * 1.6, 0, R * 1.6, 0]} stroke={COLOR_ANCLA} strokeWidth={activo ? 2 : 1} />
      <Line points={[0, -R * 1.6, 0, R * 1.6]} stroke={COLOR_ANCLA} strokeWidth={activo ? 2 : 1} />
      {ancla.nombre && (
        <Text text={ancla.nombre} x={R * 1.8} y={-7} fontSize={11} fill={COLOR_ANCLA} />
      )}
    </Group>
  );
}

function ZonaArrastrable({ zona, activo, pxPorCm, onSeleccionar, onMover }) {
  const x = zona.x * pxPorCm;
  const y = zona.y * pxPorCm;
  const anchoPx = Math.max(zona.ancho * pxPorCm, 10);
  const altoPx = Math.max(zona.alto * pxPorCm, 10);
  const etiqueta =
    zona.campoPedido === 'fijo' && zona.valorFijo ? zona.valorFijo :
    zona.valorEjemplo ? zona.valorEjemplo :
    ETIQUETA_CAMPO[zona.campoPedido] || zona.tipo;

  return (
    <Group
      x={x}
      y={y}
      draggable
      onClick={(e) => { e.cancelBubble = true; onSeleccionar(); }}
      onDragStart={(e) => { e.cancelBubble = true; onSeleccionar(); }}
      onDragEnd={(e) => {
        const dxCm = (e.target.x() - x) / pxPorCm;
        const dyCm = (e.target.y() - y) / pxPorCm;
        e.target.position({ x: 0, y: 0 });
        onMover(zona.id, dxCm, dyCm);
      }}
    >
      <Rect
        width={anchoPx}
        height={altoPx}
        fill={activo ? COLOR_PRIMARIO : 'rgba(76,141,255,0.25)'}
        stroke={COLOR_PRIMARIO}
        strokeWidth={activo ? 2 : 1}
        cornerRadius={3}
      />
      <Text
        text={etiqueta}
        width={anchoPx}
        height={altoPx}
        align="center"
        verticalAlign="middle"
        fontSize={Math.min(altoPx * 0.6, 13)}
        fill={activo ? COLOR_SOBRE_PRIMARIO : COLOR_TEXTO}
      />
    </Group>
  );
}
