import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { CambioRetencion, Disponibilidad } from '../types';

const SONDEO_MS = 15_000; // respaldo por si SSE se cae (D-09)
const DESACTUALIZADO_MS = 45_000; // RF-13: pasado este tiempo sin datos nuevos, se advierte

/**
 * Disponibilidad en tiempo casi real: SSE + sondeo de respaldo.
 * Expone si los datos están desactualizados para no presentarlos como actuales (RF-13, RNF-10).
 */
export function useTiempoReal(idSesion: string | null, alCambiarRetencion: (c: CambioRetencion) => void) {
  const [datos, setDatos] = useState<Disponibilidad | null>(null);
  const [ultimaCarga, setUltimaCarga] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conectadoSSE, setConectadoSSE] = useState(false);
  const [ahora, setAhora] = useState(Date.now());
  const callbackRef = useRef(alCambiarRetencion);
  callbackRef.current = alCambiarRetencion;

  const recargar = useCallback(async () => {
    try {
      const d = await api.zonas();
      setDatos(d);
      setUltimaCarga(Date.now());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (!idSesion) return;
    recargar();
    const sondeo = setInterval(recargar, SONDEO_MS);
    const reloj = setInterval(() => setAhora(Date.now()), 1_000);

    const fuente = new EventSource(`/api/events/stream?sessionId=${idSesion}`);
    fuente.onopen = () => setConectadoSSE(true);
    fuente.onerror = () => setConectadoSSE(false);
    fuente.addEventListener('zonas', () => recargar());
    fuente.addEventListener('retencion', (ev) => callbackRef.current(JSON.parse((ev as MessageEvent).data)));

    return () => {
      clearInterval(sondeo);
      clearInterval(reloj);
      fuente.close();
    };
  }, [idSesion, recargar]);

  const desactualizado = ultimaCarga === null || ahora - ultimaCarga > DESACTUALIZADO_MS || error !== null;
  return { datos, ultimaCarga, error, conectadoSSE, desactualizado, ahora, recargar };
}
