import { useEffect, useState } from 'react';
import { api, fijarSesion } from '../api';

const CLAVE = 'fastparking.idSesion';

function leer(): string | null {
  try {
    return localStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}
function guardar(id: string) {
  try {
    localStorage.setItem(CLAVE, id);
  } catch {
    /* modo privado: la sesión vive solo en memoria */
  }
}

/**
 * RF-01 / D-02: abre la sesión anónima.
 * - Si la URL trae ?t=<token del QR del tiquete>, crea o reanuda la sesión de ese tiquete.
 * - Si no, reutiliza la sesión guardada o crea una de demostración.
 */
export function useSesion() {
  const [idSesion, setIdSesion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const tokenQr = url.searchParams.get('t') ?? undefined;
    if (tokenQr) {
      url.searchParams.delete('t');
      window.history.replaceState(null, '', url.toString()); // el token no queda visible en la barra
    }
    const guardada = leer();

    (async () => {
      try {
        if (!tokenQr && guardada) {
          fijarSesion(guardada);
          try {
            await api.retencionActual(); // valida que la sesión siga vigente
            setIdSesion(guardada);
            return;
          } catch {
            /* sesión vencida o inexistente: se crea una nueva */
          }
        }
        const s = await api.crearSesion(tokenQr);
        guardar(s.idSesion);
        fijarSesion(s.idSesion);
        setIdSesion(s.idSesion);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  return { idSesion, error };
}
