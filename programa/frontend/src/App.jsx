import { memo, useCallback, useState } from 'react';
import { Formulario } from './paginas/Formulario.jsx';
import { Prendas } from './paginas/Prendas.jsx';
import { Piezas } from './paginas/Piezas.jsx';
import { Plantillas } from './paginas/Plantillas.jsx';
import { Fuentes } from './paginas/Fuentes.jsx';
import { Productos } from './paginas/Productos.jsx';
import { Pedidos } from './paginas/Pedidos.jsx';
import { Historial } from './paginas/Historial.jsx';
import { CorteLaser } from './paginas/CorteLaser.jsx';
import { Icono } from './componentes/Icono.jsx';
import { EstadoServidor } from './componentes/EstadoServidor.jsx';
import { SubTabs } from './componentes/SubTabs.jsx';
import { PanelDock } from './componentes/PanelDock.jsx';

// Memoizados: aunque un apartado ya visitado se queda montado (oculto con
// `hidden`, ver más abajo), sin esto igual volvía a RENDERIZARSE entero --
// no a recargar datos, pero sí a rehacer todo su trabajo de render -- cada
// vez que cambiaba CUALQUIER estado de App (ej. entrar a OTRO apartado
// distinto), porque React re-renderiza todos los descendientes por
// defecto salvo que se le diga explícitamente que no hace falta.
const ProductosMemo = memo(Productos);
const PiezasMemo = memo(Piezas);
const PlantillasMemo = memo(Plantillas);
const FuentesMemo = memo(Fuentes);
const PrendasMemo = memo(Prendas);
const FormularioMemo = memo(Formulario);
const PedidosMemo = memo(Pedidos);
const HistorialMemo = memo(Historial);
const CorteLaserMemo = memo(CorteLaser);

// Tres apartados en el nav (no seis): pantallas relacionadas viven como
// sub-pestañas DENTRO de un mismo apartado (estilo Google Drive), no como
// entradas nuevas del nav -- corrección explícita del usuario sobre la
// pasada anterior, que había creado un apartado nuevo por cada pantalla.
// "Moldería" (antes "Piezas"): el id interno se deja igual a propósito --
// nada más que la etiqueta visible depende de él (visitadas, PanelDock,
// etc. usan 'piezas' como clave), así que renombrar el texto no toca nada
// más.
const PESTANAS = [
  { id: 'piezas', etiqueta: 'Moldería', icono: 'pieza' },
  { id: 'diseno', etiqueta: 'Diseño', icono: 'diseno' },
  { id: 'produccion', etiqueta: 'Producción', icono: 'pedido' },
];

