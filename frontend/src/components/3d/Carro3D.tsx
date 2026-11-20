import { RoundedBox } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group } from 'three';
import { muestrear, type Cuadro } from './escena';

/**
 * Carro procedural (D-26): carrocería redondeada, cabina de vidrio, 4 ruedas y faros.
 * Largo en el eje X local (la trompa mira hacia +X). Medidas en unidades 3D (≈ 1,2 m).
 */
export function ModeloCarro({ color, faros, resaltado }: { color: string; faros: boolean; resaltado?: string }) {
  return (
    <group>
      {/* Sombra simulada: barata y suficiente en celular */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.02}>
        <planeGeometry args={[4.6, 2.3]} />
        <meshBasicMaterial color="#0b2b33" transparent opacity={0.22} depthWrite={false} />
      </mesh>
      <RoundedBox args={[4.2, 0.85, 1.85]} radius={0.32} smoothness={3} position-y={0.62} castShadow>
        <meshStandardMaterial color={color} metalness={0.35} roughness={0.38} />
      </RoundedBox>
      <RoundedBox args={[2.1, 0.62, 1.6]} radius={0.26} smoothness={3} position={[-0.25, 1.24, 0]} castShadow>
        <meshStandardMaterial color="#1d2c33" metalness={0.6} roughness={0.15} />
      </RoundedBox>
      {[1.35, -1.35].map((x) => (
        <mesh key={x} position={[x, 0.36, 0]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[0.36, 0.36, 1.92, 14]} />
          <meshStandardMaterial color="#15191c" roughness={0.8} />
        </mesh>
      ))}
      {faros &&
        [0.6, -0.6].map((z) => (
          <mesh key={z} position={[2.09, 0.72, z]}>
            <boxGeometry args={[0.06, 0.16, 0.42]} />
            <meshStandardMaterial color="#fff6d6" emissive="#fff1c1" emissiveIntensity={2.2} toneMapped={false} />
          </mesh>
        ))}
      {resaltado && (
        <mesh position-y={1.9} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[1.2, 1.5, 32]} />
          <meshBasicMaterial color={resaltado} toneMapped={false} transparent opacity={0.9} />
        </mesh>
      )}
    </group>
  );
}

/** Carro animado: recorre su trayecto (entrada o salida) y luego queda quieto. */
export function CarroAnimado({
  trayecto,
  inicio,
  color,
  faros,
  resaltado,
  alTerminar,
}: {
  trayecto: Cuadro[];
  inicio: number;
  color: string;
  faros: boolean;
  resaltado?: string;
  alTerminar?: () => void;
}) {
  const ref = useRef<Group>(null);
  const terminado = useRef(false);
  useFrame(() => {
    if (!ref.current) return;
    const m = muestrear(trayecto, (performance.now() - inicio) / 1000);
    ref.current.position.set(m.x, 0, m.z);
    ref.current.rotation.y = m.yaw;
    if (m.fin && !terminado.current) {
      terminado.current = true;
      alTerminar?.();
    }
  });
  const p0 = trayecto[0];
  return (
    <group ref={ref} position={[p0.x, 0, p0.z]} rotation-y={p0.yaw}>
      <ModeloCarro color={color} faros={faros} resaltado={resaltado} />
    </group>
  );
}
