// Expande un Grupo (piezas por REFERENCIA) a la forma plana que ya consumen
// calibracion.js/nesting.js/resolverPedido.js: un array de "piezas" con
// nombre, rotable y dimensionesPorTalla. Es el único lugar que sabe leer una
// referencia de biblioteca — el resto del motor no necesita saber que una
// pieza puede estar compartida entre grupos.

// `versionesPiezas` (opcional): { [piezaId]: numeroDeVersion } -- un Producto
// puede quedar "fijado" a propósito a una versión vieja de una pieza (ver
// rutas/api.js, flujo de confirmación al reprocesar/reemplazar molderia).
// Sin este parámetro (Grupos, Plantillas, nesting sin producto real de por
// medio) se usa la geometría ACTUAL de la pieza, igual que siempre.
export function resolverPiezasDeGrupo(grupo, piezas, versionesPiezas) {
  return grupo.piezas.map((gp) => {
    const pieza = piezas.find((p) => p.id === gp.piezaId);
    if (!pieza) {
      throw new Error(
        'El grupo "' + grupo.nombre + '" referencia una pieza que ya no existe (rol "' + gp.rol + '").'
      );
    }

    const angulosPermitidos = pieza.angulosPermitidos;
    const rotable = angulosPermitidos === 'libre' || angulosPermitidos.includes(180);

    let geometriaPorTalla = pieza.geometriaPorTalla;
    let dimensionesPorTalla = pieza.dimensionesPorTalla;
    const numeroVersion = versionesPiezas?.[gp.piezaId];
    if (numeroVersion != null) {
      const version = (pieza.versiones || []).find((v) => v.version === numeroVersion);
      if (!version) {
        throw new Error(
          'La pieza "' + pieza.nombre + '" (rol "' + gp.rol + '" en "' + grupo.nombre + '") está fijada a ' +
          'una versión que ya no existe -- hay que revisar este producto y volver a personalizar esta pieza.'
        );
      }
      geometriaPorTalla = version.geometriaPorTalla;
      dimensionesPorTalla = version.dimensionesPorTalla;
    }

    return {
      nombre: gp.rol,
      rotable,
      tela: pieza.tela,
      dimensionesPorTalla,
      geometriaPorTalla,
      // Clasificación de la pieza en sí (biblioteca), no de una versión
      // puntual -- se propaga tal cual, pin de versión o no (ver
      // motor/resolverPedido.js·tallaRealDePieza).
      tallaUnica: !!pieza.tallaUnica,
    };
  });
}
