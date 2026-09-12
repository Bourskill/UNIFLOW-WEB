import { Router } from 'express';
import { nanoid } from 'nanoid';
import { leerColeccion, escribirColeccion } from '../dominio/almacen.js';
import { resolverPiezasDeGrupo } from '../dominio/resolverGrupo.js';
import { anidarPiezas } from '../motor/nesting.js';
import { generarPdfNesting } from '../motor/exportarPdf.js';
import { resolverPiezasDePedido } from '../motor/resolverPedido.js';
import { importarGeometriaSvg, resolverGeometriaSvgManual } from '../motor/importarSvg.js';

export const router = Router();

function crudSimple(nombreColeccion) {
  router.get('/' + nombreColeccion, async (req, res) => {
    res.json(await leerColeccion(nombreColeccion));
  });

  router.post('/' + nombreColeccion, async (req, res) => {
    const coleccion = await leerColeccion(nombreColeccion);
    const registro = { id: nanoid(), ...req.body };
    coleccion.push(registro);
    await escribirColeccion(nombreColeccion, coleccion);
    res.status(201).json(registro);
  });

  router.put('/' + nombreColeccion + '/:id', async (req, res) => {
    const coleccion = await leerColeccion(nombreColeccion);
    const indice = coleccion.findIndex((r) => r.id === req.params.id);
    if (indice === -1) return res.status(404).json({ error: 'No encontrado' });
    coleccion[indice] = { ...coleccion[indice], ...req.body, id: req.params.id };
    await escribirColeccion(nombreColeccion, coleccion);
    res.json(coleccion[indice]);
  });

  router.delete('/' + nombreColeccion + '/:id', async (req, res) => {
    const coleccion = await leerColeccion(nombreColeccion);
    const restante = coleccion.filter((r) => r.id !== req.params.id);
    await escribirColeccion(nombreColeccion, restante);
    res.status(204).end();
  });
}

crudSimple('grupos');
crudSimple('disenos');
crudSimple('productos');
crudSimple('pedidos');

// --- Piezas (biblioteca reutilizable) -------------------------------------
// A diferencia de grupos/disenos/productos/pedidos, Piezas no es un CRUD
// genérico: crearla implica procesar geometría SVG real, y esa lógica no
// tiene sentido meterla en crudSimple().

router.get('/piezas', async (req, res) => {
  res.json(await leerColeccion('piezas'));
});

router.delete('/piezas/:id', async (req, res) => {
  const piezas = await leerColeccion('piezas');
  await escribirColeccion('piezas', piezas.filter((p) => p.id !== req.params.id));
  res.status(204).end();
});

