// Expande un Grupo (piezas por REFERENCIA) a la forma plana que ya consumen
// calibracion.js/nesting.js/resolverPedido.js: un array de "piezas" con
// nombre, rotable y dimensionesPorTalla. Es el único lugar que sabe leer una
// referencia de biblioteca — el resto del motor no necesita saber que una
// pieza puede estar compartida entre grupos.

function espejarPoligono(poligonoMm) {
  const xs = poligonoMm.map((p) => p[0]);
  const max = Math.max(...xs);
  const min = Math.min(...xs);
  return poligonoMm.map(([x, y]) => [max - (x - min), y]);
}

export function resolverPiezasDeGrupo(grupo, piezas) {
  return grupo.piezas.map((gp) => {
    const pieza = piezas.find((p) => p.id === gp.piezaId);
    if (!pieza) {
      throw new Error(
        'El grupo "' + grupo.nombre + '" referencia una pieza que ya no existe (rol "' + gp.rol + '").'
      );
    }

    const angulosPermitidos = gp.angulosPermitidosOverride ?? pieza.angulosPermitidos;
    const rotable = angulosPermitidos === 'libre' || angulosPermitidos.includes(180);

    return {
      nombre: gp.rol,
      rotable,
      tela: pieza.tela,
      espejoActivo: !!gp.espejoActivo,
      dimensionesPorTalla: pieza.dimensionesPorTalla,
      geometriaPorTalla: gp.espejoActivo
        ? Object.fromEntries(
            Object.entries(pieza.geometriaPorTalla || {}).map(([talla, geo]) => [
              talla,
              { ...geo, poligonoMm: espejarPoligono(geo.poligonoMm) },
            ])
          )
        : pieza.geometriaPorTalla,
    };
  });
}
