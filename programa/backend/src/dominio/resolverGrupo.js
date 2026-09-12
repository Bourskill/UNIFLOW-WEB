// Expande un Grupo (piezas por REFERENCIA) a la forma plana que ya consumen
// calibracion.js/nesting.js/resolverPedido.js: un array de "piezas" con
// nombre, rotable y dimensionesPorTalla. Es el único lugar que sabe leer una
// referencia de biblioteca — el resto del motor no necesita saber que una
// pieza puede estar compartida entre grupos.

export function resolverPiezasDeGrupo(grupo, piezas) {
  return grupo.piezas.map((gp) => {
    const pieza = piezas.find((p) => p.id === gp.piezaId);
    if (!pieza) {
      throw new Error(
        'El grupo "' + grupo.nombre + '" referencia una pieza que ya no existe (rol "' + gp.rol + '").'
      );
    }

    const angulosPermitidos = pieza.angulosPermitidos;
    const rotable = angulosPermitidos === 'libre' || angulosPermitidos.includes(180);

    return {
      nombre: gp.rol,
      rotable,
      tela: pieza.tela,
      dimensionesPorTalla: pieza.dimensionesPorTalla,
      geometriaPorTalla: pieza.geometriaPorTalla,
    };
  });
}
