import type { Disponibilidad, Retencion, Ubicacion } from './types';

/** Error de la API con código estable (RF-14). */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

let idSesion: string | null = null;
export const fijarSesion = (id: string | null) => {
  idSesion = id;
};

async function pedir<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(ruta, {
      ...opciones,
      headers: {
        'content-type': 'application/json',
        ...(idSesion ? { 'x-session-id': idSesion } : {}),
        ...opciones.headers,
      },
    });
  } catch {
    throw new ApiError(0, 'SIN_CONEXION', 'No hay conexión con FastParking. Revisa tu internet.');
  }
  const cuerpo = await res.json().catch(() => null);
  if (!res.ok) {
    const e = cuerpo?.error;
    throw new ApiError(res.status, e?.code ?? 'ERROR', e?.message ?? 'Ocurrió un error inesperado.', e?.details);
  }
  return cuerpo as T;
}

export const api = {
  crearSesion: (qrToken?: string) =>
    pedir<{ idSesion: string; expiraEn: string }>('/api/sessions', { method: 'POST', body: JSON.stringify({ qrToken }) }),
  zonas: () => pedir<Disponibilidad>('/api/zones'),
  retencionActual: () => pedir<{ retencion: Retencion | null }>('/api/retentions/current'),
  retener: (idZona: number) => pedir<Retencion>('/api/retentions', { method: 'POST', body: JSON.stringify({ idZona }) }),
  cancelar: (idRetencion: string) => pedir<Retencion>(`/api/retentions/${idRetencion}/cancel`, { method: 'POST' }),
  llegar: (idRetencion: string, puesto?: number) =>
    pedir<Retencion>(`/api/retentions/${idRetencion}/arrive`, { method: 'POST', body: JSON.stringify({ puesto }) }),
  ubicacion: () => pedir<{ ubicacion: Ubicacion | null }>('/api/vehicle-location'),
  guardarUbicacion: (idZona: number, referencia: string) =>
    pedir<{ ubicacion: Ubicacion }>('/api/vehicle-location', {
      method: 'PUT',
      body: JSON.stringify({ idZona, referencia: referencia.trim() || undefined }),
    }),
};
