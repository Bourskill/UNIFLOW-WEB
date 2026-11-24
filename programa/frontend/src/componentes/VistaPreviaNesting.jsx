import { Stage, Layer, Rect, Text, Image as ImagenKonva, Group, Shape } from 'react-konva';
import { useImagenCargada } from './useImagenCargada.js';
import { useFuentesWeb, cssDeFamilia } from './useFuentesWeb.js';
import { URL_FUENTE_BASE } from '../api.js';
import { colocarArte } from '../utilidades/colocarArte.js';
import { fondoActivo, ejeDegradado } from '../utilidades/fondoPieza.js';
import { medidasDeCapsula, caminoDeCapsula } from '../utilidades/capsulaTalla.js';

// Un pixel por cm es suficiente para la vista previa; no es la resolución del
// PDF final (eso lo decide exportarPdf.js en el backend con puntos reales).
const PX_POR_CM = 6;

// Texto ya ajustado a su zona (motor/ajusteTexto.js): se dibuja por su línea
// de base con el cuerpo, tracking y escala que calculó el backend -- las mismas
// cifras con las que exportarPdf.js lo escribe. Rota alrededor del centro de
// la zona, en el sentido del PDF (antihorario para grados positivos).
function TextoAjustado({ texto, familia }) {
  if (!familia) return null; // la fuente todavía carga: mejor nada que otra letra
  const a = texto.ajuste;
  return (
    <Shape
      listening={false}
      sceneFunc={(ctx) => {
        const c = ctx._context;
        c.save();
        c.translate(texto.cxCm * PX_POR_CM, texto.cyCm * PX_POR_CM);
        c.rotate(-((texto.rotacionGrados || 0) * Math.PI) / 180);
        // La talla: su cápsula blanca debajo, centrada en la zona.
        if (texto.capsula) {
          c.beginPath();
          for (const [op, ...p] of caminoDeCapsula(medidasDeCapsula(a, texto.capsula.margenCm))) {
            const q = p.map((v) => v * PX_POR_CM);
            if (op === 'M') c.moveTo(q[0], q[1]);
            else if (op === 'L') c.lineTo(q[0], q[1]);
            else if (op === 'C') c.bezierCurveTo(q[0], q[1], q[2], q[3], q[4], q[5]);
            else c.closePath();
          }
          c.fillStyle = texto.capsula.colorHex || '#ffffff';
          c.fill();
        }
        c.translate(a.dxCm * PX_POR_CM, a.dyCm * PX_POR_CM);
        c.scale(a.escalaH / 100, 1);
        c.font = a.cuerpoCm * PX_POR_CM + 'px ' + cssDeFamilia(familia);
        c.fontKerning = 'none';
        c.letterSpacing = (a.trackingMil / 1000) * a.cuerpoCm * PX_POR_CM + 'px';
        c.fillStyle = texto.colorHex;
        c.textBaseline = 'alphabetic';
        c.fillText(a.texto ?? texto.texto, 0, 0);
        c.restore();
      }}
    />
  );
}

export function VistaPreviaNesting({ resultado }) {
  const ancho = resultado.anchoLienzoCm * PX_POR_CM;
  const alto = resultado.altoLienzoCm * PX_POR_CM;
  const familias = useFuentesWeb([
    URL_FUENTE_BASE,
    ...resultado.piezas.flatMap((p) => (p.textos || []).map((t) => t.fuenteUrl)),
  ]);

  return (
    <Stage width={ancho} height={alto} className="rounded-lg border border-border">
      <Layer>
        <Rect x={0} y={0} width={ancho} height={alto} fill="#f5f5f0" stroke="#999" />
        {resultado.piezas.map((pieza) => (
          <PiezaEnLienzo key={pieza.id} pieza={pieza} familias={familias} />
        ))}
      </Layer>
    </Stage>
  );
}

