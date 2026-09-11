import { Router } from 'express';
import { nanoid } from 'nanoid';
import { leerColeccion, escribirColeccion } from '../dominio/almacen.js';
import { anidarPiezas } from '../motor/nesting.js';
import { generarPdfNesting } from '../motor/exportarPdf.js';

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

crudSimple('molderias');
crudSimple('disenos');
crudSimple('productos');
crudSimple('pedidos');

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
