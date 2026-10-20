import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CARRIL,
  CENTRO_CARRIL,
  PLANO,
  RAMPA,
  construirPlano,
  longitud,
  puntoEn,
  recorrido,
  rutaHastaPuesto,
  type Punto,
  type ZonaEnPlano,
} from '../lib/plano';
import type { Piso, Retencion, Ubicacion } from '../types';
import { IconoNavegar } from './iconos';
import { EtiquetaEstado } from './ui';

const AZUL = '#1F6BFF';
const ALTO_ESCENA = 560;
const VELOCIDAD = 95; // unidades de plano por segundo (≈ 11 m/s en la simulación acelerada)
const pts = (r: Punto[]) => r.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

function Carro({ x, y, ancho, alto, propio }: { x: number; y: number; ancho: number; alto: number; propio?: boolean }) {
  const m = Math.max(3, alto * 0.14);
  const w = ancho - 14;
  const h = alto - m * 2;
  return (
    <g filter="url(#sombra)">
      <rect x={x + 7} y={y + m} width={w} height={h} rx={h * 0.32} className={propio ? 'carro carro--propio' : 'carro'} />
      <rect x={x + 7 + w * 0.56} y={y + m + h * 0.16} width={w * 0.2} height={h * 0.68} rx={2} className="carro__vidrio" />
    </g>
  );
}

function ZonaSvg({ z, destacada }: { z: ZonaEnPlano; destacada: boolean }) {
  const { zona, bloque, edificio, lado } = z;
  return (
    <g>
      <rect
        x={bloque.x - 2}
        y={bloque.y}
        width={bloque.ancho + 4}
        height={bloque.alto}
        rx={8}
        className={`plano-zona plano-zona--${zona.estado.toLowerCase()} ${destacada ? 'plano-zona--destacada' : ''}`}
      />
      {z.puestos.map((p) => (
        <g key={p.numero}>
          <rect x={p.x} y={p.y} width={p.ancho} height={p.alto} className={`puesto puesto--${p.estado}`} />
          {(p.estado === 'ocupado' || p.estado === 'mi-vehiculo') && (
            <Carro x={p.x} y={p.y} ancho={p.ancho} alto={p.alto} propio={p.estado === 'mi-vehiculo'} />
          )}
          {p.estado === 'mio' && (
            <text x={p.cx} y={p.cy + 4} textAnchor="middle" className="puesto__texto">
              P{String(p.numero).padStart(2, '0')}
            </text>
          )}
        </g>
      ))}
      {/* Bloque tipo "edificio" (muros, ascensores) con extrusión para el efecto 3D */}
      <rect x={edificio.x} y={edificio.y + 7} width={edificio.ancho} height={edificio.alto} rx={10} className="edificio__base" />
      <rect x={edificio.x} y={edificio.y} width={edificio.ancho} height={edificio.alto} rx={10} className="edificio" />
      <text
        x={edificio.x + edificio.ancho / 2}
        y={edificio.y + 34}
        textAnchor="middle"
        className="edificio__codigo"
      >
        {zona.codigo.split('-')[1]}
      </text>
      <text x={edificio.x + edificio.ancho / 2} y={edificio.y + 54} textAnchor="middle" className="edificio__cupo">
        {zona.cupoLogico} libres
      </text>
      <text
        transform={`translate(${edificio.x + edificio.ancho / 2},${edificio.y + edificio.alto / 2 + 40}) rotate(${lado === 'izq' ? -90 : 90})`}
        textAnchor="middle"
        className="edificio__nombre"
      >
        {zona.nombre.replace(/^Zona \w — /, '')}
      </text>
    </g>
  );
}

/**
 * RF-10 / RF-16: plano ilustrativo del sótano con perspectiva 3D, ocupación por zona,
 * ruta de referencia y navegación SIMULADA con flecha hasta el puesto.
 */
