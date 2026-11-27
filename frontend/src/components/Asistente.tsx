import { useEffect, useRef, useState } from 'react';
import { api } from '../api';

interface Mensaje {
  rol: 'usuario' | 'asistente';
  texto: string;
  motor?: 'LLM' | 'REGLAS';
}

const SUGERENCIAS = ['¿Dónde dejé mi carro?', '¿Cuánto debo pagar?', '¿Cuánto le queda a mi reserva?', '¿Hay puestos libres en S2?'];

/**
 * Asistente de ayuda con IA (RF-21). Botón flotante que abre un chat corto: el agente consulta los datos
 * de la sesión con herramientas de solo lectura y responde en lenguaje natural.
 */
/** Ícono del chat (se usa en el botón de la barra inferior). */
export function IconoChat({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4h0A1.5 1.5 0 0 1 4 14.5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="9" cy="9.6" r="1.1" fill="currentColor" />
      <circle cx="12" cy="9.6" r="1.1" fill="currentColor" />
      <circle cx="15" cy="9.6" r="1.1" fill="currentColor" />
    </svg>
  );
}

/**
 * v2.1: el panel del chat se controla desde la barra inferior (ya no hay un botón flotante encima del
 * contenido). El historial se conserva mientras la app está abierta.
 */
export function Asistente({ abierto }: { abierto: boolean }) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([
    { rol: 'asistente', texto: 'Hola, soy el asistente de FastParking. Pregúntame por tu carro, tu reserva, tu cuenta o los puestos libres.' },
  ]);
  const [texto, setTexto] = useState('');
  const [pensando, setPensando] = useState(false);
  const fin = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fin.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes, pensando, abierto]);

  async function enviar(pregunta: string) {
    const q = pregunta.trim();
    if (!q || pensando) return;
    const historial = mensajes.slice(1).map(({ rol, texto }) => ({ rol, texto }));
    setMensajes((m) => [...m, { rol: 'usuario', texto: q }]);
    setTexto('');
    setPensando(true);
    try {
      const r = await api.asistente(q, historial);
      setMensajes((m) => [...m, { rol: 'asistente', texto: r.respuesta, motor: r.motor }]);
    } catch (e) {
      setMensajes((m) => [...m, { rol: 'asistente', texto: (e as Error).message }]);
    } finally {
      setPensando(false);
    }
  }

  if (!abierto) return null;
  return (
    <section className="asistente" role="dialog" aria-label="Asistente de ayuda">
      <header className="asistente__cabecera">
        <span className="asistente__avatar">IA</span>
        <div>
          <strong>Asistente FastParking</strong>
          <small>Responde con tus datos de esta visita</small>
        </div>
      </header>
      <div className="asistente__mensajes" aria-live="polite">
        {mensajes.map((m, i) => (
          <p key={i} className={`asistente__burbuja asistente__burbuja--${m.rol}`}>
            {m.texto}
          </p>
        ))}
        {pensando && <p className="asistente__burbuja asistente__burbuja--asistente asistente__pensando">Pensando…</p>}
        <div ref={fin} />
      </div>
      {mensajes.length <= 2 && (
        <div className="asistente__sugerencias">
          {SUGERENCIAS.map((s) => (
            <button key={s} type="button" onClick={() => enviar(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      <form
        className="asistente__formulario"
        onSubmit={(e) => {
          e.preventDefault();
          enviar(texto);
        }}
      >
        <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escribe tu pregunta…" maxLength={300} aria-label="Pregunta" />
        <button type="submit" disabled={pensando || !texto.trim()} aria-label="Enviar">
          ➤
        </button>
      </form>
    </section>
  );
}
