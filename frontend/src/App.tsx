import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, ApiError } from './api';
import { ListaZonas, PanelAlternativas, SelectorPiso } from './components/Disponibilidad';
import { Billetera } from './components/Billetera';
import { IconoBilletera, IconoCarro, IconoInicio, IconoMapa } from './components/iconos';
import { MapaSotano } from './components/MapaSotano';
import { MiVehiculo } from './components/MiVehiculo';
import { PanelRetencion } from './components/PanelRetencion';
import { Tiquete } from './components/Tiquete';
import { AvisoSimulacion, Encabezado, EstadoDatos, Notificaciones, type Aviso } from './components/ui';
import { useSesion } from './hooks/useSesion';
import { useTiempoReal } from './hooks/useTiempoReal';
import type { Alternativa, CambioRetencion, Retencion, Ubicacion, Zona } from './types';

type Pestana = 'inicio' | 'mapa' | 'vehiculo' | 'billetera';

const PESTANAS: { id: Pestana; texto: string; icono: ReactNode }[] = [
  { id: 'inicio', texto: 'Inicio', icono: <IconoInicio /> },
  { id: 'mapa', texto: 'Mapa', icono: <IconoMapa /> },
  { id: 'vehiculo', texto: 'Mi vehículo', icono: <IconoCarro /> },
  { id: 'billetera', texto: 'Billetera', icono: <IconoBilletera /> },
];

