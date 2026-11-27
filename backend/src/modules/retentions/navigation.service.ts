import { notificador } from '../../shared/realtime.js';

/**
 * Sincronización de la navegación (RF-20): cuando el conductor pulsa "Ir" en el celular, el servidor
 * guarda cuándo empezó y cuánto dura su recorrido simulado, y lo avisa por SSE. Así el carro vinotinto
 * de /simulacion avanza al MISMO ritmo que la flecha del celular. Se guarda en memoria: es un dato efímero
 * de la demostración (un solo servidor en Render).
 */
interface Navegacion {
  idZona: number;
  puesto: number;
  inicio: number;
  duracionMs: number;
  desde?: { x: number; y: number };
}

const navegaciones = new Map<string, Navegacion>();
const clave = (idZona: number, puesto: number) => `${idZona}-${puesto}`;

function limpiar() {
  const ahora = Date.now();
  for (const [k, n] of navegaciones) if (ahora - n.inicio > n.duracionMs + 10 * 60_000) navegaciones.delete(k);
}

export function iniciarNavegacion(idZona: number, puesto: number, duracionMs: number, desde?: { x: number; y: number }): void {
  limpiar();
  const n = { idZona, puesto, inicio: Date.now(), duracionMs, desde };
  navegaciones.set(clave(idZona, puesto), n);
  notificador.publicarNavegacion({ idZona, puesto, duracionMs, transcurridoMs: 0, desde });
}

/** v2.1: "Reiniciar demo" olvida las navegaciones en curso. */
export function limpiarNavegaciones(): void {
  navegaciones.clear();
}

/** Navegaciones en curso con el tiempo ya transcurrido (para quien abre /simulacion a mitad de camino). */
export function navegacionesActivas() {
  limpiar();
  const ahora = Date.now();
  return [...navegaciones.values()].map((n) => ({
    idZona: n.idZona,
    puesto: n.puesto,
    duracionMs: n.duracionMs,
    transcurridoMs: ahora - n.inicio,
    desde: n.desde,
  }));
}