// Analiza UN archivo SVG (antes de guardar nada) y devuelve si se pudo
// resolver solo, o si hace falta que el usuario elija el contorno y/o
// confirme la escala física — nunca se adivina en silencio (ver
// claude/README.md, "nunca dar una talla por buena").
router.post('/piezas/analizar-svg', async (req, res) => {
  const { svgTexto } = req.body;
  if (!svgTexto) return res.status(400).json({ error: 'Falta svgTexto' });
  try {
    const resultado = await importarGeometriaSvg(svgTexto);
    res.json(resultado);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Segundo paso del análisis cuando el primero no se pudo resolver solo: el
// usuario ya eligió cuál candidato es el contorno y/o confirmó cuántos cm
// mide, y acá se recalcula la geometría con esos datos confirmados.
router.post('/piezas/analizar-svg/manual', async (req, res) => {
  const { svgTexto, indiceElegido, mmPorUnidad, anchoConocidoCm } = req.body;
  if (!svgTexto || indiceElegido == null || (!mmPorUnidad && !anchoConocidoCm)) {
    return res.status(400).json({ error: 'Faltan svgTexto, indiceElegido, y mmPorUnidad o anchoConocidoCm' });
  }
  try {
    const resultado = await resolverGeometriaSvgManual(svgTexto, indiceElegido, { mmPorUnidad, anchoConocidoCm });
    res.json(resultado);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Crea (o completa) una Pieza a partir de geometrías YA resueltas por talla
// (el frontend hizo el análisis + confirmación de cada archivo antes de
// llegar acá). dimensionesPorTalla se deriva del bounding box real, nunca al
// revés.
router.post('/piezas', async (req, res) => {
  const { nombre, angulosPermitidos, permiteEspejo, tela, geometriaPorTalla } = req.body;
  if (!nombre || !geometriaPorTalla || Object.keys(geometriaPorTalla).length === 0) {
    return res.status(400).json({ error: 'Falta nombre o geometriaPorTalla' });
  }
  const dimensionesPorTalla = Object.fromEntries(
    Object.entries(geometriaPorTalla).map(([talla, geo]) => [
      talla,
      { anchoCm: round2(geo.boundingBoxMm.anchoMm / 10), altoCm: round2(geo.boundingBoxMm.altoMm / 10) },
    ])
  );

  const piezas = await leerColeccion('piezas');
  const registro = {
    id: nanoid(),
    nombre,
    angulosPermitidos: angulosPermitidos?.length ? angulosPermitidos : [0, 180],
    permiteEspejo: !!permiteEspejo,
    tela: tela || null,
    geometriaPorTalla,
    dimensionesPorTalla,
  };
  piezas.push(registro);
  await escribirColeccion('piezas', piezas);
  res.status(201).json(registro);
});

// Agrega/reemplaza la geometría de UNA talla puntual de una pieza ya
// existente — resubir para completar una talla faltante, o corregir una.
// v0: reemplaza directo, sin historial de versiones (simplificación
// documentada en ESTADO-ACTUAL.md).
router.put('/piezas/:id/tallas/:talla', async (req, res) => {
  const { boundingBoxMm } = req.body;
  if (!boundingBoxMm) return res.status(400).json({ error: 'Falta la geometría resuelta' });

  const piezas = await leerColeccion('piezas');
  const pieza = piezas.find((p) => p.id === req.params.id);
  if (!pieza) return res.status(404).json({ error: 'Pieza no encontrada' });

  pieza.geometriaPorTalla[req.params.talla] = req.body;
  pieza.dimensionesPorTalla[req.params.talla] = {
    anchoCm: round2(boundingBoxMm.anchoMm / 10),
    altoCm: round2(boundingBoxMm.altoMm / 10),
  };
  await escribirColeccion('piezas', piezas);
  res.json(pieza);
});

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Anida un conjunto de líneas de pedido y devuelve el layout (sin generar PDF
// todavía) — es la vista previa antes de imprimir. Recibe las piezas ya
// resueltas (ancho/alto/rotable) en vez de recalcularlas acá, porque esa
// resolución cruza moldería + diseño + calibración y todavía no hay un único
// punto que lo arme.
router.post('/nesting/vista-previa', async (req, res) => {
  const { piezas, anchoLienzoCm, separacionCm } = req.body;
  if (!Array.isArray(piezas) || !anchoLienzoCm) {
    return res.status(400).json({ error: 'Faltan piezas o anchoLienzoCm' });
  }
  const resultado = anidarPiezas(piezas, { anchoLienzoCm, separacionCm });
  res.json(resultado);
});

// Resuelve piezas reales de un grupo (multiplicadas por talla y cantidad) y
// las anida, SIN personalización — el camino corto para corte láser o para
// probar el nesting sin armar todavía un Producto/Pedido completo. Si falta
// la dimensión de una talla, falla explícito: no se asume nada (ver
// claude/README.md — nunca dar una talla por buena).
router.post('/nesting/desde-grupo', async (req, res) => {
  const { grupoId, lineas, anchoLienzoCm, separacionCm } = req.body;
  if (!grupoId || !Array.isArray(lineas) || lineas.length === 0 || !anchoLienzoCm) {
    return res.status(400).json({ error: 'Faltan grupoId, lineas o anchoLienzoCm' });
  }

  const [grupos, piezas] = await Promise.all([leerColeccion('grupos'), leerColeccion('piezas')]);
  const grupo = grupos.find((g) => g.id === grupoId);
  if (!grupo) return res.status(404).json({ error: 'Grupo no encontrado' });
  if (!Array.isArray(grupo.piezas) || grupo.piezas.length === 0) {
    return res.status(400).json({ error: 'Ese grupo todavía no tiene piezas cargadas' });
  }

  let piezasDelGrupo;
  try {
    piezasDelGrupo = resolverPiezasDeGrupo(grupo, piezas);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const piezasParaAnidar = [];
  let contador = 0;
  for (const linea of lineas) {
    const cantidad = Number(linea.cantidad) || 0;
    for (let copia = 0; copia < cantidad; copia++) {
      for (const pieza of piezasDelGrupo) {
        const dimension = pieza.dimensionesPorTalla?.[linea.talla];
        if (!dimension) {
          return res.status(400).json({
            error: 'La pieza "' + pieza.nombre + '" no tiene dimensión cargada para la talla ' +
              linea.talla + '. No se genera nada hasta que esté completa.',
          });
        }
        piezasParaAnidar.push({
          id: 'g' + contador++,
          piezaId: pieza.nombre,
          lineaPedidoId: linea.talla + '#' + copia,
          talla: linea.talla,
          anchoCm: dimension.anchoCm,
          altoCm: dimension.altoCm,
          rotable: !!pieza.rotable,
        });
      }
    }
  }

  const resultado = anidarPiezas(piezasParaAnidar, { anchoLienzoCm, separacionCm });
  res.json(resultado);
});

// Anida un pedido REAL: cada línea es una prenda con talla + nombre + número.
// Resuelve producto → moldería (dimensiones) + diseño (arte) + elementos
// (dónde va cada texto y con qué tamaño), y devuelve piezas con su contenido
// ya calibrado — esto es lo que hace que la vista previa muestre la camiseta
// real en vez de un rectángulo con el nombre de la pieza.
router.post('/nesting/desde-pedido', async (req, res) => {
  const { pedidoId, anchoLienzoCm, separacionCm } = req.body;
  if (!pedidoId || !anchoLienzoCm) {
    return res.status(400).json({ error: 'Faltan pedidoId o anchoLienzoCm' });
  }

  const [pedidos, productos, grupos, piezas, disenos] = await Promise.all([
    leerColeccion('pedidos'),
    leerColeccion('productos'),
    leerColeccion('grupos'),
    leerColeccion('piezas'),
    leerColeccion('disenos'),
  ]);

  const pedido = pedidos.find((p) => p.id === pedidoId);
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
  if (!Array.isArray(pedido.lineas) || pedido.lineas.length === 0) {
    return res.status(400).json({ error: 'Ese pedido todavía no tiene ninguna línea (prenda) cargada' });
  }

  let piezasParaAnidar;
  try {
    piezasParaAnidar = resolverPiezasDePedido({ pedido, productos, grupos, piezas, disenos });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const resultado = anidarPiezas(piezasParaAnidar, { anchoLienzoCm, separacionCm });
  res.json(resultado);
});

// Genera el PDF final a partir de un layout ya anidado (normalmente el mismo
// que devolvió /nesting/vista-previa, después de que el usuario lo confirmó).
// Guarda el registro de generación pieza por pieza para poder hacer
// reposición más adelante sin rehacer el lote completo.
router.post('/nesting/generar', async (req, res) => {
  const resultadoNesting = req.body;
  if (!Array.isArray(resultadoNesting?.piezas)) {
    return res.status(400).json({ error: 'Falta el resultado de nesting a generar' });
  }

  const pdfBytes = await generarPdfNesting(resultadoNesting);

  const generaciones = await leerColeccion('generaciones');
  const generacion = {
    id: nanoid(),
    creadoEn: new Date().toISOString(),
    anchoLienzoCm: resultadoNesting.anchoLienzoCm,
    altoLienzoCm: resultadoNesting.altoLienzoCm,
    utilizacion: resultadoNesting.utilizacion,
    piezas: resultadoNesting.piezas.map((p) => ({ ...p, estado: 'generada' })),
  };
  generaciones.push(generacion);
  await escribirColeccion('generaciones', generaciones);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="generacion-' + generacion.id + '.pdf"');
  res.send(Buffer.from(pdfBytes));
});

// Reposición: reimprime una sola pieza de una generación ya existente, sin
// tocar el resto del lote. Es el hallazgo más accionable de la investigación
// de referencia (ver claude/README.md).
router.post('/nesting/:generacionId/reposicion/:piezaId', async (req, res) => {
  const generaciones = await leerColeccion('generaciones');
  const generacion = generaciones.find((g) => g.id === req.params.generacionId);
  if (!generacion) return res.status(404).json({ error: 'Generación no encontrada' });

  const pieza = generacion.piezas.find((p) => p.id === req.params.piezaId);
  if (!pieza) return res.status(404).json({ error: 'Pieza no encontrada en esa generación' });

  const layoutDeUnaPieza = anidarPiezas(
    [{ ...pieza, rotable: pieza.rotacionGrados === 180 }],
    { anchoLienzoCm: pieza.anchoCm + 1 }
  );
  const pdfBytes = await generarPdfNesting(layoutDeUnaPieza);

  pieza.estado = 'repuesta';
  await escribirColeccion('generaciones', generaciones);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="reposicion-' + pieza.id + '.pdf"');
  res.send(Buffer.from(pdfBytes));
});
