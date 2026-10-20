import type { Ubicacion } from '../types';
import { IconoCarro, IconoReloj, IconoUbicacion } from './iconos';
import { horaCorta } from './ui';

/** RF-09: solo lo esencial — hora de entrada y lugar donde quedó el vehículo. */
export function MiVehiculo({ ingreso, ubicacion }: { ingreso: string | null; ubicacion: Ubicacion | null }) {
  return (
    <div className="pila">
      <section className="tarjeta tarjeta--marca vehiculo" aria-labelledby="titulo-vehiculo">
        <span className="vehiculo__icono">
          <IconoCarro size={30} />
        </span>
        <h2 id="titulo-vehiculo" className="titulo-grande">
          {ubicacion ? `${ubicacion.zonaCodigo}${ubicacion.puesto ? ` · P${String(ubicacion.puesto).padStart(2, '0')}` : ''}` : 'Sin ubicación'}
        </h2>
        <p className="texto-claro">{ubicacion ? ubicacion.pisoNombre : 'Se guarda cuando confirmas que estacionaste.'}</p>
      </section>

      <div className="resumen resumen--tarjetas">
        <div className="tarjeta">
          <IconoReloj size={20} />
          <span className="resumen__valor">{ingreso ? horaCorta(ingreso) : '—'}</span>
          <span className="resumen__rotulo">Hora de entrada</span>
        </div>
        <div className="tarjeta">
          <IconoUbicacion size={20} />
          <span className="resumen__valor">{ubicacion ? ubicacion.zonaCodigo : '—'}</span>
          <span className="resumen__rotulo">{ubicacion?.puesto ? `Puesto ${String(ubicacion.puesto).padStart(2, '0')}` : 'Lugar'}</span>
        </div>
      </div>
    </div>
  );
}
