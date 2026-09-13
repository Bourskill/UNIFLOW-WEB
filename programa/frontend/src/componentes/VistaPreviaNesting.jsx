import { useEffect, useState } from 'react';
import { Stage, Layer, Rect, Text, Image as ImagenKonva, Group } from 'react-konva';

// Un pixel por cm es suficiente para la vista previa; no es la resolución del
// PDF final (eso lo decide exportarPdf.js en el backend con puntos reales).
const PX_POR_CM = 6;

function useImagenCargada(dataUrl) {
  const [imagen, setImagen] = useState(null);
  useEffect(() => {
    if (!dataUrl) {
      setImagen(null);
      return;
    }
    const elemento = new window.Image();
    elemento.crossOrigin = 'anonymous'; // la imagen ahora suele venir de Supabase Storage, no embebida
    elemento.onload = () => setImagen(elemento);
    elemento.src = dataUrl;
  }, [dataUrl]);
  return imagen;
}

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

  return (
    <Group x={x} y={y}>
      {imagen ? (
        <ImagenKonva image={imagen} width={ancho} height={alto} />
      ) : (
        <Rect width={ancho} height={alto} fill={esRotada ? '#ffe0cc' : '#cce5ff'} stroke="#333" strokeWidth={1} />
      )}

      {!tieneContenidoReal && (
        <Text
          x={4}
          y={4}
          text={pieza.piezaId + '\n' + pieza.talla + (esRotada ? ' · 180°' : '')}
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