function PiezaEnLienzo({ pieza, familias }) {
  const x = pieza.posicion.x * PX_POR_CM;
  const y = pieza.posicion.y * PX_POR_CM;
  const ancho = pieza.anchoCm * PX_POR_CM;
  const alto = pieza.altoCm * PX_POR_CM;
  const esRotada = pieza.rotacionGrados === 180;
  // Un arte en PDF trae su vista en PNG (el navegador no dibuja PDF); el PDF
  // de producción usa el original, vectorial.
  const imagen = useImagenCargada(pieza.imagenVistaUrl || pieza.imagenDataUrl);
  // Fondo de color del Diseño (sólido o degradado), debajo del arte -- mismo cálculo que el PDF (fondoPieza.js).
  const fondo = fondoActivo(pieza.fondo);
  const tieneContenidoReal = imagen || fondo || (pieza.textos && pieza.textos.length > 0);

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
    : pieza.ajusteArte || fondo
      ? (ctx) => { ctx.beginPath(); ctx.rect(0, 0, ancho, alto); ctx.closePath(); }
      : undefined;
  // Con ajuste del arte (Diseño), mismo cálculo que el PDF (colocarArte.js).
  const rectArte = imagen && pieza.ajusteArte
    ? colocarArte({
        anchoCm: pieza.anchoCm, altoCm: pieza.altoCm,
        anchoImagen: imagen.naturalWidth || imagen.width, altoImagen: imagen.naturalHeight || imagen.height,
        ajuste: pieza.ajusteArte,
      })
    : null;
  const imagenKonva = imagen && (
    rectArte
      // Con espejo (Ajustar diseño), volteada en su lugar: escala -1 desde el borde opuesto.
      ? <ImagenKonva image={imagen}
          x={(rectArte.x + (rectArte.espejoH ? rectArte.ancho : 0)) * PX_POR_CM} y={(rectArte.y + (rectArte.espejoV ? rectArte.alto : 0)) * PX_POR_CM}
          scaleX={rectArte.espejoH ? -1 : 1} scaleY={rectArte.espejoV ? -1 : 1}
          width={rectArte.ancho * PX_POR_CM} height={rectArte.alto * PX_POR_CM} />
      : <ImagenKonva image={imagen} width={ancho} height={alto} />
  );

  const fondoKonva = fondo && (() => {
    if (fondo.tipo === 'solido') return <Rect width={ancho} height={alto} fill={fondo.color1} listening={false} />;
    const eje = ejeDegradado({ anchoCm: pieza.anchoCm, altoCm: pieza.altoCm, anguloGrados: fondo.anguloGrados });
    return (
      <Rect width={ancho} height={alto} listening={false}
        fillLinearGradientStartPoint={{ x: eje.x1 * PX_POR_CM, y: eje.y1 * PX_POR_CM }}
        fillLinearGradientEndPoint={{ x: eje.x2 * PX_POR_CM, y: eje.y2 * PX_POR_CM }}
        fillLinearGradientColorStops={[0, fondo.color1, 1, fondo.color2]} />
    );
  })();

  return (
    <Group x={x} y={y}>
      {imagen || fondo ? (
        clipFunc ? (
          <Group clipFunc={clipFunc}>{fondoKonva}{imagenKonva}</Group>
        ) : (
          <>{fondoKonva}{imagenKonva}</>
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
        texto.ajuste ? (
          <TextoAjustado key={indice} texto={texto} familia={familias[texto.fuenteUrl || URL_FUENTE_BASE]} />
        ) : (
          // Una generación guardada antes del ajuste a la zona: se ve como se imprimió.
          <Text
            key={indice}
            x={texto.xCm * PX_POR_CM}
            y={texto.yCm * PX_POR_CM}
            text={texto.texto}
            fontSize={texto.altoCm * PX_POR_CM}
            fontStyle="bold"
            fill={texto.colorHex}
            rotation={-(texto.rotacionGrados || 0)}
          />
        )
      ))}
    </Group>
  );
}
