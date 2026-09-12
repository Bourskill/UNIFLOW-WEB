import { Router } from 'express';
import { nanoid } from 'nanoid';
import { leerColeccion, escribirColeccion } from '../dominio/almacen.js';
import { resolverPiezasDeGrupo } from '../dominio/resolverGrupo.js';
import { anidarPiezas } from '../motor/nesting.js';
import { generarPdfNesting } from '../motor/exportarPdf.js';
import { resolverPiezasDePedido } from '../motor/resolverPedido.js';
import { analizarPiezaMultiTalla, resolverGeometriasPorTalla } from '../motor/importarSvg.js';
import { analizarPiezaMultiTallaDxf, resolverGeometriasPorTallaDxf } from '../motor/importarDxf.js';

const router = Router();

// Envuelve cada handler async: si tira un error sin capturar (ej. un timeout
// pasajero de Supabase), antes tumbaba el proceso ENTERO en vez de fallar
// solo esa petición — un hipo de red se llevaba puesto todo el backend.
// Ahora se lo pasa a next(), que cae en el manejador de errores de
// server.js y responde 500 solo a esa request.
for (const metodo of ['get', 'post', 'put', 'delete']) {
  const original = router[metodo].bind(router);
  router[metodo] = (ruta, manejador) =>
    original(ruta, (req, res, next) => Promise.resolve(manejador(req, res, next)).catch(next));
}

export { router };

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

crudSimple('disenos');
crudSimple('productos');
crudSimple('pedidos');

// --- Piezas (biblioteca) ---------------------------------------------------
// Acá se sube la moldería real: por PIEZA, UN solo archivo con todas sus
// tallas adentro (nombradas "S", "M", "L"...) — así se manejan de verdad los
// patrones graduados, no un archivo por talla ni el de la prenda completa
// (eso era el enfoque de Illustrator). Cada pieza vive en una biblioteca y se
// referencia (no se copia) desde uno o más Grupos — resubir la pieza acá
// actualiza automáticamente a todos los grupos que la usan.

router.get('/piezas', async (req, res) => {
  res.json(await leerColeccion('piezas'));
});

// Analiza el archivo (con todas las tallas nombradas adentro -- una forma
// por talla en SVG, una capa por talla en DXF) y trata de matchear cada una
// contra una talla conocida (S/M/L/...). Lo que no matchea queda para que
// el usuario lo asigne a mano. `formato` decide qué motor de importación se
// usa; nunca se adivina por el contenido del archivo.
router.post('/piezas/analizar-multitalla', async (req, res) => {
  const { texto, formato } = req.body;
  if (!texto || !formato) return res.status(400).json({ error: 'Faltan texto o formato' });
  if (formato !== 'svg' && formato !== 'dxf') {
    return res.status(400).json({ error: 'Formato no soportado: ' + formato });
  }
  try {
    const resultado =
      formato === 'dxf' ? await analizarPiezaMultiTallaDxf(texto) : await analizarPiezaMultiTalla(texto);
    res.json(resultado);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Con el mapeo talla -> índice de candidato ya confirmado (automático +
// correcciones a mano), calcula la geometría real de cada talla detectada.
// No guarda nada todavía — el frontend arma la Pieza final con esto y llama
// a POST /piezas.
router.post('/piezas/resolver-multitalla', async (req, res) => {
  const { texto, formato, asignaciones, mmPorUnidad, anchoConocidoCm, indiceReferencia } = req.body;
  if (!texto || !formato || !asignaciones || Object.keys(asignaciones).length === 0) {
    return res.status(400).json({ error: 'Faltan texto, formato o asignaciones' });
  }
  try {
    const resolver = formato === 'dxf' ? resolverGeometriasPorTallaDxf : resolverGeometriasPorTalla;
    const resultado = await resolver(texto, asignaciones, { mmPorUnidad, anchoConocidoCm, indiceReferencia });
    res.json(resultado);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Crea la Pieza con las geometrías YA resueltas por talla (el frontend
// analizó y confirmó cada archivo del rango de tallas antes de llegar acá).
router.post('/piezas', async (req, res) => {
  const { nombre, angulosPermitidos, tela, geometriaPorTalla } = req.body;
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
    tela: tela || null,
    geometriaPorTalla,
    dimensionesPorTalla,
  };
  piezas.push(registro);
  await escribirColeccion('piezas', piezas);
  res.status(201).json(registro);
});

router.put('/piezas/:id', async (req, res) => {
  const { nombre, angulosPermitidos, tela } = req.body;
  const piezas = await leerColeccion('piezas');
  const pieza = piezas.find((p) => p.id === req.params.id);
  if (!pieza) return res.status(404).json({ error: 'Pieza no encontrada' });

  if (nombre !== undefined) pieza.nombre = nombre;
  if (angulosPermitidos !== undefined) pieza.angulosPermitidos = angulosPermitidos;
  if (tela !== undefined) pieza.tela = tela;
  await escribirColeccion('piezas', piezas);
  res.json(pieza);
});

router.delete('/piezas/:id', async (req, res) => {
  const piezas = await leerColeccion('piezas');
  await escribirColeccion('piezas', piezas.filter((p) => p.id !== req.params.id));
  res.status(204).end();
});

// Agrega/reemplaza la geometría de UNA talla puntual de una pieza ya
// existente — para completar una talla que faltaba o corregir una, sin
// resubir todo el rango de nuevo. v0: reemplaza directo, sin historial de
// versiones (simplificación documentada en ESTADO-ACTUAL.md).
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

// --- Grupos (catálogo: una prenda = piezas de biblioteca por rol) ---------
// No se sube nada acá — Grupos solo arma una prenda eligiendo piezas que ya
// existen en la biblioteca. Reciclar una pieza en otro grupo es elegirla de
// nuevo; si se resube en "Piezas", todos los grupos que la usan lo ven.

router.get('/grupos', async (req, res) => {
  res.json(await leerColeccion('grupos'));
});

router.post('/grupos', async (req, res) => {
  const { nombre, piezas } = req.body;
  if (!nombre || !Array.isArray(piezas) || piezas.length === 0) {
    return res.status(400).json({ error: 'Falta nombre o piezas' });
  }
  for (const gp of piezas) {
    if (!gp.piezaId || !gp.rol) {
      return res.status(400).json({ error: 'Cada pieza del grupo necesita piezaId y rol' });
    }
  }

  const grupos = await leerColeccion('grupos');
  const grupo = { id: nanoid(), nombre, piezas };
  grupos.push(grupo);
  await escribirColeccion('grupos', grupos);
  res.status(201).json(grupo);
});

router.delete('/grupos/:id', async (req, res) => {
  const grupos = await leerColeccion('grupos');
  await escribirColeccion('grupos', grupos.filter((g) => g.id !== req.params.id));
  res.status(204).end();
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
