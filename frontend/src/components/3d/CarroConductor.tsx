import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type { Group } from 'three';
import { longitud, puntoEn, type Punto } from '../../lib/plano';
import { ModeloCarro } from './Carro3D';
import { COLOR, aX, aZ } from './escena';
import { girarHacia, yawDeRumbo } from './Ruta3D';

const VELOCIDAD = 42; // misma velocidad que la navegación del celular (≈ 5 m/s)

/**
 * Carro VINOTINTO del conductor que usa FastParking (vista /simulacion).
 * Recorre su ruta desde la rampa y se detiene frente al puesto reservado ("en camino").
 * Si el agente lo reasigna, gira y sigue hacia el puesto nuevo desde donde iba: así se ve la conexión
 * entre el celular y la simulación.
 */
export function CarroConductor({ ruta, faros }: { ruta: Punto[]; faros: boolean }) {
  const ref = useRef<Group>(null);
  const tramo = useRef<{ ruta: Punto[]; inicio: number; duracion: number } | null>(null);
  const yaw = useRef<number | null>(null);

  // Solo reacciona si cambia el DESTINO (no cada vez que llega una actualización de ocupación).
  const claveRuta = ruta.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(';');
  useEffect(() => {
    // Se detiene en la vía, justo frente al puesto (el último tramo es la entrada al puesto).
    const frente = ruta.slice(0, -1);
    let camino = frente;
    if (ref.current && tramo.current) {
      // Reasignación: parte desde la posición actual del carro.
      const actual = { x: ref.current.position.x / 0.1 + 180, y: ref.current.position.z / 0.1 + 475 };
      camino = [actual, { x: frente[0].x, y: actual.y }, ...frente.slice(1)];
    }
    tramo.current = { ruta: camino, inicio: performance.now(), duracion: Math.max(2500, (longitud(camino) / VELOCIDAD) * 1000) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveRuta]);

  useFrame((_, dt) => {
    const g = ref.current;
    const t = tramo.current;
    if (!g || !t) return;
    const f = Math.min(1, (performance.now() - t.inicio) / t.duracion);
    const p = puntoEn(t.ruta, f);
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
