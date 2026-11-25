import { campoDeZona } from '../utilidades/campoDeZona.js';
import { useEffect, useState } from 'react';
import { URL_FUENTE_BASE, buscarEnBancoDeFuentes, agregarFuenteDelBanco } from '../api.js';
import { confirmarGuardado } from '../datos/index.js';
import { NOMBRE_PESO, urlDeMuestra } from '../utilidades/bancoFuentes.js';
import { useFuentesWeb, cssDeFamilia } from './useFuentesWeb.js';
import { InputNumero } from './InputNumero.jsx';
import { Ayuda } from './ui.jsx';
import { SelectorColor } from './SelectorColor.jsx';
import { contornosDeZona, CONTORNOS_MAX, CONTORNO_ANILLO_MAX_CM, CONTORNO_PCT_MAX } from '../utilidades/contornosTexto.js';

// Estilo del texto de una zona (nombre, número o texto fijo): fuente, color,
// espaciado entre letras, alineación y contornos de color (uno o varios). Todo lo que se elige
// acá llega igual al lienzo y al PDF (backend: ajusteTexto.js y
// exportarPdf.js) -- el espaciado y el borde cambian además cuánto entra el
// texto en su zona.

// Mismos límites que acepta el backend (ajusteTexto.js·ESPACIADO_MIL / INTERLINEADO).
const ESPACIADO = { min: -200, max: 500 };
const INTERLINEADO = { min: -50, max: 200, porDefecto: 30 };

// Colores de uso más común en camisetas, para no abrir el selector cada vez.

// Dónde queda el texto en el alto de su zona cuando le sobra lugar (un nombre
// largo baja de cuerpo): pegado arriba, al medio o abajo.
const ALINEACIONES_V = [
  { valor: 'arriba', etiqueta: 'Arriba' },
  { valor: 'centro', etiqueta: 'Medio' },
  { valor: 'abajo', etiqueta: 'Abajo' },
];

const ALINEACIONES = [
  { valor: 'izquierda', etiqueta: 'Izquierda' },
  { valor: 'centro', etiqueta: 'Centro' },
  { valor: 'derecha', etiqueta: 'Derecha' },
];

// Un contorno nuevo: negro, o blanco si el anterior ya es oscuro (así se
// distinguen los dos de entrada).
const nuevoContorno = (anterior) => ({
  colorHex: anterior && anterior.colorHex.toLowerCase() === '#000000' ? '#ffffff' : '#000000',
  grosorCm: 0.2,
});

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

