import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api';
import { qrComoPath } from '../lib/qr';
import type { Comprobante, Cotizacion, MetodoPago } from '../types';
import { IconoBanco, IconoCelular, IconoCheck, IconoTarjeta } from './iconos';
import { horaCorta } from './ui';

const CLAVE_HISTORIAL = 'fastparking.historialPagos';
export const pesos = (v: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);

const METODOS: { id: MetodoPago; nombre: string; detalle: string; icono: ReactNode }[] = [
  { id: 'TARJETA', nombre: 'Tarjeta', detalle: 'Crédito o débito', icono: <IconoTarjeta /> },
  { id: 'NEQUI', nombre: 'Nequi', detalle: 'Billetera digital', icono: <IconoCelular /> },
  { id: 'PSE', nombre: 'PSE', detalle: 'Débito bancario', icono: <IconoBanco /> },
];

function leerHistorialLocal(): Comprobante[] {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_HISTORIAL) ?? '[]') as Comprobante[];
  } catch {
    return [];
  }
}
function guardarEnHistorialLocal(c: Comprobante) {
  try {
    const previos = leerHistorialLocal().filter((x) => x.codigo !== c.codigo);
    localStorage.setItem(CLAVE_HISTORIAL, JSON.stringify([c, ...previos].slice(0, 20)));
  } catch {
    /* sin almacenamiento: el historial vive solo en el servidor para esta sesión */
  }
}

function duracion(minutos: number) {
  const h = Math.floor(minutos / 60);
  return h > 0 ? `${h} h ${minutos % 60} min` : `${minutos} min`;
}

/** Comprobante con QR de salida (RF-11). */
function ComprobanteCard({ c, ahora }: { c: Comprobante; ahora: number }) {
  const { path, tamano } = useMemo(() => qrComoPath(`FASTPARKING-SALIDA:${c.codigo}`), [c.codigo]);
  const restante = Math.max(0, Math.floor((Date.parse(c.salidaHasta) - ahora) / 1000));
  return (
    <section className="tarjeta comprobante" aria-labelledby="titulo-comprobante">
      <div className="comprobante__estado">
        <IconoCheck size={28} />
        <div>
          <h2 id="titulo-comprobante" className="titulo-seccion">
            Pago aprobado
          </h2>
          <p className="texto-suave texto-chico">Simulación · código {c.codigo}</p>
        </div>
      </div>
      <div className="resumen">
        <div>
          <span className="resumen__valor">{horaCorta(c.ingreso)}</span>
          <span className="resumen__rotulo">Entrada</span>
        </div>
        <div>
          <span className="resumen__valor">{duracion(c.minutos)}</span>
          <span className="resumen__rotulo">Tiempo</span>
        </div>
        <div>
          <span className="resumen__valor">{pesos(c.valor)}</span>
          <span className="resumen__rotulo">Total</span>
        </div>
      </div>
      <div className="salida">
        <svg className="salida__qr" viewBox={`-2 -2 ${tamano + 4} ${tamano + 4}`} shapeRendering="crispEdges" aria-label="QR de salida">
          <rect x="-2" y="-2" width={tamano + 4} height={tamano + 4} fill="#fff" />
          <path d={path} fill="#083E4D" />
        </svg>
        <div>
          <p className="etiqueta">QR de salida</p>
          <p className="salida__tiempo">
            {restante > 0 ? `${Math.floor(restante / 60)}:${String(restante % 60).padStart(2, '0')}` : 'Vencido'}
          </p>
          <p className="texto-suave texto-chico">
            {restante > 0 ? `Sal antes de las ${horaCorta(c.salidaHasta)}` : 'Acércate a la caja del parqueadero'}
          </p>
        </div>
      </div>
      <p className="nota">{c.aviso}</p>
    </section>
  );
}

