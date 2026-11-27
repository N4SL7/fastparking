import { useEffect, useMemo, useRef, useState } from 'react';
import { qrComoPath } from '../lib/qr';
import { IconoCheck, IconoTiquete } from './iconos';

/** Genera un token de tiquete simulado (lo que imprimiría la máquina de ingreso). */
export function nuevoTokenTiquete(): string {
  const aleatorio = crypto.getRandomValues(new Uint32Array(2));
  return `FP-${aleatorio[0].toString(36).toUpperCase()}${aleatorio[1].toString(36).toUpperCase()}`.slice(0, 16);
}

const DURACION_ESCANEO_MS = 1600;
const DURACION_LEIDO_MS = 550;

/**
 * RF-01 (v2.1): pantalla de escaneo. El tiquete físico tradicional se conserva (RN-10); su QR abre la PWA con
 * el token del tiquete. Diseño limpio: QR enmarcado con esquinas, poco texto y un solo botón. Al simular el
 * escaneo, una línea recorre el QR y aparece "Tiquete leído" antes de entrar a la app. No se lee la placa.
 */
export function Tiquete({
  token,
  horaIngreso,
  sesionActiva,
  onEscanear,
  onNuevoTiquete,
}: {
  token: string;
  horaIngreso: Date;
  sesionActiva: boolean;
  onEscanear: () => void;
  onNuevoTiquete: () => void;
}) {
  const url = `${window.location.origin}/?t=${encodeURIComponent(token)}`;
  const { path, tamano } = useMemo(() => qrComoPath(url), [url]);
  const [fase, setFase] = useState<'listo' | 'escaneando' | 'leido'>('listo');
  const temporizadores = useRef<number[]>([]);
  useEffect(() => () => temporizadores.current.forEach(clearTimeout), []);

  function escanear() {
    if (fase !== 'listo') return;
    const sinMovimiento = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (sinMovimiento) return onEscanear();
    setFase('escaneando');
    temporizadores.current.push(
      window.setTimeout(() => setFase('leido'), DURACION_ESCANEO_MS),
      window.setTimeout(onEscanear, DURACION_ESCANEO_MS + DURACION_LEIDO_MS),
    );
  }

  return (
    <section className="escaneo" aria-labelledby="titulo-escaneo">
      <div className="escaneo__texto">
        <p className="etiqueta">Bienvenido a Parque La Colina</p>
        <h2 id="titulo-escaneo" className="escaneo__titulo">
          {sesionActiva ? 'Tu tiquete' : 'Escanea tu tiquete'}
        </h2>
        <p className="texto-suave">Mira los cupos, aparta tu puesto y llega con ruta. Sin instalar nada.</p>
      </div>

      <div className={`escaneo__visor escaneo__visor--${fase}`} role="img" aria-label={`Código QR del tiquete ${token}`}>
        <span className="escaneo__esquina escaneo__esquina--ai" aria-hidden="true" />
        <span className="escaneo__esquina escaneo__esquina--ad" aria-hidden="true" />
        <span className="escaneo__esquina escaneo__esquina--bi" aria-hidden="true" />
        <span className="escaneo__esquina escaneo__esquina--bd" aria-hidden="true" />
        <div className="escaneo__qr">
          <svg viewBox={`-2 -2 ${tamano + 4} ${tamano + 4}`} shapeRendering="crispEdges">
            <rect x="-2" y="-2" width={tamano + 4} height={tamano + 4} fill="#fff" />
            <path d={path} fill="#083E4D" />
          </svg>
          {fase === 'escaneando' && <span className="escaneo__linea" aria-hidden="true" />}
          {fase === 'leido' && (
            <span className="escaneo__leido" role="status">
              <IconoCheck size={34} />
              Tiquete leído
            </span>
          )}
        </div>
      </div>

      <dl className="escaneo__datos">
        <div>
          <dt>Tiquete</dt>
          <dd>{token}</dd>
        </div>
        <div>
          <dt>Ingreso</dt>
          <dd>{horaIngreso.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })}</dd>
        </div>
      </dl>

      {!sesionActiva ? (
        <button type="button" className="boton boton--grande" onClick={escanear} disabled={fase !== 'listo'}>
          <IconoTiquete size={20} /> {fase === 'listo' ? 'Simular escaneo del QR' : 'Leyendo tiquete…'}
        </button>
      ) : (
        <button type="button" className="boton boton--secundario" onClick={onNuevoTiquete}>
          Simular un nuevo ingreso (otro conductor)
        </button>
      )}
      <p className="nota texto-centro">Conserva tu tiquete físico: también puedes pagar en las cajas.</p>
    </section>
  );
}
