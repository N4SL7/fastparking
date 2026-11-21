import { useCallback, useState } from 'react';
import type { IntrusoEnCamino } from '../components/3d/PisoSotano3D';

/**
 * RF-19: carros intrusos en camino, recibidos por SSE ("intruso"). Se guardan con el inicio en el reloj local
 * para que celular e iPad los animen al mismo tiempo; se descartan un minuto después de llegar.
 */
export function useIntrusos() {
  const [intrusos, setIntrusos] = useState<IntrusoEnCamino[]>([]);
  const registrarIntruso = useCallback((d: { idZona: number; puesto: number; duracionMs: number; transcurridoMs: number }) => {
    const nuevo: IntrusoEnCamino = {
      idZona: d.idZona,
      numero: d.puesto,
      inicioLocal: performance.now() - d.transcurridoMs,
      duracionMs: d.duracionMs,
    };
    setIntrusos((l) => [...l.filter((i) => performance.now() - i.inicioLocal < i.duracionMs + 60_000), nuevo]);
  }, []);
  return { intrusos, registrarIntruso };
}
