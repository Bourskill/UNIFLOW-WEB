import { useEffect, useMemo, useRef, useState } from 'react';
import { exportarMesas, exportarMesasArchivo, guardarArchivo } from '../api.js';
import { armarZip } from '../utilidades/zip.js';
import { obtener } from '../datos/index.js';
import { TarjetaProduccion } from '../componentes/TarjetaProduccion.jsx';
import { Boton, Input, Tarjeta, Aviso, ErrorCarga } from '../componentes/ui.jsx';
import { ordenarPorReciente, tallasDeProduccion, nombreDeExportacion } from '../utilidades/producciones.js';

// Producción → Producciones: TODAS las producciones (Diseño muestra solo las
// más recientes). Desde acá se exporta cada una por tallas: cada talla es
// la prenda completa, con una mesa por pieza y su contorno láser, como el
// script PROCESAR MOLDES de Illustrator pero ya con su diseño. "Editar" la
// abre en Diseño.
export function Producciones({ recargarSenal, onEditar }) {
  const [datos, setDatos] = useState({ productos: [], grupos: [], piezas: [], disenos: [] });
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [exportandoId, setExportandoId] = useState(null);
  const panelRef = useRef(null);

  async function recargar() {
    setErrorCarga(null);
    try {
      const [productos, grupos, piezas, disenos] = await Promise.all(
        ['productos', 'grupos', 'piezas', 'disenos'].map((c) => obtener(c)));
      setDatos({ productos, grupos, piezas, disenos });
    } catch (e) {
      setErrorCarga(e.message);
    } finally {
      setCargando(false);
    }
  }
  useEffect(() => {
    recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recargarSenal]);

  const lista = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const todas = ordenarPorReciente(datos.productos);
    if (!q) return todas;
    return todas.filter((p) => {
      const prendas = (p.grupoIds || (p.grupoId ? [p.grupoId] : [])).map((id) => datos.grupos.find((g) => g.id === id)?.nombre || '');
      return [p.nombre, ...prendas].some((t) => (t || '').toLowerCase().includes(q));
    });
  }, [datos, busqueda]);

  const exportando = datos.productos.find((p) => p.id === exportandoId) || null;
  function alternarExportar(p) {
    setExportandoId((id) => (id === p.id ? null : p.id));
    setTimeout(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  }

  if (cargando) return <p className="text-sm text-muted-foreground">Cargando…</p>;
  if (errorCarga) return <ErrorCarga mensaje={errorCarga} onReintentar={recargar} />;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold">Producciones</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Todas las producciones. «Exportar» saca cada talla como la prenda completa: una mesa por pieza, con
          su diseño y su contorno láser, a la medida justa más 1 cm de margen — listo para abrir en Illustrator.
        </p>
      </div>

      {exportando && (
        <div ref={panelRef} className="scroll-mt-4">
          <PanelExportar key={exportando.id} produccion={exportando} grupos={datos.grupos} piezas={datos.piezas}
            onCerrar={() => setExportandoId(null)} />
        </div>
      )}

      {datos.productos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay producciones. Se arman en Diseño.</p>
      ) : (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-faint-foreground">
              {lista.length === datos.productos.length ? datos.productos.length + ' producciones' : lista.length + ' de ' + datos.productos.length}
            </h3>
            <Input className="ml-auto w-64" placeholder="Buscar por nombre o prenda" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4">
            {lista.map((p) => (
              <TarjetaProduccion
                key={p.id}
                produccion={p}
                grupos={datos.grupos}
                piezas={datos.piezas}
                disenos={datos.disenos}
                editando={false}
                exportando={p.id === exportandoId}
                onEditar={() => onEditar?.(p)}
                onExportar={() => alternarExportar(p)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function PanelExportar({ produccion, grupos, piezas, onCerrar }) {
  const disponibles = useMemo(() => tallasDeProduccion(produccion, grupos, piezas), [produccion, grupos, piezas]);
  const [elegidas, setElegidas] = useState(() => new Set(disponibles));
  // Marcado de entrada: sin él, el nombre y el número salen vacíos aunque en
  // Diseño se vean con el ejemplo (y parece que "faltan").
  const [conEjemplo, setConEjemplo] = useState(true);
  const [porSeparado, setPorSeparado] = useState(true);
  const [trabajando, setTrabajando] = useState(null);
  const [error, setError] = useState(null);
  const [listo, setListo] = useState(null);

  const tallas = disponibles.filter((t) => elegidas.has(t));
  const alternar = (t) => setElegidas((prev) => {
    const r = new Set(prev);
    if (r.has(t)) r.delete(t); else r.add(t);
    return r;
  });

  async function exportar() {
    setError(null);
    setListo(null);
    try {
      if (porSeparado && tallas.length > 1) {
        // Varias tallas, un PDF por talla: todos juntos en UN .zip.
        const archivos = [];
        for (let i = 0; i < tallas.length; i++) {
          setTrabajando('Talla ' + tallas[i] + ' (' + (i + 1) + ' de ' + tallas.length + ')…');
          const pdf = await exportarMesasArchivo(produccion.id, { tallas: [tallas[i]], conEjemplo });
          archivos.push({ nombre: nombreDeExportacion(produccion, [tallas[i]]), bytes: new Uint8Array(await pdf.arrayBuffer()) });
        }
        setTrabajando('Armando el .zip…');
        guardarArchivo(new Blob([armarZip(archivos)], { type: 'application/zip' }), nombreDeExportacion(produccion, tallas).replace(/\.pdf$/, '.zip'));
        setListo('ZIP descargado con ' + tallas.length + ' archivos, uno por talla.');
      } else {
        // Una talla, o todas en un PDF (una mesa = una página).
        setTrabajando(porSeparado ? 'Talla ' + tallas[0] + '…' : 'Armando las mesas…');
        await exportarMesas(produccion.id, { tallas, conEjemplo }, nombreDeExportacion(produccion, tallas));
        setListo(porSeparado ? '1 archivo descargado.' : 'PDF descargado con ' + tallas.length + (tallas.length === 1 ? ' talla.' : ' tallas.'));
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setTrabajando(null);
    }
  }

  const chip = (activa) => 'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ' +
    (activa ? 'border-primary bg-primary-soft text-primary' : 'border-border text-muted-foreground hover:border-primary/50');

  return (
    <Tarjeta className="flex flex-col gap-4 border-primary/40">
      <div className="flex items-start gap-3">
        <div>
          <h3 className="text-sm font-semibold">Exportar «{produccion.nombre}»</h3>
          <p className="mt-0.5 text-xs text-faint-foreground">
            Cada talla es una prenda completa: una mesa por pieza (las que van en par, las dos), con su contorno
            láser y sus piquetes. Si la producción no tiene contorno propio, va el de siempre: 1 mm afuera, 0,1 cm.
          </p>
        </div>
        <Boton type="button" variante="fantasma" tamano="sm" className="ml-auto" onClick={onCerrar}>Cerrar</Boton>
      </div>

      {disponibles.length === 0 ? (
        <Aviso tono="error">Esta producción no tiene ninguna talla con todas sus piezas cargadas (revisá la prenda en Moldería).</Aviso>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs text-faint-foreground">
              <span className="font-semibold">Tallas</span>
              <button type="button" className="ml-2 hover:text-foreground" onClick={() => setElegidas(new Set(disponibles))}>Todas</button>
              <span>·</span>
              <button type="button" className="hover:text-foreground" onClick={() => setElegidas(new Set())}>Ninguna</button>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Tallas a exportar">
              {disponibles.map((t) => (
                <button key={t} type="button" aria-pressed={elegidas.has(t)} className={chip(elegidas.has(t))} onClick={() => alternar(t)}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={porSeparado} onChange={(e) => setPorSeparado(e.target.checked)} />
              Un archivo por talla
              <span className="text-xs text-faint-foreground">(varias tallas bajan juntas en un .zip; si no, todas en un solo PDF, una detrás de otra)</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={conEjemplo} onChange={(e) => setConEjemplo(e.target.checked)} />
              Con el nombre y número de ejemplo
              <span className="text-xs text-faint-foreground">(si no, esas zonas van vacías)</span>
            </label>
          </div>

          {error && <Aviso tono="error">{error}</Aviso>}
          {listo && <Aviso tono="info">{listo}</Aviso>}
          <div className="flex items-center gap-3">
            <Boton type="button" variante="acento" disabled={tallas.length === 0 || !!trabajando} onClick={exportar}>
              {trabajando || (tallas.length === 0 ? 'Elegí al menos una talla'
                : porSeparado ? (tallas.length === 1 ? 'Exportar 1 archivo' : 'Exportar ZIP · ' + tallas.length + ' archivos')
                  : 'Exportar PDF · ' + tallas.length + (tallas.length === 1 ? ' talla' : ' tallas'))}
            </Boton>
          </div>
        </>
      )}
    </Tarjeta>
  );
}
