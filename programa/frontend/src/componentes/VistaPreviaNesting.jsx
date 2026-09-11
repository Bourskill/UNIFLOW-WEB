import { Stage, Layer, Rect, Text } from 'react-konva';

// Un pixel por cm es suficiente para la vista previa; no es la resolución del
// PDF final (eso lo decide exportarPdf.js en el backend con puntos reales).
const PX_POR_CM = 6;

export function VistaPreviaNesting({ resultado }) {
  const ancho = resultado.anchoLienzoCm * PX_POR_CM;
  const alto = resultado.altoLienzoCm * PX_POR_CM;

  return (
    <Stage width={ancho} height={alto} className="lienzo-nesting">
      <Layer>
        <Rect x={0} y={0} width={ancho} height={alto} fill="#f5f5f0" stroke="#999" />
        {resultado.piezas.map((pieza) => (
          <Grupo key={pieza.id} pieza={pieza} />
        ))}
      </Layer>
    </Stage>
  );
}

function Grupo({ pieza }) {
  const x = pieza.posicion.x * PX_POR_CM;
  const y = pieza.posicion.y * PX_POR_CM;
  const ancho = pieza.anchoCm * PX_POR_CM;
  const alto = pieza.altoCm * PX_POR_CM;
  const esRotada = pieza.rotacionGrados === 180;

  return (
    <>
      <Rect
        x={x}
        y={y}
        width={ancho}
        height={alto}
        fill={esRotada ? '#ffe0cc' : '#cce5ff'}
        stroke="#333"
        strokeWidth={1}
      />
      <Text
        x={x + 4}
        y={y + 4}
        text={pieza.piezaId + '\n' + pieza.talla + (esRotada ? ' · 180°' : '')}
        fontSize={11}
        fill="#222"
      />
    </>
  );
}
