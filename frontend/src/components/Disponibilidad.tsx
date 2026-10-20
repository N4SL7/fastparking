import type { Alternativa, Piso, Retencion, Zona } from '../types';
import { EtiquetaEstado } from './ui';

function TarjetaZona({
  zona,
  esMia,
  puedeRetener,
  ocupado,
  onRetener,
}: {
  zona: Zona;
  esMia: boolean;
  puedeRetener: boolean;
  ocupado: boolean;
  onRetener: (z: Zona) => void;
}) {
  const ocupacion = Math.round(((zona.ocupados + zona.retenidas) / zona.capacidadTotal) * 100);
  return (
    <li className={`zona ${esMia ? 'zona--mia' : ''}`}>
      <div className="zona__cabecera">
        <h3 className="zona__nombre">
          {zona.codigo} <span className="zona__detalle">{zona.nombre.replace(/^Zona \w — /, '')}</span>
        </h3>
        <EtiquetaEstado estado={zona.estado} />
      </div>
      <p className="zona__cupo">
        <strong>{zona.cupoLogico}</strong> {zona.cupoLogico === 1 ? 'cupo disponible' : 'cupos disponibles'} de {zona.capacidadTotal}
      </p>
      <div
        className="barra"
        role="progressbar"
        aria-label={`Ocupación de ${zona.codigo}`}
        aria-valuenow={ocupacion}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span className={`barra__relleno barra__relleno--${zona.estado.toLowerCase()}`} style={{ width: `${ocupacion}%` }} />
      </div>
      {esMia ? (
        <p className="zona__mia">✓ Tu retención está en esta zona</p>
      ) : (
        <button
          type="button"
          className="boton"
          disabled={!puedeRetener || zona.cupoLogico === 0 || ocupado}
          onClick={() => onRetener(zona)}
        >
          {zona.cupoLogico === 0 ? 'Sin cupo' : 'Retener 10 min'}
        </button>
      )}
    </li>
  );
}

export function ListaZonas({
  piso,
  retencion,
  ocupado,
  onRetener,
}: {
  piso: Piso;
  retencion: Retencion | null;
  ocupado: boolean;
  onRetener: (z: Zona) => void;
}) {
  return (
    <ul className="zonas">
      {piso.zonas.map((z) => (
        <TarjetaZona
          key={z.idZona}
          zona={z}
          esMia={retencion?.idZona === z.idZona}
          puedeRetener={!retencion}
          ocupado={ocupado}
          onRetener={onRetener}
        />
      ))}
    </ul>
  );
}

export function SelectorPiso({ pisos, actual, onCambiar }: { pisos: Piso[]; actual: number; onCambiar: (id: number) => void }) {
  return (
    <div className="pisos" role="tablist" aria-label="Pisos del parqueadero">
      {pisos.map((p) => {
        const libres = p.zonas.reduce((s, z) => s + z.cupoLogico, 0);
        return (
          <button
            key={p.idPiso}
            type="button"
            role="tab"
            aria-selected={p.idPiso === actual}
            className={`piso ${p.idPiso === actual ? 'piso--activo' : ''}`}
            onClick={() => onCambiar(p.idPiso)}
          >
            <span className="piso__nombre">{p.nombre}</span>
            <span className="piso__libres">{libres} libres</span>
          </button>
        );
      })}
    </div>
  );
}

/** RF-07: la zona ya no tenía cupo; se ofrecen alternativas cercanas. */
export function PanelAlternativas({
  zonaSolicitada,
  alternativas,
  onRetener,
  onCerrar,
}: {
  zonaSolicitada: string;
  alternativas: Alternativa[];
  onRetener: (idZona: number) => void;
  onCerrar: () => void;
}) {
  return (
    <section className="panel panel--alerta" aria-labelledby="titulo-alternativas">
      <h2 id="titulo-alternativas" className="panel__titulo">
        {zonaSolicitada} se acaba de llenar
      </h2>
      {alternativas.length === 0 ? (
        <p>No hay otras zonas con cupo en este momento.</p>
      ) : (
        <>
          <p>Zonas cercanas con cupo:</p>
          <ul className="alternativas">
            {alternativas.map((a) => (
              <li key={a.idZona}>
                <span>
                  <strong>{a.codigo}</strong> · {a.pisoNombre} · {a.cupoLogico} cupos
                </span>
                <button type="button" className="boton boton--chico" onClick={() => onRetener(a.idZona)}>
                  Retener
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <button type="button" className="boton boton--secundario" onClick={onCerrar}>
        Cerrar
      </button>
    </section>
  );
}
