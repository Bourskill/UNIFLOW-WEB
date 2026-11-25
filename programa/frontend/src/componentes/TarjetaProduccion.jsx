import { useId } from 'react';
import { Boton, Chip } from './ui.jsx';
import { geometriaParaAnclaje } from '../utilidades/geometriaAnclaje.js';
import { fondoDePieza, ejeDegradado } from '../utilidades/fondoPieza.js';
import { ordenarTallasNatural } from '../constantes.js';
import { espejarGeometriaPorTalla, claveDelOtroLado } from '../utilidades/espejoPieza.js';
import { gruposDeProduccion } from '../utilidades/moldesDeProduccion.js';

// Una producción (antes "producto") como tarjeta, igual que las de la
// Biblioteca: miniatura con sus piezas -- la forma real, el fondo de color y
// la imagen del diseño de cada una -- y los datos para reconocerla. "Editar"
// la abre en el editor de arriba, con todo lo que tenía guardado.

const MAX_PIEZAS = 4;

function tallaDeMuestra(pieza) {
  const tallas = ordenarTallasNatural(Object.keys(pieza?.dimensionesPorTalla || {}));
  if (tallas.length === 0) return null;
  return tallas.find((t) => t.toUpperCase() === 'L') || tallas[Math.floor((tallas.length - 1) / 2)];
}

// Las piezas de la producción con lo que hace falta para dibujarlas.
export function piezasDeProduccion(produccion, grupos, piezas, disenos) {
  // Con los moldes que la producción cambió (MANGA → MANGA LARGA): la miniatura muestra esos.
  const gruposDe = gruposDeProduccion(produccion, grupos);
  const namespacear = gruposDe.length > 1;
  const diseno = disenos.find((d) => d.id === produccion.disenoId) || null;
  const salida = [];
  for (const g of gruposDe) {
    for (const gp of g.piezas) {
      const pieza = piezas.find((p) => p.id === gp.piezaId);
      const talla = tallaDeMuestra(pieza);
      const geo = pieza && talla ? geometriaParaAnclaje(pieza, talla) : null;
      if (!geo) continue;
      const clave = namespacear ? g.id + '::' + gp.rol : gp.rol;
      const dibujo = (claveDiseno) => {
        const vista = diseno?.vistasPorPieza?.[claveDiseno] || diseno?.imagenesPorPieza?.[claveDiseno] || null;
        return {
          imagen: vista && !/\.pdf(\?|$)/i.test(vista) ? vista : null,
          fondo: diseno ? fondoDePieza(diseno, claveDiseno) : null,
        };
      };
      salida.push({ clave, rol: gp.rol, geo, ...dibujo(clave) });
      // Pieza en par: también su otro lado, reflejado, con su diseño propio o el mismo.
      if (gp.par) {
        const geoOtro = geometriaParaAnclaje({ ...pieza, geometriaPorTalla: espejarGeometriaPorTalla(pieza.geometriaPorTalla) }, talla);
        const claveOtro = claveDelOtroLado(clave);
        if (geoOtro) salida.push({ clave: claveOtro, rol: gp.rol + ' (otro lado)', geo: geoOtro, ...dibujo(produccion.ladosPropios?.[clave] ? claveOtro : clave) });
      }
    }
  }
  return salida;
}

function MiniPieza({ geo, imagen, fondo }) {
  const id = 'mini-' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const W = geo.pieza.ancho_cm, H = geo.pieza.alto_cm;
  const puntos = geo.vertices.map((v) => v.x + ',' + v.y).join(' ');
  const eje = fondo?.tipo === 'degradado' ? ejeDegradado({ anchoCm: W, altoCm: H, anguloGrados: fondo.anguloGrados }) : null;
  const relleno = fondo ? (eje ? 'url(#' + id + '-g)' : fondo.color1) : 'rgba(76,141,255,0.08)';
  return (
    <svg viewBox={'0 0 ' + W + ' ' + H} preserveAspectRatio="xMidYMid meet" className="h-full max-w-full" style={{ aspectRatio: W + ' / ' + H }}>
      <defs>
        <clipPath id={id + '-c'}><polygon points={puntos} /></clipPath>
        {eje && (
          <linearGradient id={id + '-g'} gradientUnits="userSpaceOnUse" x1={eje.x1} y1={eje.y1} x2={eje.x2} y2={eje.y2}>
            <stop offset="0" stopColor={fondo.color1} /><stop offset="1" stopColor={fondo.color2} />
          </linearGradient>
        )}
      </defs>
      <polygon points={puntos} fill={relleno} />
      {imagen && (
        <image href={imagen} x={0} y={0} width={W} height={H} preserveAspectRatio="xMidYMid slice" clipPath={'url(#' + id + '-c)'} />
      )}
      <polygon points={puntos} fill="none" stroke="#4c8dff" strokeOpacity={imagen || fondo ? 0.35 : 0.9} strokeWidth={Math.max(W, H) / 120} />
    </svg>
  );
}

