import { useEffect, useMemo, useState } from 'react';
import { analizarPrenda, crearGrupo, crearPieza, subirArchivo } from '../api.js';
import { obtener } from '../datos/index.js';
import { PRESETS_ANGULOS, ordenarTallasNatural } from '../constantes.js';
import { Boton, Campo, Input, Select, Tarjeta, Chip, Aviso, Ayuda } from '../componentes/ui.jsx';
import { TrazosPreview } from '../componentes/TrazosPreview.jsx';

// Clave con la que se guarda la única geometría de una pieza de talla única
// (una capa con un solo contorno, ej. un tapacuellos): la pieza va marcada
// tallaUnica, así que producción la usa para cualquier talla que se pida
// (motor/resolverPedido.js·tallaRealDePieza).
const CLAVE_TALLA_UNICA = 'UNICA';

function leerArchivoComoBase64(archivo) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(lector.result.split(',')[1]);
    lector.onerror = reject;
    lector.readAsDataURL(archivo);
  });
}

function partirTallas(texto) {
  return texto.split(/[\s,;/]+/).map((t) => t.trim()).filter(Boolean);
}

// Sugerencia para la lista de tallas: si la biblioteca ya tiene piezas con
// exactamente esa cantidad de tallas, la combinación más usada. Solo
// rellena el campo; el usuario la confirma o la cambia.
function tallasSugeridas(piezas, cantidad) {
  const conteo = new Map();
  for (const p of piezas) {
    const tallas = ordenarTallasNatural(Object.keys(p.dimensionesPorTalla || {}));
    if (tallas.length !== cantidad) continue;
    const clave = tallas.join(' ');
    conteo.set(clave, (conteo.get(clave) || 0) + 1);
  }
  let mejor = '';
  let veces = 0;
  for (const [clave, n] of conteo) if (n > veces) { mejor = clave; veces = n; }
  return mejor;
}

// Los nombres de talla que trae el propio archivo (los grupos de cada capa en
// Illustrator, ver backend illustrator/nombresDeTallas.js), de menor a mayor:
// la lista que más piezas comparten.
function tallasDelArchivo(piezas) {
  const conteo = new Map();
  for (const p of piezas) {
    if (!p.nombresTallas?.length) continue;
    const lista = [...p.nombresTallas].reverse().join(' ');
    conteo.set(lista, (conteo.get(lista) || 0) + 1);
  }
  let mejor = '';
  let veces = 0;
  for (const [lista, n] of conteo) if (n > veces) { mejor = lista; veces = n; }
  return mejor;
}

// Un PDF sin esos nombres solo trae los contornos. Si la
// biblioteca todavía no tiene piezas con esa cantidad de tallas (una carpeta
// nueva, por ejemplo), se ofrece la última lista que se usó para esa cantidad.
const CLAVE_TALLAS_USADAS = 'uniflow.tallasPorCantidad';
function tallasRecordadas(cantidad) {
  try { return JSON.parse(localStorage.getItem(CLAVE_TALLAS_USADAS) || '{}')[cantidad] || ''; } catch { return ''; }
}
function recordarTallas(tallas) {
  if (tallas.length < 2) return;
  try {
    const usadas = JSON.parse(localStorage.getItem(CLAVE_TALLAS_USADAS) || '{}');
    usadas[tallas.length] = tallas.join(' ');
    localStorage.setItem(CLAVE_TALLAS_USADAS, JSON.stringify(usadas));
  } catch { /* sin almacenamiento: solo no se recuerda */ }
}

// La cantidad de tallas "de la prenda": la que más se repite entre las
// piezas (las de un solo contorno son talla única y no cuentan).
function cantidadDeTallasComun(piezas) {
  const conteo = new Map();
  for (const p of piezas) {
    if (p.tallas.length > 1) conteo.set(p.tallas.length, (conteo.get(p.tallas.length) || 0) + 1);
  }
  let mejor = 0;
  let veces = 0;
  for (const [n, v] of conteo) if (v > veces) { mejor = n; veces = v; }
  return mejor;
}

