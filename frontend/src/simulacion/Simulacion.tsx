import { OrbitControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { PisoSotano3D } from '../components/3d/PisoSotano3D';
import { CarroConductor, type NavegacionSincronizada } from '../components/3d/CarroConductor';
import { Lienzo3D } from '../components/3d/Sotano3D';
import { detectarCalidad } from '../lib/calidad';
import { construirPlano, rutaHastaPuesto, type ZonaEnPlano } from '../lib/plano';
import { qrComoPath } from '../lib/qr';
import type { Disponibilidad, EstadoDemo, EstadoIntruso } from '../types';
import { pedirDemo } from './demoApi';
import { useIntrusos } from '../hooks/useIntrusos';

const SEPARACION = 46; // distancia entre pisos en la vista general (unidades 3D)
const VELOCIDADES = [
  { texto: '1×', ms: 6000 },
  { texto: '2×', ms: 3000 },
  { texto: '5×', ms: 1200 },
];
/** Conductores de FastParking en camino (puestos retenidos) con su ruta desde la rampa. */
function conductoresDe(plano: ZonaEnPlano[]) {
  const lista: { clave: string; puesto: string; ruta: ReturnType<typeof rutaHastaPuesto>; centro: { x: number; y: number } }[] = [];
  for (const z of plano) {
    z.puestos
      .filter((p) => p.estado === 'mio')
      .forEach((p, i) =>
        lista.push({ clave: `${z.zona.idZona}-${i}`, puesto: `${z.zona.idZona}-${p.numero}`, ruta: rutaHastaPuesto(p, z.lado), centro: { x: p.cx, y: p.cy } }),
      );
  }
  return lista;
}

/** v2.1: explicación corta de por qué decidió el plan B (para que no parezca que el LLM "falló" sin razón). */
function razonPlanB(error: string | null | undefined): string {
  if (!error || /configur|sin clave|api key|LLM_API_KEY/i.test(error)) return 'sin LLM configurado';
  if (/429|quota|cuota|RESOURCE_EXHAUSTED/i.test(error)) return 'se agotó la cuota gratuita del LLM';
  if (/timeout|abort|tiempo/i.test(error)) return 'el LLM tardó demasiado';
  if (/inválid|invalid|no está libre|PROPUESTA/i.test(error)) return 'la propuesta del LLM no era válida';
  return 'el LLM no respondió';
}

interface Paso {
  id: number;
  hora: number;
  texto: string;
  tipo: 'conductor' | 'intruso' | 'agente' | 'sistema';
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
  // v2.1: fase del carro intruso y "paso a paso" de lo que ocurre en la demo (trazabilidad para el público).
  const [faseIntruso, setFaseIntruso] = useState<EstadoIntruso>({ fase: 'INACTIVO' });
  const [pasos, setPasos] = useState<Paso[]>([]);
  const registrarPaso = useCallback((texto: string, tipo: Paso['tipo']) => {
    setPasos((l) => [{ id: Date.now() + Math.random(), hora: Date.now(), texto, tipo }, ...l].slice(0, 7));
  }, []);
  const codigoDe = useRef<Map<number, string>>(new Map()); // idZona → código (S1-B)
  const destinosReasignados = useRef<Set<string>>(new Set()); // retenciones creadas por el agente (no por el conductor)
  const ultimaFase = useRef('');
  const [intrusos, setIntrusos] = useState<Map<number, number>>(new Map()); // idZona → puesto que parpadea
  const previos = useRef<Map<string, string>>(new Map());
  const { intrusos: intrusosEnCamino, registrarIntruso } = useIntrusos();
  // Puesto actual → identidad del carro vinotinto (se conserva al reasignar).
  const [alias, setAlias] = useState<Map<string, string>>(new Map());
  // Navegaciones del celular sincronizadas por el servidor: clave "idZona-puesto" → inicio local y duración.
  const [navs, setNavs] = useState<Map<string, NavegacionSincronizada>>(new Map());
  const registrarNav = useCallback((n: { idZona: number; puesto: number; duracionMs: number; transcurridoMs: number; desde?: { x: number; y: number } }) => {
    setNavs((m) => {
      const k = `${n.idZona}-${n.puesto}`;
      const inicioLocal = performance.now() - n.transcurridoMs;
      const previo = m.get(k);
      if (previo && Math.abs(previo.inicioLocal - inicioLocal) < 1500) return m; // misma navegación
      return new Map(m).set(k, { inicioLocal, duracionMs: n.duracionMs, desde: n.desde });
    });
  }, []);

  const cargarZonas = useCallback(async () => {
    try {
      const d = await api.zonas();
      // Detecta carros intrusos: un puesto RETENIDO que pasó a OCUPADO.
      const nuevos = new Map<number, number>();
      const primeraCarga = previos.current.size === 0;
      for (const p of d.pisos)
        for (const z of p.zonas) {
          codigoDe.current.set(z.idZona, z.codigo);
          for (const pu of z.puestos ?? []) {
            const clave = `${z.idZona}-${pu.numero}`;
            const antes = previos.current.get(clave);
            const nombre = `${z.codigo}-${dos(pu.numero)}`;
            if (antes === 'RETENIDO' && pu.estado === 'OCUPADO') {
              if (pu.conFastParking) registrarPaso(`El conductor estacionó en ${nombre}`, 'conductor');
              else nuevos.set(z.idZona, pu.numero);
            }
            if (!primeraCarga && antes !== 'RETENIDO' && pu.estado === 'RETENIDO' && !destinosReasignados.current.has(clave))
              registrarPaso(`Un conductor reservó ${nombre} (7 min)`, 'conductor');
            previos.current.set(clave, pu.estado);
          }
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
      const e = await pedirDemo<EstadoDemo>('/api/demo/estado');
      setDemo(e);
      if (e.intruso) setFaseIntruso(e.intruso);
      e.navegaciones?.forEach(registrarNav);
    } catch {
      /* sin conexión: se reintenta */
    }
  }, [registrarNav]);

  useEffect(() => {
    cargarZonas();
    cargarDemo();
    const sondeo = setInterval(() => {
      cargarZonas();
      cargarDemo();
    }, 10_000);
    const fuente = new EventSource('/api/events/stream');
    fuente.addEventListener('zonas', () => cargarZonas());
    fuente.addEventListener('agente', (ev) => {
      // Reasignación: el carro vinotinto del puesto anterior es el mismo que va al puesto nuevo (no se teletransporta).
      const d = JSON.parse((ev as MessageEvent).data) as {
        reasignaciones?: { de: { idZona: number; puesto: number | null }; a: { idZona: number; puesto: number } | null }[];
      };
      for (const r of d.reasignaciones ?? []) {
        if (r.a) destinosReasignados.current.add(`${r.a.idZona}-${r.a.puesto}`);
        const de = `${codigoDe.current.get(r.de.idZona) ?? ''}-${dos(r.de.puesto)}`;
        registrarPaso(
          r.a ? `El agente reasignó al conductor: ${de} → ${codigoDe.current.get(r.a.idZona) ?? ''}-${dos(r.a.puesto)}` : `Sin puestos libres: la reserva ${de} se invalidó`,
          'agente',
        );
      }
      if (d.reasignaciones?.length) {
        setAlias((m) => {
          const n = new Map(m);
          for (const r of d.reasignaciones!) {
            if (!r.a || r.de.puesto === null) continue;
            const de = `${r.de.idZona}-${r.de.puesto}`;
            n.set(`${r.a.idZona}-${r.a.puesto}`, n.get(de) ?? de);
          }
          return n;
        });
      }
      cargarDemo();
    });
    fuente.addEventListener('trafico', () => cargarDemo());
    fuente.addEventListener('intruso', (ev) => registrarIntruso(JSON.parse((ev as MessageEvent).data)));
    fuente.addEventListener('navegacion', (ev) => {
      const n = JSON.parse((ev as MessageEvent).data) as { idZona: number; puesto: number; duracionMs: number; transcurridoMs: number; desde?: { x: number; y: number } };
      registrarNav(n);
      const destino = `${codigoDe.current.get(n.idZona) ?? ''}-${dos(n.puesto)}`;
      registrarPaso(n.desde ? `El conductor cambia de rumbo hacia ${destino}` : `El conductor va hacia ${destino} (${Math.round(n.duracionMs / 1000)} s)`, 'conductor');
    });
    fuente.addEventListener('intruso-estado', (ev) => {
      const e = JSON.parse((ev as MessageEvent).data) as EstadoIntruso;
      setFaseIntruso(e);
      const lugar = e.zona ? `${e.zona}-${dos(e.puesto ?? 0)}` : '';
      const clave = `${e.fase}-${lugar}`;
      if (clave === ultimaFase.current) return; // el servidor puede repetir la misma fase
      ultimaFase.current = clave;
      if (e.fase === 'ESPERANDO') registrarPaso('Carro intruso listo en la puerta trasera: saldrá cuando un conductor reserve', 'intruso');
      if (e.fase === 'EN_CAMINO') registrarPaso(`El carro intruso arranca hacia ${lugar}`, 'intruso');
      if (e.fase === 'ESTACIONADO') registrarPaso(`El carro intruso llegó primero y ocupó ${lugar}`, 'intruso');
    });
    return () => {
      clearInterval(sondeo);
      fuente.close();
    };
  }, [cargarZonas, cargarDemo, registrarNav, registrarIntruso, registrarPaso]);

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

  async function prepararIntruso(cancelar = false) {
    try {
      const e = await pedirDemo<EstadoIntruso>(`/api/demo/intruso/${cancelar ? 'cancelar' : 'preparar'}`, { method: 'POST', body: '{}' }, pin);
      setFaseIntruso(e);
      if (cancelar) registrarPaso('Carro intruso retirado', 'sistema');
    } catch (e) {
      avisar((e as Error).message, 'error');
    }
  }

  async function reiniciar() {
    try {
      const r = await pedirDemo<{ retencionesCanceladas: number; vehiculosRetirados: number }>('/api/demo/reiniciar', { method: 'POST', body: '{}' }, pin);
      setPasos([]);
      setAlias(new Map());
      setNavs(new Map());
      avisar(`Demo reiniciada: ${r.retencionesCanceladas} reservas canceladas y ${r.vehiculosRetirados} carros retirados.`, 'ok');
      await Promise.all([cargarZonas(), cargarDemo()]);
    } catch (e) {
      avisar((e as Error).message, 'error');
    }
  }

  async function intruso() {
    try {
      const r = await pedirDemo<{ estado?: string; zona?: string; puesto?: number; llegaEnMs?: number; conflictos?: { mensaje: string; motor: string }[] }>(
        '/api/demo/intruso',
        { method: 'POST', body: '{}' },
        pin,
      );
      if (r.estado === 'EN_CAMINO') {
        avisar(`Carro intruso en camino a ${r.zona}-${dos(r.puesto ?? 0)}: llega en ${Math.round((r.llegaEnMs ?? 0) / 1000)} s.`, 'ok');
      } else {
        const c = r.conflictos?.[0];
        avisar(c ? `Agente (${c.motor}): ${c.mensaje}` : 'El intruso ocupó el puesto.', 'ok');
      }
      await Promise.all([cargarZonas(), cargarDemo()]);
    } catch (e) {
      avisar((e as Error).message, 'error');
    }
  }

  const pisos = datos?.pisos ?? [];
  // v2.1: el intruso preparado se dibuja detenido en la puerta trasera del sótano al que va (o del sótano 1).
  const idPisoIntruso = (() => {
    if (faseIntruso.fase === 'ESPERANDO') return pisos[0]?.idPiso;
    if (faseIntruso.fase === 'EN_CAMINO' && faseIntruso.zona) {
      const p = pisos.find((x) => x.zonas.some((z) => z.codigo === faseIntruso.zona));
      const yaSalio = intrusosEnCamino.some((i) => codigoDe.current.get(i.idZona) === faseIntruso.zona && i.numero === faseIntruso.puesto && performance.now() - i.inicioLocal < i.duracionMs + 5000);
      return yaSalio ? undefined : p?.idPiso;
    }
    return undefined;
  })();
  const planos = useMemo(
    () =>
      pisos.map((p) => {
        // En la simulación, los puestos retenidos por conductores de FastParking brillan en teal ("en camino").
        // Los carros de conductores que ya llegaron con la app se dibujan vinotinto ("mi-vehiculo").
        const plano: ZonaEnPlano[] = construirPlano(p.zonas).map((z) => ({
          ...z,
          puestos: z.puestos.map((pu) => {
            if (pu.estado === 'retenido') return { ...pu, estado: 'mio' as const };
            const real = z.zona.puestos?.find((x) => x.numero === pu.numero);
            if (pu.estado === 'ocupado' && real?.conFastParking) return { ...pu, estado: 'mi-vehiculo' as const };
            return pu;
          }),
        }));
        return { piso: p, plano };
      }),
    [pisos],
  );

  const conectados = pisos.flatMap((p) =>
    p.zonas.flatMap((z) =>
      (z.puestos ?? [])
        .filter((pu) => pu.estado === 'RETENIDO' || pu.conFastParking)
        .map((pu) => `${pu.estado === 'RETENIDO' ? 'En camino a' : 'Estacionado en'} ${z.codigo}-${dos(pu.numero)}`),
    ),
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
                    intrusosEnCamino={intrusosEnCamino}
                    intrusoEsperando={piso.idPiso === idPisoIntruso}
                  />
                  {/* Un carro vinotinto por conductor de FastParking: lleva su propia key estable por zona para
                      que, al ser reasignado dentro de la zona, gire y continúe desde donde iba. */}
                  {conductoresDe(plano).map((c) => (
                    <CarroConductor key={`conductor-${alias.get(c.puesto) ?? c.puesto}`} ruta={c.ruta} centro={c.centro} nav={navs.get(c.puesto) ?? null} faros={calidad.faros} />
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
                {faseIntruso.fase === 'INACTIVO' ? (
                  <>
                    <button type="button" className="sim__intruso" onClick={() => prepararIntruso()}>
                      Preparar carro intruso
                      <small>Espera en la puerta trasera y sale cuando el conductor reserve</small>
                    </button>
                    <button type="button" className="sim__enlace" onClick={intruso}>
                      Lanzar ahora hacia la reserva actual
                    </button>
                  </>
                ) : (
                  <div className={`sim__estado-intruso sim__estado-intruso--${faseIntruso.fase.toLowerCase()}`} role="status">
                    <span className="sim__estado-punto" aria-hidden="true" />
                    <div>
                      <strong>
                        {faseIntruso.fase === 'ESPERANDO'
                          ? 'Intruso esperando'
                          : faseIntruso.fase === 'EN_CAMINO'
                            ? `Intruso en camino a ${faseIntruso.zona}-${dos(faseIntruso.puesto ?? 0)}`
                            : `Intruso ocupó ${faseIntruso.zona}-${dos(faseIntruso.puesto ?? 0)}`}
                      </strong>
                      <small>
                        {faseIntruso.fase === 'ESPERANDO'
                          ? 'Reserva un puesto en el celular: el intruso saldrá hacia ese puesto.'
                          : faseIntruso.fase === 'EN_CAMINO'
                            ? 'Entra por la puerta trasera para llegar antes que el conductor.'
                            : 'El agente está buscando un puesto nuevo para el conductor.'}
                      </small>
                    </div>
                    {faseIntruso.fase === 'ESPERANDO' && (
                      <button type="button" className="sim__enlace" onClick={() => prepararIntruso(true)}>
                        Cancelar
                      </button>
                    )}
                  </div>
                )}
                <button type="button" className="sim__enlace sim__enlace--reinicio" onClick={reiniciar}>
                  ↺ Reiniciar demo
                </button>
              </>
            )}
          </section>

          <section className="sim__tarjeta">
            <h2>Paso a paso</h2>
            {pasos.length === 0 ? (
              <p className="sim__nota">Aquí verás, en orden, lo que hacen el conductor, el carro intruso y el agente.</p>
            ) : (
              <ol className="sim__pasos">
                {pasos.map((p) => (
                  <li key={p.id} className={`sim__paso sim__paso--${p.tipo}`}>
                    <time>{new Date(p.hora).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
                    <span>{p.texto}</span>
                  </li>
                ))}
              </ol>
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
                    <span className="sim__punto-vino" /> {c.replace(/ (\S+)$/, ' ')}
                    <b>{c.split(' ').pop()}</b>
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
              {demo?.decisiones[0]?.motor === 'REGLAS' && (
                <span className="sim__razon">Plan B: {razonPlanB(demo.decisiones[0].error)}</span>
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
                    {d.latenciaMs} ms{d.motor === 'REGLAS' ? ` · plan B: ${razonPlanB(d.error)}` : ''}
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