export default function App() {
  const sesion = useSesion();
  const { idSesion } = sesion;
  const [retencion, setRetencion] = useState<Retencion | null>(null);
  const [ubicacion, setUbicacion] = useState<Ubicacion | null>(null);
  const [ingreso, setIngreso] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [pestana, setPestana] = useState<Pestana>('inicio');
  const [idPiso, setIdPiso] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [conflicto, setConflicto] = useState<{ zona: string; alternativas: Alternativa[] } | null>(null);
  const [pedirNavegacion, setPedirNavegacion] = useState(false);
  const retencionRef = useRef<Retencion | null>(null);
  retencionRef.current = retencion;

  const avisar = useCallback((texto: string, tipo: Aviso['tipo'] = 'info') => {
    const id = Date.now() + Math.random();
    setAvisos((a) => [...a.slice(-1), { id, tipo, texto }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), 5_000);
  }, []);

  /** RF-06 / RF-15: cambios de la retención recibidos por SSE. */
  const alCambiarRetencion = useCallback(
    (c: CambioRetencion) => {
      if (c.tipo === 'REASIGNADA' && c.retencion) {
        setRetencion(c.retencion);
        avisar(`La zona ${c.anterior?.zonaCodigo} se ocupó. Te reasignamos a ${c.retencion.zonaCodigo} (${c.retencion.pisoNombre}).`, 'alerta');
      } else if (c.tipo === 'INVALIDADA') {
        setRetencion(null);
        avisar(`La zona ${c.anterior?.zonaCodigo} se ocupó y no hay otra zona con cupo. Tu retención fue invalidada.`, 'alerta');
      } else if (c.tipo === 'EXPIRADA') {
        if (retencionRef.current?.idRetencion === c.retencion?.idRetencion) {
          setRetencion(null);
          avisar('Tu retención expiró: pasaron los 7 minutos.', 'info');
        }
      } else if (c.tipo === 'CREADA') {
        setRetencion(c.retencion);
      } else {
        setRetencion(null);
      }
    },
    [avisar],
  );

  const tiempoReal = useTiempoReal(idSesion, alCambiarRetencion);
  const { datos, ahora } = tiempoReal;

  useEffect(() => {
    if (!idSesion) {
      setRetencion(null);
      setUbicacion(null);
      setIngreso(null);
      setPestana('inicio');
      return;
    }
    api.sesionActual().then((s) => setIngreso(s.creadaEn)).catch(() => undefined);
    api.retencionActual().then((r) => setRetencion(r.retencion)).catch(() => undefined);
    api.ubicacion().then((r) => setUbicacion(r.ubicacion)).catch(() => undefined);
  }, [idSesion]);

  // RF-05: si el reloj local pasa el vencimiento, la retención deja de mostrarse como vigente.
  useEffect(() => {
    if (retencion && Date.parse(retencion.venceEn) <= ahora) {
      setRetencion(null);
      avisar('Tu retención expiró: pasaron los 7 minutos.', 'info');
    }
  }, [ahora, retencion, avisar]);

  useEffect(() => {
    if (datos && idPiso === null) setIdPiso(datos.pisos[0]?.idPiso ?? null);
  }, [datos, idPiso]);

  async function retener(idZona: number, puesto?: number): Promise<boolean> {
    setOcupado(true);
    try {
      const r = await api.retener(idZona, puesto);
      setRetencion(r);
      setConflicto(null);
      avisar(`Retención creada en ${r.zonaCodigo}${r.puesto ? ` · P${String(r.puesto).padStart(2, '0')}` : ''}. Tienes 7 minutos para llegar.`, 'exito');
      return true;
    } catch (e) {
      const err = e as ApiError;
      if (err.code === 'ZONA_SIN_CUPO') {
        const zona = datos?.pisos.flatMap((p) => p.zonas).find((z) => z.idZona === idZona);
        setConflicto({ zona: zona?.codigo ?? 'La zona', alternativas: (err.details as { alternativas: Alternativa[] }).alternativas });
      } else {
        avisar(err.message, 'alerta');
      }
      return false;
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

  /** RF-16: el conductor llegó al puesto (navegación simulada) y confirma que estacionó. */
  async function llegar(puesto: number) {
    if (!retencion) return;
    setOcupado(true);
    try {
      await api.llegar(retencion.idRetencion, puesto);
      setRetencion(null);
      const u = await api.ubicacion();
      setUbicacion(u.ubicacion);
      avisar(`¡Listo! Estacionaste en ${u.ubicacion?.zonaCodigo} · Puesto ${String(puesto).padStart(2, '0')}. Guardamos tu ubicación.`, 'exito');
      setPestana('vehiculo');
    } catch (e) {
      avisar((e as Error).message, 'alerta');
    } finally {
      setOcupado(false);
      tiempoReal.recargar();
    }
  }

  // ---------- Sin sesión: simulación de la máquina de ingreso (RF-01) ----------
  if (!idSesion) {
    return (
      <div className="app">
        <Encabezado />
        <main className="contenedor">
          {sesion.cargando ? (
            <p className="texto-suave texto-centro">Cargando…</p>
          ) : (
            <Tiquete
              token={sesion.tiquete.token}
              horaIngreso={new Date(sesion.tiquete.ingreso)}
              sesionActiva={false}
              onEscanear={() => sesion.iniciar(sesion.tiquete.token, sesion.tiquete.ingreso)}
              onNuevoTiquete={sesion.nuevoIngreso}
            />
          )}
          {sesion.error && (
            <p className="frescura frescura--alerta" role="alert">
              No pudimos iniciar tu sesión: {sesion.error}
            </p>
          )}
        </main>
      </div>
    );
  }

  const piso = datos?.pisos.find((p) => p.idPiso === idPiso) ?? datos?.pisos[0];
  const todas = datos?.pisos.flatMap((p) => p.zonas) ?? [];
  const libresTotal = todas.reduce((s, z) => s + z.cupoLogico, 0);
  const llenas = todas.filter((z) => z.estado === 'LLENA').length;

  return (
    <div className="app">
      <Encabezado tiquete={sesion.tiquete.token} />
      <main className="contenedor">
        <Notificaciones avisos={avisos} onCerrar={(id) => setAvisos((a) => a.filter((x) => x.id !== id))} />

        {pestana === 'inicio' && (
          <>
            <AvisoSimulacion />
            <div className="estadisticas">
              <div className="tarjeta estadistica">
                <p className="etiqueta">Cupos libres ahora</p>
                <p className="estadistica__valor">{libresTotal}</p>
                <p className="texto-suave texto-chico">en {datos?.pisos.length ?? 0} sótanos</p>
              </div>
              <div className="tarjeta estadistica">
                <p className="etiqueta">Zonas llenas</p>
                <p className="estadistica__valor">
                  {llenas}
                  <span className="estadistica__de">/{todas.length}</span>
                </p>
                <p className="texto-suave texto-chico">datos simulados</p>
              </div>
            </div>
            {retencion && (
              <PanelRetencion
                retencion={retencion}
                ahora={ahora}
                ocupado={ocupado}
                onCancelar={cancelar}
                onVerRuta={() => {
                  setPedirNavegacion(true);
                  setPestana('mapa');
                }}
              />
            )}
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
              !tiempoReal.error && <p className="texto-suave texto-centro">Cargando disponibilidad…</p>
            )}
          </>
        )}

        {pestana === 'mapa' && datos && (
          <>
            {retencion && (
              <p className="franja-retencion">
                Retención en <strong>{retencion.zonaCodigo}</strong> · vence en{' '}
                {(() => {
                  const s = Math.max(0, Math.floor((Date.parse(retencion.venceEn) - ahora) / 1000));
                  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
                })()}
              </p>
            )}
            <MapaSotano
              pisos={datos.pisos}
              retencion={retencion}
              ubicacion={retencion ? null : ubicacion}
              iniciarNavegacion={pedirNavegacion}
              onNavegacionIniciada={() => setPedirNavegacion(false)}
              onReservar={retener}
              onLlegar={llegar}
              ocupado={ocupado}
            />
          </>
        )}

        {pestana === 'vehiculo' && <MiVehiculo ingreso={ingreso} ubicacion={ubicacion} />}

        {pestana === 'billetera' && <Billetera ahora={ahora} onAviso={avisar} onNuevoIngreso={sesion.nuevoIngreso} />}
      </main>

      <nav className="barra-nav" aria-label="Secciones">
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`barra-nav__boton ${pestana === p.id ? 'activa' : ''}`}
            aria-current={pestana === p.id ? 'page' : undefined}
            aria-label={p.texto}
            title={p.texto}
            onClick={() => setPestana(p.id)}
          >
            {p.icono}
            <span className="barra-nav__texto">{p.texto}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
