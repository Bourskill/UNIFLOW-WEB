import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { listarFuentes, crearFuente, eliminarFuente, buscarEnBancoDeFuentes, agregarFuenteDelBanco } from '../api.js';
import { useFuentesWeb, cssDeFamilia } from '../componentes/useFuentesWeb.js';
import { Boton, Campo, Input, Select, Tarjeta, Chip, Aviso, Ayuda } from '../componentes/ui.jsx';

function leerArchivoComoBase64(archivo) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(lector.result.split(',')[1]);
    lector.onerror = reject;
    lector.readAsDataURL(archivo);
  });
}

const TIPO_MIME_POR_EXTENSION = { ttf: 'font/ttf', otf: 'font/otf' };
const NOMBRE_PESO = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };

// Mismo archivo que baja el backend (.ttf) pero en woff2, que es el que el
// navegador carga más liviano -- solo para MOSTRAR cómo se ve la fuente antes
// de agregarla; al agregarla, el backend baja y guarda el .ttf real.
function urlDeMuestra(id, peso) {
  return 'https://cdn.jsdelivr.net/fontsource/fonts/' + id + '@latest/latin-' + peso + '-normal.woff2';
}

const TEXTO_DE_PRUEBA = 'PEÑA 10';

// Catálogo de tipografías propias para nombre/número/texto fijo de una zona
// (Productos.jsx) -- sin elegir ninguna, se sigue usando la fuente de base de
// siempre. La cobertura de ñ/acentos se calcula UNA vez acá, al subir el
// archivo (rutas/api.js·POST /fuentes), no en cada PDF generado. Las fuentes
// se pueden subir a mano o traer del banco gratuito (Fontsource).
export function Fuentes({ onCambio }) {
  const [fuentes, setFuentes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState(null); // de la subida a mano
  const [errorCatalogo, setErrorCatalogo] = useState(null); // de leer el catálogo
  const [nombrePendiente, setNombrePendiente] = useState(null); // {archivo, nombre} entre soltar y confirmar
  const [textoPrueba, setTextoPrueba] = useState(TEXTO_DE_PRUEBA);

  async function recargar() {
    setCargando(true);
    setErrorCatalogo(null);
    try {
      setFuentes(await listarFuentes());
    } catch (e) {
      setErrorCatalogo(e.message);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    recargar();
  }, []);

  const onDrop = useCallback((archivos) => {
    const archivo = archivos[0];
    if (!archivo) return;
    setError(null);
    setNombrePendiente({ archivo, nombre: archivo.name.replace(/\.(ttf|otf)$/i, '') });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'font/ttf': ['.ttf'], 'font/otf': ['.otf'] },
    multiple: false,
  });

  async function confirmarSubida() {
    if (!nombrePendiente) return;
    setError(null);
    setSubiendo(true);
    try {
      const extension = nombrePendiente.archivo.name.split('.').pop().toLowerCase();
      const base64 = await leerArchivoComoBase64(nombrePendiente.archivo);
      await crearFuente({ nombre: nombrePendiente.nombre, base64, contentType: TIPO_MIME_POR_EXTENSION[extension] });
      setNombrePendiente(null);
      await recargar();
      onCambio?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubiendo(false);
    }
  }

  async function borrar(id) {
    await eliminarFuente(id);
    await recargar();
    onCambio?.();
  }

  // Cada fuente del catálogo se muestra con SU propia letra.
  const familias = useFuentesWeb(fuentes.map((f) => f.archivoUrl));

  return (
    <div className="pagina flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Fuentes</h2>
        <div className="mt-1 flex max-w-2xl items-center gap-1.5 text-sm text-muted-foreground">
          Tipografías para nombre, número y texto de una zona.
          <Ayuda>
            Sin elegir ninguna, una zona usa la fuente de base. Al agregar una fuente se revisa una
            sola vez si soporta ñ y acentos.
          </Ayuda>
        </div>
      </div>

      <BancoDeFuentes fuentes={fuentes} textoPrueba={textoPrueba} onTextoPrueba={setTextoPrueba} onAgregada={async () => { await recargar(); onCambio?.(); }} />

      <Tarjeta className="flex max-w-xl flex-col gap-3">
        <div
          {...getRootProps()}
          className={
            'cursor-pointer rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm ' +
            (isDragActive ? 'border-primary bg-primary-soft text-primary' : 'border-border text-faint-foreground')
          }
        >
          <input {...getInputProps()} />
          ¿Tenés el archivo? Soltalo acá (.ttf o .otf)
        </div>

        {nombrePendiente && (
          <div className="flex flex-wrap items-center gap-2">
            <Campo etiqueta="Nombre de la fuente" className="flex-1">
              <Input
                value={nombrePendiente.nombre}
                onChange={(e) => setNombrePendiente((prev) => ({ ...prev, nombre: e.target.value }))}
              />
            </Campo>
            <Boton variante="primario" type="button" onClick={confirmarSubida} disabled={subiendo}>
              {subiendo ? 'Subiendo…' : 'Guardar'}
            </Boton>
            <Boton variante="fantasma" type="button" onClick={() => setNombrePendiente(null)} disabled={subiendo}>
              Cancelar
            </Boton>
          </div>
        )}
        {error && <Aviso tono="error">{error}</Aviso>}
      </Tarjeta>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint-foreground">
          Tu catálogo
        </h3>
        {cargando ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : errorCatalogo ? (
          <div className="flex max-w-xl flex-col items-start gap-2">
            <Aviso tono="error">No se pudo leer tu catálogo: {errorCatalogo}</Aviso>
            <Boton tamano="sm" type="button" onClick={recargar}>Reintentar</Boton>
          </div>
        ) : fuentes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay ninguna.</p>
        ) : (
          <div className="flex max-w-xl flex-col gap-2">
            {fuentes.map((f) => (
              <div key={f.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{f.nombre}</span>
                  <span
                    className="truncate text-2xl leading-tight"
                    style={familias[f.archivoUrl] ? { fontFamily: cssDeFamilia(familias[f.archivoUrl]) } : undefined}
                  >
                    {textoPrueba || '\u00a0'}
                  </span>
                </div>
                {f.licencia && <span className="text-xs text-faint-foreground">{f.licencia}</span>}
                {f.coberturaCompleta ? (
                  <Chip tono="activo">Todos los caracteres</Chip>
                ) : (
                  <Chip tono="peligro" title={'Sin: ' + f.caracteresFaltantes.join(' ')}>
                    Sin ñ/acentos
                  </Chip>
                )}
                <Boton variante="fantasma" tamano="sm" onClick={() => borrar(f.id)}>Eliminar</Boton>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Búsqueda en el banco gratuito de Fontsource (~2000 familias, licencia
// libre). Cada resultado se dibuja con su propia letra, con el texto de
// prueba editable, para ver cómo se comporta ANTES de traerla al catálogo.
function BancoDeFuentes({ fuentes, textoPrueba, onTextoPrueba, onAgregada }) {
  const [q, setQ] = useState('');
  const [categoria, setCategoria] = useState('');
  const [pagina, setPagina] = useState(0);
  const [resultado, setResultado] = useState(null); // { total, categorias, fuentes }
  const [buscando, setBuscando] = useState(true);
  const [error, setError] = useState(null);
  const [pesos, setPesos] = useState({}); // id -> peso elegido
  const [agregando, setAgregando] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [reintento, setReintento] = useState(0);

  useEffect(() => {
    let vigente = true;
    setBuscando(true);
    const temporizador = setTimeout(async () => {
      try {
        const r = await buscarEnBancoDeFuentes({ q, categoria, pagina });
        if (!vigente) return;
        setResultado(r);
        setError(null);
      } catch (e) {
        if (vigente) setError(e.message);
      } finally {
        if (vigente) setBuscando(false);
      }
    }, 300);
    return () => { vigente = false; clearTimeout(temporizador); };
  }, [q, categoria, pagina, reintento]);

  const pesoDe = (f) => pesos[f.id] ?? f.pesoPorDefecto;
  const urlsMuestra = useMemo(() => (resultado?.fuentes || []).map((f) => urlDeMuestra(f.id, pesos[f.id] ?? f.pesoPorDefecto)), [resultado, pesos]);
  const familias = useFuentesWeb(urlsMuestra);
  const yaEsta = (f) => fuentes.some((x) => x.fontsourceId === f.id && x.peso === pesoDe(f));
  const totalPaginas = resultado ? Math.max(1, Math.ceil(resultado.total / 24)) : 1;

  async function agregar(f) {
    setAgregando(f.id);
    setAviso(null);
    setError(null);
    try {
      const registro = await agregarFuenteDelBanco({ id: f.id, peso: pesoDe(f) });
      setAviso(
        '"' + registro.nombre + '" agregada' +
          (registro.coberturaCompleta ? '.' : ' -- ojo: no soporta ' + registro.caracteresFaltantes.join(' ') + '.')
      );
      await onAgregada();
    } catch (e) {
      setError(e.message);
    } finally {
      setAgregando(null);
    }
  }

  return (
    <Tarjeta className="flex flex-col gap-4">
      <div className="flex items-center gap-1.5">
        <h3 className="text-sm font-semibold">Banco gratuito</h3>
        <Ayuda>
          Fontsource: unas 2000 familias de Google Fonts y otras, todas de licencia libre (se pueden
          usar en producto comercial). Elegí una y se baja a tu catálogo, con la revisión de ñ y
          acentos. Los pesos que ves en cada una son los que tiene disponibles.
        </Ayuda>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Campo etiqueta="Buscar" className="w-56">
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPagina(0); }} placeholder="Anton, Bebas, Oswald…" />
        </Campo>
        <Campo etiqueta="Estilo" className="w-44">
          <Select value={categoria} onChange={(e) => { setCategoria(e.target.value); setPagina(0); }}>
            <option value="">Todos</option>
            {(resultado?.categorias || []).map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Campo>
        <Campo etiqueta="Texto de prueba" className="w-56">
          <Input value={textoPrueba} onChange={(e) => onTextoPrueba(e.target.value)} />
        </Campo>
      </div>

      {error && <Aviso tono="error">{error}</Aviso>}
      {aviso && <Aviso tono="info">{aviso}</Aviso>}

      {!resultado && buscando && <p className="text-sm text-muted-foreground">Buscando en el banco…</p>}
      {!resultado && !buscando && error && (
        <div>
          <Boton tamano="sm" type="button" onClick={() => setReintento((n) => n + 1)}>Reintentar</Boton>
        </div>
      )}

      {resultado && (
        <>
          <p className="text-xs text-faint-foreground">
            {buscando ? 'Buscando…' : resultado.total + (resultado.total === 1 ? ' fuente' : ' fuentes')}
          </p>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {resultado.fuentes.map((f) => {
              const peso = pesoDe(f);
              const familia = familias[urlDeMuestra(f.id, peso)];
              return (
                <div key={f.id} className="flex flex-col gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium" title={f.family}>{f.family}</span>
                    <Chip>{f.category}</Chip>
                  </div>
                  <div
                    className="min-h-[2.25rem] truncate text-3xl leading-tight"
                    style={familia ? { fontFamily: cssDeFamilia(familia) } : { opacity: 0.3 }}
                  >
                    {textoPrueba || '\u00a0'}
                  </div>
                  <div className="flex items-center gap-2">
                    {f.weights.length > 1 ? (
                      <Select
                        aria-label={'Peso de ' + f.family}
                        className="max-w-[130px] py-1 text-xs"
                        value={peso}
                        onChange={(e) => setPesos((prev) => ({ ...prev, [f.id]: Number(e.target.value) }))}
                      >
                        {f.weights.map((w) => <option key={w} value={w}>{w} {NOMBRE_PESO[w] || ''}</option>)}
                      </Select>
                    ) : (
                      <span className="text-xs text-faint-foreground">{peso} {NOMBRE_PESO[peso] || ''}</span>
                    )}
                    <span className="flex-1" />
                    {yaEsta(f) ? (
                      <Chip tono="activo">En tu catálogo</Chip>
                    ) : (
                      <Boton tamano="sm" variante="acento" type="button" aria-label={'Agregar ' + f.family + ' ' + peso + ' al catálogo'} onClick={() => agregar(f)} disabled={agregando !== null}>
                        {agregando === f.id ? 'Agregando…' : 'Agregar'}
                      </Boton>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {totalPaginas > 1 && (
            <div className="flex items-center gap-3">
              <Boton tamano="sm" type="button" onClick={() => setPagina((p) => Math.max(0, p - 1))} disabled={pagina === 0}>Anterior</Boton>
              <span className="text-xs text-faint-foreground">Página {pagina + 1} de {totalPaginas}</span>
              <Boton tamano="sm" type="button" onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))} disabled={pagina >= totalPaginas - 1}>Siguiente</Boton>
            </div>
          )}
        </>
      )}
    </Tarjeta>
  );
}
