import { campoDeZona } from '../utilidades/campoDeZona.js';
import { useEffect, useState } from 'react';
import { URL_FUENTE_BASE, buscarEnBancoDeFuentes, agregarFuenteDelBanco } from '../api.js';
import { confirmarGuardado } from '../datos/index.js';
import { NOMBRE_PESO, urlDeMuestra } from '../utilidades/bancoFuentes.js';
import { useFuentesWeb, cssDeFamilia } from './useFuentesWeb.js';
import { InputNumero } from './InputNumero.jsx';
import { Ayuda } from './ui.jsx';

// Estilo del texto de una zona (nombre, número o texto fijo): fuente, color,
// espaciado entre letras, alineación y borde de color. Todo lo que se elige
// acá llega igual al lienzo y al PDF (backend: ajusteTexto.js y
// exportarPdf.js) -- el espaciado y el borde cambian además cuánto entra el
// texto en su zona.

// Mismos límites que acepta el backend (ajusteTexto.js·ESPACIADO_MIL / CONTORNO_MAX_CM).
const ESPACIADO = { min: -200, max: 500 };
const CONTORNO_MAX_CM = 3;

// Colores de uso más común en camisetas, para no abrir el selector cada vez.
const COLORES_RAPIDOS = ['#ffffff', '#000000', '#d32f2f', '#1565c0', '#fbc02d', '#2e7d32', '#ef6c00', '#6a1b9a', '#9e9e9e', '#c9a227'];

const ALINEACIONES = [
  { valor: 'izquierda', etiqueta: 'Izquierda' },
  { valor: 'centro', etiqueta: 'Centro' },
  { valor: 'derecha', etiqueta: 'Derecha' },
];

const CONTORNO_POR_DEFECTO = { activo: false, colorHex: '#000000', grosorCm: 0.2 };

function Seccion({ titulo, ayuda, children, derecha }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">{titulo}</span>
        {ayuda && <Ayuda>{ayuda}</Ayuda>}
        {derecha && <div className="ml-auto">{derecha}</div>}
      </div>
      {children}
    </div>
  );
}

