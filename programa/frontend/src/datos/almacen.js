// Caché en memoria de las colecciones (piezas, prendas, diseños...), compartida
// por TODAS las pantallas. Dos problemas que resuelve:
//
//  1) "Cada cambio refresca toda la página": antes cada pantalla guardaba su
//     propia copia y, tras cualquier cambio, la volvía a pedir entera al
//     servidor mostrando "Cargando…" -- borrar una fila hacía desaparecer y
//     reaparecer la lista. Ahora hay UNA copia: se muestra al instante lo que
//     ya hay (aunque esté un poco vieja) y se actualiza por detrás, sin
//     "Cargando…" ni remontar nada.
//  2) Borrar es OPTIMISTA: la fila desaparece en el acto; el servidor se
//     entera en segundo plano. Si falla, vuelve a su lugar y se avisa.
//
// Este módulo es JavaScript puro (sin React ni red propia): recibe cómo listar
// cada colección y cómo avisar al usuario, así se puede probar en Node.

const IGUALES = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * @param {object} opciones
 * @param {Record<string, () => Promise<any[]>>} opciones.listadores  cómo pedir cada colección al servidor
 * @param {(aviso: {mensaje: string, tono?: 'info'|'error'}) => void} [opciones.avisar]
 * @param {number} [opciones.vigenciaMs]  tras cuánto una copia se considera vieja al volver a mirarla
 */
