// En local, sin variable de entorno, apunta al backend de desarrollo.
// En Netlify, se define VITE_API_URL apuntando al backend real en Render.
// Se normaliza el sufijo /api acá para que dé igual si la variable se cargó
// como el origen solo (https://host) o con el sufijo ya puesto
// (https://host/api) — ambas formas terminan en la misma BASE_URL.
const ORIGEN = (import.meta.env.VITE_API_URL || 'http://localhost:4000')
  .replace(/\/+$/, '')
  .replace(/\/api$/, '');
const BASE_URL = ORIGEN + '/api';

async function pedirJson(ruta, opciones) {
  const respuesta = await fetch(BASE_URL + ruta, {
    headers: { 'Content-Type': 'application/json' },
    ...opciones,
  });
  if (!respuesta.ok) {
    const cuerpo = await respuesta.json().catch(() => ({}));
    throw new Error(cuerpo.error || 'Error de red (' + respuesta.status + ')');
  }
  return respuesta.status === 204 ? null : respuesta.json();
}

export function listarMolderias() {
  return pedirJson('/molderias');
}

export function crearMolderia(molderia) {
  return pedirJson('/molderias', { method: 'POST', body: JSON.stringify(molderia) });
}

export function eliminarMolderia(id) {
  return pedirJson('/molderias/' + id, { method: 'DELETE' });
}

export function anidarDesdeMolderia(molderiaId, lineas, anchoLienzoCm) {
  return pedirJson('/nesting/desde-molderia', {
    method: 'POST',
    body: JSON.stringify({ molderiaId, lineas, anchoLienzoCm }),
  });
}

export async function generarPdf(resultadoNesting) {
  const respuesta = await fetch(BASE_URL + '/nesting/generar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(resultadoNesting),
  });
  if (!respuesta.ok) throw new Error('Falló la generación del PDF');
  const blob = await respuesta.blob();
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = 'nesting.pdf';
  enlace.click();
  URL.revokeObjectURL(url);
}