// Iconito de alineación vertical: una barra dentro de un marco, arriba/medio/abajo.
function IconoAlineacionV({ valor }) {
  const y = valor === 'arriba' ? 2 : valor === 'abajo' ? 8 : 5;
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <rect x="0.5" y="0.5" width="11" height="11" rx="2" fill="none" stroke="currentColor" strokeOpacity="0.5" />
      <rect x="3" y={y} width="6" height="2" rx="1" fill="currentColor" />
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
  const textoZona =
    (campoDeZona(zona) === 'fijo' ? zona.valorFijo : zona.valorEjemplo) || (esNumero ? '10' : 'PEÑA');
  // Un texto con Enter va en varios renglones (ajusteTexto.js·normalizarLineas).
  const renglones = String(textoZona).split('\n').map((l) => l.trim()).filter(Boolean);
  const muestra = renglones.join(' ') || textoZona;
  // Todos los renglones, con los vacíos del medio (dos Enter seguidos dejan uno de aire).
  const todos = String(textoZona).split('\n').map((l) => l.trim());
  while (todos.length && !todos[0]) todos.shift();
  while (todos.length && !todos[todos.length - 1]) todos.pop();
  const variosRenglones = !esNumero && todos.length > 1;
  const interlineado = Number.isFinite(Number(zona.interlineado)) && zona.interlineado != null && zona.interlineado !== ''
    ? Number(zona.interlineado) : INTERLINEADO.porDefecto;
  // Contornos: cada uno guarda su grosor en cm Y en % de la letra; según
  // "Escalar con la letra" (contornosEnlazados) se usa uno u otro
  // (contornosTexto.js). Para pasar de uno al otro se toma de referencia el
  // alto de la zona (en un nombre o número, casi el alto de la letra).
  const enlazados = zona.contornosEnlazados === true;
  // Con varios renglones, la letra es una parte del alto (con el interlineado).
  const nRenglones = variosRenglones ? todos.length : 1;
  const altoRef = (zona.alto?.modo === 'fijo' && zona.alto.valor > 0 ? zona.alto.valor : 8) / (nRenglones + (nRenglones - 1) * (interlineado / 100));
  const redondear1 = (n) => Math.round(n * 10) / 10;
  const contornos = (Array.isArray(zona.contornos) ? zona.contornos : contornosDeZona(zona)).map((c) => ({
    colorHex: c.colorHex || '#000000',
    grosorCm: c.grosorCm > 0 ? c.grosorCm : c.pct > 0 ? Math.round((c.pct / 100) * altoRef * 100) / 100 : 0.2,
    pct: c.pct > 0 ? c.pct : redondear1(((c.grosorCm > 0 ? c.grosorCm : 0.2) / altoRef) * 100),
  }));
  const espaciado = Number(zona.espaciadoMil) || 0;
  const alineacion = zona.alineacion || 'centro';
  const alineacionV = zona.alineacionV || 'centro';
  // Se guarda siempre la lista; el `contorno` único de antes queda sin efecto.
  const guardarContornos = (lista) => onActualizar({ contornos: lista, contorno: null });
  const cambiarContorno = (i, cambios) => guardarContornos(contornos.map((c, j) => (j === i ? { ...c, ...cambios } : c)));
  const moverContorno = (i, paso) => {
    const lista = [...contornos];
    [lista[i], lista[i + paso]] = [lista[i + paso], lista[i]];
    guardarContornos(lista);
  };

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
          (esNumero ? ' Si el número es más ancho que la zona, se sale solo por el lado contrario.' : ' Abajo: arriba, al medio o abajo de la zona -- cuando un nombre largo sale más chico, así no queda flotando y todos arrancan a la misma altura.')}
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
        {!esNumero && (
          <div className="grid grid-cols-3 gap-1" role="group" aria-label="Alineación vertical en la zona">
            {ALINEACIONES_V.map((a) => (
              <button
                key={a.valor} type="button" onClick={() => onActualizar({ alineacionV: a.valor })}
                aria-pressed={alineacionV === a.valor} title={'Texto pegado ' + (a.valor === 'centro' ? 'al medio' : a.valor === 'arriba' ? 'arriba' : 'abajo') + ' de su zona'}
                className={'flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] transition-colors ' +
                  (alineacionV === a.valor ? 'border-primary bg-primary-soft text-primary' : 'border-border text-muted-foreground hover:border-primary/50')}
              >
                <IconoAlineacionV valor={a.valor} />
                {a.etiqueta}
              </button>
            ))}
          </div>
        )}
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

      {variosRenglones && (
        <Seccion
          titulo="Espacio entre renglones"
          ayuda="Cuánto aire queda entre un renglón y el de abajo, en % del alto de la letra: 0 los deja pegados. Todos los renglones van al mismo tamaño y el bloque entero llena la zona."
          derecha={interlineado !== INTERLINEADO.porDefecto && (
            <button type="button" className="text-[11px] text-primary hover:underline" onClick={() => onActualizar({ interlineado: null })}>Normal</button>
          )}
        >
          <div className="flex items-center gap-2">
            <input
              type="range" min={INTERLINEADO.min} max={INTERLINEADO.max} step={5} value={interlineado}
              onChange={(e) => onActualizar({ interlineado: Number(e.target.value) })}
              className="flex-1 accent-primary" aria-label="Espacio entre renglones"
            />
            <InputNumero
              className="w-20" step={5} wheelStep={5} min={INTERLINEADO.min} max={INTERLINEADO.max} value={interlineado}
              onChange={(n) => onActualizar({ interlineado: Math.min(Math.max(Math.round(n), INTERLINEADO.min), INTERLINEADO.max) })}
            />
            <span className="text-xs text-muted-foreground">%</span>
          </div>
        </Seccion>
      )}

      <Seccion
        titulo="Contornos"
        ayuda={'Bordes de color alrededor de cada letra, por fuera: el 1 va pegado a la letra y cada uno siguiente rodea al anterior. Sin ninguno, el texto no lleva borde. ' +
          (esNumero ? 'En un número, los contornos pueden salirse de la zona (manda el alto completo).' : 'El texto deja adentro de su zona el espacio de todos juntos, así no se salen.')}
        derecha={contornos.length < CONTORNOS_MAX && (
          <button type="button" className="text-[11px] text-primary hover:underline"
            onClick={() => { const n = nuevoContorno(contornos[contornos.length - 1]); guardarContornos([...contornos, { ...n, pct: redondear1((n.grosorCm / altoRef) * 100) }]); }}>
            + Agregar contorno
          </button>
        )}
      >
        {contornos.length === 0 && <span className="text-[11px] text-faint-foreground">Sin contornos.</span>}
        {contornos.length > 0 && (
          <label className="flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground"
            title="Encendido: el grosor va en % del alto de la letra -- un número grande lleva un contorno más grueso y uno chico, más fino, en la misma proporción.">
            <input type="checkbox" className="h-4 w-4 rounded accent-primary" checked={enlazados}
              onChange={(ev) => onActualizar({
                contornosEnlazados: ev.target.checked, contorno: null,
                // Se pasa del valor que se venía usando al otro, para que el grosor no salte.
                contornos: contornos.map((c) => (ev.target.checked
                  ? { ...c, pct: Math.min(Math.max(redondear1((c.grosorCm / altoRef) * 100), 0.1), CONTORNO_PCT_MAX) }
                  : { ...c, grosorCm: Math.min(Math.max(Math.round((c.pct / 100) * altoRef * 100) / 100, 0.01), CONTORNO_ANILLO_MAX_CM) })),
              })} />
            Escalar con la letra (grosor en % del alto de la letra)
          </label>
        )}
        {contornos.map((c, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-lg border border-border bg-surface-muted/40 p-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-muted-foreground">
                Contorno {i + 1}{contornos.length > 1 ? (i === 0 ? ' · pegado a la letra' : i === contornos.length - 1 ? ' · el de afuera' : '') : ''}
              </span>
              <span className="ml-auto flex items-center gap-1">
                {i > 0 && (
                  <button type="button" title="Más cerca de la letra" aria-label={'Acercar el contorno ' + (i + 1) + ' a la letra'}
                    onClick={() => moverContorno(i, -1)} className="rounded border border-border px-1.5 text-[11px] text-faint-foreground hover:border-primary">↑</button>
                )}
                {i < contornos.length - 1 && (
                  <button type="button" title="Más afuera" aria-label={'Alejar el contorno ' + (i + 1) + ' de la letra'}
                    onClick={() => moverContorno(i, 1)} className="rounded border border-border px-1.5 text-[11px] text-faint-foreground hover:border-primary">↓</button>
                )}
                <button type="button" title="Quitar este contorno" aria-label={'Quitar el contorno ' + (i + 1)}
                  onClick={() => guardarContornos(contornos.filter((_, j) => j !== i))}
                  className="rounded border border-border px-1.5 text-[11px] text-faint-foreground hover:border-danger hover:text-danger">✕</button>
              </span>
            </div>
            <SelectorColor valor={c.colorHex} etiqueta={'Color del contorno ' + (i + 1)} onCambiar={(color) => cambiarContorno(i, { colorHex: color })} />
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-faint-foreground">Grosor</span>
              {enlazados ? (
                <>
                  <InputNumero
                    className="w-20" step={0.5} wheelStep={1} min={0.1} max={CONTORNO_PCT_MAX} value={c.pct}
                    onChange={(n) => cambiarContorno(i, { pct: Math.min(Math.max(redondear1(n), 0.1), CONTORNO_PCT_MAX) })}
                    aria-label={'Grosor del contorno ' + (i + 1) + ' en % de la letra'}
                  />
                  <span className="text-xs text-muted-foreground">% de la letra</span>
                  {[2, 4, 8].map((g) => (
                    <button key={g} type="button" onClick={() => cambiarContorno(i, { pct: g })}
                      className={'rounded-full border px-2 py-0.5 text-[10px] ' + (c.pct === g ? 'border-primary bg-primary-soft text-primary' : 'border-border text-faint-foreground hover:border-primary')}>
                      {g}%
                    </button>
                  ))}
                </>
              ) : (
                <>
                  <InputNumero
                    className="w-20" step={0.05} wheelStep={0.1} min={0.01} max={CONTORNO_ANILLO_MAX_CM} value={c.grosorCm}
                    onChange={(n) => cambiarContorno(i, { grosorCm: Math.min(Math.max(n, 0.01), CONTORNO_ANILLO_MAX_CM) })}
                  />
                  <span className="text-xs text-muted-foreground">cm</span>
                  {[0.1, 0.2, 0.4].map((g) => (
                    <button key={g} type="button" onClick={() => cambiarContorno(i, { grosorCm: g })}
                      className={'rounded-full border px-2 py-0.5 text-[10px] ' + (c.grosorCm === g ? 'border-primary bg-primary-soft text-primary' : 'border-border text-faint-foreground hover:border-primary')}>
                      {g}
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        ))}
      </Seccion>
    </div>
  );
}
