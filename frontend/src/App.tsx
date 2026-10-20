import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';
import { ListaZonas, PanelAlternativas, SelectorPiso } from './components/Disponibilidad';
import { MiVehiculo, PlanoReferencia } from './components/MiVehiculo';
import { PanelRetencion } from './components/PanelRetencion';
import { AvisoSimulacion, Encabezado, EstadoDatos, Notificaciones, type Aviso } from './components/ui';
import { useSesion } from './hooks/useSesion';
import { useTiempoReal } from './hooks/useTiempoReal';
import type { Alternativa, CambioRetencion, Retencion, Zona } from './types';

type Pestana = 'zonas' | 'vehiculo';

export default function App() {
  const { idSesion, error: errorSesion } = useSesion();
  const [retencion, setRetencion] = useState<Retencion | null>(null);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [pestana, setPestana] = useState<Pestana>('zonas');
  const [idPiso, setIdPiso] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [conflicto, setConflicto] = useState<{ zona: string; alternativas: Alternativa[] } | null>(null);
  const retencionRef = useRef<Retencion | null>(null);
  retencionRef.current = retencion;

  const avisar = useCallback((texto: string, tipo: Aviso['tipo'] = 'info') => {
    const id = Date.now() + Math.random();
    setAvisos((a) => [...a.slice(-1), { id, tipo, texto }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), 5_000);
  }, []);

  /** RF-06 / RF-15: cambios de la retención que llegan por SSE (reasignación, invalidación, expiración). */
  const alCambiarRetencion = useCallback(
    (c: CambioRetencion) => {
      if (c.tipo === 'REASIGNADA' && c.retencion) {
        setRetencion(c.retencion);
        avisar(`La zona ${c.anterior?.zonaCodigo} se ocupó. Te reasignamos a ${c.retencion.zonaCodigo} (${c.retencion.pisoNombre}).`, 'alerta');
      } else if (c.tipo === 'INVALIDADA') {
        setRetencion(null);
        avisar(`La zona ${c.anterior?.zonaCodigo} se ocupó y no hay otra zona con cupo. Tu retención fue invalidada.`, 'alerta');
      } else if (c.tipo === 'EXPIRADA') {
        // Puede que el reloj local ya la haya retirado: se avisa una sola vez.
        if (retencionRef.current?.idRetencion === c.retencion?.idRetencion) {
          setRetencion(null);
          avisar('Tu retención expiró: pasaron los 10 minutos.', 'info');
        }
      } else if (c.tipo === 'CREADA' || c.tipo === 'CANCELADA') {
        setRetencion(c.tipo === 'CREADA' ? c.retencion : null);
      }
    },
    [avisar],
  );

  const tiempoReal = useTiempoReal(idSesion, alCambiarRetencion);
  const { datos, ahora } = tiempoReal;

  useEffect(() => {
    if (!idSesion) return;
    api
      .retencionActual()
      .then((r) => setRetencion(r.retencion))
      .catch(() => undefined);
  }, [idSesion]);

  // Si el reloj pasa el vencimiento, la retención deja de mostrarse como vigente aunque no haya llegado el aviso (RF-05).
  useEffect(() => {
    if (retencion && Date.parse(retencion.venceEn) <= ahora) {
      setRetencion(null);
      avisar('Tu retención expiró: pasaron los 10 minutos.', 'info');
    }
  }, [ahora, retencion, avisar]);

  useEffect(() => {
    if (datos && idPiso === null) setIdPiso(datos.pisos[0]?.idPiso ?? null);
  }, [datos, idPiso]);

  async function retener(idZona: number) {
    setOcupado(true);
    try {
      const r = await api.retener(idZona);
      setRetencion(r);
      setConflicto(null);
      avisar(`Retención creada en ${r.zonaCodigo}. Tienes 10 minutos para llegar.`, 'exito');
    } catch (e) {
      const err = e as ApiError;
      if (err.code === 'ZONA_SIN_CUPO') {
        const zona = datos?.pisos.flatMap((p) => p.zonas).find((z) => z.idZona === idZona);
        setConflicto({ zona: zona?.codigo ?? 'La zona', alternativas: (err.details as { alternativas: Alternativa[] }).alternativas });
      } else {
        avisar(err.message, 'alerta');
      }
    } finally {
      setOcupado(false);
      tiempoReal.recargar();
    }
  }

  async function cancelar() {
    if (!retencion) return;
    setOcupado(true);
    try {
      await api.cancelar(retencion.idRetencion);
      setRetencion(null);
      avisar('Retención cancelada. El cupo quedó libre para otros conductores.', 'info');
    } catch (e) {
      avisar((e as Error).message, 'alerta');
    } finally {
      setOcupado(false);
      tiempoReal.recargar();
    }
  }

  if (errorSesion) {
    return (
      <main className="contenedor">
        <Encabezado />
        <p className="frescura frescura--alerta" role="alert">
          No pudimos iniciar tu sesión: {errorSesion}
        </p>
      </main>
    );
  }

  const piso = datos?.pisos.find((p) => p.idPiso === idPiso) ?? datos?.pisos[0];
  const pisoRetencion = retencion ? datos?.pisos.find((p) => p.zonas.some((z) => z.idZona === retencion.idZona)) : undefined;

  return (
    <>
      <Encabezado />
      <main className="contenedor">
        <AvisoSimulacion />
        <Notificaciones avisos={avisos} onCerrar={(id) => setAvisos((a) => a.filter((x) => x.id !== id))} />

        {pestana === 'zonas' && (
          <>
            {retencion && <PanelRetencion retencion={retencion} ahora={ahora} ocupado={ocupado} onCancelar={cancelar} />}
            {retencion && pisoRetencion && <PlanoReferencia piso={pisoRetencion} idZonaResaltada={retencion.idZona} />}
            {conflicto && (
              <PanelAlternativas
                zonaSolicitada={conflicto.zona}
                alternativas={conflicto.alternativas}
                onRetener={retener}
                onCerrar={() => setConflicto(null)}
              />
            )}
            <EstadoDatos
              ultimaCarga={tiempoReal.ultimaCarga}
              desactualizado={tiempoReal.desactualizado}
              conectadoSSE={tiempoReal.conectadoSSE}
              error={tiempoReal.error}
              onReintentar={tiempoReal.recargar}
            />
            {datos && piso ? (
              <>
                <SelectorPiso pisos={datos.pisos} actual={piso.idPiso} onCambiar={setIdPiso} />
                <ListaZonas piso={piso} retencion={retencion} ocupado={ocupado} onRetener={(z: Zona) => retener(z.idZona)} />
              </>
            ) : (
              !tiempoReal.error && <p className="vacio">Cargando disponibilidad…</p>
            )}
          </>
        )}

        {pestana === 'vehiculo' && datos && <MiVehiculo pisos={datos.pisos} onAviso={avisar} />}
      </main>

      <nav className="navegacion" aria-label="Secciones">
        <button type="button" className={pestana === 'zonas' ? 'activa' : ''} aria-current={pestana === 'zonas'} onClick={() => setPestana('zonas')}>
          <span aria-hidden="true">🅿</span> Disponibilidad
        </button>
        <button
          type="button"
          className={pestana === 'vehiculo' ? 'activa' : ''}
          aria-current={pestana === 'vehiculo'}
          onClick={() => setPestana('vehiculo')}
        >
          <span aria-hidden="true">🚗</span> Mi vehículo
        </button>
      </nav>
    </>
  );
}
