import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { Shape, type Group, type Mesh, type MeshBasicMaterial } from 'three';
import { longitud, puntoEn, type Punto } from '../../lib/plano';
import { COLOR, aX, aZ } from './escena';

/** Rumbo del plano (grados, 0 = hacia la rampa) → rotación Y de una flecha que apunta a +X. */
export const yawDeRumbo = (rumbo: number) => {
  const r = (rumbo * Math.PI) / 180;
  return Math.atan2(Math.cos(r), Math.sin(r));
};

/** Interpola un ángulo por el camino más corto. */
export function girarHacia(actual: number, objetivo: number, f: number) {
  let d = ((objetivo - actual + Math.PI) % (2 * Math.PI)) - Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return actual + d * f;
}

function formaChevron() {
  const s = new Shape();
  s.moveTo(-0.35, -0.55);
  s.lineTo(0.35, 0);
  s.lineTo(-0.35, 0.55);
  s.lineTo(-0.1, 0);
  s.closePath();
  return s;
}

function formaFlecha() {
  const s = new Shape();
  s.moveTo(1.1, 0);
  s.lineTo(-0.8, 0.85);
  s.lineTo(-0.35, 0);
  s.lineTo(-0.8, -0.85);
  s.closePath();
  return s;
}

/**
 * Ruta de navegación (RF-10): cinta teal sobre el piso, chevrones animados en el sentido de avance y la
 * flecha 3D del conductor. La ruta es una simulación, no una localización en vivo (RN-09).
 */
export function Ruta3D({ ruta, avance, mostrarFlecha }: { ruta: Punto[]; avance: { current: number }; mostrarFlecha: boolean }) {
  const puntos = useMemo(() => ruta.map((p) => [aX(p.x), 0.08, aZ(p.y)] as [number, number, number]), [ruta]);
  const chevron = useMemo(formaChevron, []);
  const flecha = useMemo(formaFlecha, []);
  const total = useMemo(() => longitud(ruta), [ruta]);
  const N = Math.max(4, Math.floor(total / 30));
  const chevronRefs = useRef<(Mesh | null)[]>([]);
  const marcador = useRef<Group>(null);
  const anillo = useRef<Mesh>(null);
  const destino = ruta[ruta.length - 1];
  const yawSuave = useRef<number | null>(null);

  useFrame(({ clock }, dt) => {
    const progreso = avance.current;
    const desfase = (clock.elapsedTime * 0.18) % 1;
    for (let i = 0; i < N; i++) {
      const m = chevronRefs.current[i];
      if (!m) continue;
      const t = (i + desfase) / N;
      const visible = t > progreso + 0.01;
      m.visible = visible;
      if (!visible) continue;
      const p = puntoEn(ruta, t);
      m.position.set(aX(p.x), 0.1, aZ(p.y));
      m.rotation.set(-Math.PI / 2, 0, yawDeRumbo(p.rumbo));
    }
    if (marcador.current) {
      const p = puntoEn(ruta, progreso);
      marcador.current.position.set(aX(p.x), 0.45 + Math.sin(clock.elapsedTime * 3) * 0.08, aZ(p.y));
      // El giro en las esquinas es suave (antes saltaba 90° de golpe).
      const objetivo = yawDeRumbo(p.rumbo);
      yawSuave.current = yawSuave.current === null ? objetivo : girarHacia(yawSuave.current, objetivo, Math.min(1, dt * 6));
      marcador.current.rotation.set(0, yawSuave.current, 0);
    }
    if (anillo.current) {
      const s = 1 + ((clock.elapsedTime * 0.8) % 1) * 1.6;
      anillo.current.scale.set(s, s, s);
      (anillo.current.material as MeshBasicMaterial).opacity = 0.7 * (1 - ((clock.elapsedTime * 0.8) % 1));
    }
  });

  return (
    <group>
      <Line points={puntos} color={COLOR.ruta} lineWidth={7} transparent opacity={0.55} />
      <Line points={puntos} color="#e8fdff" lineWidth={1.6} />
      {Array.from({ length: N }, (_, i) => (
        <mesh key={i} ref={(m) => (chevronRefs.current[i] = m)}>
          <shapeGeometry args={[chevron]} />
          <meshBasicMaterial color="#ffffff" toneMapped={false} />
        </mesh>
      ))}
      {/* Destino */}
      <mesh position={[aX(destino.x), 0.06, aZ(destino.y)]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.7, 32]} />
        <meshBasicMaterial color={COLOR.ruta} toneMapped={false} />
      </mesh>
      {mostrarFlecha && (
        <group ref={marcador}>
          <mesh rotation-x={-Math.PI / 2} position-y={-0.38}>
            <circleGeometry args={[1.25, 32]} />
            <meshBasicMaterial color="#0b2b33" transparent opacity={0.22} depthWrite={false} />
          </mesh>
          <mesh ref={anillo} rotation-x={-Math.PI / 2} position-y={-0.36}>
            <ringGeometry args={[1.0, 1.25, 40]} />
            <meshBasicMaterial color={COLOR.ruta} transparent toneMapped={false} />
          </mesh>
          <mesh rotation-x={-Math.PI / 2} castShadow>
            <extrudeGeometry args={[flecha, { depth: 0.28, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2 }]} />
            <meshStandardMaterial color="#ffffff" emissive={COLOR.ruta} emissiveIntensity={0.6} metalness={0.2} roughness={0.3} />
          </mesh>
        </group>
      )}
    </group>
  );
}
