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

// Productos multi-prenda ("kit": camiseta + short + medias en un solo
// armado): combina las piezas de VARIOS grupos en una sola lista plana.
//
// El riesgo real que esto resuelve: dos prendas distintas pueden tener un
// rol con el mismo nombre por casualidad (dos "Delantero", uno de la
// camiseta y otro del short) -- el resto del motor (motor/anclaje/resolver.js,
// referencias.js, grafo.js, geometriaAnclaje.js) usa ese nombre como CLAVE
// PLANA en objetos, así que combinar dos grupos sin namespacear pisaría la
// geometría de una pieza con la de la otra en silencio, sin ningún error.
//
// Namespacear SOLO cuando hay más de un grupo (grupoId + '::' + rol) dejar
// intacto el caso de un solo grupo (rol tal cual, IDÉNTICO al de
// resolverPiezasDeGrupo) es lo que mantiene compatibles todos los Productos
// ya guardados -- su Anclaje.anclas[].pieza/Anclaje.zonas[].pieza son roles
// crudos sin namespace, grabados antes de que este caso existiera. Un
// Producto nuevo de un solo grupo sigue viendo exactamente lo mismo que
// siempre; namespacear ahí también hubiera roto cada ancla/zona ya guardada.
export function resolverPiezasDeGrupos(grupos, piezas, versionesPiezas) {
  const namespacear = grupos.length > 1;
  const resultado = [];
  for (const grupo of grupos) {
    const piezasDelGrupo = resolverPiezasDeGrupo(grupo, piezas, versionesPiezas);
    for (const pieza of piezasDelGrupo) {
      resultado.push({
        ...pieza,
        nombre: namespacear ? grupo.id + '::' + pieza.nombre : pieza.nombre,
        // Rol crudo (sin namespace) + nombre de la prenda dueña -- para
        // mensajes legibles (nunca mostrarle al usuario un id de grupo en
        // crudo). `nombre` de arriba sigue siendo la CLAVE real que usa el
        // resto del motor.
        rol: pieza.nombre,
        grupoId: grupo.id,
        grupoNombre: grupo.nombre,
      });
    }
  }
  return resultado;
}
