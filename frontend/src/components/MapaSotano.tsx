import { useEffect, useMemo, useRef, useState, type PointerEvent as PE } from 'react';
import {
  CARRIL,
  CENTRO_CARRIL,
  PLANO,
  RAMPA,
  chevrones,
  construirPlano,
  longitud,
  puntoEn,
  recorrido,
  rutaHastaPuesto,
  siguienteInstruccion,
  type Puesto,
  type Punto,
  type ZonaEnPlano,
} from '../lib/plano';
import type { Piso, Retencion, Ubicacion, Zona } from '../types';
import { IconoNavegar } from './iconos';

const AZUL = '#1F6BFF';
const ALTO_ESCENA = 540;
const VELOCIDAD = 95; // unidades de plano por segundo (simulación acelerada)
const pts = (r: Punto[]) => r.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
const dos = (n: number) => String(n).padStart(2, '0');

/** Colores "reflectivos" (pintura de alta visibilidad) para identificar cada zona en el piso. */
const REFLECTIVOS = ['#FFD400', '#B6FF00', '#FF8A00', '#00E5FF'];

function Carro({ p, propio }: { p: Puesto; propio?: boolean }) {
  const m = Math.max(3, p.alto * 0.14);
  const w = p.ancho - 14;
  const h = p.alto - m * 2;
  return (
    <g filter="url(#sombra)" pointerEvents="none">
      <rect x={p.x + 7} y={p.y + m} width={w} height={h} rx={h * 0.32} className={propio ? 'carro carro--propio' : 'carro'} />
      <rect x={p.x + 7 + w * 0.56} y={p.y + m + h * 0.16} width={w * 0.2} height={h * 0.68} rx={2} className="carro__vidrio" />
    </g>
  );
}

function ZonaSvg({
  z,
  indice,
  destacada,
  seleccionado,
  onTocarPuesto,
}: {
  z: ZonaEnPlano;
  indice: number;
  destacada: boolean;
  seleccionado: number | null;
  onTocarPuesto: (z: ZonaEnPlano, p: Puesto) => void;
}) {
  const { zona, bloque, edificio } = z;
  const reflectivo = REFLECTIVOS[indice % REFLECTIVOS.length];
  return (
    <g>
      <rect
        x={bloque.x - 3}
        y={bloque.y}
        width={bloque.ancho + 6}
        height={bloque.alto}
        rx={8}
        className={`plano-zona ${destacada ? 'plano-zona--destacada' : ''}`}
      />
      {z.puestos.map((p) => {
        const elegido = seleccionado === p.numero;
        return (
          <g key={p.numero} onClick={() => onTocarPuesto(z, p)} className={p.estado === 'libre' ? 'puesto-tocable' : undefined}>
            <rect
              x={p.x}
              y={p.y}
              width={p.ancho}
              height={p.alto}
              className={`puesto puesto--${p.estado} ${elegido ? 'puesto--elegido' : ''}`}
              style={{ stroke: reflectivo }}
            />
            {(p.estado === 'ocupado' || p.estado === 'mi-vehiculo') && <Carro p={p} propio={p.estado === 'mi-vehiculo'} />}
            {(p.estado === 'mio' || elegido) && (
              <text x={p.cx} y={p.cy + 4} textAnchor="middle" className="puesto__texto" pointerEvents="none">
                P{dos(p.numero)}
              </text>
            )}
          </g>
        );
      })}
      {/* Bloque de concreto (muros, ascensores) con extrusión para el efecto 3D */}
      <rect x={edificio.x} y={edificio.y + 8} width={edificio.ancho} height={edificio.alto} rx={10} className="edificio__base" />
      <rect x={edificio.x} y={edificio.y} width={edificio.ancho} height={edificio.alto} rx={10} className="edificio" />
      <rect x={edificio.x + 8} y={edificio.y + 10} width={edificio.ancho - 16} height={34} rx={9} className="edificio__placa" />
      <text x={edificio.x + edificio.ancho / 2} y={edificio.y + 34} textAnchor="middle" className="edificio__codigo">
        {zona.codigo.split('-')[1]}
      </text>
      <rect x={edificio.x + 8} y={edificio.y + 50} width={edificio.ancho - 16} height={5} rx={2.5} fill={reflectivo} />
      <text x={edificio.x + edificio.ancho / 2} y={edificio.y + 72} textAnchor="middle" className="edificio__cupo">
        {zona.cupoLogico} libres
      </text>
    </g>
  );
}

interface Seleccion {
  zona: Zona;
  puesto: number;
}

