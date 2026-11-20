import { Html } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Mesh, MeshBasicMaterial } from 'three';
import { CARRIL, PLANO, RAMPA, type Puesto, type ZonaEnPlano } from '../../lib/plano';
import type { PerfilCalidad } from '../../lib/calidad';
import { CarroAnimado, ModeloCarro } from './Carro3D';
import {
  ANCHO_3D,
  COLOR,
  ESCALA,
  LARGO_3D,
  aX,
  aZ,
  colorCarro,
  trayectoEntrada,
  trayectoSalida,
  yawEstacionado,
  type Cuadro,
} from './escena';

const ALTO_MURO = 1.1;
const COLUMNAS_Y = [200, 420, 640, 860];

interface CarroEnEscena {
  clave: string;
  puesto: Puesto;
  lado: 'izq' | 'der';
  modo: 'estacionado' | 'entrando' | 'saliendo';
  inicio: number;
  trayecto: Cuadro[] | null;
  color: string;
  propio: boolean;
}

const ocupa = (p: Puesto) => p.estado === 'ocupado' || p.estado === 'mi-vehiculo';

/**
 * "4D": compara la ocupación anterior con la nueva. Los puestos que se ocupan reciben un carro que ENTRA por
 * la rampa y se estaciona; los que se liberan ven a su carro SALIR. La primera carga aparece ya estacionada.
 */
function useCarros(plano: ZonaEnPlano[], animar: boolean): [CarroEnEscena[], (clave: string) => void] {
  const [carros, setCarros] = useState<Map<string, CarroEnEscena>>(new Map());
  const primera = useRef(true);

  useEffect(() => {
    setCarros((previos) => {
      const siguiente = new Map(previos);
      const presentes = new Set<string>();
      const ahora = performance.now();
      for (const z of plano) {
        for (const p of z.puestos) {
          if (!ocupa(p)) continue;
          const clave = `${z.zona.idZona}-${p.numero}`;
          presentes.add(clave);
          const previo = siguiente.get(clave);
          const propio = p.estado === 'mi-vehiculo';
          if (previo && previo.modo !== 'saliendo') {
            if (previo.propio !== propio) siguiente.set(clave, { ...previo, propio });
            continue;
          }
          const anima = animar && !primera.current;
          siguiente.set(clave, {
            clave,
            puesto: p,
            lado: z.lado,
            modo: anima ? 'entrando' : 'estacionado',
            inicio: ahora + Math.random() * 400,
            trayecto: anima ? trayectoEntrada(p, z.lado) : null,
            color: colorCarro(clave),
            propio,
          });
        }
      }
      for (const [clave, c] of siguiente) {
        if (presentes.has(clave) || c.modo === 'saliendo') continue;
        if (animar && !primera.current) {
          siguiente.set(clave, { ...c, modo: 'saliendo', inicio: ahora, trayecto: trayectoSalida(c.puesto, c.lado) });
        } else {
          siguiente.delete(clave);
        }
      }
      primera.current = false;
      return siguiente;
    });
  }, [plano, animar]);

  const retirar = (clave: string) =>
    setCarros((m) => {
      const c = m.get(clave);
      if (!c) return m;
      const n = new Map(m);
      if (c.modo === 'saliendo') n.delete(clave);
      else n.set(clave, { ...c, modo: 'estacionado', trayecto: null });
      return n;
    });

  return [[...carros.values()], retirar];
}

function Pulso({ color, ancho, alto, rapido }: { color: string; ancho: number; alto: number; rapido?: boolean }) {
  const ref = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    const m = ref.current?.material as MeshBasicMaterial | undefined;
    if (m) m.opacity = 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(clock.elapsedTime * (rapido ? 12 : 3.2)));
  });
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} position-y={0.04}>
      <planeGeometry args={[ancho, alto]} />
      <meshBasicMaterial color={color} transparent opacity={0.5} toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

