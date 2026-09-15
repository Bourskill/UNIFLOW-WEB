// Exporta un resultado de nesting (piezas YA ubicadas en el lienzo) a un
// archivo DXF real para corte láser -- una polilínea cerrada (LWPOLYLINE)
// por pieza, en su posición real dentro del lienzo. Pensado para el camino
// "rápido, sin personalizar" (moldería + talla + cantidad, sin nombre/
// número/diseño) -- exportarPdf.js sigue siendo el camino real de
// producción con personalización.
//
// Solo usa el CONTORNO real de cada pieza (pieza.contornoCm, mismas
// coordenadas cm que ya usa exportarPdf.js para el borde de contraste/
// láser y el recorte de imagen) -- sin eso no hay nada que cortar: una
// pieza sin geometría real cargada queda afuera del DXF, nunca se inventa
// un rectángulo (un rectángulo no es un corte real de la pieza).
//
// $INSUNITS se declara en milímetros (código de grupo 70 = 4) -- mismo
// criterio que importarDxf.js·UNIDAD_INSUNITS_A_MM (4: 1mm por unidad), así
// que cualquier software de corte (o el propio importador de este
// proyecto, en una vuelta de ida y vuelta) lo interpreta sin ambigüedad,
// sin pedir la escala a mano. Una capa (layer) por talla -- mismo contrato
// "una capa por talla" que ya exige importarDxf.js del lado de lectura.
//
// Y del DXF es hacia ARRIBA (estándar cartesiano); contornoCm es Y hacia
// ABAJO (misma convención que zonas/textos) -- se invierte acá con el
// mismo cálculo que ya usa exportarPdf.js para ubicar el borde de
// contraste (altoLienzo - posición - y), no una convención nueva.
//
// rotacionGrados 180 (nesting.js puede rotar una pieza `rotable` para
// empaquetar mejor) SÍ se aplica acá -- a diferencia del camino de
// exportarPdf.js (que nunca rota el contorno ni la imagen: las piezas
// personalizadas casi nunca son `rotable`, ver dominio/modelos.js), en
// corte láser rotar de verdad para ahorrar material es el caso de uso
// esperado -- si no se aplicara, el corte real saldría en la orientación
// equivocada del lienzo.

const CM_A_MM = 10;

function formatearNumero(n) {
  return (Math.round(n * 1000) / 1000).toString();
}

function rotar180(v, anchoCm, altoCm) {
  return { x: anchoCm - v.x, y: altoCm - v.y };
}

function poliliniaCerrada(vertices, capa) {
  const lineas = ['0', 'LWPOLYLINE', '8', capa, '90', String(vertices.length), '70', '1'];
  for (const v of vertices) {
    lineas.push('10', formatearNumero(v.x), '20', formatearNumero(v.y));
  }
  return lineas;
}

export function generarDxfNesting(resultadoNesting) {
  const lineas = [
    '0', 'SECTION', '2', 'HEADER',
    '9', '$INSUNITS', '70', '4',
    '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES',
  ];

  let algunaPieza = false;
  for (const pieza of resultadoNesting.piezas) {
    if (!pieza.contornoCm || pieza.contornoCm.length < 3) continue;
    algunaPieza = true;

    const local = pieza.rotacionGrados === 180
      ? pieza.contornoCm.map((v) => rotar180(v, pieza.anchoCm, pieza.altoCm))
      : pieza.contornoCm;

    const vertices = local.map((v) => ({
      x: (pieza.posicion.x + v.x) * CM_A_MM,
      y: (resultadoNesting.altoLienzoCm - pieza.posicion.y - v.y) * CM_A_MM,
    }));

    const capa = (pieza.talla || 'SIN_TALLA').toString().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    lineas.push(...poliliniaCerrada(vertices, capa));
  }

  if (!algunaPieza) {
    throw new Error(
      'Ninguna de las piezas de este lote tiene geometría real cargada -- no hay nada para cortar.'
    );
  }

  lineas.push('0', 'ENDSEC', '0', 'EOF');
  return lineas.join('\n') + '\n';
}
