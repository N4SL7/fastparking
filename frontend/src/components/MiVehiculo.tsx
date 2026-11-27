import type { Piso, Ubicacion } from '../types';
import type { IntrusoEnCamino } from './3d/PisoSotano3D';
import { IconoCarro } from './iconos';
import { MapaSotano } from './MapaSotano';
import { horaCorta } from './ui';

const dos = (n: number) => String(n).padStart(2, '0');

/**
 * RF-09 (v2.1): dónde quedó el carro, a la vista. Una fila con el lugar y la hora de entrada (sin repetir
 * datos) y, debajo, el mapa del sótano con el carro resaltado y el botón "Llévame a mi carro", que guía
 * con la ruta en esta misma pantalla.
 */
export function MiVehiculo({
  ingreso,
  ubicacion,
  pisos,
  intrusosEnCamino,
  tieneRetencion,
}: {
  ingreso: string | null;
  ubicacion: Ubicacion | null;
  pisos: Piso[] | null;
  intrusosEnCamino?: IntrusoEnCamino[];
  tieneRetencion: boolean;
}) {
  if (!ubicacion) {
    return (
      <section className="tarjeta vacio" aria-labelledby="titulo-vehiculo">
        <span className="vacio__icono">
          <IconoCarro size={28} />
        </span>
        <h2 id="titulo-vehiculo" className="titulo-seccion">
          Aún no has estacionado
        </h2>
        <p className="texto-suave">
          {tieneRetencion
            ? 'Cuando llegues a tu puesto, confirma en el Mapa que estacionaste y aquí verás dónde quedó tu carro.'
            : 'Aparta un puesto en Inicio o en el Mapa. Al confirmar que estacionaste, guardamos dónde quedó tu carro.'}
        </p>
      </section>
    );
  }

  return (
    <div className="pila">
      <section className="tarjeta tarjeta--marca vehiculo" aria-labelledby="titulo-vehiculo">
        <p className="etiqueta etiqueta--clara">Tu carro está en</p>
        <h2 id="titulo-vehiculo" className="titulo-grande">
          {ubicacion.zonaCodigo}
          {ubicacion.puesto ? ` · P${dos(ubicacion.puesto)}` : ''}
        </h2>
        <div className="vehiculo__datos">
          <span>{ubicacion.pisoNombre}</span>
          <span aria-hidden="true">·</span>
          <span>Entrada {ingreso ? horaCorta(ingreso) : '—'}</span>
        </div>
      </section>

      {pisos && pisos.length > 0 && (
        <MapaSotano
          pisos={pisos}
          retencion={null}
          ubicacion={ubicacion}
          iniciarNavegacion={false}
          onNavegacionIniciada={() => undefined}
          onReservar={async () => false}
          onLlegar={() => undefined}
          ocupado={false}
          soloLectura
          compacto
          intrusosEnCamino={intrusosEnCamino}
        />
      )}
    </div>
  );
}
