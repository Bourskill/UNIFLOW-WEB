import { useState } from 'react';
import { espejarPieza, editarGrupo } from '../api.js';
import { confirmarGuardado } from '../datos/index.js';
import { nombreDeEspejo } from '../utilidades/nombreEspejo.js';
import { Boton, Input, Aviso } from './ui.jsx';
import { TrazosPreview } from './TrazosPreview.jsx';

// Espejo desde Diseño: de la pieza que se está viendo sale su lado opuesto
// (izquierda ↔ derecha) y queda YA en la prenda, lista para su propio diseño
// -- sin importar otro archivo ni pasar por la Biblioteca.
//
// Dos casos:
//  - La prenda ya usa ESTA misma pieza en otro rol (ej. "Manga der" apunta
//    al mismo molde que "Manga izq"): ese rol pasa a usar el espejo.
//  - Si no: se suma un rol nuevo con el espejo.
// Si la Biblioteca ya tiene el espejo de esta pieza, se reusa en vez de
// crear otro igual.

export function PanelEspejoPrenda({ grupo, rol, pieza, piezas, onListo, onCancelar }) {
  const otrosRoles = grupo.piezas.filter((gp) => gp.piezaId === pieza.id && gp.rol !== rol).map((gp) => gp.rol);
  const espejoExistente = piezas.find((p) => p.id !== pieza.id && (p.espejoDe === pieza.id || p.id === pieza.espejoDe)) || null;
  const [modo, setModo] = useState(otrosRoles.length ? 'reemplazar:' + otrosRoles[0] : 'nuevo');
  const [rolNuevo, setRolNuevo] = useState(() => nombreDeEspejo(rol));
  const [reusar, setReusar] = useState(!!espejoExistente);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState(null);

  const rolesUsados = new Set(grupo.piezas.map((gp) => gp.rol.trim().toLowerCase()));
  const rolRepetido = modo === 'nuevo' && rolesUsados.has(rolNuevo.trim().toLowerCase());
  const puede = modo !== 'nuevo' || (rolNuevo.trim() && !rolRepetido);

  async function crear() {
    setTrabajando(true);
    setError(null);
    try {
      let espejo = reusar && espejoExistente ? espejoExistente : null;
      if (!espejo) {
        espejo = await espejarPieza(pieza.id, nombreDeEspejo(pieza.nombre));
        confirmarGuardado('piezas', espejo);
      }
      const rolDestino = modo === 'nuevo' ? rolNuevo.trim() : modo.slice('reemplazar:'.length);
      const piezasDelGrupo = modo === 'nuevo'
        ? [...grupo.piezas, { piezaId: espejo.id, rol: rolDestino }]
        : grupo.piezas.map((gp) => (gp.rol === rolDestino ? { ...gp, piezaId: espejo.id } : gp));
      const grupoActualizado = confirmarGuardado('grupos', await editarGrupo(grupo.id, { piezas: piezasDelGrupo }));
      onListo({ grupo: grupoActualizado, pieza: espejo, rol: rolDestino });
    } catch (e) {
      setError(e.message);
      setTrabajando(false);
    }
  }

  const claseOpcion = (activa) => 'flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 ' +
    (activa ? 'border-primary bg-primary-soft/40' : 'border-border hover:border-primary/50');

  return (
    <div className="mb-3 flex flex-col gap-3 rounded-lg border border-primary/40 bg-surface p-3 text-sm">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-faint-foreground" aria-hidden="true">
          <div className="h-12 w-10"><TrazosPreview geometriaPorTalla={pieza.geometriaPorTalla || {}} fluido /></div>
          <span>→</span>
          <div className="h-12 w-10 -scale-x-100"><TrazosPreview geometriaPorTalla={pieza.geometriaPorTalla || {}} fluido /></div>
        </div>
        <div>
          <div className="font-medium">Espejo de «{rol}»</div>
          <div className="text-xs text-faint-foreground">
            La misma pieza reflejada (izquierda ↔ derecha), con todas sus tallas, para darle otro diseño. «{rol}» no cambia.
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Dónde va el espejo">
        {otrosRoles.map((r) => (
          <label key={r} className={claseOpcion(modo === 'reemplazar:' + r)}>
            <input type="radio" className="mt-1 accent-primary" checked={modo === 'reemplazar:' + r} onChange={() => setModo('reemplazar:' + r)} />
            <span>
              Que «{r}» use el espejo
              <span className="block text-xs text-faint-foreground">
                Hoy «{r}» usa el mismo molde que «{rol}», sin reflejar. Si ya tenía zonas, se vuelven a ubicar sobre la forma espejada: revisalas.
              </span>
            </span>
          </label>
        ))}
        <label className={claseOpcion(modo === 'nuevo')}>
          <input type="radio" className="mt-1 accent-primary" checked={modo === 'nuevo'} onChange={() => setModo('nuevo')} />
          <span className="flex flex-1 flex-col gap-1.5">
            Sumarlo a «{grupo.nombre}» como una pieza más
            {modo === 'nuevo' && (
              <>
                <Input value={rolNuevo} onChange={(e) => setRolNuevo(e.target.value)} aria-label="Nombre del rol nuevo en la prenda" className="max-w-[260px]" />
                {rolRepetido && <span className="text-xs text-danger">La prenda ya tiene una pieza con ese nombre.</span>}
              </>
            )}
          </span>
        </label>
      </div>

      {espejoExistente && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" className="h-4 w-4 accent-primary" checked={reusar} onChange={(e) => setReusar(e.target.checked)} />
          Usar «{espejoExistente.nombre}», el espejo que ya está en la Biblioteca (si no, se crea otro)
        </label>
      )}

      {error && <Aviso tono="error">{error}</Aviso>}
      <div className="flex gap-2">
        <Boton type="button" variante="primario" tamano="sm" onClick={crear} disabled={!puede || trabajando}>
          {trabajando ? 'Creando…' : 'Crear espejo'}
        </Boton>
        <Boton type="button" variante="fantasma" tamano="sm" onClick={onCancelar} disabled={trabajando}>Cancelar</Boton>
      </div>
    </div>
  );
}
