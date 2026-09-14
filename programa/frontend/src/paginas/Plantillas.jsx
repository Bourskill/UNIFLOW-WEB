import { useEffect, useState } from 'react';
import { listarPlantillas, listarGrupos, eliminarPlantilla } from '../api.js';
import { Boton, Tarjeta, Chip, Aviso } from '../componentes/ui.jsx';

// Una Plantilla es la configuración de zonas de un producto SIN contenido
// real (nombre/número/logo) -- para prendas que se repiten mucho, arrancar
// un producto nuevo con el anclaje ya armado en vez de rehacerlo cada vez.
// Se guarda desde Productos.jsx ("Guardar como plantilla") y se usa desde
// acá ("Usar esta plantilla" te lleva a Diseño con las zonas ya puestas).
export function Plantillas({ recargarSenal, onUsarPlantilla }) {
  const [plantillas, setPlantillas] = useState([]);
  const [grupos, setGrupos] = useState([]);
  // Ver el comentario igual en Piezas.jsx -- sin esto, la primera visita
  // muestra "Todavía no hay ninguna plantilla" mientras el fetch sigue en
  // vuelo, indistinguible de que de verdad no haya ninguna.
  const [cargando, setCargando] = useState(true);
  // Sin distinguir esto de "vacío": si la tabla `plantillas` todavía no
  // existe en Supabase (hay que correr supabase-schema.sql una vez a mano,
  // ver ESTADO-ACTUAL.md) el fetch falla, y sin capturar el error acá se
  // veía IDÉNTICO a "todavía no hay ninguna" -- un error real disfrazado de
  // vacío, exactamente lo que este proyecto evita en cualquier otro lado.
  const [error, setError] = useState(null);

  async function recargar() {
    setCargando(true);
    setError(null);
    try {
      const [ps, gs] = await Promise.all([listarPlantillas(), listarGrupos()]);
      setPlantillas(ps);
      setGrupos(gs);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recargarSenal]);

  async function borrar(id) {
    await eliminarPlantilla(id);
    await recargar();
  }

  return (
    <div className="pagina flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Plantillas</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          La configuración de zonas de una prenda, sin nombre/número/logo reales — para
          no rearmar el anclaje cada vez en prendas que se repiten mucho. Se guardan desde
          Diseño ("Guardar como plantilla") y se usan desde acá.
        </p>
      </div>

      {cargando ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : error ? (
        <Aviso tono="error">No se pudo cargar: {error}</Aviso>
      ) : plantillas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay ninguna plantilla guardada.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plantillas.map((p) => {
            // grupoIds (kit multi-prenda) o el viejo grupoId singular.
            const idsPrendas = p.grupoIds || (p.grupoId ? [p.grupoId] : []);
            const prendas = idsPrendas.map((id) => grupos.find((g) => g.id === id)).filter(Boolean);
            const faltaAlguna = prendas.length !== idsPrendas.length;
            const cantidadZonas = p.anclaje?.zonas?.length || 0;
            return (
              <Tarjeta key={p.id} className="flex flex-col gap-3">
                <div>
                  <div className="font-medium">{p.nombre}</div>
                  <div className="text-xs text-muted-foreground">
                    {prendas.length > 0 ? prendas.map((g) => g.nombre).join(' + ') : 'prenda eliminada de la biblioteca'}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Chip>{cantidadZonas} zona{cantidadZonas === 1 ? '' : 's'}</Chip>
                </div>
                <div className="flex gap-2">
                  <Boton variante="secundario" tamano="sm" disabled={faltaAlguna} onClick={() => onUsarPlantilla(p)}>
                    Usar esta plantilla
                  </Boton>
                  <Boton variante="fantasma" tamano="sm" onClick={() => borrar(p.id)}>Eliminar</Boton>
                </div>
                {faltaAlguna && (
                  <p className="text-xs text-danger">
                    {idsPrendas.length > 1
                      ? 'Al menos una de las prendas de este kit ya no existe en la biblioteca — no se puede usar hasta rearmarla.'
                      : 'La prenda que usaba esta plantilla ya no existe — no se puede usar hasta elegir otra.'}
                  </p>
                )}
              </Tarjeta>
            );
          })}
        </div>
      )}
    </div>
  );
}
