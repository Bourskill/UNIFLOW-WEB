import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { listarPiezas, crearPieza, eliminarPieza, analizarSvg, analizarSvgManual } from '../api.js';
import { TALLAS, PRESETS_ANGULOS } from '../constantes.js';

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

// Un slot por talla: arrastrar el SVG de esa talla, analizarlo, y si el
// backend no pudo resolver solo cuál es el contorno y/o la escala física,
// pedir la confirmación acá mismo — nunca se guarda una geometría adivinada.
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
    <div className={'slot-svg ' + estado}>
      <div className="slot-svg-talla">{talla}</div>

      {estado === 'vacio' && (
        <div {...getRootProps()} className={'zona-dropzone' + (isDragActive ? ' activa' : '')}>
          <input {...getInputProps()} />
          <span>Soltar .svg</span>
        </div>
      )}

      {estado === 'analizando' && <div className="slot-svg-estado">Analizando…</div>}

      {estado === 'resuelto' && geometria && (
        <div className="slot-svg-estado ok">
          ✓ {(geometria.boundingBoxMm.anchoMm / 10).toFixed(1)}×{(geometria.boundingBoxMm.altoMm / 10).toFixed(1)} cm
        </div>
      )}

      {(estado === 'necesitaEleccion' || estado === 'necesitaEscala') && resultado && (
        <div className="slot-svg-resolver">
          <p className="aviso-slot">{resultado.motivo}</p>
          {estado === 'necesitaEleccion' && (
            <select value={indiceElegido} onChange={(e) => setIndiceElegido(e.target.value)}>
              <option value="">Elegí el contorno…</option>
              {resultado.candidatos.map((c) => (
                <option key={c.indice} value={c.indice}>
                  {c.nombre || 'forma #' + c.indice}
                </option>
              ))}
            </select>
          )}
          {!resultado.escalaConfirmada && (
            <input
              type="number"
              placeholder="Ancho real (cm)"
              value={anchoConocidoCm}
              onChange={(e) => setAnchoConocidoCm(e.target.value)}
            />
          )}
          <button
            type="button"
            onClick={confirmarManual}
            disabled={!indiceElegido || (!resultado.escalaConfirmada && !anchoConocidoCm)}
          >
            Confirmar
          </button>
        </div>
      )}

      {estado === 'error' && <div className="slot-svg-estado error">{errorMsg}</div>}
    </div>
  );
}

export function Piezas({ recargarSenal, onCambio }) {
  const [piezas, setPiezas] = useState([]);
  const [nombre, setNombre] = useState('');
  const [tela, setTela] = useState('');
  const [presetAngulos, setPresetAngulos] = useState(PRESETS_ANGULOS[0].id);
  const [permiteEspejo, setPermiteEspejo] = useState(false);
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
        permiteEspejo,
        geometriaPorTalla: Object.fromEntries(tallasCompletas.map((t) => [t, geometrias[t]])),
      });
      setNombre('');
      setTela('');
      setGeometrias({});
      setGeneracionSlots((n) => n + 1); // fuerza a los slots a volver a "vacío"
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
    <div className="pagina">
      <h2>Piezas</h2>
      <p className="ayuda">
        La biblioteca de formas reales: cada pieza se sube una vez, con el contorno real (no un
        rectángulo), y se recicla en tantos grupos/prendas como haga falta.
      </p>

      <form className="tarjeta" onSubmit={guardar}>
        <label>
          Nombre de la pieza
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Espalda" />
        </label>
        <label>
          Tela por defecto (opcional)
          <input value={tela} onChange={(e) => setTela(e.target.value)} placeholder="Dry Fit" />
        </label>
        <label>
          Ángulos de rotación permitidos al anidar
          <select value={presetAngulos} onChange={(e) => setPresetAngulos(e.target.value)}>
            {PRESETS_ANGULOS.map((p) => (
              <option key={p.id} value={p.id}>{p.etiqueta}</option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={permiteEspejo} onChange={(e) => setPermiteEspejo(e.target.checked)} />
          Se puede usar espejada (izquierda/derecha desde la misma pieza)
        </label>

        <div className="fila-rango-talla">
          <label>
            Desde
            <select value={tallaDesde} onChange={(e) => setTallaDesde(e.target.value)}>
              {TALLAS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label>
            Hasta
            <select value={tallaHasta} onChange={(e) => setTallaHasta(e.target.value)}>
              {TALLAS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        </div>

        <div className="grilla-slots-svg">
          {rango.map((t) => (
            <SlotTalla key={t + '-' + generacionSlots} talla={t} onResuelto={marcarResuelto} />
          ))}
        </div>

        <div className="acciones">
          <button type="submit" className="primario">Guardar pieza</button>
        </div>
        {error && <p className="error">{error}</p>}
      </form>

      <h3>Piezas en biblioteca</h3>
      {piezas.length === 0 ? (
        <p>Todavía no hay ninguna.</p>
      ) : (
        <ul className="lista-molderias">
          {piezas.map((p) => (
            <li key={p.id}>
              <strong>{p.nombre}</strong> — tallas: {Object.keys(p.dimensionesPorTalla).join(', ')}
              <button type="button" onClick={() => borrar(p.id)}>Eliminar</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