function App() {
  const [pestana, setPestana] = useState('piezas');
  // Igual que en SubTabs: un apartado se monta recién la primera vez que se
  // visita, y desde ahí queda montado (oculto con `hidden`) -- así entrar y
  // salir no repite la carga, pero tampoco se disparan de arranque las
  // consultas de los 3 apartados a la vez (Supabase gratis no es gratis de
  // tráfico simultáneo).
  const [visitadas, setVisitadas] = useState(() => new Set(['piezas']));
  const [recargarSenal, setRecargarSenal] = useState(0);
  // useCallback a propósito: onCambio se pasa como prop a componentes
  // memoizados (ver arriba) -- si esta función fuera una closure nueva en
  // cada render de App, el memo no serviría de nada (todos los apartados
  // volverían a renderizar en cada cambio de estado de App, memo o no).
  const marcarCambio = useCallback(() => setRecargarSenal((n) => n + 1), []);
  const pestanaActual = PESTANAS.find((p) => p.id === pestana);

  // "Usar esta plantilla" (Plantillas.jsx) tiene que llevar al usuario al
  // apartado Diseño con esa configuración de zonas ya cargada -- mismo
  // mecanismo lift-state-up que recargarSenal/marcarCambio: un solo dato
  // vive acá, Plantillas.jsx lo escribe, Productos.jsx lo lee una vez al
  // detectarlo y lo limpia después de consumirlo (para no volver a precargar
  // si el usuario re-entra a Diseño más tarde sin haber elegido otra).
  const [plantillaParaUsar, setPlantillaParaUsar] = useState(null);
  const usarPlantilla = useCallback((plantilla) => {
    setPlantillaParaUsar(plantilla);
    ir('diseno');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const consumirPlantilla = useCallback(() => setPlantillaParaUsar(null), []);

  function ir(id) {
    setPestana(id);
    setVisitadas((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-14 flex-none items-center justify-between border-b border-border bg-surface px-5">
        <div className="flex items-center gap-2.5 text-sm font-semibold tracking-tight">
          <span className="h-5 w-5 rounded-md bg-primary" />
          UNIFLOW WEB
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-faint-foreground">Producción / {pestanaActual.etiqueta}</span>
          <EstadoServidor />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <PanelDock storageKey="apartados" lado="izquierda" anchoPorDefecto={224} anchoMinimo={160} anchoMaximo={320}>
          {(colapsado) => (
            <nav className="flex flex-col gap-1 p-3">
              {PESTANAS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => ir(p.id)}
                  title={colapsado ? p.etiqueta : undefined}
                  className={
                    'flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ' +
                    (colapsado ? 'justify-center px-0' : '') + ' ' +
                    (pestana === p.id
                      ? 'bg-primary-soft font-medium text-primary'
                      : 'text-muted-foreground hover:bg-surface-muted hover:text-foreground')
                  }
                >
                  <Icono nombre={p.icono} />
                  {!colapsado && p.etiqueta}
                </button>
              ))}
            </nav>
          )}
        </PanelDock>

        <main className="min-h-0 flex-1">
          {visitadas.has('piezas') && (
            <div hidden={pestana !== 'piezas'} className="h-full">
              <SubTabs
                tabs={[
                  { id: 'subir', etiqueta: 'Subir piezas', contenido: <FormularioMemo onCambio={marcarCambio} /> },
                  { id: 'prendas', etiqueta: 'Prendas', contenido: <PrendasMemo recargarSenal={recargarSenal} /> },
                  { id: 'biblioteca', etiqueta: 'Biblioteca', contenido: <PiezasMemo recargarSenal={recargarSenal} onCambio={marcarCambio} /> },
                  { id: 'plantillas', etiqueta: 'Plantillas', contenido: <PlantillasMemo recargarSenal={recargarSenal} onUsarPlantilla={usarPlantilla} /> },
                  { id: 'fuentes', etiqueta: 'Fuentes', contenido: <FuentesMemo /> },
                ]}
              />
            </div>
          )}
          {visitadas.has('diseno') && (
            <div hidden={pestana !== 'diseno'} className="h-full">
              {/* Una sola pantalla, sin sub-pestañas -- unificado a pedido del
                  usuario (antes Diseños y Productos eran dos pasos separados
                  que había que guardar por separado y volver a conectar por
                  nombre; ver Productos.jsx). Sin scroll/padding acá: Productos
                  arma su propio layout de dos paneles (contenido a la
                  izquierda con scroll propio + panel de zona anclado a la
                  derecha) para que el lienzo nunca se reacomode cuando el
                  panel de zona cambia de alto -- ver PanelDock.jsx. */}
              <ProductosMemo
                recargarSenal={recargarSenal}
                onCambio={marcarCambio}
                plantillaParaUsar={plantillaParaUsar}
                onConsumirPlantilla={consumirPlantilla}
              />
            </div>
          )}
          {visitadas.has('produccion') && (
            <div hidden={pestana !== 'produccion'} className="h-full">
              <SubTabs
                tabs={[
                  { id: 'nuevo', etiqueta: 'Nuevo pedido', contenido: <PedidosMemo recargarSenal={recargarSenal} /> },
                  { id: 'laser', etiqueta: 'Corte láser', contenido: <CorteLaserMemo /> },
                  { id: 'historial', etiqueta: 'Historial', contenido: <HistorialMemo recargarSenal={recargarSenal} /> },
                ]}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
