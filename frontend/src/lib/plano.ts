/**
 * Geometría del plano ILUSTRATIVO de un sótano (RF-10, RN-09).
 * No representa el plano oficial de Parque La Colina: es un modelo de referencia para la simulación.
 * Coordenadas en "unidades de plano"; 1 unidad ≈ 0,12 m.
 */
import type { Zona } from '../types';

export const PLANO = { ancho: 360, alto: 950, metrosPorUnidad: 0.12 };
export const CARRIL = { x: 150, ancho: 60 }; // vía central de circulación
export const CENTRO_CARRIL = CARRIL.x + CARRIL.ancho / 2;
export const RAMPA = { y: 0, alto: 62 };

const BLOQUES = [
  { lado: 'izq', y: 80, alto: 420 },
  { lado: 'der', y: 80, alto: 420 },
  { lado: 'izq', y: 520, alto: 420 },
  { lado: 'der', y: 520, alto: 420 },
] as const;

export interface Puesto {
  numero: number; // 1..capacidad, de la rampa hacia el fondo
  x: number;
  y: number;
  ancho: number;
  alto: number;
  cx: number;
  cy: number;
  estado: 'libre' | 'ocupado' | 'retenido' | 'mio' | 'mi-vehiculo';
}

export interface ZonaEnPlano {
  zona: Zona;
  lado: 'izq' | 'der';
  bloque: { x: number; y: number; ancho: number; alto: number };
  edificio: { x: number; y: number; ancho: number; alto: number };
  puestos: Puesto[];
}

/** Barajado determinista: la misma zona siempre "ocupa" los mismos puestos (la ocupación se ve estable). */
function ordenDeOcupacion(idZona: number, n: number): number[] {
  const orden = Array.from({ length: n }, (_, i) => i);
  let semilla = idZona * 9301 + 49297;
  for (let i = n - 1; i > 0; i--) {
    semilla = (semilla * 9301 + 49297) % 233280;
    const j = Math.floor((semilla / 233280) * (i + 1));
    [orden[i], orden[j]] = [orden[j], orden[i]];
  }
  return orden;
}

export interface OpcionesPlano {
  /** Zona de la retención vigente del conductor. */
  idZonaRetencion?: number;
  /** Puesto elegido en el mapa; si no hay o está ocupado, se usa el primer libre más cercano a la rampa. */
  puestoRetencion?: number | null;
  /** Ubicación guardada del vehículo. */
  vehiculo?: { idZona: number; puesto: number | null };
}

export function construirPlano(zonas: Zona[], opciones: OpcionesPlano = {}): ZonaEnPlano[] {
  return [...zonas]
    .sort((a, b) => a.ordenCercania - b.ordenCercania)
    .slice(0, 4)
    .map((zona, i) => {
      const b = BLOQUES[i];
      const izq = b.lado === 'izq';
      const ancho = 66;
      const x = izq ? CARRIL.x - ancho - 4 : CARRIL.x + CARRIL.ancho + 4;
      const altoPuesto = Math.min(34, b.alto / zona.capacidadTotal);
      const yInicio = b.y + (b.alto - altoPuesto * zona.capacidadTotal) / 2;

      const puestos: Puesto[] = Array.from({ length: zona.capacidadTotal }, (_, k) => {
        const y = yInicio + k * altoPuesto;
        return { numero: k + 1, x, y, ancho, alto: altoPuesto, cx: x + ancho / 2, cy: y + altoPuesto / 2, estado: 'libre' as const };
      });

      // Ocupación física (eventos): primero el vehículo propio si está en esta zona, luego el orden determinista.
      const propio = opciones.vehiculo?.idZona === zona.idZona ? opciones.vehiculo.puesto : null;
      let porOcupar = zona.ocupados;
      if (propio && puestos[propio - 1] && porOcupar > 0) {
        puestos[propio - 1].estado = 'mi-vehiculo';
        porOcupar--;
      }
      for (const idx of ordenDeOcupacion(zona.idZona, zona.capacidadTotal)) {
        if (porOcupar <= 0) break;
        if (puestos[idx].estado === 'libre') {
          puestos[idx].estado = 'ocupado';
          porOcupar--;
        }
      }
      // Retenciones vigentes: la mía toma el primer libre (más cercano a la rampa); las demás, los siguientes.
      const libres = puestos.filter((p) => p.estado === 'libre');
      let retenidasOtras = zona.retenidas;
      if (opciones.idZonaRetencion === zona.idZona && libres.length > 0) {
        const elegido = libres.find((p) => p.numero === opciones.puestoRetencion) ?? libres[0];
        elegido.estado = 'mio';
        libres.splice(libres.indexOf(elegido), 1);
        retenidasOtras--;
      }
      for (const p of libres) {
        if (retenidasOtras <= 0) break;
        p.estado = 'retenido';
        retenidasOtras--;
      }

      const edificio = { x: izq ? 14 : 290, y: b.y + 40, ancho: 56, alto: b.alto - 80 };
      return { zona, lado: b.lado, bloque: { x, y: b.y, ancho, alto: b.alto }, edificio, puestos };
    });
}

