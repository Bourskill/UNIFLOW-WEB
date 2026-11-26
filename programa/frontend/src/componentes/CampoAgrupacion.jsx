import { useId } from 'react';
import { Input, Ayuda } from './ui.jsx';

// "Agrupar la moldería subida": al subir piezas, dejarlas juntas bajo un
// nombre (utilidades/agrupaciones.js) para encontrarlas fácil al armar una
// prenda. Ofrece las agrupaciones que ya existen, para sumar a una.
// valor: { activa, nombre }.
export function CampoAgrupacion({ valor, onCambiar, existentes = [] }) {
  const idLista = useId();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <label className="flex items-center gap-2 text-sm font-medium text-foreground">
        <input type="checkbox" checked={valor.activa} onChange={(e) => onCambiar({ ...valor, activa: e.target.checked })} />
        Agrupar esta moldería
      </label>
      {valor.activa && (
        <>
          <Input
            value={valor.nombre}
            onChange={(e) => onCambiar({ ...valor, nombre: e.target.value })}
            placeholder="Nombre de la agrupación (ej. SPARTA VOLEY)"
            className="max-w-[320px]"
            list={idLista}
            aria-label="Nombre de la agrupación"
          />
          <datalist id={idLista}>
            {existentes.map((n) => <option key={n} value={n} />)}
          </datalist>
        </>
      )}
      <Ayuda>
        Junta las piezas que subís ahora bajo un nombre, para que al crear una prenda no tengas que
        buscarlas entre toda la Biblioteca. Si ya existe una agrupación con ese nombre, se suman a
        ella. No es una prenda: las prendas se arman aparte, eligiendo las piezas y su rol.
      </Ayuda>
    </div>
  );
}
