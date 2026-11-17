// Vista en PNG de un diseño en PDF, para VERLO en el lienzo y en la vista
// previa (el navegador no puede dibujar un PDF dentro del SVG). El PDF de
// producción NO usa esta vista: incrusta el PDF original, vectorial (ver
// backend/src/motor/exportarPdf.js·incrustarArte).
//
// Primera página, su área visible (CropBox), sin la rotación de la página
// -- igual que la incrusta el backend -- y con fondo TRANSPARENTE, así se
// ve el fondo de color de la pieza en lo que el PDF deja vacío.
// pdf.js se carga recién al soltar un PDF: no pesa en el resto de la app.

export async function vistaDePdf(archivo, { ladoMaxPx = 2400 } = {}) {
  const pdfjs = await import('pdfjs-dist');
  const { default: urlWorker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = urlWorker;

  const datos = new Uint8Array(await archivo.arrayBuffer());
  const doc = await pdfjs.getDocument({ data: datos }).promise;
  try {
    const pagina = await doc.getPage(1);
    const base = pagina.getViewport({ scale: 1, rotation: 0 });
    const escala = Math.min(ladoMaxPx / Math.max(base.width, base.height), 10);
    const viewport = pagina.getViewport({ scale: escala, rotation: 0 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const contexto = canvas.getContext('2d');
    await pagina.render({ canvas, canvasContext: contexto, viewport, background: 'rgba(0,0,0,0)' }).promise;
    const blob = await new Promise((resolver, rechazar) =>
      canvas.toBlob((b) => (b ? resolver(b) : rechazar(new Error('No se pudo armar la vista del PDF.'))), 'image/png'));
    return { blob, paginas: doc.numPages };
  } finally {
    doc.destroy();
  }
}
