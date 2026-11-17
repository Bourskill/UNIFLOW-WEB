// Lo compartido del banco gratuito de fuentes (Fontsource) entre Moldería →
// Fuentes y el selector de fuente de Diseño (componentes/PanelTexto.jsx).

export const NOMBRE_PESO = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };

// Mismo archivo que baja el backend (.ttf) pero en woff2, que es el que el
// navegador carga más liviano -- solo para MOSTRAR cómo se ve la fuente antes
// de usarla; al elegirla, el backend baja y guarda el .ttf real.
export function urlDeMuestra(id, peso) {
  return 'https://cdn.jsdelivr.net/fontsource/fonts/' + id + '@latest/latin-' + peso + '-normal.woff2';
}
