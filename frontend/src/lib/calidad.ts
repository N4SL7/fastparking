/**
 * Calidad gráfica adaptable (artefacto 5.4, D-25).
 * - ALTO (iPad / computador): resolución hasta 2×, sombras suaves, brillo neón (bloom) y faros.
 * - LIVIANO (celular): resolución 1×, sombras simuladas y sin posprocesado, para mantener ≥ 30 fps.
 * Se puede forzar con ?calidad=alto | ?calidad=liviano en la URL (útil para medir en la sustentación).
 */
export type NivelCalidad = 'alto' | 'liviano';

export interface PerfilCalidad {
  nivel: NivelCalidad;
  dpr: [number, number];
  sombras: boolean;
  bloom: boolean;
  faros: boolean;
  antialias: boolean;
}

const PERFILES: Record<NivelCalidad, PerfilCalidad> = {
  alto: { nivel: 'alto', dpr: [1, 2], sombras: true, bloom: true, faros: true, antialias: true },
  liviano: { nivel: 'liviano', dpr: [1, 1], sombras: false, bloom: false, faros: false, antialias: false },
};

export function detectarCalidad(): PerfilCalidad {
  if (typeof window === 'undefined') return PERFILES.liviano;
  const forzada = new URLSearchParams(window.location.search).get('calidad');
  if (forzada === 'alto' || forzada === 'liviano') return PERFILES[forzada];

  const ladoCorto = Math.min(window.screen.width, window.screen.height);
  const punteroFino = window.matchMedia?.('(pointer: fine)').matches ?? false;
  // iPadOS se presenta como "Macintosh" con pantalla táctil: también cuenta como tablet.
  const esIpad = /iPad/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const memoria = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const esPotente = (ladoCorto >= 700 || punteroFino || esIpad) && memoria >= 4;
  return PERFILES[esPotente ? 'alto' : 'liviano'];
}

/** true en tablets y computadores: la vista /simulacion usa pantalla completa. */
export function esPantallaGrande(): boolean {
  return typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) >= 700;
}
