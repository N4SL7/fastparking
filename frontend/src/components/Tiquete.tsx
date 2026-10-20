import { useMemo } from 'react';
import { qrComoPath } from '../lib/qr';
import { IconoTiquete } from './iconos';

/** Genera un token de tiquete simulado (lo que imprimiría la máquina de ingreso). */
export function nuevoTokenTiquete(): string {
  const aleatorio = crypto.getRandomValues(new Uint32Array(2));
  return `FP-${aleatorio[0].toString(36).toUpperCase()}${aleatorio[1].toString(36).toUpperCase()}`.slice(0, 16);
}

/**
 * RF-01: simulación de la máquina de ingreso del parqueadero.
 * El tiquete físico tradicional se conserva (RN-10); FastParking solo propone imprimirle un QR
 * que abre la PWA con el token del tiquete. No se lee ni se guarda la placa.
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

  return (
    <section className="tiquete-escena" aria-labelledby="titulo-tiquete">
      <div className="tarjeta tiquete-intro">
        <p className="etiqueta">Simulación · máquina de ingreso</p>
        <h2 id="titulo-tiquete" className="titulo-seccion">
          {sesionActiva ? 'Tu tiquete de parqueadero' : 'Bienvenido a Parque La Colina'}
        </h2>
        <p className="texto-suave">
          Al ingresar, la máquina entrega el tiquete físico de siempre con un QR. Escanéalo con tu celular para ver el mapa
          del sótano, reservar un puesto y pagar desde la app, sin instalar nada.
        </p>
      </div>

      <div className="tiquete" role="img" aria-label={`Tiquete ${token} con código QR`}>
        <div className="tiquete__cabecera">
          <span className="tiquete__marca">
            <img src="/icon.svg" alt="" width={22} height={22} /> FastParking
          </span>
          <span className="tiquete__sotano">Ingreso · Sótanos 1–3</span>
        </div>
        <svg className="tiquete__qr" viewBox={`-2 -2 ${tamano + 4} ${tamano + 4}`} shapeRendering="crispEdges">
          <rect x="-2" y="-2" width={tamano + 4} height={tamano + 4} fill="#fff" />
          <path d={path} fill="#083E4D" />
        </svg>
        <dl className="tiquete__datos">
          <div>
            <dt>Tiquete</dt>
            <dd>{token}</dd>
          </div>
          <div>
            <dt>Ingreso</dt>
            <dd>{horaIngreso.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</dd>
          </div>
          <div>
            <dt>Placa</dt>
            <dd>No se guarda</dd>
          </div>
        </dl>
        <div className="tiquete__corte" aria-hidden="true" />
        <p className="tiquete__pie">Conserve este tiquete. Puede pagar desde la app FastParking o en las cajas habituales.</p>
      </div>

      {!sesionActiva ? (
        <button type="button" className="boton boton--grande" onClick={onEscanear}>
          <IconoTiquete size={20} /> Simular escaneo del QR
        </button>
      ) : (
        <button type="button" className="boton boton--secundario" onClick={onNuevoTiquete}>
          Simular un nuevo ingreso (otro conductor)
        </button>
      )}
      <p className="texto-suave texto-centro">
        También puedes escanearlo con tu celular si está en la misma red Wi-Fi que este equipo.
        <br />
        <code className="url-qr">{url}</code>
      </p>
    </section>
  );
}
