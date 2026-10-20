/** Íconos de línea (SVG propio, sin dependencias). */
type P = { size?: number };
const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
});
export const IconoInicio = ({ size = 24 }: P) => (
  <svg {...base(size)}>
    <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" fill="currentColor" stroke="none" />
  </svg>
);
export const IconoMapa = ({ size = 24 }: P) => (
  <svg {...base(size)}>
    <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z" />
    <path d="M9 4v14M15 6v14" />
  </svg>
);
export const IconoCarro = ({ size = 24 }: P) => (
  <svg {...base(size)}>
    <path d="M5 16V11l2-5h10l2 5v5" />
    <path d="M3 16h18v3h-3M6 19H3v-3" />
    <circle cx="7.5" cy="16" r="1.5" />
    <circle cx="16.5" cy="16" r="1.5" />
    <path d="M5 11h14" />
  </svg>
);
export const IconoTiquete = ({ size = 24 }: P) => (
  <svg {...base(size)}>
    <rect x="4" y="4" width="6" height="6" rx="1" />
    <rect x="14" y="4" width="6" height="6" rx="1" />
    <rect x="4" y="14" width="6" height="6" rx="1" />
    <path d="M14 14h2v2h-2zM18 14h2M14 18h2M18 18h2v2" />
  </svg>
);
export const IconoReloj = ({ size = 20 }: P) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);
export const IconoNavegar = ({ size = 20 }: P) => (
  <svg {...base(size)}>
    <path d="M12 3 20 21l-8-4-8 4z" fill="currentColor" />
  </svg>
);
export const IconoUbicacion = ({ size = 20 }: P) => (
  <svg {...base(size)}>
    <path d="M12 21s-7-6.3-7-11a7 7 0 0 1 14 0c0 4.7-7 11-7 11z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
);
export const IconoBilletera = ({ size = 24 }: P) => (
  <svg {...base(size)}>
    <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" />
    <rect x="3.5" y="8" width="17" height="11" rx="2.5" />
    <path d="M16 13.5h2" />
  </svg>
);
export const IconoCheck = ({ size = 24 }: P) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12.5 2.6 2.5L16 9.5" />
  </svg>
);
export const IconoTarjeta = ({ size = 22 }: P) => (
  <svg {...base(size)}>
    <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
    <path d="M3 10h18M7 15h3" />
  </svg>
);
export const IconoCelular = ({ size = 22 }: P) => (
  <svg {...base(size)}>
    <rect x="7" y="3" width="10" height="18" rx="2.5" />
    <path d="M11 17.5h2" />
  </svg>
);
export const IconoBanco = ({ size = 22 }: P) => (
  <svg {...base(size)}>
    <path d="M3 9.5 12 4l9 5.5M5 10v7M9.5 10v7M14.5 10v7M19 10v7M3.5 20h17" />
  </svg>
);