function PuestoMesh({
  z,
  p,
  elegido,
  intruso,
  onTocar,
}: {
  z: ZonaEnPlano;
  p: Puesto;
  elegido: boolean;
  intruso: boolean;
  onTocar?: (z: ZonaEnPlano, p: Puesto) => void;
}) {
  const ancho = p.ancho * ESCALA - 0.15;
  const alto = p.alto * ESCALA - 0.15;
  const tocar = (e: ThreeEvent<MouseEvent>) => {
    if (!onTocar || e.delta > 8) return; // fue un arrastre de cámara, no un toque
    e.stopPropagation();
    onTocar(z, p);
  };
  return (
    <group position={[aX(p.cx), 0, aZ(p.cy)]}>
      {/* Área tocable (invisible) */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.03} onClick={tocar}>
        <planeGeometry args={[ancho, alto]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {p.estado === 'retenido' && <Pulso color={COLOR.retenido} ancho={ancho} alto={alto} />}
      {p.estado === 'mio' && <Pulso color={COLOR.mio} ancho={ancho} alto={alto} />}
      {intruso && <Pulso color={COLOR.intruso} ancho={ancho} alto={alto} rapido />}
      {elegido && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.05}>
          <ringGeometry args={[0.8, 1.05, 32]} />
          <meshBasicMaterial color={COLOR.mio} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

function ZonaMesh({
  z,
  calidad,
  seleccion,
  intruso,
  destacada,
  onTocar,
  etiquetas,
}: {
  z: ZonaEnPlano;
  calidad: PerfilCalidad;
  seleccion: number | null;
  intruso: number | null;
  destacada: boolean;
  onTocar?: (z: ZonaEnPlano, p: Puesto) => void;
  etiquetas: boolean;
}) {
  const { bloque, edificio, zona } = z;
  const cx = aX(bloque.x + bloque.ancho / 2);
  const cz = aZ(bloque.y + bloque.alto / 2);
  const w = bloque.ancho * ESCALA + 0.6;
  const l = bloque.alto * ESCALA;
  const neon = destacada ? '#5ff3ff' : COLOR.neon;
  const intensidad = calidad.bloom ? (destacada ? 3.2 : 2.2) : 1;
  return (
    <group>
      {/* Bordillo de marca #083E4D alrededor de la zona */}
      {[
        [cx, cz - l / 2, w + 0.3, 0.3],
        [cx, cz + l / 2, w + 0.3, 0.3],
        [cx - w / 2, cz, 0.3, l],
        [cx + w / 2, cz, 0.3, l],
      ].map(([x, zz, a, b], i) => (
        <group key={i} position={[x, 0, zz]}>
          <mesh position-y={0.09} castShadow={calidad.sombras}>
            <boxGeometry args={[a, 0.18, b]} />
            <meshStandardMaterial color={COLOR.marca} roughness={0.5} />
          </mesh>
          {/* Línea neón (emisiva): brilla con bloom en modo alto */}
          <mesh position-y={0.2}>
            <boxGeometry args={[a === 0.3 ? 0.08 : a, 0.04, b === 0.3 ? 0.08 : b]} />
            <meshStandardMaterial color={neon} emissive={neon} emissiveIntensity={intensidad} toneMapped={false} />
          </mesh>
        </group>
      ))}
      {/* Demarcación blanca reflectiva entre puestos */}
      {z.puestos.map((p) => (
        <mesh key={`l${p.numero}`} position={[aX(p.cx), 0.025, aZ(p.y)]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[p.ancho * ESCALA - 0.4, 0.09]} />
          <meshBasicMaterial color={COLOR.demarcacion} />
        </mesh>
      ))}
      {z.puestos.map((p) => (
        <PuestoMesh
          key={p.numero}
          z={z}
          p={p}
          elegido={seleccion === p.numero}
          intruso={intruso === p.numero}
          onTocar={onTocar}
        />
      ))}
      {/* Núcleo de concreto (ascensores/escaleras) en blanco hueso, con placa de marca */}
      <group position={[aX(edificio.x + edificio.ancho / 2), 0, aZ(edificio.y + edificio.alto / 2)]}>
        <mesh position-y={1.3} castShadow={calidad.sombras} receiveShadow={calidad.sombras}>
          <boxGeometry args={[edificio.ancho * ESCALA, 2.6, edificio.alto * ESCALA]} />
          <meshStandardMaterial color={COLOR.hueso} roughness={0.85} />
        </mesh>
        <mesh position-y={2.63}>
          <boxGeometry args={[edificio.ancho * ESCALA - 0.6, 0.06, edificio.alto * ESCALA - 0.6]} />
          <meshStandardMaterial color={COLOR.marca} roughness={0.6} />
        </mesh>
      </group>
      {etiquetas && (
        <Html position={[aX(edificio.x + edificio.ancho / 2), 3.4, aZ(edificio.y + 30)]} center distanceFactor={40} zIndexRange={[20, 0]} pointerEvents="none">
          <div className={`etiqueta-3d etiqueta-3d--${zona.estado.toLowerCase()} ${destacada ? 'activa' : ''}`}>
            <strong>{zona.codigo.split('-')[1]}</strong>
            <span>{zona.cupoLogico} libres</span>
          </div>
        </Html>
      )}
    </group>
  );
}

/**
 * Un piso del sótano en 3D (artefacto 5.2): losa de concreto, vía central, rampa, columnas, muros bajos de
 * maqueta, zonas con bordillo de marca y línea neón, puestos tocables y carros animados.
 */
export function PisoSotano3D({
  plano,
  codigoPiso,
  calidad,
  seleccion,
  intruso,
  idZonaDestacada,
  onTocarPuesto,
  animarCarros = true,
  etiquetas = true,
}: {
  plano: ZonaEnPlano[];
  codigoPiso: string;
  calidad: PerfilCalidad;
  seleccion?: { idZona: number; numero: number } | null;
  intruso?: { idZona: number; numero: number } | null;
  idZonaDestacada?: number | null;
  onTocarPuesto?: (z: ZonaEnPlano, p: Puesto) => void;
  animarCarros?: boolean;
  etiquetas?: boolean;
}) {
  const [carros, retirar] = useCarros(plano, animarCarros);
  const via = useMemo(
    () => ({ x: aX(CARRIL.x + CARRIL.ancho / 2), ancho: CARRIL.ancho * ESCALA, z0: aZ(RAMPA.alto), z1: aZ(PLANO.alto - 10) }),
    [],
  );
  return (
    <group>
      {/* Losa */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow={calidad.sombras}>
        <planeGeometry args={[ANCHO_3D, LARGO_3D]} />
        <meshStandardMaterial color={COLOR.piso} roughness={0.92} />
      </mesh>
      {/* Vía central con líneas */}
      <mesh rotation-x={-Math.PI / 2} position={[via.x, 0.01, (via.z0 + via.z1) / 2]} receiveShadow={calidad.sombras}>
        <planeGeometry args={[via.ancho, via.z1 - via.z0]} />
        <meshStandardMaterial color={COLOR.via} roughness={0.95} />
      </mesh>
      {Array.from({ length: 22 }, (_, i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[via.x, 0.02, via.z0 + 2 + i * 3.9]}>
          <planeGeometry args={[0.14, 1.8]} />
          <meshBasicMaterial color={COLOR.lineaVia} />
        </mesh>
      ))}
      {/* Rampa de entrada */}
      <mesh position={[via.x, 0.35, aZ(RAMPA.alto / 2)]} rotation-x={-0.12} receiveShadow={calidad.sombras}>
        <boxGeometry args={[via.ancho + 1.6, 0.3, RAMPA.alto * ESCALA]} />
        <meshStandardMaterial color="#9aa3a9" roughness={0.9} />
      </mesh>
      <Html position={[via.x, 1.6, aZ(RAMPA.alto / 2)]} center distanceFactor={26} pointerEvents="none" zIndexRange={[20, 0]}>
        <div className="etiqueta-3d etiqueta-3d--rampa">{codigoPiso === 'S1' ? 'ENTRADA' : `RAMPA ${codigoPiso}`}</div>
      </Html>
      {/* Columnas */}
      {COLUMNAS_Y.flatMap((y) => [CARRIL.x - 3, CARRIL.x + CARRIL.ancho + 3].map((x) => [x, y])).map(([x, y]) => (
        <mesh key={`${x}-${y}`} position={[aX(x), 1.6, aZ(y)]} castShadow={calidad.sombras}>
          <boxGeometry args={[0.9, 3.2, 0.9]} />
          <meshStandardMaterial color={COLOR.hueso} roughness={0.8} />
        </mesh>
      ))}
      {/* Muros bajos y cortados (vista de maqueta) */}
      {[
        [0, -LARGO_3D / 2, ANCHO_3D, 0.4],
        [0, LARGO_3D / 2, ANCHO_3D, 0.4],
        [-ANCHO_3D / 2, 0, 0.4, LARGO_3D],
        [ANCHO_3D / 2, 0, 0.4, LARGO_3D],
      ].map(([x, z, a, b], i) =>
        i === 0 ? null : (
          <mesh key={i} position={[x, ALTO_MURO / 2, z]} castShadow={calidad.sombras} receiveShadow={calidad.sombras}>
            <boxGeometry args={[a, ALTO_MURO, b]} />
            <meshStandardMaterial color={COLOR.muro} roughness={0.9} />
          </mesh>
        ),
      )}
      {plano.map((z) => (
        <ZonaMesh
          key={z.zona.idZona}
          z={z}
          calidad={calidad}
          etiquetas={etiquetas}
          destacada={z.zona.idZona === idZonaDestacada}
          seleccion={seleccion?.idZona === z.zona.idZona ? seleccion.numero : null}
          intruso={intruso?.idZona === z.zona.idZona ? intruso.numero : null}
          onTocar={onTocarPuesto}
        />
      ))}
      {carros.map((c) =>
        c.trayecto ? (
          <CarroAnimado
            key={`${c.clave}-${c.modo}`}
            trayecto={c.trayecto}
            inicio={c.inicio}
            color={c.propio ? COLOR.conductor : c.color}
            faros={calidad.faros}
            alTerminar={() => retirar(c.clave)}
          />
        ) : (
          <group key={c.clave} position={[aX(c.puesto.cx), 0, aZ(c.puesto.cy)]} rotation-y={yawEstacionado(c.lado)}>
            <ModeloCarro color={c.propio ? COLOR.conductor : c.color} faros={false} resaltado={c.propio ? COLOR.mio : undefined} />
          </group>
        ),
      )}
    </group>
  );
}
