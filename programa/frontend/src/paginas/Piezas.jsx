import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { listarPiezas, crearPieza, editarPieza, eliminarPieza, analizarSvg, analizarSvgManual } from '../api.js';
import { TALLAS, PRESETS_ANGULOS } from '../constantes.js';
import { Boton, Campo, Input, Select, Tarjeta, Chip, Aviso } from '../componentes/ui.jsx';

function leerArchivoComoTexto(archivo) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(lector.result);
    lector.onerror = reject;
    lector.readAsText(archivo);
  });
}

function rangoDeTallas(desde, hasta) {
  const i0 = TALLAS.indexOf(desde);
  const i1 = TALLAS.indexOf(hasta);
  if (i0 === -1 || i1 === -1 || i0 > i1) return [];
  return TALLAS.slice(i0, i1 + 1);
}

// Un slot por talla: arrastrás el SVG de esa talla, se analiza, y si el
// backend no pudo resolver solo el contorno y/o la escala física, se
// resuelve acá mismo — nunca se guarda una geometría adivinada.
function SlotTalla({ talla, onResuelto }) {
  const [estado, setEstado] = useState('vacio');
  const [svgTexto, setSvgTexto] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [indiceElegido, setIndiceElegido] = useState('');
  const [anchoConocidoCm, setAnchoConocidoCm] = useState('');
  const [geometria, setGeometria] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  const onDrop = useCallback(
    async (archivos) => {
      const archivo = archivos[0];
      if (!archivo) return;
      setEstado('analizando');
      setErrorMsg(null);
      try {
        const texto = await leerArchivoComoTexto(archivo);
        setSvgTexto(texto);
        const r = await analizarSvg(texto);
        setResultado(r);
        if (r.resuelto) {
          const geo = { poligonoMm: r.poligonoMm, boundingBoxMm: r.boundingBoxMm, svgOriginal: texto, validadoPorUsuario: true };
          setGeometria(geo);
          setEstado('resuelto');
          onResuelto(talla, geo);
        } else if (r.contornoIndice != null && !r.escalaConfirmada) {
          setIndiceElegido(String(r.contornoIndice));
          setEstado('necesitaEscala');
        } else {
          setEstado('necesitaEleccion');
        }
      } catch (e) {
        setErrorMsg(e.message);
        setEstado('error');
      }
    },
    [talla, onResuelto]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/svg+xml': ['.svg'] },
    multiple: false,
  });

  async function confirmarManual() {
    setErrorMsg(null);
    try {
      const opciones = resultado.escalaConfirmada
        ? { mmPorUnidad: resultado.mmPorUnidad }
        : { anchoConocidoCm: Number(anchoConocidoCm) };
      const r = await analizarSvgManual(svgTexto, Number(indiceElegido), opciones);
      const geo = { poligonoMm: r.poligonoMm, boundingBoxMm: r.boundingBoxMm, svgOriginal: svgTexto, validadoPorUsuario: true };
      setGeometria(geo);
      setEstado('resuelto');
      onResuelto(talla, geo);
    } catch (e) {
      setErrorMsg(e.message);
    }
  }

  return (
    <div
      className={
        'flex flex-col gap-1.5 rounded-lg border p-2 ' +
        (estado === 'resuelto' ? 'border-primary/40 bg-primary-soft' : estado === 'error' ? 'border-danger/40' : 'border-border bg-surface-muted')
      }
    >
      <div className="text-[10px] font-semibold uppercase tracking-wide text-faint-foreground">{talla}</div>

      {estado === 'vacio' && (
        <div
          {...getRootProps()}
          className={
            'cursor-pointer rounded-md border-2 border-dashed px-2 py-3 text-center text-xs ' +
            (isDragActive ? 'border-primary bg-primary-soft text-primary' : 'border-border text-faint-foreground')
          }
        >
          <input {...getInputProps()} />
          Soltar .svg
        </div>
      )}

      {estado === 'analizando' && <p className="text-xs text-muted-foreground">Analizando…</p>}

      {estado === 'resuelto' && geometria && (
        <p className="text-xs font-medium text-primary">
          ✓ {(geometria.boundingBoxMm.anchoMm / 10).toFixed(1)}×{(geometria.boundingBoxMm.altoMm / 10).toFixed(1)} cm
        </p>
      )}

      {(estado === 'necesitaEleccion' || estado === 'necesitaEscala') && resultado && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] text-faint-foreground">{resultado.motivo}</p>
          {estado === 'necesitaEleccion' && (
            <Select value={indiceElegido} onChange={(e) => setIndiceElegido(e.target.value)} className="text-xs">
              <option value="">Elegí el contorno…</option>
              {resultado.candidatos.map((c) => (
                <option key={c.indice} value={c.indice}>{c.nombre || 'forma #' + c.indice}</option>
              ))}
            </Select>
          )}
          {!resultado.escalaConfirmada && (
            <Input
              type="number"
              placeholder="Ancho real (cm)"
              value={anchoConocidoCm}
              onChange={(e) => setAnchoConocidoCm(e.target.value)}
              className="text-xs"
            />
          )}
          <Boton
            tamano="sm"
            variante="primario"
            onClick={confirmarManual}
            disabled={!indiceElegido || (!resultado.escalaConfirmada && !anchoConocidoCm)}
          >
            Confirmar
          </Boton>
        </div>
      )}

      {estado === 'error' && <p className="text-xs text-danger">{errorMsg}</p>}
    </div>
  );
}

