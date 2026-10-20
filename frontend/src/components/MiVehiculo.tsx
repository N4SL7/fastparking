import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import type { Piso, Ubicacion } from '../types';
import { hora } from './ui';

/** RF-10 / RN-09: plano ILUSTRATIVO de un piso; resalta una zona. No es localización en vivo. */
export function PlanoReferencia({ piso, idZonaResaltada }: { piso: Piso; idZonaResaltada?: number }) {
  const ancho = 320;
  const columnas = 2;
  const celdaW = (ancho - 48) / columnas;
  const celdaH = 64;
  const filas = Math.ceil(piso.zonas.length / columnas);
  const alto = filas * (celdaH + 16) + 56;
  return (
    <figure className="plano">
      <svg viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={`Plano ilustrativo de ${piso.nombre}`}>
        <rect x="1" y="1" width={ancho - 2} height={alto - 2} rx="12" className="plano__borde" />
        <rect x={ancho / 2 - 18} y="8" width="36" height={alto - 16} rx="4" className="plano__via" />
        <text x={ancho / 2} y={alto - 16} textAnchor="middle" className="plano__texto-via">
          vía
        </text>
        {piso.zonas.map((z, i) => {
          const col = i % columnas;
          const fila = Math.floor(i / columnas);
          const x = 16 + col * (celdaW + 16);
          const y = 16 + fila * (celdaH + 16);
          const activa = z.idZona === idZonaResaltada;
          return (
            <g key={z.idZona}>
              <rect x={x} y={y} width={celdaW - 8} height={celdaH} rx="8" className={activa ? 'plano__zona plano__zona--activa' : 'plano__zona'} />
              <text x={x + (celdaW - 8) / 2} y={y + 28} textAnchor="middle" className="plano__codigo">
                {z.codigo}
              </text>
              <text x={x + (celdaW - 8) / 2} y={y + 48} textAnchor="middle" className="plano__nombre">
                {activa ? '🚗 aquí' : z.nombre.replace(/^Zona \w — /, '')}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption>Plano ilustrativo de referencia — no muestra tu posición en vivo.</figcaption>
    </figure>
  );
}

/** RF-09: guardar y consultar dónde quedó el vehículo. */
export function MiVehiculo({ pisos, onAviso }: { pisos: Piso[]; onAviso: (texto: string, tipo?: 'exito' | 'alerta') => void }) {
  const [ubicacion, setUbicacion] = useState<Ubicacion | null>(null);
  const [idZona, setIdZona] = useState<number | ''>('');
  const [referencia, setReferencia] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    api
      .ubicacion()
      .then((r) => {
        setUbicacion(r.ubicacion);
        if (r.ubicacion) {
          setIdZona(r.ubicacion.idZona);
          setReferencia(r.ubicacion.referencia ?? '');
        }
      })
      .catch((e) => onAviso((e as Error).message, 'alerta'));
  }, [onAviso]);

  async function guardar(ev: FormEvent) {
    ev.preventDefault();
    if (idZona === '') return;
    setGuardando(true);
    try {
      const r = await api.guardarUbicacion(idZona, referencia);
      setUbicacion(r.ubicacion);
      onAviso(`Ubicación guardada: ${r.ubicacion.zonaCodigo}, ${r.ubicacion.pisoNombre}.`, 'exito');
    } catch (e) {
      onAviso((e as Error).message, 'alerta');
    } finally {
      setGuardando(false);
    }
  }

  const pisoGuardado = ubicacion ? pisos.find((p) => p.zonas.some((z) => z.idZona === ubicacion.idZona)) : undefined;

  return (
    <div className="mi-vehiculo">
      {ubicacion && pisoGuardado ? (
        <section className="panel" aria-labelledby="titulo-ubicacion">
          <p className="panel__etiqueta">Tu vehículo quedó en</p>
          <h2 id="titulo-ubicacion" className="panel__titulo">
            {ubicacion.pisoNombre} · {ubicacion.zonaCodigo}
          </h2>
          {ubicacion.referencia && <p className="panel__detalle">Referencia: {ubicacion.referencia}</p>}
          <p className="panel__detalle">Guardado a las {hora(ubicacion.registradaEn)}</p>
          <PlanoReferencia piso={pisoGuardado} idZonaResaltada={ubicacion.idZona} />
        </section>
      ) : (
        <p className="vacio">Aún no has guardado dónde dejaste tu vehículo.</p>
      )}

      <form className="panel formulario" onSubmit={guardar}>
        <h2 className="panel__titulo">{ubicacion ? 'Actualizar ubicación' : 'Guardar ubicación'}</h2>
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
