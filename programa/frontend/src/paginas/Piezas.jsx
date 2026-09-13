import { useEffect, useMemo, useState } from 'react';
import { listarPiezas, listarGrupos, editarPieza, eliminarPieza } from '../api.js';
import { PRESETS_ANGULOS, ordenarTallasNatural } from '../constantes.js';
import { Boton, Campo, Input, Select, Tarjeta, Chip } from '../componentes/ui.jsx';
import { TrazosPreview } from '../componentes/TrazosPreview.jsx';

function presetDe(angulosPermitidos) {
  if (angulosPermitidos === 'libre') return 'libre';
  const preset = PRESETS_ANGULOS.find(
    (p) => Array.isArray(p.valores) && JSON.stringify(p.valores) === JSON.stringify(angulosPermitidos)
  );
  return preset?.id || '0-180';
}

function FilaPieza({ pieza, usadaEn, onCambio, onBorrar }) {
  const [editando, setEditando] = useState(false);
  const [categoria, setCategoria] = useState(pieza.categoria || '');
  const [tela, setTela] = useState(pieza.tela || '');
  const [presetAngulos, setPresetAngulos] = useState(presetDe(pieza.angulosPermitidos));

  async function guardar() {
    const preset = PRESETS_ANGULOS.find((p) => p.id === presetAngulos);
    await editarPieza(pieza.id, { categoria: categoria || null, tela: tela || null, angulosPermitidos: preset.valores });
    setEditando(false);
    onCambio();
  }

  const tallas = ordenarTallasNatural(Object.keys(pieza.dimensionesPorTalla || {}));

  return (
    <Tarjeta className="flex flex-col gap-3">
      <div className="flex items-start gap-4">
        <TrazosPreview geometriaPorTalla={pieza.geometriaPorTalla || {}} size={90} />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{pieza.nombre}</span>
            {pieza.categoria && <Chip>{pieza.categoria}</Chip>}
            {pieza.tela && <span className="text-xs text-faint-foreground">· {pieza.tela}</span>}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {tallas.length === 0 ? (
              <span className="text-xs text-faint-foreground">sin geometría cargada</span>
            ) : (
              tallas.map((t) => (
                <Chip key={t}>{t}: {pieza.dimensionesPorTalla[t].anchoCm}×{pieza.dimensionesPorTalla[t].altoCm}cm</Chip>
              ))
            )}
          </div>
          <div className="mt-1.5 text-xs text-faint-foreground">
            {usadaEn.length === 0 ? 'Sin usar en ninguna prenda todavía' : 'Usada en: ' + usadaEn.join(', ')}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Boton variante="secundario" tamano="sm" onClick={() => setEditando((v) => !v)}>
            {editando ? 'Cerrar' : 'Editar'}
          </Boton>
          <Boton variante="fantasma" tamano="sm" onClick={onBorrar}>Eliminar</Boton>
        </div>
      </div>

      {editando && (
        <div className="flex flex-wrap items-end gap-3 border-t border-border pt-3">
          <Campo etiqueta="Categoría" className="max-w-[180px]">
            <Input value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Delantero, Manga…" />
          </Campo>
          <Campo etiqueta="Tela por defecto" className="max-w-[180px]">
            <Input value={tela} onChange={(e) => setTela(e.target.value)} placeholder="Dry Fit" />
          </Campo>
          <Campo etiqueta="Ángulos de rotación permitidos" className="max-w-[240px]">
            <Select value={presetAngulos} onChange={(e) => setPresetAngulos(e.target.value)}>
              {PRESETS_ANGULOS.map((p) => <option key={p.id} value={p.id}>{p.etiqueta}</option>)}
            </Select>
          </Campo>
          <Boton variante="primario" tamano="sm" onClick={guardar}>Guardar cambios</Boton>
        </div>
      )}
    </Tarjeta>
  );
}

// Biblioteca de piezas: no se sube nada acá (eso vive en "Subir piezas") —
// esto es ver qué hay, filtrar por categoría, y saber en qué prendas se usa
// o se comparte cada una antes de tocarla o borrarla.
export function Piezas({ recargarSenal, onCambio }) {
  const [piezas, setPiezas] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [busqueda, setBusqueda] = useState('');

  async function recargar() {
    const [ps, gs] = await Promise.all([listarPiezas(), listarGrupos()]);
    setPiezas(ps);
    setGrupos(gs);
  }

  useEffect(() => {
    recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recargarSenal]);

  const categorias = useMemo(
    () => [...new Set(piezas.map((p) => p.categoria).filter(Boolean))].sort(),
    [piezas]
  );

  const usadaEnPorPieza = useMemo(() => {
    const mapa = {};
    for (const g of grupos) {
      for (const gp of g.piezas) {
        if (!mapa[gp.piezaId]) mapa[gp.piezaId] = [];
        mapa[gp.piezaId].push(g.nombre);
      }
    }
    return mapa;
  }, [grupos]);

  const piezasFiltradas = piezas
    .filter((p) => !filtroCategoria || p.categoria === filtroCategoria)
    .filter((p) => !busqueda.trim() || p.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()));

  async function borrar(id) {
    await eliminarPieza(id);
    await recargar();
    onCambio?.();
  }

  return (
    <div className="pagina flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Piezas</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          La biblioteca completa. Resubir una pieza acá (desde "Subir piezas") actualiza al
          instante todas las prendas que la usan.
        </p>
      </div>

      {piezas.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre…"
            className="max-w-[220px]"
          />
          {categorias.length > 0 && (
            <>
              <span className="text-xs font-medium text-faint-foreground">Categoría:</span>
              <Select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)} className="max-w-[200px]">
                <option value="">Todas</option>
                {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </>
          )}
          <span className="text-xs text-faint-foreground">
            {piezasFiltradas.length} de {piezas.length}
          </span>
        </div>
      )}

      {piezasFiltradas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {piezas.length === 0 ? 'Todavía no hay ninguna — subí una en "Subir piezas".' : 'Ninguna coincide con el filtro.'}
        </p>
      ) : (
        <div className="flex max-w-3xl flex-col gap-3">
          {piezasFiltradas.map((p) => (
            <FilaPieza
              key={p.id}
              pieza={p}
              usadaEn={usadaEnPorPieza[p.id] || []}
              onCambio={recargar}
              onBorrar={() => borrar(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
