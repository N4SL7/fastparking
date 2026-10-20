import { useCallback, useEffect, useState } from 'react';
import { api, fijarSesion } from '../api';
import { nuevoTokenTiquete } from '../components/Tiquete';

const CLAVE_SESION = 'fastparking.idSesion';
const CLAVE_TIQUETE = 'fastparking.tiquete';

interface TiqueteGuardado {
  token: string;
  ingreso: string;
}

function leer<T>(clave: string): T | null {
  try {
    const v = localStorage.getItem(clave);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function guardar(clave: string, valor: unknown) {
  try {
    if (valor === null) localStorage.removeItem(clave);
    else localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    /* modo privado: solo en memoria */
  }
}

/**
 * RF-01 / D-02: sesión anónima ligada al token del QR del tiquete.
 * - URL con ?t=<token>: el conductor escaneó el QR → se crea o reanuda la sesión de ese tiquete.
 * - Sin token: se muestra la simulación de la máquina de ingreso con un tiquete nuevo.
 */
export function useSesion() {
  const [idSesion, setIdSesion] = useState<string | null>(null);
  const [tiquete, setTiquete] = useState<TiqueteGuardado>(
    () => leer<TiqueteGuardado>(CLAVE_TIQUETE) ?? { token: nuevoTokenTiquete(), ingreso: new Date().toISOString() },
  );
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const iniciar = useCallback(async (token: string, ingreso = new Date().toISOString()) => {
    setError(null);
    try {
      const s = await api.crearSesion(token);
      const t = { token, ingreso };
      guardar(CLAVE_SESION, s.idSesion);
      guardar(CLAVE_TIQUETE, t);
      fijarSesion(s.idSesion);
      setTiquete(t);
      setIdSesion(s.idSesion);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const tokenQr = url.searchParams.get('t');
    if (tokenQr) {
      url.searchParams.delete('t');
      window.history.replaceState(null, '', url.toString()); // el token no queda visible en la barra
    }
    (async () => {
      if (tokenQr) {
        const previo = leer<TiqueteGuardado>(CLAVE_TIQUETE);
        await iniciar(tokenQr, previo?.token === tokenQr ? previo.ingreso : undefined);
      } else {
        const guardada = leer<string>(CLAVE_SESION);
        if (guardada) {
          fijarSesion(guardada);
          try {
            await api.retencionActual(); // valida que la sesión siga vigente
            setIdSesion(guardada);
          } catch {
            fijarSesion(null);
            guardar(CLAVE_SESION, null);
          }
        }
      }
      setCargando(false);
    })();
  }, [iniciar]);

  /** Simula que llega otro vehículo: nuevo tiquete y nueva sesión. */
  const nuevoIngreso = useCallback(() => {
    guardar(CLAVE_SESION, null);
    fijarSesion(null);
    const t = { token: nuevoTokenTiquete(), ingreso: new Date().toISOString() };
    guardar(CLAVE_TIQUETE, t);
    setTiquete(t);
    setIdSesion(null);
  }, []);

  return { idSesion, tiquete, cargando, error, iniciar, nuevoIngreso };
}
