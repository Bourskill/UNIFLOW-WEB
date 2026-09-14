import { useEffect, useState } from 'react';
import { listarGrupos, listarPiezas, eliminarGrupo } from '../api.js';
import { Boton, Tarjeta, Chip } from '../componentes/ui.jsx';
import { TrazosPreview } from '../componentes/TrazosPreview.jsx';
import { ordenarTallasNatural } from '../constantes.js';

function tallasDe(grupo, piezas) {
  const tallas = new Set();
  for (const gp of grupo.piezas) {
    const pieza = piezas.find((p) => p.id === gp.piezaId);
    Object.keys(pieza?.dimensionesPorTalla || {}).forEach((t) => tallas.add(t));
  }
  return ordenarTallasNatural([...tallas]);
}

function TarjetaPrenda({ grupo, piezas, onAbrir, onBorrar }) {
  const piezasReales = grupo.piezas.map((gp) => ({ ...gp, pieza: piezas.find((p) => p.id === gp.piezaId) }));

  return (
    <Tarjeta className="flex cursor-pointer flex-col gap-3 transition-colors hover:border-primary/40" onClick={onAbrir}>
      <div className="grid grid-cols-2 gap-1.5">
        {piezasReales.slice(0, 4).map((gp, i) => (
          <TrazosPreview key={i} geometriaPorTalla={gp.pieza?.geometriaPorTalla || {}} size={64} />
        ))}
      </div>
      <div>
        <div className="font-medium">{grupo.nombre}</div>
        <div className="text-xs text-muted-foreground">
          {grupo.piezas.length} pieza{grupo.piezas.length === 1 ? '' : 's'}
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {tallasDe(grupo, piezas).length === 0 ? (
          <span className="text-xs text-faint-foreground">sin tallas cargadas</span>
        ) : (
          tallasDe(grupo, piezas).map((t) => <Chip key={t} className="uppercase">{t}</Chip>)
        )}
      </div>
      <div onClick={(e) => e.stopPropagation()}>
        <Boton variante="fantasma" tamano="sm" onClick={onBorrar}>Eliminar</Boton>
      </div>
    </Tarjeta>
  );
}

function DetallePrenda({ grupo, piezas, onVolver }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Boton variante="fantasma" tamano="sm" onClick={onVolver}>← Volver al catálogo</Boton>
      </div>
      <div>
        <h2 className="text-lg font-semibold">{grupo.nombre}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {grupo.piezas.length} pieza{grupo.piezas.length === 1 ? '' : 's'} — tallas disponibles:{' '}
          {tallasDe(grupo, piezas).map((t) => t.toUpperCase()).join(', ') || 'ninguna cargada'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {grupo.piezas.map((gp) => {
          const pieza = piezas.find((p) => p.id === gp.piezaId);
          return (
            <Tarjeta key={gp.piezaId + gp.rol} className="flex gap-3">
              <TrazosPreview geometriaPorTalla={pieza?.geometriaPorTalla || {}} size={80} />
              <div className="flex flex-col gap-1">
                <div className="text-sm font-medium">{gp.rol}</div>
                {!pieza ? (
                  <span className="text-xs text-danger">pieza eliminada de la biblioteca</span>
                ) : (
                  <>
                    <div className="text-xs text-muted-foreground">{pieza.nombre}</div>
                    {pieza.categoria && <div className="text-xs text-faint-foreground">{pieza.categoria}</div>}
                    <div className="mt-1 flex flex-wrap gap-1">
                      {ordenarTallasNatural(Object.keys(pieza.dimensionesPorTalla || {})).map((t) => (
                        <Chip key={t}>{t.toUpperCase()}: {pieza.dimensionesPorTalla[t].anchoCm}×{pieza.dimensionesPorTalla[t].altoCm}cm</Chip>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </Tarjeta>
          );
        })}
      </div>
    </div>
  );
}

// El catálogo: cada prenda es una card (mosaico de sus piezas + tallas
// disponibles); entrar a una muestra el detalle real de qué piezas la
// forman, con su contorno real -- no una lista de texto plano.
export function Prendas({ recargarSenal }) {
  const [grupos, setGrupos] = useState([]);
  const [piezas, setPiezas] = useState([]);
  const [seleccionado, setSeleccionado] = useState(null);
  // Ver el comentario igual en Piezas.jsx: sin esto, la primera visita
  // muestra "Todavía no hay ninguna prenda armada" mientras el fetch sigue
  // en vuelo -- indistinguible de que de verdad no haya ninguna.
  const [cargando, setCargando] = useState(true);

  async function recargar() {
    setCargando(true);
    try {
      const [gs, ps] = await Promise.all([listarGrupos(), listarPiezas()]);
      setGrupos(gs);
      setPiezas(ps);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recargarSenal]);

  async function borrar(id) {
    await eliminarGrupo(id);
    if (seleccionado === id) setSeleccionado(null);
    await recargar();
  }

  const grupoAbierto = grupos.find((g) => g.id === seleccionado);

  if (grupoAbierto) {
    return (
      <div className="pagina">
        <DetallePrenda grupo={grupoAbierto} piezas={piezas} onVolver={() => setSeleccionado(null)} />
      </div>
    );
  }

  return (
    <div className="pagina flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Prendas</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          El catálogo de prendas armadas. Para crear una nueva, subí o elegí sus piezas en{' '}
          <strong>Subir piezas</strong>.
        </p>
      </div>

      {cargando ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : grupos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay ninguna prenda armada.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {grupos.map((g) => (
            <TarjetaPrenda
              key={g.id}
              grupo={g}
              piezas={piezas}
              onAbrir={() => setSeleccionado(g.id)}
              onBorrar={() => borrar(g.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
