import { useEffect, useState } from 'react';

// Compartido entre VistaPreviaNesting (Konva.Image de la hoja generada) y
// CanvasZonas (Konva.Image del diseño recortado sobre el molde) -- carga un
// <img> nativo para pasárselo a Konva, que no sabe pedir una URL por sí solo.
export function useImagenCargada(url) {
  const [imagen, setImagen] = useState(null);
  useEffect(() => {
    if (!url) {
      setImagen(null);
      return;
    }
    const elemento = new window.Image();
    elemento.crossOrigin = 'anonymous'; // viene de Supabase Storage, no embebida
    elemento.onload = () => setImagen(elemento);
    elemento.src = url;
  }, [url]);
  return imagen;
}