// Prenda completa en UN PDF: una capa por pieza ("MANGA", "ESPALDAS"...),
// con todas las tallas anidadas una dentro de otra y sus piquetes. El
// archivo no dice qué talla es cada contorno -- el backend los devuelve de
// mayor a menor y acá se les pone nombre con la lista que escribe el
// usuario (de menor a mayor, como se lee una tabla de talles).
// Recibe el archivo ya soltado en "Subir piezas" (Formulario.jsx), que es
// quien detectó que es una prenda y no una pieza.
export function ImportarPrenda({ archivo, onQuitar, onGuardado }) {
  const [estado, setEstado] = useState('analizando'); // analizando | listo | error
  const [analisis, setAnalisis] = useState(null);
  const [archivoUrl, setArchivoUrl] = useState(null);
  const [avisoArchivo, setAvisoArchivo] = useState(null);
  const [textoTallas, setTextoTallas] = useState('');
  const [filas, setFilas] = useState([]); // [{ incluir, nombre }] alineado con analisis.piezas
  const [presetAngulos, setPresetAngulos] = useState(PRESETS_ANGULOS[0].id);
  const [armarPrenda, setArmarPrenda] = useState(false);
  const [nombrePrenda, setNombrePrenda] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    empezar(archivo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function empezar(nuevo) {
    try {
      const base64 = await leerArchivoComoBase64(nuevo);
      const [url, r, biblioteca] = await Promise.all([
        // La copia del original no es imprescindible (estas piezas no se
        // "reprocesan"): si Storage falla, se importa igual y se avisa.
        subirArchivo(nuevo, 'application/pdf', 'prenda').catch((e) => {
          setAvisoArchivo(e.message);
          return null;
        }),
        analizarPrenda(base64),
        obtener('piezas').catch(() => []),
      ]);
      if (r.piezas.length === 0) throw new Error('El PDF no trae ninguna capa con piezas.');
      setArchivoUrl(url);
      setAnalisis(r);
      setFilas(r.piezas.map((p) => ({ incluir: p.tallas.length > 0, nombre: p.nombre })));
      setNombrePrenda(nuevo.name.replace(/\.pdf$/i, '').trim());
      const cantidad = cantidadDeTallasComun(r.piezas);
      setTextoTallas(tallasDelArchivo(r.piezas) || tallasSugeridas(biblioteca, cantidad) || tallasRecordadas(cantidad));
      setEstado('listo');
    } catch (e) {
      setError(e.message);
      setEstado('error');
    }
  }

  const tallas = useMemo(() => partirTallas(textoTallas), [textoTallas]);
  const tallasRepetidas = new Set(tallas.map((t) => t.toUpperCase())).size !== tallas.length;

  // Por pieza: su geometriaPorTalla ya con nombres, o por qué no se puede.
  const resueltas = useMemo(() => {
    if (!analisis) return [];
    return analisis.piezas.map((p) => {
      if (p.tallas.length === 0) return { problema: 'No se encontró ningún contorno en esta capa.' };
      if (p.tallas.length === 1) {
        return { tallaUnica: true, geometriaPorTalla: { [CLAVE_TALLA_UNICA]: { ...p.tallas[0], validadoPorUsuario: true } } };
      }
      if (tallas.length !== p.tallas.length) {
        return {
          problema: 'Trae ' + p.tallas.length + ' tallas y la lista tiene ' + tallas.length + '.',
        };
      }
      // p.tallas viene de MAYOR a menor; la lista del usuario, de menor a MAYOR.
      const geometriaPorTalla = {};
      p.tallas.forEach((geo, i) => {
        geometriaPorTalla[tallas[tallas.length - 1 - i]] = { ...geo, validadoPorUsuario: true };
      });
      return { geometriaPorTalla };
    });
  }, [analisis, tallas]);

  function cambiarFila(indice, cambios) {
    setFilas((prev) => prev.map((f, i) => (i === indice ? { ...f, ...cambios } : f)));
  }

  const incluidas = filas.map((f, i) => ({ ...f, indice: i })).filter((f) => f.incluir);
  const nombresRepetidos = (() => {
    const vistos = new Set();
    for (const f of incluidas) {
      const n = f.nombre.trim().toLowerCase();
      if (vistos.has(n)) return true;
      vistos.add(n);
    }
    return false;
  })();

  const pendientes = [];
  if (incluidas.length === 0) pendientes.push('elegir al menos una pieza');
  if (tallas.length === 0 && incluidas.some((f) => !resueltas[f.indice]?.tallaUnica)) pendientes.push('la lista de tallas');
  if (tallasRepetidas) pendientes.push('tallas repetidas en la lista');
  const conProblema = incluidas.filter((f) => resueltas[f.indice]?.problema).length;
  if (tallas.length > 0 && conProblema > 0) pendientes.push(conProblema + (conProblema === 1 ? ' pieza no coincide' : ' piezas no coinciden') + ' con la lista (quitalas o corregí la lista)');
  if (incluidas.some((f) => !f.nombre.trim())) pendientes.push('nombre en todas las piezas');
  if (nombresRepetidos) pendientes.push('nombres repetidos');
  if (armarPrenda && !nombrePrenda.trim()) pendientes.push('nombre de la prenda');
  const puedeGuardar = estado === 'listo' && pendientes.length === 0;

  async function guardar() {
    if (!puedeGuardar) return;
    setError(null);
    setGuardando(true);
    const preset = PRESETS_ANGULOS.find((p) => p.id === presetAngulos);
    recordarTallas(tallas);
    const creadas = [];
    try {
      for (const f of incluidas) {
        const r = resueltas[f.indice];
        const pieza = await crearPieza({
          nombre: f.nombre.trim(),
          angulosPermitidos: preset.valores,
          geometriaPorTalla: r.geometriaPorTalla,
          tallaUnica: !!r.tallaUnica,
          archivoOriginal: archivoUrl,
          formatoOriginal: 'pdf-prenda',
        });
        creadas.push({ piezaId: pieza.id, rol: f.nombre.trim() });
      }
      if (armarPrenda) await crearGrupo({ nombre: nombrePrenda.trim(), piezas: creadas });
      onGuardado?.(
        archivo.name + ': ' + creadas.length + (creadas.length === 1 ? ' pieza guardada' : ' piezas guardadas') +
          (armarPrenda ? ' · prenda "' + nombrePrenda.trim() + '" armada.' : '.')
      );
    } catch (e) {
      // Si falló a mitad, las que ya se crearon quedan en la biblioteca:
      // se dice cuántas, para no duplicarlas al reintentar.
      setError(
        e.message +
          (creadas.length > 0 ? ' — ya se guardaron ' + creadas.length + ' antes del error (revisá la Biblioteca antes de reintentar).' : '')
      );
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium" title={archivo.name}>{archivo.name}</div>
          <div className="text-xs text-muted-foreground">
            Prenda completa{analisis ? ' · ' + analisis.piezas.length + ' piezas' : ''}
          </div>
        </div>
        <Boton variante="fantasma" tamano="sm" type="button" onClick={onQuitar}>Quitar</Boton>
      </div>

      {estado === 'analizando' && <p className="text-sm text-muted-foreground">Analizando…</p>}
      {estado === 'error' && <Aviso tono="error">{error}</Aviso>}
      {avisoArchivo && (
        <Aviso tono="info">
          No se pudo guardar una copia del PDF original ({avisoArchivo}). Las piezas se importan igual.
        </Aviso>
      )}

      {estado === 'listo' && analisis && (
        <>
          <Tarjeta className="flex flex-wrap items-end gap-4">
            <Campo etiqueta="Tallas, de menor a mayor" className="min-w-[280px] flex-1">
              <Input
                value={textoTallas}
                onChange={(e) => setTextoTallas(e.target.value)}
                placeholder="Ej. 2 4 6 8 10 12 14 16 S"
              />
            </Campo>
            <Campo etiqueta="Giros permitidos" className="w-[230px]">
              <Select value={presetAngulos} onChange={(e) => setPresetAngulos(e.target.value)}>
                {PRESETS_ANGULOS.map((p) => <option key={p.id} value={p.id}>{p.etiqueta}</option>)}
              </Select>
            </Campo>
            <div className="flex items-center gap-1.5 pb-2 text-xs text-muted-foreground">
              {tallas.length} {tallas.length === 1 ? 'talla' : 'tallas'}
              <Ayuda>
                El PDF no trae el nombre de cada talla: cada pieza viene con sus contornos anidados, y
                se ordenan solos del más chico al más grande. Escribí las tallas en ese mismo orden,
                separadas por espacio o coma. Las piezas con un solo contorno se guardan como talla
                única.
              </Ayuda>
            </div>
          </Tarjeta>

          <div className="flex flex-col gap-2">
            {analisis.piezas.map((p, i) => {
              const r = resueltas[i];
              const fila = filas[i];
              const piquetes = p.tallas.map((t) => t.piquetesMm.length);
              const piquetesTexto =
                piquetes.length === 0 ? '' :
                Math.max(...piquetes) === 0 ? 'sin piquetes' :
                Math.min(...piquetes) === Math.max(...piquetes)
                  ? piquetes[0] + (piquetes[0] === 1 ? ' piquete' : ' piquetes') + ' por talla'
                  : 'entre ' + Math.min(...piquetes) + ' y ' + Math.max(...piquetes) + ' piquetes por talla';
              const vista = r?.geometriaPorTalla ||
                Object.fromEntries(p.tallas.map((geo, k) => ['#' + k, geo]));
              return (
                <Tarjeta key={i} className={'flex items-center gap-4 ' + (fila.incluir ? '' : 'opacity-50')}>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded accent-primary"
                    checked={fila.incluir}
                    disabled={p.tallas.length === 0}
                    onChange={(e) => cambiarFila(i, { incluir: e.target.checked })}
                    aria-label={'Incluir ' + p.nombre}
                  />
                  <TrazosPreview geometriaPorTalla={vista} size={72} />
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Input
                      value={fila.nombre}
                      onChange={(e) => cambiarFila(i, { nombre: e.target.value })}
                      className="max-w-[260px]"
                      aria-label="Nombre de la pieza"
                    />
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {r?.tallaUnica ? (
                        <Chip tono="activo">talla única</Chip>
                      ) : r?.geometriaPorTalla ? (
                        ordenarTallasNatural(Object.keys(r.geometriaPorTalla)).map((t) => (
                          <Chip key={t} tono="activo" className="uppercase">{t}</Chip>
                        ))
                      ) : (
                        <span>{p.tallas.length} {p.tallas.length === 1 ? 'contorno' : 'contornos'}</span>
                      )}
                      {piquetesTexto && <span>· {piquetesTexto}</span>}
                    </div>
                    {fila.incluir && r?.problema && tallas.length > 0 && (
                      <span className="text-xs text-danger">{r.problema}</span>
                    )}
                    {(p.lineasIgnoradas > 0 || p.piquetesSinContorno > 0) && (
                      <span className="text-xs text-faint-foreground">
                        Se ignoraron {p.lineasIgnoradas > 0 ? p.lineasIgnoradas + ' líneas largas sin área' : ''}
                        {p.lineasIgnoradas > 0 && p.piquetesSinContorno > 0 ? ' y ' : ''}
                        {p.piquetesSinContorno > 0 ? p.piquetesSinContorno + ' piquetes sin contorno' : ''}.
                      </span>
                    )}
                  </div>
                </Tarjeta>
              );
            })}
          </div>

          <Tarjeta className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <input type="checkbox" checked={armarPrenda} onChange={(e) => setArmarPrenda(e.target.checked)} />
              Juntar las piezas elegidas en una prenda
            </label>
            {armarPrenda && (
              <Input
                value={nombrePrenda}
                onChange={(e) => setNombrePrenda(e.target.value)}
                placeholder="Nombre de la prenda"
                className="max-w-[320px]"
              />
            )}
          </Tarjeta>

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <Boton variante="primario" type="button" onClick={guardar} disabled={guardando || !puedeGuardar}>
                {guardando
                  ? 'Guardando…'
                  : 'Guardar ' + incluidas.length + (incluidas.length === 1 ? ' pieza' : ' piezas') + (armarPrenda ? ' y la prenda' : '')}
              </Boton>
              {pendientes.length > 0 && (
                <span className="text-xs text-faint-foreground">Falta: {pendientes.join(' · ')}</span>
              )}
            </div>
            {error && <Aviso tono="error">{error}</Aviso>}
          </div>
        </>
      )}
    </div>
  );
}
