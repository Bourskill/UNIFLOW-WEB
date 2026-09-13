import { ordenarTallasNatural } from '../constantes.js';

// Vista previa del contorno real de una pieza -- todas sus tallas superpuestas
// en la misma escala, como se veía en UNIFLOW/Illustrator (el patrón graduado
// completo, no un rectángulo con un número de ancho×alto). mm en el archivo
// original van con Y hacia arriba; SVG las pinta con Y hacia abajo, así que
// se invierte al armar el path en vez de forzarlo con un transform.
export function TrazosPreview({ geometriaPorTalla, size = 96, className = '' }) {
  const tallas = ordenarTallasNatural(Object.keys(geometriaPorTalla || {}));

  if (tallas.length === 0) {
    return (
      <div
        className={
          'flex items-center justify-center rounded-lg border border-dashed border-border ' +
          'text-[10px] text-faint-foreground ' + className
        }
        style={{ width: size, height: size }}
      >
        sin trazo
      </div>
    );
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const t of tallas) {
    for (const [x, y] of geometriaPorTalla[t].poligonoMm) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const ancho = maxX - minX || 1;
  const alto = maxY - minY || 1;
  const margen = Math.max(ancho, alto) * 0.06;

  function trazoDe(poligonoMm) {
    return (
      poligonoMm
        .map(([x, y], i) => (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + (minY + maxY - y).toFixed(1))
        .join(' ') + ' Z'
    );
  }

  return (
    <svg
      viewBox={(minX - margen) + ' ' + (minY - margen) + ' ' + (ancho + margen * 2) + ' ' + (alto + margen * 2)}
      width={size}
      height={size}
      className={'rounded-lg border border-border bg-surface-muted ' + className}
    >
      {tallas.map((t) => (
        <path
          key={t}
          d={trazoDe(geometriaPorTalla[t].poligonoMm)}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="1.2"
          vectorEffect="non-scaling-stroke"
          opacity="0.85"
        />
      ))}
    </svg>
  );
}
