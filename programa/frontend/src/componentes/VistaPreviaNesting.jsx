import { Stage, Layer, Rect, Text, Image as ImagenKonva, Group } from 'react-konva';
import { useImagenCargada } from './useImagenCargada.js';

// Un pixel por cm es suficiente para la vista previa; no es la resolución del
// PDF final (eso lo decide exportarPdf.js en el backend con puntos reales).
const PX_POR_CM = 6;

export function VistaPreviaNesting({ resultado }) {
  const ancho = resultado.anchoLienzoCm * PX_POR_CM;
  const alto = resultado.altoLienzoCm * PX_POR_CM;

  return (
    <Stage width={ancho} height={alto} className="rounded-lg border border-border">
      <Layer>
        <Rect x={0} y={0} width={ancho} height={alto} fill="#f5f5f0" stroke="#999" />
        {resultado.piezas.map((pieza) => (
          <PiezaEnLienzo key={pieza.id} pieza={pieza} />
        ))}
      </Layer>
    </Stage>
  );
}

function PiezaEnLienzo({ pieza }) {
  const x = pieza.posicion.x * PX_POR_CM;
  const y = pieza.posicion.y * PX_POR_CM;
  const ancho = pieza.anchoCm * PX_POR_CM;
  const alto = pieza.altoCm * PX_POR_CM;
  const esRotada = pieza.rotacionGrados === 180;
  const imagen = useImagenCargada(pieza.imagenDataUrl);
  const tieneContenidoReal = imagen || (pieza.textos && pieza.textos.length > 0);

  // Recorte real a la forma de la pieza, no al rectángulo -- mismo
  // contornoCm (mismas coordenadas cm que zonas/textos) que exportarPdf.js
  // usa para lo mismo en el backend. Sin él, se mantiene el estirado al
  // rectángulo de siempre -- la vista previa nunca debe mostrar menos de
  // lo que el PDF final va a mostrar, solo puede ser menos precisa.
  const tieneContornoReal = pieza.contornoCm?.length >= 3;
  const clipFunc = tieneContornoReal
    ? (ctx) => {
        ctx.beginPath();
        pieza.contornoCm.forEach((v, i) => {
          const px = v.x * PX_POR_CM, py = v.y * PX_POR_CM;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
      }
    : undefined;

  return (
    <Group x={x} y={y}>
      {imagen ? (
        tieneContornoReal ? (
          <Group clipFunc={clipFunc}>
            <ImagenKonva image={imagen} width={ancho} height={alto} />
          </Group>
        ) : (
          <ImagenKonva image={imagen} width={ancho} height={alto} />
        )
      ) : (
        <Rect width={ancho} height={alto} fill={esRotada ? '#ffe0cc' : '#cce5ff'} stroke="#333" strokeWidth={1} />
      )}

      {!tieneContenidoReal && (
        <Text
          x={4}
          y={4}
          text={pieza.piezaId + '\n' + (pieza.talla || '').toUpperCase() + (esRotada ? ' · 180°' : '')}
          fontSize={11}
          fill="#222"
        />
      )}

      {(pieza.textos || []).map((texto, indice) => (
        <Text
          key={indice}
          x={texto.xCm * PX_POR_CM}
          y={texto.yCm * PX_POR_CM}
          text={texto.texto}
          fontSize={texto.altoCm * PX_POR_CM}
          fontStyle="bold"
          fill={texto.colorHex}
        />
      ))}
    </Group>
  );
}
