import type { EstadoZona } from '../types';

export function Encabezado({ tiquete }: { tiquete?: string }) {
  return (
    <header className="encabezado">
      <div className="encabezado__marca">
        <img src="/icon.svg" alt="" className="encabezado__logo" width={40} height={40} />
        <div>
          <h1 className="encabezado__titulo">FastParking</h1>
          <p className="encabezado__sub">Parque La Colina · prototipo académico</p>
        </div>
      </div>
      {tiquete && (
        <span className="chip chip--claro" title="Tiquete de esta sesión">
          {tiquete}
        </span>
      )}
    </header>
  );
}

/** RN-03, RN-09: el usuario nunca debe creer que el cupo está garantizado. */
export function AvisoSimulacion() {
  return (
    <p className="aviso" role="note">
      <strong>Demostración:</strong> la disponibilidad es simulada y por zona. Una retención es temporal y{' '}
      <strong>no garantiza</strong> el cupo físico.
    </p>
  );
}

const ETIQUETAS: Record<EstadoZona, { texto: string; simbolo: string }> = {
  DISPONIBLE: { texto: 'Disponible', simbolo: '●' },
  POCOS_CUPOS: { texto: 'Pocos cupos', simbolo: '▲' },
  LLENA: { texto: 'Llena', simbolo: '■' },
};

/** RF-03 / RNF-07: el estado se comunica con texto + símbolo + color (el color nunca es la única señal). */
export function EtiquetaEstado({ estado }: { estado: EstadoZona }) {
  const e = ETIQUETAS[estado];
  return (
    <span className={`estado estado--${estado.toLowerCase()}`}>
      <span aria-hidden="true">{e.simbolo}</span> {e.texto}
    </span>
  );
}

export const hora = (iso: string | number) =>
  new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** RF-13: frescura de los datos. */
export function EstadoDatos({
  ultimaCarga,
  desactualizado,
  conectadoSSE,
  error,
  onReintentar,
}: {
  ultimaCarga: number | null;
  desactualizado: boolean;
  conectadoSSE: boolean;
  error: string | null;
  onReintentar: () => void;
}) {
  if (desactualizado) {
    return (
      <div className="frescura frescura--alerta" role="alert">
        <span>
          ⚠ Datos desactualizados{ultimaCarga ? ` (última actualización ${hora(ultimaCarga)})` : ''}. {error ?? ''} No los tomes como
          disponibilidad actual.
        </span>
        <button type="button" className="boton boton--secundario boton--chico" onClick={onReintentar}>
          Reintentar
        </button>
      </div>
    );
  }
  return (
    <p className="frescura">
      <span className={`punto ${conectadoSSE ? 'punto--vivo' : ''}`} aria-hidden="true" />
      Actualizado a las {ultimaCarga ? hora(ultimaCarga) : '—'} {conectadoSSE ? '· en tiempo real' : '· consultando cada 15 s'}
    </p>
  );
}

export interface Aviso {
  id: number;
  tipo: 'info' | 'exito' | 'alerta';
  texto: string;
}

export function Notificaciones({ avisos, onCerrar }: { avisos: Aviso[]; onCerrar: (id: number) => void }) {
  return (
    <div className="notificaciones" aria-live="polite">
      {avisos.map((a) => (
        <div key={a.id} className={`notificacion notificacion--${a.tipo}`}>
          <span>{a.texto}</span>
          <button type="button" className="notificacion__cerrar" aria-label="Cerrar aviso" onClick={() => onCerrar(a.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