/** RF-11 / RF-17: liquidación, pago simulado, comprobante con QR de salida e historial. */
export function Billetera({
  ahora,
  onAviso,
  onNuevoIngreso,
}: {
  ahora: number;
  onAviso: (texto: string, tipo?: 'exito' | 'alerta' | 'info') => void;
  onNuevoIngreso: () => void;
}) {
  const [cotizacion, setCotizacion] = useState<Cotizacion | null>(null);
  const [metodo, setMetodo] = useState<MetodoPago>('TARJETA');
  const [pagando, setPagando] = useState(false);
  const [historial, setHistorial] = useState<Comprobante[]>(leerHistorialLocal);

  const cargar = useCallback(async () => {
    try {
      const q = await api.cotizar();
      setCotizacion(q);
      if (q.pago) {
        guardarEnHistorialLocal(q.pago);
        setHistorial(leerHistorialLocal());
      }
    } catch (e) {
      onAviso((e as Error).message, 'alerta');
    }
  }, [onAviso]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Valor en vivo mientras el conductor mira la pantalla (el valor final lo calcula el servidor al pagar).
  const minutosVivos = cotizacion ? Math.max(1, Math.ceil((ahora - Date.parse(cotizacion.ingreso)) / 60_000)) : 0;
  const valorVivo = cotizacion ? minutosVivos * cotizacion.tarifaMinuto : 0;

  async function pagar() {
    setPagando(true);
    try {
      const c = await api.pagar(metodo);
      guardarEnHistorialLocal(c);
      setHistorial(leerHistorialLocal());
      onAviso(`Pago simulado aprobado por ${pesos(c.valor)}. Usa el QR de salida.`, 'exito');
      await cargar();
    } catch (e) {
      onAviso((e as Error).message, 'alerta');
    } finally {
      setPagando(false);
    }
  }

  if (!cotizacion) return <p className="texto-suave texto-centro">Calculando tu tiempo de parqueo…</p>;
  const pago = cotizacion.pago;

  return (
    <div className="pila">
      {pago ? (
        <ComprobanteCard c={pago} ahora={ahora} />
      ) : (
        <>
          <section className="tarjeta tarjeta--marca cuenta" aria-labelledby="titulo-cuenta">
            <p className="etiqueta etiqueta--clara">Total a pagar</p>
            <h2 id="titulo-cuenta" className="cuenta__total">
              {pesos(valorVivo)}
            </h2>
            <div className="resumen resumen--claro">
              <div>
                <span className="resumen__valor">{horaCorta(cotizacion.ingreso)}</span>
                <span className="resumen__rotulo">Entrada</span>
              </div>
              <div>
                <span className="resumen__valor">{duracion(minutosVivos)}</span>
                <span className="resumen__rotulo">Tiempo</span>
              </div>
              <div>
                <span className="resumen__valor">{pesos(cotizacion.tarifaMinuto)}</span>
                <span className="resumen__rotulo">por minuto</span>
              </div>
            </div>
            <p className="texto-claro texto-chico">Tarifa ilustrativa del prototipo, no es la tarifa oficial del centro comercial.</p>
          </section>

          <section className="tarjeta" aria-labelledby="titulo-metodo">
            <h2 id="titulo-metodo" className="titulo-seccion">
              Método de pago
            </h2>
            <div className="metodos" role="radiogroup" aria-label="Método de pago">
              {METODOS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={metodo === m.id}
                  className={`metodo ${metodo === m.id ? 'metodo--activo' : ''}`}
                  onClick={() => setMetodo(m.id)}
                >
                  {m.icono}
                  <span className="metodo__nombre">{m.nombre}</span>
                  <span className="metodo__detalle">{m.detalle}</span>
                </button>
              ))}
            </div>
            <p className="nota">Modo demostración: no se piden ni se guardan datos de tarjetas o cuentas.</p>
            <button type="button" className="boton boton--grande" disabled={pagando} onClick={pagar}>
              {pagando ? 'Procesando…' : `Pagar ${pesos(valorVivo)}`}
            </button>
          </section>
        </>
      )}

      <section className="tarjeta" aria-labelledby="titulo-historial">
        <h2 id="titulo-historial" className="titulo-seccion">
          Historial de pagos
        </h2>
        {historial.length === 0 ? (
          <p className="texto-suave">Aún no tienes pagos en este dispositivo.</p>
        ) : (
          <ul className="historial">
            {historial.map((h) => (
              <li key={h.codigo}>
                <div>
                  <strong>{pesos(h.valor)}</strong>
                  <span className="texto-suave texto-chico">
                    {new Date(h.pagadoEn).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })} · {horaCorta(h.pagadoEn)} ·{' '}
                    {duracion(h.minutos)}
                  </span>
                </div>
                <span className="chip">{h.metodo === 'TARJETA' ? 'Tarjeta' : h.metodo === 'NEQUI' ? 'Nequi' : 'PSE'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {pago && (
        <button type="button" className="boton boton--secundario" onClick={onNuevoIngreso}>
          Simular un nuevo ingreso (otro tiquete)
        </button>
      )}
    </div>
  );
}
