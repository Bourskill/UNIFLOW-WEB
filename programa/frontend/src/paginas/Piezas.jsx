import { useEffect, useState } from 'react';
import { listarPiezas, editarPieza, eliminarPieza } from '../api.js';
import { PRESETS_ANGULOS } from '../constantes.js';
import { Boton, Campo, Input, Select, Tarjeta, Chip } from '../componentes/ui.jsx';

function presetDe(angulosPermitidos) {
  if (angulosPermitidos === 'libre') return 'libre';
  const preset = PRESETS_ANGULOS.find(
    (p) => Array.isArray(p.valores) && JSON.stringify(p.valores) === JSON.stringify(angulosPermitidos)
  );
  return preset?.id || '0-180';
}

function FilaPieza({ pieza, onCambio, onBorrar }) {
  const [editando, setEditando] = useState(false);
  const [tela, setTela] = useState(pieza.tela || '');
  const [presetAngulos, setPresetAngulos] = useState(presetDe(pieza.angulosPermitidos));
  const [permiteEspejo, setPermiteEspejo] = useState(pieza.permiteEspejo);

  async function guardar() {
    const preset = PRESETS_ANGULOS.find((p) => p.id === presetAngulos);
    await editarPieza(pieza.id, { tela: tela || null, angulosPermitidos: preset.valores, permiteEspejo });
    setEditando(false);
    onCambio();
  }

  const tallas = Object.keys(pieza.dimensionesPorTalla || {});

  return (
    <Tarjeta className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium">{pieza.nombre}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {tallas.length === 0 ? (
              <span className="text-xs text-faint-foreground">sin geometría cargada todavía</span>
            ) : (
              tallas.map((t) => (
                <Chip key={t}>
                  {t}: {pieza.dimensionesPorTalla[t].anchoCm}×{pieza.dimensionesPorTalla[t].altoCm}cm
                </Chip>
              ))
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Boton variante="secundario" tamano="sm" onClick={() => setEditando((v) => !v)}>
            {editando ? 'Cerrar' : 'Editar'}
          </Boton>
          <Boton variante="fantasma" tamano="sm" onClick={() => onBorrar(pieza.id)}>Eliminar</Boton>
        </div>
      </div>

      {editando && (
        <div className="flex flex-wrap items-end gap-3 border-t border-border pt-3">
          <Campo etiqueta="Tela por defecto" className="max-w-[180px]">
            <Input value={tela} onChange={(e) => setTela(e.target.value)} placeholder="Dry Fit" />
          </Campo>
          <Campo etiqueta="Ángulos de rotación permitidos" className="max-w-[240px]">
            <Select value={presetAngulos} onChange={(e) => setPresetAngulos(e.target.value)}>
              {PRESETS_ANGULOS.map((p) => <option key={p.id} value={p.id}>{p.etiqueta}</option>)}
            </Select>
          </Campo>
          <label className="flex items-center gap-2 pb-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={permiteEspejo} onChange={(e) => setPermiteEspejo(e.target.checked)} />
            Permite espejo
          </label>
          <Boton variante="primario" tamano="sm" onClick={guardar}>Guardar cambios</Boton>
        </div>
      )}
    </Tarjeta>
  );
}

export function Piezas({ recargarSenal }) {
  const [piezas, setPiezas] = useState([]);

  async function recargar() {
    setPiezas(await listarPiezas());
  }

  useEffect(() => {
    recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recargarSenal]);

  async function borrar(id) {
    await eliminarPieza(id);
    await recargar();
  }

  return (
    <div className="pagina flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Piezas</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          La biblioteca de formas reales. La geometría se carga desde <strong>Grupos</strong> (un
          archivo por talla, con todas las piezas juntas) — acá solo se ve qué hay, se ajustan sus
          reglas (rotación, espejo, tela) y se recicla entre prendas.
        </p>
      </div>

      {piezas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no hay ninguna — creá un grupo primero y cargale una talla.
        </p>
      ) : (
        <div className="flex max-w-2xl flex-col gap-3">
          {piezas.map((p) => (
            <FilaPieza key={p.id} pieza={p} onCambio={recargar} onBorrar={borrar} />
          ))}
        </div>
      )}
    </div>
  );
}
