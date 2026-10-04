import { useEffect, useState } from 'react';

// Carga de tipografías en el NAVEGADOR para que la vista previa dibuje el
// texto con la MISMA fuente con la que el PDF lo mide y lo escribe (una
// fuente de Diseño, de nesting, del banco...). Cada URL se carga una sola
// vez por sesión; mientras no está lista, el texto simplemente no se dibuja
// (mejor que dibujarlo con otra letra y medir mal el espacio).

const cargas = new Map(); // url -> Promise<string> con el nombre de familia
let contador = 0;

/** Promesa del nombre de familia CSS de una fuente (la crea y la registra). */
export function cargarFuenteWeb(url) {
  if (!cargas.has(url)) {
    const familia = 'uniflow-fuente-' + contador++;
    const fuente = new FontFace(familia, 'url(' + JSON.stringify(url) + ')');
    cargas.set(
      url,
      fuente.load().then(() => {
        document.fonts.add(fuente);
        return familia;
      })
    );
    // Un fallo no se guarda: el próximo intento vuelve a probar.
    cargas.get(url).catch(() => cargas.delete(url));
  }
  return cargas.get(url);
}

/**
 * Familias CSS ya listas para un conjunto de URLs: { url: familia }. Las que
 * todavía cargan (o fallaron) simplemente no aparecen en el mapa.
 */
export function useFuentesWeb(urls) {
  const [listas, setListas] = useState({});
  const clave = [...new Set(urls.filter(Boolean))].sort().join('\n');

  useEffect(() => {
    let vigente = true;
    for (const url of clave ? clave.split('\n') : []) {
      cargarFuenteWeb(url)
        .then((familia) => { if (vigente) setListas((prev) => (prev[url] === familia ? prev : { ...prev, [url]: familia })); })
        .catch(() => {});
    }
    return () => { vigente = false; };
  }, [clave]);

  return listas;
}
