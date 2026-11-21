/**
 * Convenciones de la escena 3D (artefacto 5.2, guía visual en docs/agente-llm.md §Guía visual 3D).
 * El plano ilustrativo (lib/plano.ts) usa unidades de plano en 2D: x = ancho, y = profundidad.
 * En 3D: X = x, Z = y, Y = altura. 1 unidad 3D = 10 unidades de plano ≈ 1,2 m.
 */
import { CENTRO_CARRIL, PLANO, type Puesto } from '../../lib/plano';

export const ESCALA = 0.1;
export const aX = (x: number) => (x - PLANO.ancho / 2) * ESCALA;
export const aZ = (y: number) => (y - PLANO.alto / 2) * ESCALA;
export const ANCHO_3D = PLANO.ancho * ESCALA;
export const LARGO_3D = PLANO.alto * ESCALA;
export const CARRIL_X = aX(CENTRO_CARRIL);

/** Paleta "maqueta arquitectónica premium" con el color de marca #083E4D. */
export const COLOR = {
  fondo: '#e7ecef',
  piso: '#aab2b8',
  via: '#8f989f',
  lineaVia: '#f3f5f6',
  demarcacion: '#f7f9fa',
  hueso: '#f1efe9',
  muro: '#e9e6df',
  marca: '#083e4d',
  neon: '#26c6da',
  retenido: '#f5b942',
  mio: '#14c2d6',
  intruso: '#ef4444',
  ruta: '#12b5cb',
  /** Carro del conductor de FastParking (elegido por la autora): vinotinto. */
  conductor: '#7b1e3a',
  /** Carro intruso (no usa FastParking): naranja. */
  carroIntruso: '#f97316',
};

/** Paleta sobria de carros: blanco, grafito, plata, negro; 1 de cada 8 en azul o rojo apagado. */
const CARROS = ['#f2f4f5', '#3a4148', '#b9c0c6', '#1b1f23', '#e8eaec', '#5b636b', '#c9cfd4', '#2a2f34'];
const ACENTO = ['#3e6a8a', '#8e3b3b'];
export function colorCarro(clave: string): string {
  let h = 0;
  for (let i = 0; i < clave.length; i++) h = (h * 31 + clave.charCodeAt(i)) >>> 0;
  return h % 8 === 0 ? ACENTO[h % 2] : CARROS[h % CARROS.length];
}

/** Ángulo (rotación Y) de un carro estacionado: la trompa mira hacia la vía (se estacionó en reversa). */
export function yawEstacionado(lado: 'izq' | 'der'): number {
  return lado === 'izq' ? 0 : Math.PI;
}

export interface Cuadro {
  x: number;
  z: number;
  yaw: number;
  t: number; // segundos desde el inicio de la animación
}

const VELOCIDAD = 32; // unidades de plano por segundo (≈ 4 m/s, ritmo tranquilo dentro de un parqueadero)
const ABAJO = -Math.PI / 2; // mirando hacia +Z (hacia el fondo del sótano)
const ARRIBA = Math.PI / 2; // mirando hacia -Z (hacia la rampa)

function cuadros(puntos: { x: number; y: number; yaw: number }[]): Cuadro[] {
  let t = 0;
  return puntos.map((p, i) => {
    if (i > 0) {
      const a = puntos[i - 1];
      t += Math.max(2, Math.hypot(p.x - a.x, p.y - a.y) / VELOCIDAD);
    }
    return { x: aX(p.x), z: aZ(p.y), yaw: p.yaw, t };
  });
}

/** Un carro entra por la rampa, avanza por la vía, se pasa del puesto y se estaciona en reversa. */
export function trayectoEntrada(p: Puesto, lado: 'izq' | 'der'): Cuadro[] {
  return cuadros([
    { x: CENTRO_CARRIL, y: -40, yaw: ABAJO },
    { x: CENTRO_CARRIL, y: p.cy + 32, yaw: ABAJO },
    { x: CENTRO_CARRIL + (lado === 'izq' ? 6 : -6), y: p.cy + 18, yaw: ABAJO },
    { x: p.cx, y: p.cy, yaw: yawEstacionado(lado) },
  ]);
}

/**
 * RF-19: el carro intruso entra por la OTRA puerta (el fondo del sótano), sube por la vía y se mete de frente
 * en el puesto retenido. Los tiempos se escalan para que llegue exactamente cuando el servidor ocupa el puesto.
 */
export function trayectoIntruso(p: Puesto, lado: 'izq' | 'der', duracionMs: number): Cuadro[] {
  const base = cuadros([
    { x: CENTRO_CARRIL, y: PLANO.alto + 40, yaw: ARRIBA },
    { x: CENTRO_CARRIL, y: p.cy + 26, yaw: ARRIBA },
    { x: p.cx, y: p.cy, yaw: lado === 'izq' ? Math.PI : 0 },
  ]);
  const total = base[base.length - 1].t || 1;
  return base.map((c) => ({ ...c, t: (c.t / total) * (duracionMs / 1000) }));
}

/** Un carro sale del puesto hacia la vía y sube por la rampa. */
export function trayectoSalida(p: Puesto, lado: 'izq' | 'der'): Cuadro[] {
  return cuadros([
    { x: p.cx, y: p.cy, yaw: yawEstacionado(lado) },
    { x: CENTRO_CARRIL, y: p.cy - 24, yaw: ARRIBA },
    { x: CENTRO_CARRIL, y: -50, yaw: ARRIBA },
  ]);
}

function suave(t: number) {
  return t * t * (3 - 2 * t);
}

function angulo(a: number, b: number, f: number) {
  let d = ((b - a + Math.PI) % (2 * Math.PI)) - Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return a + d * f;
}

/** Posición y rumbo de un carro en el segundo `s` de su trayecto. */
export function muestrear(trayecto: Cuadro[], s: number): { x: number; z: number; yaw: number; fin: boolean } {
  const ultimo = trayecto[trayecto.length - 1];
  if (s >= ultimo.t) return { x: ultimo.x, z: ultimo.z, yaw: ultimo.yaw, fin: true };
  for (let i = 1; i < trayecto.length; i++) {
    const a = trayecto[i - 1];
    const b = trayecto[i];
    if (s <= b.t) {
      const f = suave((s - a.t) / (b.t - a.t || 1));
      return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, yaw: angulo(a.yaw, b.yaw, f), fin: false };
    }
  }
  return { x: ultimo.x, z: ultimo.z, yaw: ultimo.yaw, fin: true };
}