// onExportar, onDuplicar y onEliminar son opcionales: Producción exporta, Diseño elimina.
export function TarjetaProduccion({ produccion, grupos, piezas, disenos, editando, onEditar, onEliminar, onExportar, exportando, onDuplicar, duplicando }) {
  const piezasDibujo = piezasDeProduccion(produccion, grupos, piezas, disenos);
  const ids = produccion.grupoIds || (produccion.grupoId ? [produccion.grupoId] : []);
  const nombresPrendas = ids.map((id) => grupos.find((g) => g.id === id)?.nombre).filter(Boolean);
  const diseno = disenos.find((d) => d.id === produccion.disenoId);
  const zonas = produccion.anclaje?.zonas?.length || 0;
  const conImagen = piezasDibujo.filter((p) => p.imagen).length;

  return (
    <article
      className={
        'flex flex-col overflow-hidden rounded-xl border bg-surface shadow-sm transition-[border-color,box-shadow] hover:shadow-md ' +
        (editando ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/40')
      }
    >
      <button type="button" onClick={onEditar} className="relative block aspect-[4/3] w-full border-b border-border bg-surface-muted"
        title={'Abrir «' + produccion.nombre + '» en el editor'}>
        {piezasDibujo.length === 0 ? (
          <span className="absolute inset-0 flex items-center justify-center text-xs text-faint-foreground">
            {nombresPrendas.length ? 'Sin piezas para mostrar' : 'La prenda ya no existe'}
          </span>
        ) : (
          <span className="absolute inset-3 flex items-end justify-center gap-2">
            {piezasDibujo.slice(0, MAX_PIEZAS).map((p) => (
              <span key={p.clave} className="flex h-full min-w-0 flex-1 items-center justify-center" title={p.rol}>
                <MiniPieza geo={p.geo} imagen={p.imagen} fondo={p.fondo} />
              </span>
            ))}
          </span>
        )}
        {piezasDibujo.length > MAX_PIEZAS && (
          <span className="absolute bottom-2 right-2 rounded-md bg-background/80 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            +{piezasDibujo.length - MAX_PIEZAS} piezas
          </span>
        )}
        {editando && (
          <span className="absolute left-2.5 top-2.5 rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
            En el editor
          </span>
        )}
      </button>

      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h3 className="font-semibold leading-snug" title={produccion.nombre}>{produccion.nombre}</h3>
        <div className="flex flex-wrap gap-1">
          {nombresPrendas.length
            ? nombresPrendas.map((n) => <Chip key={n}>{n}</Chip>)
            : <span className="text-xs text-danger">prenda eliminada</span>}
        </div>
        <div className="text-xs text-muted-foreground">
          {diseno ? 'Diseño: ' + diseno.nombre : 'Sin diseño'}
          {diseno && piezasDibujo.length > 0 && ' · ' + conImagen + ' de ' + piezasDibujo.length + ' piezas con imagen'}
        </div>
        <div className="mt-auto pt-1 text-xs text-faint-foreground">
          {zonas === 0 ? 'Sin zonas todavía' : zonas + (zonas === 1 ? ' zona' : ' zonas') + ' (nombre, número, logos…)'}
        </div>
      </div>

      <div className="flex items-center gap-1 border-t border-border px-2 py-1.5">
        <Boton type="button" variante={editando ? 'acento' : 'fantasma'} tamano="sm" onClick={onEditar} disabled={editando}>
          {editando ? 'Editando' : 'Editar'}
        </Boton>
        {onExportar && (
          <Boton type="button" variante={exportando ? 'acento' : 'fantasma'} tamano="sm" onClick={onExportar}
            title="Cada talla como la prenda completa: una mesa por pieza, con su contorno láser">
            {exportando ? 'Cerrar' : 'Exportar'}
          </Boton>
        )}
        {onDuplicar && (
          <Boton type="button" variante="fantasma" tamano="sm" onClick={onDuplicar} disabled={duplicando}
            title="Una copia independiente (con su propio diseño) para hacerle cambios sin tocar esta">
            {duplicando ? 'Duplicando…' : 'Duplicar'}
          </Boton>
        )}
        {onEliminar && <Boton type="button" variante="fantasma" tamano="sm" className="ml-auto text-danger" onClick={onEliminar}>Eliminar</Boton>}
      </div>
    </article>
  );
}
