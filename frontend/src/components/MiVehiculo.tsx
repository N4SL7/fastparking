import { useState, type FormEvent } from 'react';
import { api } from '../api';
import type { Piso, Ubicacion } from '../types';
import { IconoUbicacion } from './iconos';
import { MapaSotano } from './MapaSotano';
import { hora } from './ui';

/** RF-09: dónde quedó el vehículo (automático al confirmar llegada o manual). */
export function MiVehiculo({
  pisos,
  ubicacion,
  onGuardada,
  onAviso,
}: {
  pisos: Piso[];
  ubicacion: Ubicacion | null;
  onGuardada: (u: Ubicacion) => void;
  onAviso: (texto: string, tipo?: 'exito' | 'alerta') => void;
}) {
  const [idZona, setIdZona] = useState<number | ''>(ubicacion?.idZona ?? '');
  const [referencia, setReferencia] = useState(ubicacion?.referencia ?? '');
  const [guardando, setGuardando] = useState(false);

  async function guardar(ev: FormEvent) {
    ev.preventDefault();
    if (idZona === '') return;
    setGuardando(true);
    try {
      const r = await api.guardarUbicacion(idZona, referencia);
      onGuardada(r.ubicacion);
      onAviso(`Ubicación guardada: ${r.ubicacion.zonaCodigo}, ${r.ubicacion.pisoNombre}.`, 'exito');
    } catch (e) {
      onAviso((e as Error).message, 'alerta');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="pila">
      {ubicacion ? (
        <section className="tarjeta tarjeta--marca" aria-labelledby="titulo-ubicacion">
          <p className="etiqueta etiqueta--clara">
            <IconoUbicacion size={16} /> Tu vehículo quedó en
          </p>
          <h2 id="titulo-ubicacion" className="titulo-grande">
            {ubicacion.pisoNombre} · {ubicacion.zonaCodigo}
            {ubicacion.puesto ? ` · P${String(ubicacion.puesto).padStart(2, '0')}` : ''}
          </h2>
          {ubicacion.referencia && <p className="texto-claro">Referencia: {ubicacion.referencia}</p>}
          <p className="texto-claro">Guardado a las {hora(ubicacion.registradaEn)}</p>
        </section>
      ) : (
        <p className="tarjeta texto-suave texto-centro">
          Aún no has guardado dónde dejaste tu vehículo. Se guarda solo al confirmar tu llegada, o puedes hacerlo aquí.
        </p>
      )}

      {ubicacion && (
        <MapaSotano
          pisos={pisos}
          retencion={null}
          ubicacion={ubicacion}
          iniciarNavegacion={false}
          onNavegacionIniciada={() => undefined}
          onLlegar={() => undefined}
          ocupado={false}
        />
      )}

      <form className="tarjeta formulario" onSubmit={guardar}>
        <h2 className="titulo-seccion">{ubicacion ? 'Corregir ubicación' : 'Guardar ubicación manualmente'}</h2>
        <label htmlFor="zona">Zona</label>
        <select id="zona" required value={idZona} onChange={(e) => setIdZona(e.target.value ? Number(e.target.value) : '')}>
          <option value="">Selecciona piso y zona…</option>
          {pisos.map((p) => (
            <optgroup key={p.idPiso} label={p.nombre}>
              {p.zonas.map((z) => (
                <option key={z.idZona} value={z.idZona}>
                  {z.codigo} — {z.nombre.replace(/^Zona \w — /, '')}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <label htmlFor="referencia">Referencia (opcional)</label>
        <input
          id="referencia"
          maxLength={80}
          placeholder="Ej.: columna C-12, cerca del ascensor"
          value={referencia}
          onChange={(e) => setReferencia(e.target.value)}
        />
        <button type="submit" className="boton" disabled={guardando || idZona === ''}>
          {guardando ? 'Guardando…' : 'Guardar ubicación'}
        </button>
      </form>
    </div>
  );
}
