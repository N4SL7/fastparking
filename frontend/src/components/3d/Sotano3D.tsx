import { MapControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { Suspense, useEffect, useRef, type ReactNode } from 'react';
import { Vector3 } from 'three';
import type { MapControls as MapControlsImpl } from 'three-stdlib';
import type { PerfilCalidad } from '../../lib/calidad';
import { puntoEn, type Punto } from '../../lib/plano';
import { COLOR, aX, aZ } from './escena';
import { yawDeRumbo } from './Ruta3D';

/** Luces y posprocesado según la calidad (5.4). */
export function Ambiente({ calidad, niebla = true }: { calidad: PerfilCalidad; niebla?: boolean }) {
  return (
    <>
      <color attach="background" args={[COLOR.fondo]} />
      {niebla && <fog attach="fog" args={[COLOR.fondo, 80, 170]} />}
      <hemisphereLight args={['#ffffff', '#8a949b', 1.15]} />
      <directionalLight
        position={[22, 40, 18]}
        intensity={1.5}
        castShadow={calidad.sombras}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
        shadow-bias={-0.0004}
      />
      {calidad.bloom && (
        <EffectComposer multisampling={0}>
          <Bloom intensity={0.9} luminanceThreshold={1} luminanceSmoothing={0.2} mipmapBlur />
        </EffectComposer>
      )}
    </>
  );
}

/** Lienzo 3D común a la app del conductor y a /simulacion. */
export function Lienzo3D({
  calidad,
  children,
  alto,
  niebla = true,
}: {
  calidad: PerfilCalidad;
  children: ReactNode;
  alto?: number | string;
  niebla?: boolean;
}) {
  return (
    <div className="lienzo-3d" style={{ height: alto }}>
      <Canvas
        shadows={calidad.sombras}
        dpr={calidad.dpr}
        gl={{ antialias: calidad.antialias, powerPreference: 'high-performance' }}
        camera={{ fov: 42, near: 0.5, far: 400, position: [0, 38, 40] }}
      >
        <Suspense fallback={null}>
          <Ambiente calidad={calidad} niebla={niebla} />
          {children}
        </Suspense>
      </Canvas>
    </div>
  );
}

/**
 * Cámara de vista general: el conductor arrastra para recorrer el sótano, pellizca para acercar e inclina
 * con dos dedos. Al cambiar el foco (puesto reservado), la cámara se desliza hasta él.
 */
export function CamaraGeneral({ foco, distancia = 44 }: { foco: [number, number]; distancia?: number }) {
  const controles = useRef<MapControlsImpl>(null);
  const { camera } = useThree();
  const objetivo = useRef(new Vector3(foco[0], 0, foco[1]));
  const animando = useRef(true);

  useEffect(() => {
    objetivo.current.set(foco[0], 0, foco[1]);
    animando.current = true;
  }, [foco[0], foco[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame(() => {
    const c = controles.current;
    if (!c || !animando.current) return;
    const delta = objetivo.current.clone().sub(c.target);
    if (delta.length() < 0.05) {
      animando.current = false;
      return;
    }
    const paso = delta.multiplyScalar(0.08);
    c.target.add(paso);
    camera.position.add(paso);
    c.update();
  });

  useEffect(() => {
    camera.position.set(foco[0] + 2, distancia * 0.95, foco[1] + distancia * 0.75);
    camera.lookAt(foco[0], 0, foco[1]);
    controles.current?.target.set(foco[0], 0, foco[1]);
    controles.current?.update();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <MapControls
      ref={controles}
      makeDefault
      enableDamping
      dampingFactor={0.12}
      screenSpacePanning={false}
      minDistance={12}
      maxDistance={110}
      minPolarAngle={0.25}
      maxPolarAngle={1.2}
      onStart={() => (animando.current = false)}
    />
  );
}

/** Cámara de navegación: sigue a la flecha por detrás y por encima, como un GPS (RF-10). */
export function CamaraSeguimiento({ ruta, progreso }: { ruta: Punto[]; progreso: number }) {
  const { camera } = useThree();
  const mirar = useRef(new Vector3());
  useFrame(() => {
    const p = puntoEn(ruta, progreso);
    const yaw = yawDeRumbo(p.rumbo);
    const dir = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const pos = new Vector3(aX(p.x), 0, aZ(p.y));
    const deseada = pos.clone().addScaledVector(dir, -11).add(new Vector3(0, 10.5, 0));
    camera.position.lerp(deseada, 0.06);
    mirar.current.lerp(pos.clone().addScaledVector(dir, 5), 0.08);
    camera.lookAt(mirar.current);
  });
  return null;
}
