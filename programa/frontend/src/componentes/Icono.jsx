// Íconos de línea, minimalistas, al estilo de los paneles de Adobe — no son
// decorativos, identifican cada sección del panel lateral igual que los
// íconos de un panel dockeable en Illustrator.
const TRAZOS = {
  molderia: 'M4 4h9l7 7v9H4z M13 4v7h7',
  diseno: 'M4 5h16v14H4z M4 15l4-4 3 3 5-6 4 5',
  producto: 'M13 3l8 8-9 9-8-8V4h8z M8.5 8.5h.01',
  pedido: 'M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6',
};

export function Icono({ nombre, size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={TRAZOS[nombre]} />
    </svg>
  );
}
