import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { subirArchivo } from '../api.js';
import { Campo, Aviso } from './ui.jsx';

function archivoADataUrl(archivo) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(lector.result);
    lector.onerror = reject;
    lector.readAsDataURL(archivo);
  });
}

// Sube la imagen a Storage apenas se suelta (no al guardar el diseño): así
// lo que termina en el registro del Diseño es una URL liviana, nunca la
// imagen en sí — ver almacen.js sobre por qué eso tronaba con "statement
// timeout". Compartido entre el editor de Producto y cualquier otro lugar
// que necesite subir el arte de una pieza.
// `rol` es la clave real (puede venir namespaceada grupoId::rol en un kit
// multi-prenda -- Productos.jsx) que se le devuelve a onElegir y se usa
// como pista de nombre al subir el archivo. `etiqueta` (opcional, por
// defecto el propio rol) es lo que se le muestra al usuario -- nunca un id
// de grupo en crudo.
export function SlotImagenDiseno({ rol, etiqueta, url, onElegir }) {
  const etiquetaVisible = etiqueta || rol;
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState(null);

  const onDrop = useCallback(
    async (archivos) => {
      const archivo = archivos[0];
      if (!archivo) return;
      setSubiendo(true);
      setError(null);
      try {
        const dataUrl = await archivoADataUrl(archivo);
        const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
        const urlSubida = await subirArchivo(base64, archivo.type, rol);
        onElegir(rol, urlSubida);
      } catch (e) {
        setError(e.message);
      } finally {
        setSubiendo(false);
      }
    },
    [rol, onElegir]
  );
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'] },
    multiple: false,
  });

  return (
    <Campo etiqueta={'Imagen para "' + etiquetaVisible + '"'}>
      <div
        {...getRootProps()}
        className={
          'cursor-pointer rounded-lg border-2 border-dashed px-4 py-3 text-center text-xs ' +
          (isDragActive ? 'border-primary bg-primary-soft text-primary' : 'border-border text-faint-foreground')
        }
      >
        <input {...getInputProps()} />
        {subiendo ? 'Subiendo…' : url ? 'Reemplazar' : 'Arrastrar o elegir archivo'}
      </div>
      {error && <Aviso tono="error">{error}</Aviso>}
      {url && <img className="mt-2 max-h-20 max-w-20 rounded-md border border-border" src={url} alt={etiquetaVisible} />}
    </Campo>
  );
}
