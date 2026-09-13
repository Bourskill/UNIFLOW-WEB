import { Router } from 'express';
import { nanoid } from 'nanoid';
import { leerColeccion, leerRegistro, crearRegistro, actualizarRegistro, borrarRegistro, subirArchivo } from '../dominio/almacen.js';
import { resolverPiezasDeGrupo } from '../dominio/resolverGrupo.js';
import { anidarPiezas } from '../motor/nesting.js';
import { generarPdfNesting } from '../motor/exportarPdf.js';
import { resolverPiezasDePedido } from '../motor/resolverPedido.js';
import { analizarPiezaMultiTalla as analizarDxf, resolverGeometriasPorTalla as resolverDxf } from '../motor/importarDxf.js';
import { analizarPiezaMultiTalla as analizarPdf, resolverGeometriasPorTalla as resolverPdf } from '../motor/importarPdf.js';

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

const EXTENSION_POR_TIPO = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'application/pdf': '.pdf',
  'application/dxf': '.dxf',
  'image/vnd.dxf': '.dxf',
};

// Punto único de subida de archivos pesados (imagen de Diseño, PDF/DXF
// original de Pieza) a Supabase Storage -- ver almacen.js para el porqué:
// guardarlos como base64 adentro de la fila de la tabla hacía que Postgres
// cortara la escritura por timeout con un solo archivo de unos pocos MB.
// El body sigue viajando en base64 (mismo límite de 50mb de server.js), lo
// que cambia es dónde termina viviendo: Storage, no la columna jsonb.
router.post('/archivos', async (req, res) => {
  const { base64, contentType, nombre } = req.body;
  if (!base64 || !contentType) return res.status(400).json({ error: 'Faltan base64 o contentType' });
  try {
    const buffer = Buffer.from(base64, 'base64');
    const extension = EXTENSION_POR_TIPO[contentType] || '';
    const ruta = (nombre || 'archivo').replace(/[^a-z0-9_-]/gi, '_') + '-' + nanoid() + extension;
    const url = await subirArchivo(ruta, buffer, contentType);
    res.status(201).json({ url });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

function crudSimple(nombreColeccion) {
  router.get('/' + nombreColeccion, async (req, res) => {
    res.json(await leerColeccion(nombreColeccion));
  });

  router.post('/' + nombreColeccion, async (req, res) => {
    const registro = { id: nanoid(), ...req.body };
    await crearRegistro(nombreColeccion, registro);
    res.status(201).json(registro);
  });

  router.put('/' + nombreColeccion + '/:id', async (req, res) => {
    const existente = await leerRegistro(nombreColeccion, req.params.id);
    if (!existente) return res.status(404).json({ error: 'No encontrado' });
    const registro = { ...existente, ...req.body, id: req.params.id };
    await actualizarRegistro(nombreColeccion, req.params.id, registro);
    res.json(registro);
  });

  router.delete('/' + nombreColeccion + '/:id', async (req, res) => {
    await borrarRegistro(nombreColeccion, req.params.id);
    res.status(204).end();
  });
}

crudSimple('disenos');
crudSimple('productos');
crudSimple('pedidos');

// --- Piezas (biblioteca) ---------------------------------------------------
// Acá se sube la moldería real: por PIEZA, UN solo archivo con todas sus
// tallas adentro, una CAPA por talla (nombrada "S", "M", "L"...; puede traer
// más de un trazo por capa -- contorno + piquetes sueltos de esa talla, todo
// cuenta como parte de esa talla) — así se manejan de verdad los patrones
// graduados, no un archivo por talla ni el de la prenda completa (eso era
// el enfoque de Illustrator). Cada pieza vive en una biblioteca y se
// referencia (no se copia) desde uno o más Grupos — resubir la pieza acá
// actualiza automáticamente a todos los grupos que la usan.
//
// Dos formatos soportados, los dos con capas reales:
// - DXF: para quien arma la moldería en software de patronaje dedicado
//   (Rhino, Lectra, Gerber, Optitex...), que exporta capas limpias.
// - PDF: para quien arma la moldería en Illustrator (exportando con "Crear
//   capas de Acrobat" activado) -- el export nativo de Illustrator a DXF no
//   preserva bien las capas, PDF sí. Bonus: PDF siempre mide en puntos, así
//   que nunca hace falta confirmar la escala a mano como puede pasar en DXF.
// Se descartó SVG (probado y desechado): en la práctica llegaba sin nombre
// por forma y sin unidad física declarada.

router.get('/piezas', async (req, res) => {
  res.json(await leerColeccion('piezas'));
});

function motorPorFormato(formato) {
  if (formato === 'dxf') return { analizar: analizarDxf, resolver: resolverDxf, decodificar: (texto) => texto };
  if (formato === 'pdf') return { analizar: analizarPdf, resolver: resolverPdf, decodificar: (texto) => Buffer.from(texto, 'base64') };
  return null;
}

// Analiza el archivo (una capa por talla) y trata de matchear cada capa
// contra una talla conocida. Lo que no matchea (o en DXF, quedó en una capa
// reservada tipo "0", que un CAD asigna por defecto) queda para que el
// usuario lo asigne a mano. `formato` decide qué motor usa el backend --
// nunca se adivina por el contenido del archivo. El DXF viaja como texto
// plano; el PDF (binario) viaja en base64 dentro del mismo campo `texto`.
router.post('/piezas/analizar-multitalla', async (req, res) => {
  const { texto, formato } = req.body;
  const motor = motorPorFormato(formato);
  if (!texto || !motor) return res.status(400).json({ error: 'Falta texto, o formato inválido (dxf o pdf)' });
  try {
    const resultado = await motor.analizar(motor.decodificar(texto));
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
  const motor = motorPorFormato(formato);
  if (!texto || !motor || !asignaciones || Object.keys(asignaciones).length === 0) {
    return res.status(400).json({ error: 'Faltan texto, formato válido (dxf o pdf), o asignaciones' });
  }
  try {
    const resultado = await motor.resolver(motor.decodificar(texto), asignaciones, { mmPorUnidad, anchoConocidoCm, indiceReferencia });
    res.json(resultado);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Crea la Pieza con las geometrías YA resueltas por talla (el frontend
// analizó y confirmó cada archivo del rango de tallas antes de llegar acá).
router.post('/piezas', async (req, res) => {
  const { nombre, categoria, angulosPermitidos, tela, geometriaPorTalla, archivoOriginal, formatoOriginal } = req.body;
  if (!nombre || !geometriaPorTalla || Object.keys(geometriaPorTalla).length === 0) {
    return res.status(400).json({ error: 'Falta nombre o geometriaPorTalla' });
  }
  const dimensionesPorTalla = Object.fromEntries(
    Object.entries(geometriaPorTalla).map(([talla, geo]) => [
      talla,
      { anchoCm: round2(geo.boundingBoxMm.anchoMm / 10), altoCm: round2(geo.boundingBoxMm.altoMm / 10) },
    ])
  );

  const registro = {
    id: nanoid(),
    nombre,
    // Libre, no un enum -- una pieza puede ser "Delantero", "Manga", "Cuello",
    // lo que use cada taller; solo sirve para filtrar/agrupar en la biblioteca.
    categoria: categoria || null,
    angulosPermitidos: angulosPermitidos?.length ? angulosPermitidos : [0, 180],
    tela: tela || null,
    // Un solo archivo por Pieza (no uno por talla, sería el mismo repetido
    // N veces) -- URL de Storage, nunca el archivo embebido.
    archivoOriginal: archivoOriginal || null,
    formatoOriginal: formatoOriginal || null,
    geometriaPorTalla,
    dimensionesPorTalla,
  };
  await crearRegistro('piezas', registro);
  res.status(201).json(registro);
});

router.put('/piezas/:id', async (req, res) => {
  const { nombre, categoria, angulosPermitidos, tela } = req.body;
  const pieza = await leerRegistro('piezas', req.params.id);
  if (!pieza) return res.status(404).json({ error: 'Pieza no encontrada' });

  if (nombre !== undefined) pieza.nombre = nombre;
  if (categoria !== undefined) pieza.categoria = categoria;
  if (angulosPermitidos !== undefined) pieza.angulosPermitidos = angulosPermitidos;
  if (tela !== undefined) pieza.tela = tela;
  await actualizarRegistro('piezas', req.params.id, pieza);
  res.json(pieza);
});

router.delete('/piezas/:id', async (req, res) => {
  await borrarRegistro('piezas', req.params.id);
  res.status(204).end();
});

// Agrega/reemplaza la geometría de UNA talla puntual de una pieza ya
// existente — para completar una talla que faltaba o corregir una, sin
// resubir todo el rango de nuevo. v0: reemplaza directo, sin historial de
// versiones (simplificación documentada en ESTADO-ACTUAL.md).
router.put('/piezas/:id/tallas/:talla', async (req, res) => {
  const { boundingBoxMm } = req.body;
  if (!boundingBoxMm) return res.status(400).json({ error: 'Falta la geometría resuelta' });

  const pieza = await leerRegistro('piezas', req.params.id);
  if (!pieza) return res.status(404).json({ error: 'Pieza no encontrada' });

  pieza.geometriaPorTalla[req.params.talla] = req.body;
  pieza.dimensionesPorTalla[req.params.talla] = {
    anchoCm: round2(boundingBoxMm.anchoMm / 10),
    altoCm: round2(boundingBoxMm.altoMm / 10),
  };
  await actualizarRegistro('piezas', req.params.id, pieza);
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

  const grupo = { id: nanoid(), nombre, piezas };
  await crearRegistro('grupos', grupo);
  res.status(201).json(grupo);
});

router.delete('/grupos/:id', async (req, res) => {
  await borrarRegistro('grupos', req.params.id);
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

  const generacion = {
    id: nanoid(),
    creadoEn: new Date().toISOString(),
    anchoLienzoCm: resultadoNesting.anchoLienzoCm,
    altoLienzoCm: resultadoNesting.altoLienzoCm,
    utilizacion: resultadoNesting.utilizacion,
    piezas: resultadoNesting.piezas.map((p) => ({ ...p, estado: 'generada' })),
  };
  await crearRegistro('generaciones', generacion);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="generacion-' + generacion.id + '.pdf"');
  res.send(Buffer.from(pdfBytes));
});

// Historial de producción: cada corrida de nesting ya generada, más nueva
// primero -- la pestaña "Historial" de Producción vive de esto.
router.get('/generaciones', async (req, res) => {
  const generaciones = await leerColeccion('generaciones');
  res.json(generaciones.slice().reverse());
});

// Reposición: reimprime una sola pieza de una generación ya existente, sin
// tocar el resto del lote. Es el hallazgo más accionable de la investigación
// de referencia (ver claude/README.md).
router.post('/nesting/:generacionId/reposicion/:piezaId', async (req, res) => {
  const generacion = await leerRegistro('generaciones', req.params.generacionId);
  if (!generacion) return res.status(404).json({ error: 'Generación no encontrada' });

  const pieza = generacion.piezas.find((p) => p.id === req.params.piezaId);
  if (!pieza) return res.status(404).json({ error: 'Pieza no encontrada en esa generación' });

  const layoutDeUnaPieza = anidarPiezas(
    [{ ...pieza, rotable: pieza.rotacionGrados === 180 }],
    { anchoLienzoCm: pieza.anchoCm + 1 }
  );
  const pdfBytes = await generarPdfNesting(layoutDeUnaPieza);

  pieza.estado = 'repuesta';
  await actualizarRegistro('generaciones', req.params.generacionId, generacion);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="reposicion-' + pieza.id + '.pdf"');
  res.send(Buffer.from(pdfBytes));
});