function presetDe(angulosPermitidos) {
  if (angulosPermitidos === 'libre') return 'libre';
  const preset = PRESETS_ANGULOS.find(
    (p) => Array.isArray(p.valores) && JSON.stringify(p.valores) === JSON.stringify(angulosPermitidos)
  );
  return preset?.id || '0-180';
}

function FilaPiezaExistente({ pieza, onCambio, onBorrar }) {
  const [editando, setEditando] = useState(false);
  const [tela, setTela] = useState(pieza.tela || '');
  const [presetAngulos, setPresetAngulos] = useState(presetDe(pieza.angulosPermitidos));

  async function guardar() {
    const preset = PRESETS_ANGULOS.find((p) => p.id === presetAngulos);
    await editarPieza(pieza.id, { tela: tela || null, angulosPermitidos: preset.valores });
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
              <span className="text-xs text-faint-foreground">sin geometría cargada</span>
            ) : (
              tallas.map((t) => (
                <Chip key={t}>{t}: {pieza.dimensionesPorTalla[t].anchoCm}×{pieza.dimensionesPorTalla[t].altoCm}cm</Chip>
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
          <Boton variante="primario" tamano="sm" onClick={guardar}>Guardar cambios</Boton>
        </div>
      )}
    </Tarjeta>
  );
}

export function Piezas({ recargarSenal, onCambio }) {
  const [piezas, setPiezas] = useState([]);
  const [nombre, setNombre] = useState('');
  const [tela, setTela] = useState('');
  const [presetAngulos, setPresetAngulos] = useState(PRESETS_ANGULOS[0].id);
  const [tallaDesde, setTallaDesde] = useState(TALLAS[1]);
  const [tallaHasta, setTallaHasta] = useState(TALLAS[4]);
  const [geometrias, setGeometrias] = useState({});
  const [generacionSlots, setGeneracionSlots] = useState(0);
  const [error, setError] = useState(null);

  const rango = useMemo(() => rangoDeTallas(tallaDesde, tallaHasta), [tallaDesde, tallaHasta]);

  async function recargar() {
    setPiezas(await listarPiezas());
  }

  useEffect(() => {
    recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recargarSenal]);

  function marcarResuelto(talla, geometria) {
    setGeometrias((prev) => ({ ...prev, [talla]: geometria }));
  }

  async function guardar(evento) {
    evento.preventDefault();
    setError(null);
    if (!nombre.trim()) {
      setError('Falta el nombre de la pieza.');
      return;
    }
    const tallasCompletas = rango.filter((t) => geometrias[t]);
    if (tallasCompletas.length === 0) {
      setError('Subí la forma de al menos una talla.');
      return;
    }
    const preset = PRESETS_ANGULOS.find((p) => p.id === presetAngulos);
    try {
      await crearPieza({
        nombre,
        tela: tela || null,
        angulosPermitidos: preset.valores,
        geometriaPorTalla: Object.fromEntries(tallasCompletas.map((t) => [t, geometrias[t]])),
      });
      setNombre('');
      setTela('');
      setGeometrias({});
      setGeneracionSlots((n) => n + 1);
      await recargar();
      onCambio?.();
    } catch (e) {
      setError(e.message);
    }
  }

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
          Acá se sube la moldería real: elegís una pieza (ej. "Manga") y subís de una vez todas sus
          tallas, con su forma real (no un rectángulo). Después se arma la prenda completa en{' '}
          <strong>Grupos</strong>, eligiendo piezas de acá.
        </p>
      </div>

      <Tarjeta as="form" onSubmit={guardar} className="flex max-w-2xl flex-col gap-4">
        <Campo etiqueta="Nombre de la pieza">
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Manga izquierda" />
        </Campo>
        <Campo etiqueta="Tela por defecto (opcional)">
          <Input value={tela} onChange={(e) => setTela(e.target.value)} placeholder="Dry Fit" />
        </Campo>
        <Campo etiqueta="Ángulos de rotación permitidos al anidar">
          <Select value={presetAngulos} onChange={(e) => setPresetAngulos(e.target.value)}>
            {PRESETS_ANGULOS.map((p) => <option key={p.id} value={p.id}>{p.etiqueta}</option>)}
          </Select>
        </Campo>

        <div className="flex gap-3">
          <Campo etiqueta="Desde" className="max-w-[110px]">
            <Select value={tallaDesde} onChange={(e) => setTallaDesde(e.target.value)}>
              {TALLAS.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Campo>
          <Campo etiqueta="Hasta" className="max-w-[110px]">
            <Select value={tallaHasta} onChange={(e) => setTallaHasta(e.target.value)}>
              {TALLAS.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Campo>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {rango.map((t) => (
            <SlotTalla key={t + '-' + generacionSlots} talla={t} onResuelto={marcarResuelto} />
          ))}
        </div>

        <div>
          <Boton variante="primario" type="submit">Guardar pieza</Boton>
        </div>
        {error && <Aviso tono="error">{error}</Aviso>}
      </Tarjeta>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint-foreground">
          Piezas en biblioteca
        </h3>
        {piezas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay ninguna.</p>
        ) : (
          <div className="flex max-w-2xl flex-col gap-3">
            {piezas.map((p) => (
              <FilaPiezaExistente key={p.id} pieza={p} onCambio={recargar} onBorrar={borrar} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
