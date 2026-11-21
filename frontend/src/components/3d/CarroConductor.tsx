import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type { Group } from 'three';
import { longitud, puntoEn, type Punto } from '../../lib/plano';
import { ModeloCarro } from './Carro3D';
import { COLOR, aX, aZ } from './escena';
import { girarHacia, yawDeRumbo } from './Ruta3D';

const ENTRADA_AL_PUESTO_MS = 1500; // último tramo: de la vía al centro del puesto
const REASIGNACION_MS = 6000; // si lo reasignan sin nueva navegación, se mueve en este tiempo

/** Navegación del celular sincronizada por el servidor (inicio en el reloj local + duración). */
export interface NavegacionSincronizada {
  inicioLocal: number;
  duracionMs: number;
}

/**
 * Carro VINOTINTO del conductor que usa FastParking (vista /simulacion), SINCRONIZADO con el celular:
 * - Reservó pero aún no pulsa "Ir": espera en la rampa.
 * - Pulsa "Ir": avanza por la misma ruta y con la MISMA duración que la flecha del celular, y entra al puesto.
 * - Si el agente lo reasigna: sale desde donde está hacia el puesto nuevo.
 */
export function CarroConductor({
  ruta,
  centro,
  nav,
  faros,
}: {
  ruta: Punto[];
  centro: Punto;
  nav: NavegacionSincronizada | null;
  faros: boolean;
}) {
  const ref = useRef<Group>(null);
  const tramo = useRef<{ ruta: Punto[]; inicio: number; duracion: number } | null>(null);
  const yaw = useRef<number | null>(null);
  const claveRuta = ruta.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(';');

  useEffect(() => {
    const g = ref.current;
    const posicionActual = g && tramo.current ? { x: g.position.x / 0.1 + 180, y: g.position.z / 0.1 + 475 } : null;
    if (!nav) {
      if (!posicionActual) {
        // Aún no navega: espera en la entrada del sótano.
        tramo.current = { ruta: [ruta[0], { x: ruta[0].x, y: ruta[0].y + 1 }], inicio: performance.now(), duracion: 1 };
      } else {
        // Reasignado sin navegación nueva: va desde donde está hasta el puesto nuevo.
        const camino = [posicionActual, { x: ruta[0].x, y: posicionActual.y }, ...ruta.slice(1), centro];
        tramo.current = { ruta: camino, inicio: performance.now(), duracion: REASIGNACION_MS };
      }
      return;
    }
    // Navegación del celular: la ruta (sin el centro del puesto) dura lo mismo que la flecha.
    const desde = posicionActual && Math.hypot(posicionActual.x - ruta[0].x, posicionActual.y - ruta[0].y) > 20 ? posicionActual : null;
    const camino = desde ? [desde, { x: ruta[0].x, y: desde.y }, ...ruta.slice(1)] : ruta;
    tramo.current = { ruta: camino, inicio: nav.inicioLocal, duracion: nav.duracionMs };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveRuta, nav?.inicioLocal]);

  useFrame((_, dt) => {
    const g = ref.current;
    const t = tramo.current;
    if (!g || !t) return;
    const transcurrido = performance.now() - t.inicio;
    let p: Punto & { rumbo: number };
    if (nav && transcurrido > t.duracion) {
      // Llegó al frente del puesto (igual que "Llegaste" en el celular): entra al puesto.
      const f = Math.min(1, (transcurrido - t.duracion) / ENTRADA_AL_PUESTO_MS);
      p = puntoEn([t.ruta[t.ruta.length - 1], centro], f);
    } else {
      const largo = longitud(t.ruta) || 1;
      p = puntoEn(t.ruta, Math.max(0, Math.min(1, transcurrido / t.duracion)) * (largo > 0 ? 1 : 0));
    }
    g.position.set(aX(p.x), 0, aZ(p.y));
    const objetivo = yawDeRumbo(p.rumbo);
    yaw.current = yaw.current === null ? objetivo : girarHacia(yaw.current, objetivo, Math.min(1, dt * 5));
    g.rotation.y = yaw.current;
  });

  return (
    <group ref={ref}>
      <ModeloCarro color={COLOR.conductor} faros={faros} resaltado={COLOR.mio} />
    </group>
  );
}