/**
 * RF-10 / RF-16: plano ILUSTRATIVO del sótano en perspectiva 3D. El conductor toca un puesto libre para
 * reservarlo (retención temporal simulada de 7 min) y sigue la ruta simulada con flecha hasta llegar.
 */
export function MapaSotano({
  pisos,
  retencion,
  ubicacion,
  iniciarNavegacion,
  onNavegacionIniciada,
  onReservar,
  onLlegar,
  ocupado,
  soloLectura = false,
}: {
  pisos: Piso[];
  retencion: Retencion | null;
  ubicacion: Ubicacion | null;
  iniciarNavegacion: boolean;
  onNavegacionIniciada: () => void;
  onReservar: (idZona: number, puesto: number) => Promise<boolean>;
  onLlegar: (puesto: number) => void;
  ocupado: boolean;
  soloLectura?: boolean;
}) {
  const pisoDe = (idZona?: number) => pisos.find((p) => p.zonas.some((z) => z.idZona === idZona));
  const [idPiso, setIdPiso] = useState((pisoDe(retencion?.idZona) ?? pisoDe(ubicacion?.idZona) ?? pisos[0])?.idPiso);
  const [progreso, setProgreso] = useState<number | null>(null);
  const [seleccion, setSeleccion] = useState<Seleccion | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pan, setPan] = useState(0);
  const arrastre = useRef<{ y: number; pan: number; movido: boolean } | null>(null);
  const raf = useRef<number>();
  const giroCamara = useRef(0);
  const escena = useRef<HTMLDivElement>(null);
  const [anchoEscena, setAnchoEscena] = useState(360);

  useEffect(() => {
    const p = pisoDe(retencion?.idZona);
    if (p) setIdPiso(p.idPiso);
    setProgreso(null);
    setSeleccion(null);
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
        puestoRetencion: retencion?.puesto,
        vehiculo: ubicacion ? { idZona: ubicacion.idZona, puesto: ubicacion.puesto } : undefined,
      }),
    [piso, retencion?.idZona, retencion?.puesto, ubicacion],
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
    const duracion = Math.max(6000, (longitud(destino.ruta) / VELOCIDAD) * 1000);
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
  const instruccion = navegando ? siguienteInstruccion(destino!.ruta, progreso!) : null;

  // ---- Cámara ----
  const ajuste = anchoEscena / PLANO.ancho;
  const escalaVista = 0.92 * ajuste;
  const cosVista = Math.cos((32 * Math.PI) / 180);
  const panMax = Math.max(0, PLANO.alto - 640);
  if (marcador) {
    const delta = ((-marcador.rumbo - giroCamara.current + 540) % 360) - 180;
    giroCamara.current += delta;
  }
  const camara = navegando
    ? `translate(${anchoEscena / 2}px, ${ALTO_ESCENA * 0.8}px) rotateX(52deg) rotateZ(${giroCamara.current.toFixed(1)}deg) ` +
      `scale(${(1.5 * ajuste).toFixed(3)}) translate(${(-marcador!.x).toFixed(1)}px, ${(-marcador!.y).toFixed(1)}px)`
    : `translate(${anchoEscena / 2}px, 10px) rotateX(32deg) scale(${escalaVista.toFixed(3)}) translate(${-PLANO.ancho / 2}px, ${-pan}px)`;

  // Al reservar o cambiar de piso, la vista general se desplaza hacia la zona de interés.
  useEffect(() => {
    if (navegando) return;
    const objetivo = destino?.puesto.y ?? 0;
    setPan(Math.min(panMax, Math.max(0, objetivo - 260)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destino?.puesto.numero, destino?.zona.idZona, idPiso, panMax]);

  // ---- Arrastre para recorrer el sótano (vista general) ----
  function alPresionar(e: PE<HTMLDivElement>) {
    if (navegando) return;
    arrastre.current = { y: e.clientY, pan, movido: false };
  }
  function alMover(e: PE<HTMLDivElement>) {
    const a = arrastre.current;
    if (!a || navegando) return;
    const dy = e.clientY - a.y;
    if (Math.abs(dy) > 6) a.movido = true;
    if (a.movido) setPan(Math.min(panMax, Math.max(0, a.pan - dy / (escalaVista * cosVista))));
  }
  function alSoltar() {
    setTimeout(() => (arrastre.current = null), 0);
  }

  function tocarPuesto(z: ZonaEnPlano, p: Puesto) {
    if (arrastre.current?.movido || navegando || soloLectura) return;
    setAviso(null);
    if (retencion) {
      setAviso('Ya tienes una retención vigente. Cancélala en Inicio para elegir otro puesto.');
      return;
    }
    if (p.estado !== 'libre') {
      setAviso(p.estado === 'retenido' ? 'Ese puesto está retenido por otro conductor.' : 'Ese puesto está ocupado.');
      setSeleccion(null);
      return;
    }
    if (z.zona.cupoLogico <= 0) {
      setAviso(`La zona ${z.zona.codigo} ya no tiene cupo.`);
      return;
    }
    setSeleccion({ zona: z.zona, puesto: p.numero });
  }

  const hoja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (seleccion) hoja.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [seleccion]);

  async function reservar() {
    if (!seleccion) return;
    const ok = await onReservar(seleccion.zona.idZona, seleccion.puesto);
    if (ok) setSeleccion(null);
  }

  return (
    <section className="mapa" aria-labelledby="titulo-mapa">
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
                setSeleccion(null);
              }}
            >
              {p.codigo}
            </button>
          ))}
        </div>
      </div>

      <div
        className={`mapa-escena ${navegando ? 'mapa-escena--navegando' : ''}`}
        ref={escena}
        style={{ height: ALTO_ESCENA }}
        onPointerDown={alPresionar}
        onPointerMove={alMover}
        onPointerUp={alSoltar}
        onPointerLeave={alSoltar}
      >
        <div className="mapa-plano" style={{ transform: camara, width: PLANO.ancho, height: PLANO.alto }}>
          <svg viewBox={`0 0 ${PLANO.ancho} ${PLANO.alto}`} width={PLANO.ancho} height={PLANO.alto} role="img" aria-label={`Plano de ${piso.nombre}`}>
            <defs>
              <filter id="sombra" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="2.5" stdDeviation="2.2" floodColor="#0b2b33" floodOpacity="0.28" />
              </filter>
              <pattern id="asfalto" width="6" height="6" patternUnits="userSpaceOnUse">
                <rect width="6" height="6" fill="#c3c9cc" />
                <circle cx="1.5" cy="1.5" r="0.6" fill="#b7bec2" />
                <circle cx="4.5" cy="4" r="0.5" fill="#cdd3d6" />
              </pattern>
            </defs>
            <rect x="2" y="2" width={PLANO.ancho - 4} height={PLANO.alto - 4} rx="22" className="plano-piso" />
            <rect x={CARRIL.x} y={RAMPA.alto} width={CARRIL.ancho} height={PLANO.alto - RAMPA.alto - 10} className="plano-via" />
            <line x1={CARRIL.x + 2} y1={RAMPA.alto} x2={CARRIL.x + 2} y2={PLANO.alto - 12} className="plano-via__borde" />
            <line
              x1={CARRIL.x + CARRIL.ancho - 2}
              y1={RAMPA.alto}
              x2={CARRIL.x + CARRIL.ancho - 2}
              y2={PLANO.alto - 12}
              className="plano-via__borde"
            />
            <line x1={CENTRO_CARRIL} y1={RAMPA.alto + 10} x2={CENTRO_CARRIL} y2={PLANO.alto - 20} className="plano-via__linea" />
            <rect x={CARRIL.x - 10} y={RAMPA.y + 6} width={CARRIL.ancho + 20} height={RAMPA.alto - 6} rx="10" className="plano-rampa" />
            <text x={CENTRO_CARRIL} y={RAMPA.y + 32} textAnchor="middle" className="plano-rampa__texto">
              {piso.codigo === 'S1' ? 'ENTRADA' : `RAMPA ${piso.codigo}`}
            </text>
            {[200, 420, 640, 860].map((y) => (
              <g key={y}>
                <rect x={CARRIL.x - 8} y={y} width="11" height="11" rx="2" className="columna" filter="url(#sombra)" />
                <rect x={CARRIL.x + CARRIL.ancho - 3} y={y} width="11" height="11" rx="2" className="columna" filter="url(#sombra)" />
              </g>
            ))}
            {plano.map((z, i) => (
              <ZonaSvg
                key={z.zona.idZona}
                z={z}
                indice={i}
                destacada={z.zona.idZona === (retencion?.idZona ?? seleccion?.zona.idZona)}
                seleccionado={seleccion?.zona.idZona === z.zona.idZona ? seleccion.puesto : null}
                onTocarPuesto={tocarPuesto}
              />
            ))}
            {destino && (
              <>
                <polyline points={pts(destino.ruta)} className="ruta" stroke={AZUL} />
                {navegando && <polyline points={pts(recorrido(destino.ruta, progreso!))} className="ruta ruta--recorrida" />}
                {(navegando ? chevrones(destino.ruta, progreso!) : chevrones(destino.ruta, 0, 46)).map((c, i) => (
                  <path key={i} d="M-5,3 L0,-3 L5,3" className="ruta__flecha" transform={`translate(${c.x},${c.y}) rotate(${c.rumbo})`} />
                ))}
                <circle cx={destino.puesto.cx} cy={destino.puesto.cy} r="7" fill={AZUL} stroke="#fff" strokeWidth="2.5" />
              </>
            )}
            {navegando && instruccion?.punto && !llego && (
              <g transform={`translate(${instruccion.punto.x},${instruccion.punto.y}) rotate(${-giroCamara.current}) translate(0,-26)`}>
                <rect x="-20" y="-11" width="40" height="22" rx="7" className="chip-distancia" />
                <text y="4" textAnchor="middle" className="chip-distancia__texto">
                  {instruccion.metros} m
                </text>
              </g>
            )}
            {marcador && (
              <g transform={`translate(${marcador.x},${marcador.y})`}>
                {!llego && <circle r="20" className="marcador__pulso" />}
                <ellipse cx="0" cy="5" rx="15" ry="6" fill="#0b2b33" opacity="0.2" />
                <circle r="15" fill={AZUL} stroke="#fff" strokeWidth="3.5" />
                <path d="M0,-7 L6,5 L0,2 L-6,5 Z" fill="#fff" transform={`rotate(${marcador.rumbo})`} />
              </g>
            )}
          </svg>
        </div>

        {navegando && (
          <div className="hud" role="status">
            <span className="hud__icono">
              <IconoNavegar size={18} />
            </span>
            {llego ? (
              <span>
                Llegaste a <strong>{destino!.zona.codigo}</strong> · Puesto {dos(destino!.puesto.numero)}
              </span>
            ) : (
              <span>
                <strong>{instruccion!.texto}</strong> en {instruccion!.metros} m
                <br />
                <small>
                  Destino {destino!.zona.codigo} · P{dos(destino!.puesto.numero)}
                </small>
              </span>
            )}
          </div>
        )}
        {!navegando && !soloLectura && !retencion && !seleccion && (
          <p className="mapa__pista">Toca un puesto libre para reservarlo · arrastra para recorrer el sótano</p>
        )}
      </div>

      {aviso && (
        <p className="mapa__aviso" role="alert">
          {aviso}
        </p>
      )}

      {seleccion && !retencion && (
        <div className="hoja" role="dialog" aria-labelledby="titulo-hoja" ref={hoja}>
          <div className="hoja__fila">
            <div>
              <p className="etiqueta">Puesto libre</p>
              <h3 id="titulo-hoja" className="hoja__titulo">
                {seleccion.zona.codigo} · P{dos(seleccion.puesto)}
              </h3>
              <p className="texto-suave texto-chico">
                {piso.nombre} · {seleccion.zona.nombre.replace(/^Zona \w — /, '')}
              </p>
            </div>
            <div className="hoja__dato">
              <strong>7:00</strong>
              <span>min de retención</span>
            </div>
          </div>
          <div className="hoja__acciones">
            <button type="button" className="boton boton--secundario" onClick={() => setSeleccion(null)}>
              Cancelar
            </button>
            <button type="button" className="boton" disabled={ocupado} onClick={reservar}>
              Reservar 7 min
            </button>
          </div>
          <p className="nota">Retención temporal simulada: no garantiza el cupo físico.</p>
        </div>
      )}

      <div className="mapa__acciones">
        {destino && !navegando && (
          <button type="button" className="boton boton--grande" onClick={navegar}>
            <IconoNavegar size={18} /> Ir a {destino.zona.codigo} · P{dos(destino.puesto.numero)}
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
      </div>

      <ul className="leyenda" aria-label="Convenciones del plano">
        <li>
          <span className="leyenda__muestra leyenda__muestra--libre" /> Libre
        </li>
        <li>
          <span className="leyenda__muestra leyenda__muestra--carro" /> Ocupado
        </li>
        <li>
          <span className="leyenda__muestra leyenda__muestra--retenido" /> Retenido
        </li>
        <li>
          <span className="leyenda__muestra leyenda__muestra--mio" /> Tu puesto
        </li>
      </ul>
      <p className="nota">
        Plano ilustrativo de referencia: no es el plano oficial del centro comercial ni muestra tu posición en vivo. La ruta y
        la flecha son una simulación.
      </p>
    </section>
  );
}