export function crearAlmacen({ listadores, avisar = () => {}, vigenciaMs = 30000, ahora = () => Date.now() }) {
  const nombres = Object.keys(listadores);
  const estados = {}; // nombre -> { datos: any[]|null, cargando, error }
  const oyentes = {}; // nombre -> Set<fn>
  const enCurso = {}; // nombre -> Promise (una sola petición a la vez por colección)
  const cargadoEn = {}; // nombre -> ms
  // Ids borrados en pantalla cuyo DELETE todavía no terminó: una lista que
  // llegue del servidor en el medio no puede "resucitarlos".
  const borrando = {};
  // Cambio mientras una carga estaba en vuelo: su resultado ya puede estar
  // desactualizado, así que al terminar se vuelve a pedir una vez más.
  const sucioDuranteCarga = {};

  for (const n of nombres) {
    estados[n] = { datos: null, cargando: false, error: null };
    oyentes[n] = new Set();
    borrando[n] = new Set();
  }

  function comprobar(nombre) {
    if (!estados[nombre]) throw new Error('Colección desconocida: ' + nombre);
  }

  function poner(nombre, cambios) {
    // Siempre un objeto NUEVO: es lo que useSyncExternalStore compara para
    // saber que hay algo que redibujar.
    estados[nombre] = { ...estados[nombre], ...cambios };
    for (const oyente of [...oyentes[nombre]]) oyente();
  }

  function sinBorrando(nombre, lista) {
    return borrando[nombre].size ? lista.filter((r) => !borrando[nombre].has(r.id)) : lista;
  }

  function leer(nombre) {
    comprobar(nombre);
    return estados[nombre];
  }

  function suscribir(nombre, oyente) {
    comprobar(nombre);
    oyentes[nombre].add(oyente);
    return () => oyentes[nombre].delete(oyente);
  }

  /**
   * Pide la colección al servidor. `silencioso` (por defecto) nunca muestra
   * "Cargando…" si ya hay datos que mostrar, y conserva la MISMA referencia
   * de la lista si nada cambió (nada se redibuja de más).
   */
  function cargar(nombre, { silencioso = true } = {}) {
    comprobar(nombre);
    if (enCurso[nombre]) {
      // Ya hay una petición en vuelo, pero salió ANTES de lo que motivó esta
      // llamada (un borrado, un cambio): se repite una vez más al terminar.
      sucioDuranteCarga[nombre] = true;
      return enCurso[nombre];
    }
    const sinDatos = estados[nombre].datos === null;
    if (sinDatos || !silencioso) poner(nombre, { cargando: sinDatos || !silencioso, error: null });

    enCurso[nombre] = Promise.resolve()
      .then(() => listadores[nombre]())
      .then((lista) => {
        const nueva = sinBorrando(nombre, lista);
        cargadoEn[nombre] = ahora();
        const actual = estados[nombre].datos;
        poner(nombre, {
          datos: actual && IGUALES(actual, nueva) ? actual : nueva,
          cargando: false,
          error: null,
        });
      })
      .catch((e) => {
        // Con datos a la vista, un fallo de fondo no los tumba: se quedan.
        poner(nombre, { cargando: false, error: estados[nombre].datos === null ? e.message : null });
      })
      .finally(() => {
        delete enCurso[nombre];
        if (sucioDuranteCarga[nombre]) {
          sucioDuranteCarga[nombre] = false;
          cargar(nombre, { silencioso: true });
        }
      });
    return enCurso[nombre];
  }

  /** Al mostrar una pantalla: pide lo que nunca se pidió, y refresca por detrás lo que ya está viejo. */
  function asegurar(nombre) {
    comprobar(nombre);
    const e = estados[nombre];
    if (e.datos === null && !enCurso[nombre]) return cargar(nombre); // también reintenta tras un error
    if (e.datos !== null && ahora() - (cargadoEn[nombre] || 0) > vigenciaMs) return cargar(nombre, { silencioso: true });
    return enCurso[nombre] || Promise.resolve();
  }

  /** Vuelve a pedir en segundo plano lo que ya se había cargado (todo, o solo `cuales`). */
  function invalidar(cuales) {
    const lista = (cuales || nombres).filter((n) => estados[n].datos !== null || enCurso[n]);
    return Promise.all(lista.map((n) => cargar(n, { silencioso: true })));
  }

  function conLista(nombre, transformar) {
    const actual = estados[nombre].datos;
    if (actual === null) return; // nunca se pidió: ya vendrá completa del servidor
    poner(nombre, { datos: transformar(actual) });
    // Si hay una carga en vuelo, su resultado salió ANTES de este cambio.
    if (enCurso[nombre]) sucioDuranteCarga[nombre] = true;
  }

  /** Inserta o reemplaza (por id) un registro que el servidor ya confirmó. */
  function guardarLocal(nombre, registro) {
    comprobar(nombre);
    conLista(nombre, (lista) => {
      const i = lista.findIndex((r) => r.id === registro.id);
      if (i === -1) return [...lista, registro];
      const copia = lista.slice();
      copia[i] = registro;
      return copia;
    });
    return registro;
  }

  /**
   * Borrado optimista: el registro desaparece AHORA; `llamada()` (el DELETE
   * real) corre en segundo plano. Nunca lanza: si falla, el registro vuelve a
   * su lugar y se avisa. Devuelve true/false según haya salido bien.
   */
  async function eliminar(nombre, id, llamada, { etiqueta = 'el registro' } = {}) {
    comprobar(nombre);
    const lista = estados[nombre].datos;
    const posicion = lista ? lista.findIndex((r) => r.id === id) : -1;
    const registro = posicion >= 0 ? lista[posicion] : null;

    borrando[nombre].add(id);
    conLista(nombre, (l) => l.filter((r) => r.id !== id));
    try {
      await llamada();
    } catch (e) {
      borrando[nombre].delete(id);
      if (registro) {
        conLista(nombre, (l) => {
          if (l.some((r) => r.id === id)) return l;
          const copia = l.slice();
          copia.splice(Math.min(posicion, copia.length), 0, registro);
          return copia;
        });
      } else {
        cargar(nombre, { silencioso: true });
      }
      avisar({ tono: 'error', mensaje: 'No se pudo borrar ' + etiqueta + ': ' + e.message + '. Volvió a la lista.' });
      return false;
    }
    borrando[nombre].delete(id);
    // El servidor es la verdad (puede haber cambiado algo más): se confirma por detrás.
    cargar(nombre, { silencioso: true });
    return true;
  }

  return { leer, suscribir, cargar, asegurar, invalidar, guardarLocal, eliminar, nombres };
}