export type Punto = { x: number; y: number };

/** Ruta de referencia: rampa → vía central → puesto (RF-10). Sin algoritmo de grafos (D-05/D-06). */
export function rutaHastaPuesto(p: Puesto, lado: 'izq' | 'der'): Punto[] {
  const entradaPuesto = lado === 'izq' ? p.x + p.ancho - 10 : p.x + 10;
  return [
    { x: CENTRO_CARRIL, y: RAMPA.y + 16 },
    { x: CENTRO_CARRIL, y: p.cy },
    { x: entradaPuesto, y: p.cy },
  ];
}

export function longitud(ruta: Punto[]): number {
  let total = 0;
  for (let i = 1; i < ruta.length; i++) total += Math.hypot(ruta[i].x - ruta[i - 1].x, ruta[i].y - ruta[i - 1].y);
  return total;
}

/** Posición y rumbo (grados, 0 = hacia arriba) a una fracción t ∈ [0,1] del recorrido. */
export function puntoEn(ruta: Punto[], t: number): Punto & { rumbo: number } {
  const objetivo = longitud(ruta) * Math.min(1, Math.max(0, t));
  let acumulado = 0;
  for (let i = 1; i < ruta.length; i++) {
    const a = ruta[i - 1];
    const b = ruta[i];
    const tramo = Math.hypot(b.x - a.x, b.y - a.y);
    const rumbo = (Math.atan2(b.x - a.x, -(b.y - a.y)) * 180) / Math.PI;
    if (acumulado + tramo >= objetivo || i === ruta.length - 1) {
      const f = tramo === 0 ? 0 : Math.min(1, (objetivo - acumulado) / tramo);
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, rumbo };
    }
    acumulado += tramo;
  }
  return { ...ruta[0], rumbo: 180 };
}

/** Sub-ruta ya recorrida (para pintar el trazo recorrido de otro tono). */
export function recorrido(ruta: Punto[], t: number): Punto[] {
  const fin = puntoEn(ruta, t);
  const objetivo = longitud(ruta) * t;
  const puntos: Punto[] = [ruta[0]];
  let acumulado = 0;
  for (let i = 1; i < ruta.length; i++) {
    const tramo = Math.hypot(ruta[i].x - ruta[i - 1].x, ruta[i].y - ruta[i - 1].y);
    if (acumulado + tramo >= objetivo) break;
    puntos.push(ruta[i]);
    acumulado += tramo;
  }
  puntos.push(fin);
  return puntos;
}

/** Próxima instrucción de giro a una fracción t del recorrido (estilo navegador). */
export function siguienteInstruccion(ruta: Punto[], t: number): { texto: string; metros: number; punto: Punto | null } {
  const objetivo = longitud(ruta) * t;
  let acumulado = 0;
  for (let i = 1; i < ruta.length; i++) {
    const a = ruta[i - 1];
    const b = ruta[i];
    const tramo = Math.hypot(b.x - a.x, b.y - a.y);
    if (acumulado + tramo >= objetivo) {
      const metros = Math.max(0, Math.round((acumulado + tramo - objetivo) * PLANO.metrosPorUnidad));
      if (i === ruta.length - 1) return { texto: 'Tu puesto está adelante', metros, punto: b };
      const c = ruta[i + 1];
      const giro = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      return { texto: giro > 0 ? 'Gira a la derecha' : 'Gira a la izquierda', metros, punto: b };
    }
    acumulado += tramo;
  }
  return { texto: 'Llegaste', metros: 0, punto: null };
}

/** Puntos con rumbo cada `paso` unidades entre t y el final (para dibujar flechas sobre el piso). */
export function chevrones(ruta: Punto[], t: number, paso = 34): (Punto & { rumbo: number })[] {
  const total = longitud(ruta);
  const salida: (Punto & { rumbo: number })[] = [];
  for (let d = total * t + 22; d < total - 10; d += paso) salida.push(puntoEn(ruta, d / total));
  return salida;
}
