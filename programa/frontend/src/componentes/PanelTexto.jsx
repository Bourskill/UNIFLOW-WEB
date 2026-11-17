import { useState } from 'react';
import { URL_FUENTE_BASE } from '../api.js';
import { useFuentesWeb, cssDeFamilia } from './useFuentesWeb.js';
import { InputNumero } from './InputNumero.jsx';
import { Ayuda } from './ui.jsx';

// Estilo del texto de una zona (nombre, número o texto fijo): fuente, color,
// espaciado entre letras, orientación y contorno de color. Todo lo que se
// elige acá llega igual al lienzo y al PDF (backend: ajusteTexto.js y
// exportarPdf.js) -- el espaciado y el contorno cambian además cuánto entra
// el texto en su zona.

// Mismos límites que acepta el backend (ajusteTexto.js·ESPACIADO_MIL / CONTORNO_MAX_CM).
const ESPACIADO = { min: -200, max: 500 };
const CONTORNO_MAX_CM = 3;

// Colores de uso más común en camisetas, para no abrir el selector cada vez.
const COLORES_RAPIDOS = ['#ffffff', '#000000', '#d32f2f', '#1565c0', '#fbc02d', '#2e7d32', '#ef6c00', '#6a1b9a', '#9e9e9e', '#c9a227'];

const ORIENTACIONES = [
  { grados: 0, etiqueta: 'Horizontal', icono: 'A→' },
  { grados: 90, etiqueta: 'Hacia arriba', icono: '↑' },
  { grados: 270, etiqueta: 'Hacia abajo', icono: '↓' },
  { grados: 180, etiqueta: 'Invertido', icono: '↻' },
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

// Selector de fuente con vista previa: cada opción se dibuja CON su propia
// letra (la misma que mide el backend y escribe el PDF), mostrando el texto
// de ejemplo de la zona -- se elige viendo, no leyendo nombres.
function SelectorFuente({ fuentes, fuenteId, muestra, onElegir }) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const opciones = [
    { id: '', nombre: 'Arimo Bold (base)', archivoUrl: URL_FUENTE_BASE, coberturaCompleta: true },
    ...fuentes,
  ];
  const actual = opciones.find((f) => f.id === (fuenteId || '')) || opciones[0];
  // Solo se cargan todas las tipografías al abrir la lista (no por cada zona).
  const familias = useFuentesWeb(abierto ? opciones.map((f) => f.archivoUrl) : [actual.archivoUrl]);
  const familiaDe = (f) => (familias[f.archivoUrl] ? cssDeFamilia(familias[f.archivoUrl]) : 'sans-serif');
  const filtradas = opciones.filter((f) => !busqueda.trim() || f.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()));

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button" onClick={() => setAbierto((v) => !v)}
        className={'flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ' +
          (abierto ? 'border-primary bg-primary-soft/40' : 'border-border bg-surface hover:border-primary/50')}
      >
        <span className="min-w-0 flex-1 truncate text-xl leading-tight text-foreground" style={{ fontFamily: familiaDe(actual) }}>
          {muestra}
        </span>
        <span className="flex flex-col items-end">
          <span className="max-w-[120px] truncate text-[11px] text-muted-foreground">{actual.nombre}</span>
          <span className="text-[10px] text-faint-foreground">{abierto ? 'cerrar ▴' : 'cambiar ▾'}</span>
        </span>
      </button>
      {abierto && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface-muted/50 p-1.5">
          {opciones.length > 6 && (
            <input
              value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar fuente…"
              className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-foreground outline-none focus:border-primary"
            />
          )}
          <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {filtradas.map((f) => {
              const elegida = f.id === actual.id;
              return (
                <button
                  key={f.id || 'base'} type="button"
                  onClick={() => { onElegir(f.id || null); setAbierto(false); }}
                  className={'flex flex-col rounded-md border px-2.5 py-1.5 text-left transition-colors ' +
                    (elegida ? 'border-primary bg-primary-soft/60' : 'border-transparent hover:border-border hover:bg-surface')}
                >
                  <span className="truncate text-lg leading-tight text-foreground" style={{ fontFamily: familiaDe(f) }}>
                    {familias[f.archivoUrl] ? muestra : '…'}
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] text-faint-foreground">
                    {f.nombre}
                    {!f.coberturaCompleta && <span className="text-amber-400">· sin ñ/acentos</span>}
                    {elegida && <span className="text-primary">· en uso</span>}
                  </span>
                </button>
              );
            })}
            {filtradas.length === 0 && <span className="px-2 py-1 text-xs text-faint-foreground">Ninguna coincide.</span>}
          </div>
          <span className="px-1 text-[10px] text-faint-foreground">Tipografías propias: Moldería → Fuentes.</span>
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
 */
export function PanelTexto({ zona, fuentes, onActualizar }) {
  const esNumero = zona.campoPedido === 'numero';
  const muestra =
    (zona.campoPedido === 'fijo' ? zona.valorFijo : zona.valorEjemplo) || (esNumero ? '10' : 'PEÑA');
  const contorno = { ...CONTORNO_POR_DEFECTO, ...(zona.contorno || {}) };
  const espaciado = Number(zona.espaciadoMil) || 0;
  const rotacion = zona.rotacion || 0;
  const cambiarContorno = (cambios) => onActualizar({ contorno: { ...contorno, ...cambios } });

  return (
    <div className="flex flex-col gap-4 border-t border-border pt-3">
      <span className="text-xs font-semibold text-faint-foreground">Texto</span>

      <Seccion titulo="Fuente">
        <SelectorFuente fuentes={fuentes} fuenteId={zona.fuenteId} muestra={muestra} onElegir={(id) => onActualizar({ fuenteId: id })} />
      </Seccion>

      <Seccion titulo="Color" ayuda="Con qué color se imprime este texto de verdad, en el PDF final (sublimación).">
        <SelectorColor valor={zona.colorHex} etiqueta="Color del texto" onCambiar={(c) => onActualizar({ colorHex: c })} />
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

      <Seccion titulo="Orientación" ayuda="Gira el texto sobre el centro de su zona. Grados positivos, en sentido antihorario (como Illustrator y el PDF).">
        <div className="grid grid-cols-4 gap-1">
          {ORIENTACIONES.map((o) => (
            <button
              key={o.grados} type="button" onClick={() => onActualizar({ rotacion: o.grados })} title={o.etiqueta + ' (' + o.grados + '°)'}
              className={'flex flex-col items-center gap-0.5 rounded-lg border px-1 py-1.5 text-[10px] transition-colors ' +
                (rotacion === o.grados ? 'border-primary bg-primary-soft text-primary' : 'border-border text-muted-foreground hover:border-primary/50')}
            >
              <span className="text-sm leading-none">{o.icono}</span>
              {o.etiqueta}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-faint-foreground">Otro ángulo</span>
          <InputNumero className="w-20" step={1} value={rotacion} onChange={(n) => onActualizar({ rotacion: n })} />
          <span className="text-xs text-muted-foreground">°</span>
        </div>
      </Seccion>

      <Seccion
        titulo="Borde de color"
        ayuda={'Un contorno alrededor de cada letra, por fuera. ' +
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
