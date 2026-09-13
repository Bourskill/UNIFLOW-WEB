// Íconos de línea, minimalistas — identifican cada sección del panel
// lateral, no son decorativos.
const TRAZOS = {
  subir: 'M12 16V4 M7 9l5-5 5 5 M4 20h16',
  prenda: 'M9 3Q12 5 15 3L18 6 15 9 15 20 9 20 9 9 6 6Z',
  pieza: 'M4 4h11l5 5v11H4z M15 4v5h5',
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
