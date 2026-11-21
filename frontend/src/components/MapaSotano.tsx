import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { detectarCalidad } from '../lib/calidad';
import { construirPlano, longitud, rutaHastaPuesto, siguienteInstruccion, type Puesto, type ZonaEnPlano } from '../lib/plano';
import type { Piso, Retencion, Ubicacion, Zona } from '../types';
import { aX, aZ } from './3d/escena';
import { PisoSotano3D, type IntrusoEnCamino } from './3d/PisoSotano3D';
import { Ruta3D } from './3d/Ruta3D';
import { CamaraGeneral, CamaraSeguimiento, Lienzo3D } from './3d/Sotano3D';
import { IconoNavegar } from './iconos';

// Alto del mapa adaptado a la pantalla: en celulares pequeños deja ver el HUD y los botones sobre la barra inferior.
const ALTO_ESCENA = 'clamp(330px, calc(100dvh - 300px), 540px)';
const VELOCIDAD = 42; // unidades de plano por segundo (≈ 5 m/s: velocidad de parqueadero)
const dos = (n: number) => String(n).padStart(2, '0');

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
  intrusosEnCamino,
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
  intrusosEnCamino?: IntrusoEnCamino[];
}) {
  const pisoDe = (idZona?: number) => pisos.find((p) => p.zonas.some((z) => z.idZona === idZona));
  const [idPiso, setIdPiso] = useState((pisoDe(retencion?.idZona) ?? pisoDe(ubicacion?.idZona) ?? pisos[0])?.idPiso);
  const [progreso, setProgreso] = useState<number | null>(null);
  const [seleccion, setSeleccion] = useState<Seleccion | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [intruso, setIntruso] = useState<{ idZona: number; numero: number } | null>(null);
  const raf = useRef<number>();
  // El avance de la flecha vive en una referencia: la escena 3D lo lee en cada cuadro sin volver a renderizar React.
  const avance = useRef(0);
  const escena = useRef<HTMLDivElement>(null);
  const calidad = useMemo(detectarCalidad, []);
  const previa = useRef<Retencion | null>(null);
  const reNavegar = useRef(false);

  useEffect(() => {
    const anterior = previa.current;
    previa.current = retencion;
    const p = pisoDe(retencion?.idZona);
    if (p) setIdPiso(p.idPiso);
    // RF-19: si la retención nació de una reasignación, el puesto anterior parpadea en rojo (carro intruso)
    // y, si el conductor iba navegando, la flecha recalcula sola la ruta hacia el nuevo puesto.
    if (retencion && anterior && retencion.idRetencionOrigen === anterior.idRetencion && anterior.puesto) {
      setIntruso({ idZona: anterior.idZona, numero: anterior.puesto });
      setTimeout(() => setIntruso(null), 5000);
      reNavegar.current = progreso !== null;
    }
    cancelAnimationFrame(raf.current!);
    avance.current = 0;
    setProgreso(null);
    setSeleccion(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retencion?.idRetencion]);

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
      if (p) return { puesto: p, lado: z.lado, zona: z.zona, esMiCarro: false };
    }
    // RF-09: sin retención, el destino es TU carro estacionado ("¿dónde dejé mi carro?").
    for (const z of plano) {
      const p = z.puestos.find((x) => x.estado === 'mi-vehiculo');
      if (p) return { puesto: p, lado: z.lado, zona: z.zona, esMiCarro: true };
    }
    return null;
  }, [plano]);
  // La ruta solo cambia si cambia el puesto destino (no con cada actualización de ocupación).
  const claveDestino = destino ? `${destino.zona.idZona}-${destino.puesto.numero}` : '';
  const ruta = useMemo(
    () => (destino ? rutaHastaPuesto(destino.puesto, destino.lado) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [claveDestino],
  );

  useEffect(() => {
    if (reNavegar.current && destino) {
      reNavegar.current = false;
      setTimeout(navegar, 900);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destino?.zona.idZona, destino?.puesto.numero]);

  function navegar() {
    if (!destino || !ruta) return;
    cancelAnimationFrame(raf.current!);
    const duracion = Math.max(12000, (longitud(ruta) / VELOCIDAD) * 1000);
    escena.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const inicio = performance.now();
    let ultimoRender = 0;
    avance.current = 0;
    // Avisa al servidor para que el carro vinotinto de /simulacion avance al mismo ritmo (RF-20).
    if (retencion) api.navegar(retencion.idRetencion, Math.round(duracion)).catch(() => undefined);
    setProgreso(0);
    const paso = (ahora: number) => {
      const t = Math.min(1, (ahora - inicio) / duracion);
      avance.current = t;
      // El HUD (instrucción y metros) se actualiza ~6 veces por segundo; la flecha, en cada cuadro.
      if (t >= 1 || ahora - ultimoRender > 160) {
        ultimoRender = ahora;
        setProgreso(t);
      }
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

  const navegando = progreso !== null && destino !== null && ruta !== null;
  const llego = navegando && progreso! >= 1;
  const instruccion = navegando ? siguienteInstruccion(ruta!, progreso!) : null;

  function tocarPuesto(z: ZonaEnPlano, p: Puesto) {
    if (navegando || soloLectura) return;
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

  // Foco de la cámara general: el puesto reservado o elegido; si no hay, la entrada del sótano.
  const puestoFoco: Puesto | undefined =
    destino?.puesto ??
    (seleccion ? plano.find((z) => z.zona.idZona === seleccion.zona.idZona)?.puestos[seleccion.puesto - 1] : undefined);
  const foco: [number, number] = puestoFoco ? [aX(puestoFoco.cx) * 0.4, aZ(puestoFoco.cy)] : [0, aZ(260)];

  const hoja = useRef<HTMLDivElement>(null);
  const acciones = useRef<HTMLDivElement>(null);
  // Al llegar, se desplaza hasta "Confirmar que estacioné aquí" para que quede a la vista (sobre la barra inferior).
  useEffect(() => {
    if (llego) acciones.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [llego]);
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

      <div className={`mapa-escena ${navegando ? 'mapa-escena--navegando' : ''}`} ref={escena} style={{ height: ALTO_ESCENA }}>
        <Lienzo3D calidad={calidad} alto="100%">
          <PisoSotano3D
            plano={plano}
            codigoPiso={piso.codigo}
            calidad={calidad}
            seleccion={seleccion ? { idZona: seleccion.zona.idZona, numero: seleccion.puesto } : null}
            intruso={intruso}
            intrusosEnCamino={intrusosEnCamino}
            idZonaDestacada={retencion?.idZona ?? seleccion?.zona.idZona ?? null}
            onTocarPuesto={tocarPuesto}
            etiquetas={!navegando}
          />
          {ruta && <Ruta3D ruta={ruta} avance={avance} mostrarFlecha={navegando} />}
          {navegando ? (
            <CamaraSeguimiento ruta={ruta!} avance={avance} />
          ) : (
            <CamaraGeneral foco={foco} />
          )}
        </Lienzo3D>

        {navegando && (
          <div className="hud" role="status">
            <span className="hud__icono">
              <IconoNavegar size={18} />
            </span>
            {llego ? (
              <span>
                {destino!.esMiCarro ? 'Aquí está tu carro: ' : 'Llegaste a '}
                <strong>{destino!.zona.codigo}</strong> · Puesto {dos(destino!.puesto.numero)}
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
        {llego && (
          <div className="mapa-escena__acciones">
            {!destino!.esMiCarro && (
              <button type="button" className="boton boton--grande" disabled={ocupado} onClick={() => onLlegar(destino!.puesto.numero)}>
                Confirmar que estacioné aquí
              </button>
            )}
            <button type="button" className="boton boton--secundario boton--chico" onClick={navegar}>
              Repetir ruta
            </button>
          </div>
        )}
        {intruso && (
          <p className="mapa__alerta" role="alert">
            Otro vehículo ocupó tu puesto · el agente te asignó uno nuevo
          </p>
        )}
        {!navegando && !soloLectura && !retencion && !seleccion && (
          <p className="mapa__pista">Toca un puesto libre para reservarlo · arrastra, pellizca y gira con dos dedos</p>
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

      <div className="mapa__acciones" ref={acciones}>
        {destino && !navegando && (
          <button type="button" className="boton boton--grande" onClick={navegar}>
            <IconoNavegar size={18} />{' '}
            {destino.esMiCarro ? `Llévame a mi carro (${destino.zona.codigo} · P${dos(destino.puesto.numero)})` : `Ir a ${destino.zona.codigo} · P${dos(destino.puesto.numero)}`}
          </button>
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
