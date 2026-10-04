import { useSyncExternalStore } from 'react';

// Avisos flotantes (esquina inferior derecha) para lo que pasa POR DETRÁS y
// el usuario no está mirando: sobre todo, un borrado que ya se mostró como
// hecho pero que el servidor rechazó. Se ven en Avisos.jsx.

let avisos = [];
let siguienteId = 1;
const oyentes = new Set();

function emitir(nuevos) {
  avisos = nuevos;
  for (const oyente of [...oyentes]) oyente();
}

export function descartarAviso(id) {
  emitir(avisos.filter((a) => a.id !== id));
}

/** Los errores duran más: hay que dar tiempo a leerlos. */
export function avisar({ mensaje, tono = 'info', duracionMs }) {
  const id = siguienteId++;
  emitir([...avisos, { id, mensaje, tono }]);
  setTimeout(() => descartarAviso(id), duracionMs ?? (tono === 'error' ? 9000 : 4000));
  return id;
}

export function useAvisos() {
  return useSyncExternalStore(
    (oyente) => {
      oyentes.add(oyente);
      return () => oyentes.delete(oyente);
    },
    () => avisos
  );
}