function SelectorColor({ valor, onCambiar, etiqueta }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {COLORES_RAPIDOS.map((c) => (
        <button
          key={c} type="button" onClick={() => onCambiar(c)} title={c}
          aria-label={etiqueta + ' ' + c}
          className={'h-6 w-6 rounded-md border transition-transform hover:scale-110 ' +
            ((valor || '').toLowerCase() === c ? 'border-primary ring-2 ring-primary/50' : 'border-border')}
          style={{ background: c }}
        />
      ))}
      <label className="relative h-6 w-6 cursor-pointer overflow-hidden rounded-md border border-dashed border-border" title="Otro color">
        <input type="color" value={valor || '#000000'} onChange={(e) => onCambiar(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label={etiqueta + ': otro color'} />
        <span className="flex h-full w-full items-center justify-center text-[11px] text-faint-foreground">+</span>
      </label>
      <span className="font-mono text-[11px] uppercase text-faint-foreground">{valor}</span>
    </div>
  );
}

// Iconito de alineación: tres renglones alineados como el texto.
function IconoAlineacion({ valor }) {
  const anchos = [14, 9, 12];
  const x = (w) => (valor === 'izquierda' ? 1 : valor === 'derecha' ? 15 - w : (16 - w) / 2);
  return (
    <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true">
      {anchos.map((w, i) => <rect key={i} x={x(w)} y={i * 4.5} width={w} height="2" rx="1" fill="currentColor" />)}
    </svg>
  );
}

// Selector de fuente con vista previa: cada opción se dibuja CON su propia
// letra, mostrando el texto de ejemplo de la zona. Lista primero las del
// catálogo propio y, abajo, el banco gratuito (Fontsource) con buscador --
// elegir una del banco la trae sola al catálogo (sin pasar por Moldería →
// Fuentes) y la deja puesta en la zona.
function SelectorFuente({ fuentes, fuenteId, muestra, onElegir, onFuenteAgregada }) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [banco, setBanco] = useState(null); // { total, fuentes }
  const [buscandoBanco, setBuscandoBanco] = useState(false);
  const [agregando, setAgregando] = useState(null); // id de banco
  const [error, setError] = useState(null);

  const propias = [
    { id: '', nombre: 'Arimo Bold (base)', archivoUrl: URL_FUENTE_BASE, coberturaCompleta: true },
    ...fuentes,
  ];
  const actual = propias.find((f) => f.id === (fuenteId || '')) || propias[0];
  const texto = busqueda.trim().toLowerCase();
  const propiasFiltradas = propias.filter((f) => !texto || f.nombre.toLowerCase().includes(texto));

  // El banco se consulta al abrir y con cada búsqueda (con un respiro).
  useEffect(() => {
    if (!abierto) return undefined;
    let vigente = true;
    setBuscandoBanco(true);
    const t = setTimeout(async () => {
      try {
        const r = await buscarEnBancoDeFuentes({ q: busqueda.trim(), pagina: 0 });
        if (vigente) { setBanco(r); setError(null); }
      } catch (e) {
        if (vigente) setError('No se pudo consultar el banco de fuentes: ' + e.message);
      } finally {
        if (vigente) setBuscandoBanco(false);
      }
    }, 300);
    return () => { vigente = false; clearTimeout(t); };
  }, [abierto, busqueda]);

  // Del banco, las que todavía NO están en el catálogo con ese mismo peso.
  const delBanco = (banco?.fuentes || []).filter(
    (b) => !fuentes.some((f) => f.fontsourceId === b.id && f.peso === b.pesoPorDefecto)
  );

  // Solo se cargan las tipografías al abrir la lista (no por cada zona).
  const urls = abierto
    ? [...propias.map((f) => f.archivoUrl), ...delBanco.map((b) => urlDeMuestra(b.id, b.pesoPorDefecto))]
    : [actual.archivoUrl];
  const familias = useFuentesWeb(urls);
  const estiloDe = (url) => (familias[url] ? { fontFamily: cssDeFamilia(familias[url]) } : { opacity: 0.35 });

  async function elegirDelBanco(b) {
    setAgregando(b.id);
    setError(null);
    try {
      const registro = await agregarFuenteDelBanco({ id: b.id, peso: b.pesoPorDefecto });
      confirmarGuardado('fuentes', registro);
      onFuenteAgregada?.(registro);
      onElegir(registro.id);
      setAbierto(false);
      setBusqueda('');
    } catch (e) {
      // Ya estaba en el catálogo (otra pestaña la agregó): se usa esa.
      const existente = fuentes.find((f) => f.fontsourceId === b.id && f.peso === b.pesoPorDefecto);
      if (existente) { onElegir(existente.id); setAbierto(false); }
      else setError(e.message);
    } finally {
      setAgregando(null);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button" onClick={() => setAbierto((v) => !v)}
        className={'flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ' +
          (abierto ? 'border-primary bg-primary-soft/40' : 'border-border bg-surface hover:border-primary/50')}
      >
        <span className="min-w-0 flex-1 truncate text-xl leading-tight text-foreground" style={estiloDe(actual.archivoUrl)}>
          {muestra}
        </span>
        <span className="flex flex-col items-end">
          <span className="max-w-[120px] truncate text-[11px] text-muted-foreground">{actual.nombre}</span>
          <span className="text-[10px] text-faint-foreground">{abierto ? 'cerrar ▴' : 'cambiar ▾'}</span>
        </span>
      </button>

      {abierto && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface-muted/50 p-1.5">
          <input
            value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar fuente (Anton, Bebas, Oswald…)" autoFocus
            className="rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary"
          />
          {error && <span className="px-1 text-[11px] text-danger">{error}</span>}
          <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
            {propiasFiltradas.length > 0 && (
              <span className="px-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-faint-foreground">Tus fuentes</span>
            )}
            {propiasFiltradas.map((f) => {
              const elegida = f.id === actual.id;
              return (
                <button
                  key={f.id || 'base'} type="button"
                  onClick={() => { onElegir(f.id || null); setAbierto(false); setBusqueda(''); }}
                  className={'flex flex-col rounded-md border px-2.5 py-1.5 text-left transition-colors ' +
                    (elegida ? 'border-primary bg-primary-soft/60' : 'border-transparent hover:border-border hover:bg-surface')}
                >
                  <span className="truncate text-lg leading-tight text-foreground" style={estiloDe(f.archivoUrl)}>{muestra}</span>
                  <span className="flex items-center gap-1.5 text-[10px] text-faint-foreground">
                    {f.nombre}
                    {!f.coberturaCompleta && <span className="text-amber-400">· sin ñ/acentos</span>}
                    {elegida && <span className="text-primary">· en uso</span>}
                  </span>
                </button>
              );
            })}

            <span className="flex items-center gap-1.5 px-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-faint-foreground">
              Banco gratuito{banco ? ' · ' + banco.total : ''}
              <Ayuda>Fuentes de licencia libre (Fontsource). Al elegir una, se agrega sola a tus fuentes, con la revisión de ñ y acentos, y queda puesta en esta zona.</Ayuda>
            </span>
            {buscandoBanco && !banco && <span className="px-2 py-1 text-xs text-faint-foreground">Buscando…</span>}
            {delBanco.map((b) => {
              const url = urlDeMuestra(b.id, b.pesoPorDefecto);
              return (
                <button
                  key={b.id} type="button" disabled={agregando !== null}
                  onClick={() => elegirDelBanco(b)}
                  className="flex flex-col rounded-md border border-transparent px-2.5 py-1.5 text-left transition-colors hover:border-border hover:bg-surface disabled:opacity-60"
                >
                  <span className="truncate text-lg leading-tight text-foreground" style={estiloDe(url)}>{muestra}</span>
                  <span className="flex items-center gap-1.5 text-[10px] text-faint-foreground">
                    {b.family} {NOMBRE_PESO[b.pesoPorDefecto] || b.pesoPorDefecto}
                    {agregando === b.id ? <span className="text-primary">· agregando…</span> : <span className="text-faint-foreground">· {b.category}</span>}
                  </span>
                </button>
              );
            })}
            {banco && delBanco.length === 0 && !buscandoBanco && (
              <span className="px-2 py-1 text-xs text-faint-foreground">Nada más en el banco con ese nombre.</span>
            )}
            {banco && banco.total > banco.fuentes.length && (
              <span className="px-2 py-1 text-[10px] text-faint-foreground">Mostrando las primeras {banco.fuentes.length} — escribí para afinar la búsqueda.</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * @param {object} props
 * @param {object} props.zona        la zona cruda (anclaje.zonas)
 * @param {object[]} props.fuentes   catálogo de fuentes propias
 * @param {(cambios: object) => void} props.onActualizar
 * @param {(fuente: object) => void} [props.onFuenteAgregada]  una fuente del banco que se acaba de traer al catálogo
 */
export function PanelTexto({ zona, fuentes, onActualizar, onFuenteAgregada }) {
  const esNumero = campoDeZona(zona) === 'numero';
  const muestra =
    (campoDeZona(zona) === 'fijo' ? zona.valorFijo : zona.valorEjemplo) || (esNumero ? '10' : 'PEÑA');
  const contorno = { ...CONTORNO_POR_DEFECTO, ...(zona.contorno || {}) };
  const espaciado = Number(zona.espaciadoMil) || 0;
  const alineacion = zona.alineacion || 'centro';
  const cambiarContorno = (cambios) => onActualizar({ contorno: { ...contorno, ...cambios } });

  return (
    <div className="flex flex-col gap-4 border-t border-border pt-3">
      <span className="text-xs font-semibold text-faint-foreground">Texto</span>

      <Seccion titulo="Fuente">
        <SelectorFuente
          fuentes={fuentes} fuenteId={zona.fuenteId} muestra={muestra}
          onElegir={(id) => onActualizar({ fuenteId: id })}
          onFuenteAgregada={onFuenteAgregada}
        />
      </Seccion>

      <Seccion titulo="Color" ayuda="Con qué color se imprime este texto de verdad, en el PDF final (sublimación).">
        <SelectorColor valor={zona.colorHex} etiqueta="Color del texto" onCambiar={(c) => onActualizar({ colorHex: c })} />
      </Seccion>

      <Seccion
        titulo="Alineación"
        ayuda={'Desde dónde arranca el texto dentro de su zona: pegado al borde izquierdo, centrado, o pegado al borde derecho.' +
          (esNumero ? ' Si el número es más ancho que la zona, se sale solo por el lado contrario.' : '')}
      >
        <div className="grid grid-cols-3 gap-1">
          {ALINEACIONES.map((a) => (
            <button
              key={a.valor} type="button" onClick={() => onActualizar({ alineacion: a.valor })}
              aria-pressed={alineacion === a.valor}
              className={'flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] transition-colors ' +
                (alineacion === a.valor ? 'border-primary bg-primary-soft text-primary' : 'border-border text-muted-foreground hover:border-primary/50')}
            >
              <IconoAlineacion valor={a.valor} />
              {a.etiqueta}
            </button>
          ))}
        </div>
      </Seccion>

      <Seccion
        titulo="Espaciado entre letras"
        ayuda={'En milésimas del tamaño de la letra, como el "tracking" de Illustrator: negativo junta, positivo separa. ' +
          (esNumero ? 'Un número sigue ocupando todo el alto.' : 'Si con ese espaciado el texto no entra, se cierra un poco antes de achicar la letra.')}
        derecha={espaciado !== 0 && (
          <button type="button" className="text-[11px] text-primary hover:underline" onClick={() => onActualizar({ espaciadoMil: 0 })}>Normal</button>
        )}
      >
        <div className="flex items-center gap-2">
          <input
            type="range" min={ESPACIADO.min} max={ESPACIADO.max} step={10} value={espaciado}
            onChange={(e) => onActualizar({ espaciadoMil: Number(e.target.value) })}
            className="flex-1 accent-primary" aria-label="Espaciado entre letras"
          />
          <InputNumero
            className="w-20" step={10} wheelStep={10} min={ESPACIADO.min} max={ESPACIADO.max} value={espaciado}
            onChange={(n) => onActualizar({ espaciadoMil: Math.min(Math.max(Math.round(n), ESPACIADO.min), ESPACIADO.max) })}
          />
        </div>
      </Seccion>

      <Seccion
        titulo="Borde de color"
        ayuda={'Un contorno alrededor de cada letra, por fuera. Sin activarlo, el texto no lleva ningún borde. ' +
          (esNumero ? 'En un número, el borde puede salirse de la zona (manda el alto completo).' : 'El texto deja ese margen adentro de su zona, así el borde no se sale.')}
        derecha={(
          <button
            type="button" role="switch" aria-checked={contorno.activo} aria-label="Borde de color"
            onClick={() => cambiarContorno({ activo: !contorno.activo })}
            className={'relative h-5 w-9 rounded-full transition-colors ' + (contorno.activo ? 'bg-primary' : 'border border-border bg-surface')}
          >
            <span className={'absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ' + (contorno.activo ? 'translate-x-4' : 'translate-x-0')} />
          </button>
        )}
      >
        {contorno.activo && (
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-muted/40 p-2">
            <SelectorColor valor={contorno.colorHex} etiqueta="Color del borde" onCambiar={(c) => cambiarContorno({ colorHex: c })} />
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-faint-foreground">Grosor</span>
              <InputNumero
                className="w-20" step={0.05} wheelStep={0.1} min={0.01} max={CONTORNO_MAX_CM} value={contorno.grosorCm}
                onChange={(n) => cambiarContorno({ grosorCm: Math.min(Math.max(n, 0.01), CONTORNO_MAX_CM) })}
              />
              <span className="text-xs text-muted-foreground">cm</span>
              {[0.1, 0.2, 0.4].map((g) => (
                <button key={g} type="button" onClick={() => cambiarContorno({ grosorCm: g })}
                  className={'rounded-full border px-2 py-0.5 text-[10px] ' + (contorno.grosorCm === g ? 'border-primary bg-primary-soft text-primary' : 'border-border text-faint-foreground hover:border-primary')}>
                  {g}
                </button>
              ))}
            </div>
          </div>
        )}
      </Seccion>
    </div>
  );
}
