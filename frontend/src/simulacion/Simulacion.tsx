import { OrbitControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { PisoSotano3D } from '../components/3d/PisoSotano3D';
import { Ruta3D } from '../components/3d/Ruta3D';
import { CarroConductor } from '../components/3d/CarroConductor';
import { Lienzo3D } from '../components/3d/Sotano3D';
import { detectarCalidad } from '../lib/calidad';
import { construirPlano, rutaHastaPuesto, type ZonaEnPlano } from '../lib/plano';
import { qrComoPath } from '../lib/qr';
import type { Disponibilidad, EstadoDemo } from '../types';
import { pedirDemo } from './demoApi';

const CERO = { current: 0 };
const SEPARACION = 46; // distancia entre pisos en la vista general (unidades 3D)
const VELOCIDADES = [
  { texto: '1×', ms: 6000 },
  { texto: '2×', ms: 3000 },
  { texto: '5×', ms: 1200 },
];
/** Conductores de FastParking en camino (puestos retenidos) con su ruta desde la rampa. */
function conductoresDe(plano: ZonaEnPlano[]) {
  const lista: { clave: string; ruta: ReturnType<typeof rutaHastaPuesto>; centro: { x: number; y: number } }[] = [];
  for (const z of plano) {
    z.puestos
      .filter((p) => p.estado === 'mio')
      .forEach((p, i) => lista.push({ clave: `${z.zona.idZona}-${i}`, ruta: rutaHastaPuesto(p, z.lado), centro: { x: p.cx, y: p.cy } }));
  }
  return lista;
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const dos = (n: number | null) => String(n ?? 0).padStart(2, '0');

type Vista = 'general' | number; // número = índice del piso

function Camara({ vista, pisos }: { vista: Vista; pisos: number }) {
  const { camera } = useThree();
  const x = vista === 'general' ? 0 : (vista - (pisos - 1) / 2) * SEPARACION;
  useEffect(() => {
    if (vista === 'general') camera.position.set(0, 120, 112);
    else camera.position.set(x + 4, 78, 72);
    camera.lookAt(x, 0, 0);
  }, [vista, x, camera]);
  return <OrbitControls key={String(vista)} target={[x, 0, 0]} enableDamping maxPolarAngle={1.25} minDistance={14} maxDistance={190} makeDefault />;
}

/**
 * Modo simulación para iPad (artefacto 5.3, RF-20): el parqueadero completo en 3D con tráfico aleatorio,
 * botón "Carro intruso" y registro en vivo de las decisiones del agente LLM. El celular del conductor ve
 * la misma ocupación porque el tráfico corre en el servidor (D-24).
 */
export function Simulacion() {
  const calidad = useMemo(detectarCalidad, []);
  const [datos, setDatos] = useState<Disponibilidad | null>(null);
  const [demo, setDemo] = useState<EstadoDemo | null>(null);
  const [vista, setVista] = useState<Vista>('general');
  const [pin, setPin] = useState(() => {
    try {
      return sessionStorage.getItem('fp-demo-pin') ?? '';
    } catch {
      return '';
    }
  });
  const [desbloqueado, setDesbloqueado] = useState(false);
  const [mensaje, setMensaje] = useState<{ texto: string; tipo: 'ok' | 'error' } | null>(null);
  const [intrusos, setIntrusos] = useState<Map<number, number>>(new Map()); // idZona → puesto que parpadea
  const previos = useRef<Map<string, string>>(new Map());

  const cargarZonas = useCallback(async () => {
    try {
      const d = await api.zonas();
      // Detecta carros intrusos: un puesto RETENIDO que pasó a OCUPADO.
      const nuevos = new Map<number, number>();
      for (const p of d.pisos)
        for (const z of p.zonas)
          for (const pu of z.puestos ?? []) {
            const clave = `${z.idZona}-${pu.numero}`;
            if (previos.current.get(clave) === 'RETENIDO' && pu.estado === 'OCUPADO') nuevos.set(z.idZona, pu.numero);
            previos.current.set(clave, pu.estado);
          }
      if (nuevos.size) {
        setIntrusos(nuevos);
        setTimeout(() => setIntrusos(new Map()), 5000);
      }
      setDatos(d);
    } catch {
      /* el sondeo vuelve a intentar */
    }
  }, []);

  const cargarDemo = useCallback(async () => {
    try {
      setDemo(await pedirDemo<EstadoDemo>('/api/demo/estado'));
    } catch {
      /* sin conexión: se reintenta */
    }
  }, []);

  useEffect(() => {
    cargarZonas();
    cargarDemo();
    const sondeo = setInterval(() => {
      cargarZonas();
      cargarDemo();
    }, 10_000);
    const fuente = new EventSource('/api/events/stream');
    fuente.addEventListener('zonas', () => cargarZonas());
    fuente.addEventListener('agente', () => cargarDemo());
    fuente.addEventListener('trafico', () => cargarDemo());
    return () => {
      clearInterval(sondeo);
      fuente.close();
    };
  }, [cargarZonas, cargarDemo]);

  useEffect(() => {
    if (pin) desbloquear(pin, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function desbloquear(valor: string, silencioso = false) {
    try {
      await pedirDemo('/api/demo/pin', { method: 'POST' }, valor);
      setDesbloqueado(true);
      setPin(valor);
      try {
        sessionStorage.setItem('fp-demo-pin', valor);
      } catch {
        /* almacenamiento no disponible */
      }
    } catch (e) {
      setDesbloqueado(false);
      if (!silencioso) avisar((e as Error).message, 'error');
    }
  }

  function avisar(texto: string, tipo: 'ok' | 'error' = 'ok') {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje(null), 6000);
  }

  async function trafico(activo: boolean, intervaloMs?: number) {
    try {
      await pedirDemo('/api/demo/trafico', { method: 'POST', body: JSON.stringify({ activo, intervaloMs }) }, pin);
      await cargarDemo();
    } catch (e) {
      avisar((e as Error).message, 'error');
    }
  }

  async function intruso() {
    try {
      const r = await pedirDemo<{ conflictos: { mensaje: string; motor: string }[] }>('/api/demo/intruso', { method: 'POST', body: '{}' }, pin);
      const c = r.conflictos[0];
      avisar(c ? `Agente (${c.motor}): ${c.mensaje}` : 'El intruso ocupó el puesto.', 'ok');
      await Promise.all([cargarZonas(), cargarDemo()]);
    } catch (e) {
      avisar((e as Error).message, 'error');
    }
  }

  const pisos = datos?.pisos ?? [];
  const planos = useMemo(
    () =>
      pisos.map((p) => {
        // En la simulación, los puestos retenidos por conductores de FastParking brillan en teal ("en camino").
        const plano: ZonaEnPlano[] = construirPlano(p.zonas).map((z) => ({
          ...z,
          puestos: z.puestos.map((pu) => (pu.estado === 'retenido' ? { ...pu, estado: 'mio' as const } : pu)),
        }));
        return { piso: p, plano };
      }),
    [pisos],
  );

  const conectados = pisos.flatMap((p) =>
    p.zonas.flatMap((z) => (z.puestos ?? []).filter((pu) => pu.estado === 'RETENIDO').map((pu) => `${z.codigo}-${dos(pu.numero)}`)),
  );
  const libresPorPiso = pisos.map((p) => ({ codigo: p.codigo, libres: p.zonas.reduce((s, z) => s + z.cupoLogico, 0) }));
  const enlaceApp = `${window.location.origin}/`;
  const qr = useMemo(() => qrComoPath(enlaceApp), [enlaceApp]);
  const velocidadActual = VELOCIDADES.find((v) => v.ms === demo?.trafico.intervaloMs)?.texto;

  return (
    <div className="sim">
      <header className="sim__barra">
        <div className="sim__marca">
          <span className="sim__logo">P</span>
          <div>
            <strong>FastParking</strong>
            <small>Simulación en vivo · Parque La Colina (ilustrativo)</small>
          </div>
        </div>
        <div className="sim__chips">
          {libresPorPiso.map((p) => (
            <span key={p.codigo} className="sim__chip">
              {p.codigo} <b>{p.libres}</b> libres
            </span>
          ))}
          <span className={`sim__chip sim__chip--${demo?.agente.motor === 'LLM' ? 'llm' : 'reglas'}`}>
            Agente: {demo?.agente.motor === 'LLM' ? `LLM · ${demo.agente.modelo}` : 'Reglas (sin LLM)'}
          </span>
          {demo?.trafico.activo && <span className="sim__chip sim__chip--vivo">● Tráfico {velocidadActual ?? ''}</span>}
        </div>
      </header>

      <div className="sim__cuerpo">
        <div className="sim__escena">
          <Lienzo3D calidad={calidad} alto="100%" niebla={false}>
            {planos.map(({ piso, plano }, i) => {
              const x = (i - (planos.length - 1) / 2) * SEPARACION;
              const visible = vista === 'general' || vista === i;
              if (!visible) return null;
              return (
                <group key={piso.idPiso} position={[x, 0, 0]}>
                  <PisoSotano3D
                    plano={plano}
                    codigoPiso={piso.codigo}
                    calidad={calidad}
                    intruso={(() => {
                      for (const z of plano) if (intrusos.has(z.zona.idZona)) return { idZona: z.zona.idZona, numero: intrusos.get(z.zona.idZona)! };
                      return null;
                    })()}
                    etiquetas={vista !== 'general' || calidad.nivel === 'alto'}
                  />
                  {plano.flatMap((z) =>
                    z.puestos
                      .filter((p) => p.estado === 'mio')
                      .map((p) => <Ruta3D key={`${z.zona.idZona}-${p.numero}`} ruta={rutaHastaPuesto(p, z.lado)} avance={CERO} mostrarFlecha={false} />),
                  )}
                  {/* Un carro vinotinto por conductor de FastParking: lleva su propia key estable por zona para
                      que, al ser reasignado dentro de la zona, gire y continúe desde donde iba. */}
                  {conductoresDe(plano).map((c) => (
                    <CarroConductor key={c.clave} ruta={c.ruta} centro={c.centro} faros={calidad.faros} />
                  ))}
                </group>
              );
            })}
            <Camara vista={vista} pisos={planos.length} />
          </Lienzo3D>
          <div className="sim__vistas" role="tablist" aria-label="Vista">
            <button type="button" className={vista === 'general' ? 'activo' : ''} onClick={() => setVista('general')}>
              Vista general
            </button>
            {pisos.map((p, i) => (
              <button key={p.idPiso} type="button" className={vista === i ? 'activo' : ''} onClick={() => setVista(i)}>
                {p.codigo}
              </button>
            ))}
          </div>
          {vista === 'general' && (
            <div className="sim__rotulos">
              {pisos.map((p) => (
                <span key={p.idPiso}>{p.nombre}</span>
              ))}
            </div>
          )}
          {mensaje && <div className={`sim__mensaje sim__mensaje--${mensaje.tipo}`}>{mensaje.texto}</div>}
        </div>

        <aside className="sim__panel">
          <section className="sim__tarjeta">
            <h2>Controles de la demo</h2>
            {!demo?.controlesHabilitados ? (
              <p className="sim__nota">Los controles están deshabilitados: define DEMO_PIN en el servidor.</p>
            ) : !desbloqueado ? (
              <form
                className="sim__pin"
                onSubmit={(e) => {
                  e.preventDefault();
                  desbloquear(pin);
                }}
              >
                <input type="password" inputMode="numeric" placeholder="PIN de la demo" value={pin} onChange={(e) => setPin(e.target.value)} aria-label="PIN de la demo" />
                <button type="submit">Desbloquear</button>
              </form>
            ) : (
              <>
                <div className="sim__fila">
                  <button type="button" className={`sim__boton ${demo?.trafico.activo ? 'sim__boton--activo' : ''}`} onClick={() => trafico(!demo?.trafico.activo)}>
                    {demo?.trafico.activo ? 'Detener tráfico' : 'Iniciar tráfico'}
                  </button>
                  <div className="sim__velocidad" role="group" aria-label="Velocidad">
                    {VELOCIDADES.map((v) => (
                      <button key={v.ms} type="button" className={velocidadActual === v.texto ? 'activo' : ''} onClick={() => trafico(true, v.ms)}>
                        {v.texto}
                      </button>
                    ))}
                  </div>
                </div>
                <button type="button" className="sim__intruso" onClick={intruso}>
                  Carro intruso
                  <small>Ocupa el puesto que reservó el conductor</small>
                </button>
              </>
            )}
          </section>

          <section className="sim__tarjeta">
            <h2>Conductores con FastParking</h2>
            {conectados.length === 0 ? (
              <p className="sim__nota">Nadie ha reservado todavía. Escanea el QR, toca un puesto libre y pulsa “Reservar 7 min”.</p>
            ) : (
              <ul className="sim__conductores">
                {conectados.map((c) => (
                  <li key={c}>
                    <span className="sim__punto-vino" /> En camino a <b>{c}</b>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Registro del agente: compacto. Se despliega solo cuando se quiere mostrar al profesor. */}
          <details className="sim__tarjeta sim__registro">
            <summary>
              <span>Decisiones de la IA ({demo?.decisiones.length ?? 0})</span>
              {demo?.decisiones[0] && (
                <span className="sim__resumen">
                  <span className={`sim__motor sim__motor--${demo.decisiones[0].motor.toLowerCase()}`}>{demo.decisiones[0].motor}</span>
                  {demo.decisiones[0].zonaAnterior}-{dos(demo.decisiones[0].puestoAnterior)} →{' '}
                  {demo.decisiones[0].zonaNueva ? `${demo.decisiones[0].zonaNueva}-${dos(demo.decisiones[0].puestoNuevo)}` : '—'}
                </span>
              )}
            </summary>
            <ol>
              {demo?.decisiones.slice(0, 6).map((d, i) => (
                <li key={i} className="sim__decision">
                  <div className="sim__decision-cabeza">
                    <span className={`sim__motor sim__motor--${d.motor.toLowerCase()}`}>{d.motor}</span>
                    <span>
                      {d.zonaAnterior}-{dos(d.puestoAnterior)} → <b>{d.zonaNueva ? `${d.zonaNueva}-${dos(d.puestoNuevo)}` : 'sin alternativa'}</b>
                    </span>
                    <time>{hora(d.creadaEn)}</time>
                  </div>
                  {d.herramientas.length > 0 && (
                    <div className="sim__herramientas">
                      {d.herramientas.map((h, k) => (
                        <code key={k}>{h}</code>
                      ))}
                    </div>
                  )}
                  {d.mensaje && <p className="sim__decision-mensaje">“{d.mensaje}”</p>}
                  <p className="sim__decision-meta">
                    {d.latenciaMs} ms{d.error ? ` · plan B: ${d.error.split('\n')[0].slice(0, 60)}` : ''}
                  </p>
                </li>
              ))}
            </ol>
          </details>

          <section className="sim__tarjeta sim__qr">
            <svg viewBox={`-2 -2 ${qr.tamano + 4} ${qr.tamano + 4}`} role="img" aria-label="QR para abrir la app del conductor">
              <rect x="-2" y="-2" width={qr.tamano + 4} height={qr.tamano + 4} fill="#fff" />
              <path d={qr.path} fill="#083e4d" />
            </svg>
            <div>
              <strong>App del conductor</strong>
              <small>Escanea con el celular para tomar el tiquete y reservar un puesto.</small>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