export function MapaSotano({
  pisos,
  retencion,
  ubicacion,
  iniciarNavegacion,
  onNavegacionIniciada,
  onLlegar,
  ocupado,
}: {
  pisos: Piso[];
  retencion: Retencion | null;
  ubicacion: Ubicacion | null;
  iniciarNavegacion: boolean;
  onNavegacionIniciada: () => void;
  onLlegar: (puesto: number) => void;
  ocupado: boolean;
}) {
  const pisoDe = (idZona?: number) => pisos.find((p) => p.zonas.some((z) => z.idZona === idZona));
  const pisoInicial = pisoDe(retencion?.idZona) ?? pisoDe(ubicacion?.idZona) ?? pisos[0];
  const [idPiso, setIdPiso] = useState(pisoInicial?.idPiso);
  const [progreso, setProgreso] = useState<number | null>(null); // null = sin navegar
  const raf = useRef<number>();
  const giroCamara = useRef(0);
  const escena = useRef<HTMLDivElement>(null);
  const [anchoEscena, setAnchoEscena] = useState(360);

  // Al aparecer una retención, el mapa salta a su piso.
  useEffect(() => {
    const p = pisoDe(retencion?.idZona);
    if (p) setIdPiso(p.idPiso);
    setProgreso(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retencion?.idRetencion]);

  useEffect(() => {
    const el = escena.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAnchoEscena(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const piso = pisos.find((p) => p.idPiso === idPiso) ?? pisos[0];
  const plano = useMemo(
    () =>
      construirPlano(piso.zonas, {
        idZonaRetencion: retencion?.idZona,
        vehiculo: ubicacion ? { idZona: ubicacion.idZona, puesto: ubicacion.puesto } : undefined,
      }),
    [piso, retencion?.idZona, ubicacion],
  );

  const destino = useMemo(() => {
    for (const z of plano) {
      const p = z.puestos.find((x) => x.estado === 'mio');
      if (p) return { puesto: p, ruta: rutaHastaPuesto(p, z.lado), zona: z.zona };
    }
    return null;
  }, [plano]);

  function navegar() {
    if (!destino) return;
    cancelAnimationFrame(raf.current!);
    const duracion = Math.max(5000, (longitud(destino.ruta) / VELOCIDAD) * 1000);
    escena.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const inicio = performance.now();
    const paso = (ahora: number) => {
      const t = Math.min(1, (ahora - inicio) / duracion);
      setProgreso(t);
      if (t < 1) raf.current = requestAnimationFrame(paso);
    };
    raf.current = requestAnimationFrame(paso);
  }
  useEffect(() => () => cancelAnimationFrame(raf.current!), []);

  // Navegación pedida desde el panel de retención.
  useEffect(() => {
    if (iniciarNavegacion && destino) {
      onNavegacionIniciada();
      navegar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iniciarNavegacion, destino]);

  const navegando = progreso !== null && destino !== null;
  const marcador = navegando ? puntoEn(destino!.ruta, progreso!) : null;
  const llego = navegando && progreso! >= 1;
  const metrosRestantes = navegando ? Math.round(longitud(destino!.ruta) * (1 - progreso!) * PLANO.metrosPorUnidad) : 0;

  // Cámara: vista general inclinada, o seguimiento de la flecha (estilo navegación).
  // La transformación lleva el punto de interés del plano (la flecha, o el borde superior en la vista general)
  // a un punto fijo de la pantalla y gira el plano alrededor de él: lo que está adelante se aleja (efecto 3D).
  const ajuste = anchoEscena / PLANO.ancho;
  // El mapa gira para que la dirección de avance quede siempre "hacia arriba" (como un navegador GPS).
  // Se elige el giro equivalente más cercano al anterior para que la transición no dé la vuelta larga.
  if (marcador) {
    const objetivo = -marcador.rumbo;
    const delta = ((objetivo - giroCamara.current + 540) % 360) - 180;
    giroCamara.current += delta;
  }
  const camara = navegando
    ? `translate(${anchoEscena / 2}px, ${ALTO_ESCENA * 0.8}px) rotateX(52deg) rotateZ(${giroCamara.current.toFixed(1)}deg) scale(${(1.5 * ajuste).toFixed(3)}) ` +
      `translate(${(-marcador!.x).toFixed(1)}px, ${(-marcador!.y).toFixed(1)}px)`
    : `translate(${anchoEscena / 2}px, 14px) rotateX(34deg) scale(${(0.58 * ajuste).toFixed(3)}) translate(${-PLANO.ancho / 2}px, 0px)`;

  return (
    <section className="tarjeta mapa" aria-labelledby="titulo-mapa">
      <div className="mapa__cabecera">
        <div>
          <p className="etiqueta">Plano ilustrativo · simulación</p>
          <h2 id="titulo-mapa" className="titulo-seccion">
            {piso.nombre}
          </h2>
        </div>
        <div className="segmentado" role="tablist" aria-label="Piso del mapa">
          {pisos.map((p) => (
            <button
              key={p.idPiso}
              type="button"
              role="tab"
              aria-selected={p.idPiso === piso.idPiso}
              className={p.idPiso === piso.idPiso ? 'activo' : ''}
              onClick={() => {
                setIdPiso(p.idPiso);
                setProgreso(null);
              }}
            >
              {p.codigo}
            </button>
          ))}
        </div>
      </div>

      <div className={`mapa-escena ${navegando ? 'mapa-escena--navegando' : ''}`} ref={escena} style={{ height: ALTO_ESCENA }}>
        <div className="mapa-plano" style={{ transform: camara, width: PLANO.ancho, height: PLANO.alto }}>
          <svg viewBox={`0 0 ${PLANO.ancho} ${PLANO.alto}`} width={PLANO.ancho} height={PLANO.alto} role="img" aria-label={`Plano de ${piso.nombre}`}>
            <defs>
              <filter id="sombra" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="2.5" stdDeviation="2.2" floodColor="#0b2b33" floodOpacity="0.22" />
              </filter>
            </defs>
            <rect x="2" y="2" width={PLANO.ancho - 4} height={PLANO.alto - 4} rx="22" className="plano-piso" />
            {/* Vía central */}
            <rect x={CARRIL.x} y={RAMPA.alto} width={CARRIL.ancho} height={PLANO.alto - RAMPA.alto - 10} className="plano-via" />
            <line x1={CENTRO_CARRIL} y1={RAMPA.alto + 10} x2={CENTRO_CARRIL} y2={PLANO.alto - 20} className="plano-via__linea" />
            {/* Rampa de entrada */}
            <rect x={CARRIL.x - 10} y={RAMPA.y + 6} width={CARRIL.ancho + 20} height={RAMPA.alto - 6} rx="10" className="plano-rampa" />
            <text x={CENTRO_CARRIL} y={RAMPA.y + 30} textAnchor="middle" className="plano-rampa__texto">
              {piso.codigo === 'S1' ? 'ENTRADA' : `RAMPA ${piso.codigo}`}
            </text>
            {/* Columnas estructurales */}
            {[200, 420, 640, 860].map((y) => (
              <g key={y}>
                <rect x={CARRIL.x - 7} y={y} width="10" height="10" rx="2" className="columna" filter="url(#sombra)" />
                <rect x={CARRIL.x + CARRIL.ancho - 3} y={y} width="10" height="10" rx="2" className="columna" filter="url(#sombra)" />
              </g>
            ))}
            {plano.map((z) => (
              <ZonaSvg key={z.zona.idZona} z={z} destacada={z.zona.idZona === retencion?.idZona} />
            ))}
            {destino && (
              <>
                <polyline points={pts(destino.ruta)} className="ruta" stroke={AZUL} />
                {navegando && <polyline points={pts(recorrido(destino.ruta, progreso!))} className="ruta ruta--recorrida" />}
                <circle cx={destino.ruta[destino.ruta.length - 1].x} cy={destino.puesto.cy} r="6" fill={AZUL} />
              </>
            )}
            {marcador && (
              <g transform={`translate(${marcador.x},${marcador.y})`}>
                {!llego && <circle r="20" className="marcador__pulso" />}
                <ellipse cx="0" cy="5" rx="15" ry="6" fill="#0b2b33" opacity="0.18" />
                <circle r="15" fill={AZUL} stroke="#fff" strokeWidth="3.5" />
                <path d="M0,-7 L6,5 L0,2 L-6,5 Z" fill="#fff" transform={`rotate(${marcador.rumbo})`} />
              </g>
            )}
          </svg>
        </div>

        {navegando && (
          <div className="hud" role="status">
            <IconoNavegar size={18} />
            {llego ? (
              <span>
                Llegaste a <strong>{destino!.zona.codigo}</strong> · Puesto {String(destino!.puesto.numero).padStart(2, '0')}
              </span>
            ) : (
              <span>
                {metrosRestantes} m · hacia <strong>{destino!.zona.codigo}</strong> · Puesto {String(destino!.puesto.numero).padStart(2, '0')}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="mapa__acciones">
        {destino && !navegando && (
          <button type="button" className="boton boton--grande" onClick={navegar}>
            <IconoNavegar size={18} /> Iniciar ruta simulada a {destino.zona.codigo}
          </button>
        )}
        {llego && (
          <>
            <button type="button" className="boton boton--grande" disabled={ocupado} onClick={() => onLlegar(destino!.puesto.numero)}>
              Confirmar que estacioné aquí
            </button>
            <button type="button" className="boton boton--secundario" onClick={navegar}>
              Repetir ruta
            </button>
          </>
        )}
        {!destino && !retencion && (
          <p className="texto-suave texto-centro">Retén una zona en Inicio para ver la ruta y navegar hasta tu puesto.</p>
        )}
      </div>

      <ul className="leyenda" aria-label="Convenciones del plano">
        <li>
          <span className="leyenda__muestra puesto--libre" /> Libre
        </li>
        <li>
          <span className="leyenda__muestra leyenda__muestra--carro" /> Ocupado
        </li>
        <li>
          <span className="leyenda__muestra puesto--retenido" /> Retenido
        </li>
        <li>
          <span className="leyenda__muestra puesto--mio" /> Tu puesto
        </li>
      </ul>
      <div className="mapa__zonas">
        {plano.map((z) => (
          <span key={z.zona.idZona} className="chip">
            {z.zona.codigo} <EtiquetaEstado estado={z.zona.estado} />
          </span>
        ))}
      </div>
      <p className="nota">
        Plano ilustrativo de referencia: no es el plano oficial del centro comercial ni muestra tu posición en vivo. La ruta y
        el movimiento de la flecha son una simulación.
      </p>
    </section>
  );
}
