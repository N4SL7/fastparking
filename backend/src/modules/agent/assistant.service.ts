import { config } from '../../config.js';
import { pool } from '../../db/pool.js';
import { obtenerUbicacion } from '../locations/locations.service.js';
import { cotizar } from '../payments/payments.service.js';
import { obtenerRetencionActual } from '../retentions/retentions.service.js';
import { listarZonas } from '../zones/availability.service.js';
import { obtenerProveedorLLM, registrarErrorLLM, type DefinicionHerramienta, type MensajeLLM } from './llm.provider.js';

/**
 * Asistente de ayuda del conductor (RF-21) — segundo agente de FastParking.
 * Responde preguntas en lenguaje natural ("¿dónde dejé mi carro?", "¿cuánto debo?", "¿hay puestos en S2?")
 * usando herramientas de SOLO LECTURA limitadas a la sesión del propio conductor: el LLM nunca reserva,
 * paga ni modifica datos. Sin LLM (o si falla) responde un plan B por palabras clave con las mismas herramientas.
 */
export interface RespuestaAsistente {
  respuesta: string;
  motor: 'LLM' | 'REGLAS';
  herramientas: string[];
}

export interface TurnoChat {
  rol: 'usuario' | 'asistente';
  texto: string;
}

const COP = (n: number) => `$${n.toLocaleString('es-CO')}`;
const hora = (d: Date) => d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' });
const dos = (n: number | null) => String(n ?? 0).padStart(2, '0');

/** Gemini rechaza esquemas OBJECT sin propiedades: se declara un parámetro opcional inofensivo. */
const SIN_PARAMETROS = { type: 'object', properties: { motivo: { type: 'string', description: 'Opcional: por qué se consulta.' } } };

export const HERRAMIENTAS_ASISTENTE: DefinicionHerramienta[] = [
  {
    type: 'function',
    function: { name: 'ver_mi_vehiculo', description: 'Dónde quedó estacionado el vehículo del conductor y su hora de entrada.', parameters: SIN_PARAMETROS },
  },
  {
    type: 'function',
    function: { name: 'ver_mi_reserva', description: 'Retención temporal vigente del conductor (zona, puesto y minutos restantes).', parameters: SIN_PARAMETROS },
  },
  {
    type: 'function',
    function: { name: 'ver_mi_cuenta', description: 'Tiempo de parqueo, tarifa ilustrativa y valor a pagar (o el pago ya hecho).', parameters: SIN_PARAMETROS },
  },
  {
    type: 'function',
    function: {
      name: 'ver_disponibilidad',
      description: 'Puestos libres por piso y zona en este momento.',
      parameters: { type: 'object', properties: { piso: { type: 'string', description: 'Opcional: S1, S2 o S3' } } },
    },
  },
];

/** Herramientas: leen solo datos de ESTA sesión (o agregados públicos de disponibilidad). */
function herramientasDe(idSesion: string): Record<string, (a: Record<string, unknown>) => Promise<string>> {
  return {
    ver_mi_vehiculo: async () => {
      const [u, c] = await Promise.all([obtenerUbicacion(pool, idSesion), cotizar(idSesion)]);
      return JSON.stringify({
        horaEntrada: hora(new Date(c.ingreso)),
        ubicacion: u ? { piso: u.pisoNombre, zona: u.zonaCodigo, puesto: u.puesto, referencia: u.referencia } : null,
      });
    },
    ver_mi_reserva: async () => {
      const r = await obtenerRetencionActual(idSesion);
      if (!r) return JSON.stringify({ reserva: null });
      const minutos = Math.max(0, Math.ceil((new Date(r.venceEn).getTime() - Date.now()) / 60_000));
      return JSON.stringify({ reserva: { piso: r.pisoNombre, zona: r.zonaCodigo, puesto: r.puesto, minutosRestantes: minutos } });
    },
    ver_mi_cuenta: async () => {
      const c = await cotizar(idSesion);
      return JSON.stringify({
        minutos: c.minutos,
        tarifaPorMinuto: c.tarifaMinuto,
        valor: c.valor,
        moneda: 'COP',
        tarifaIlustrativa: true,
        pagado: Boolean(c.pago),
        salidaHasta: c.pago ? hora(new Date(c.pago.salidaHasta)) : null,
      });
    },
    ver_disponibilidad: async (a) => {
      const piso = typeof a.piso === 'string' ? a.piso.toUpperCase() : null;
      const zonas = (await listarZonas(pool)).filter((z) => !piso || z.pisoCodigo === piso);
      return JSON.stringify(zonas.map((z) => ({ piso: z.pisoCodigo, zona: z.codigo, libres: z.cupoLogico })));
    },
  };
}

const INSTRUCCIONES = [
  'Eres el asistente de ayuda de FastParking, la app del parqueadero del Centro Comercial Parque La Colina (prototipo académico, datos simulados).',
  'Responde en español, con tuteo, en máximo 2 frases cortas y concretas. Usa las herramientas para consultar datos reales; nunca inventes datos.',
  'Puedes explicar cómo usar la app: en Mapa se toca un puesto libre y se reserva por 7 minutos; la flecha guía hasta el puesto;',
  'en Mi vehículo se ve dónde quedó el carro; en Billetera se paga (pago simulado) y se obtiene el QR de salida.',
  'No puedes reservar, cancelar ni pagar por el conductor: indícale qué botón usar. Si preguntan algo ajeno al parqueadero, dilo amablemente.',
].join(' ');

/** Plan B por palabras clave (sin LLM): mismas herramientas, respuestas plantilla. */
export async function responderPorReglas(idSesion: string, pregunta: string): Promise<RespuestaAsistente> {
  const h = herramientasDe(idSesion);
  const q = pregunta.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const usar = async (nombre: keyof ReturnType<typeof herramientasDe>, a: Record<string, unknown> = {}) => JSON.parse(await h[nombre](a));

  if (/(carro|vehiculo|auto|deje|estacion|parquee)/.test(q) && !/(libre|disponib|reserv)/.test(q)) {
    const v = await usar('ver_mi_vehiculo');
    const respuesta = v.ubicacion
      ? `Tu carro está en ${v.ubicacion.piso}, zona ${v.ubicacion.zona}${v.ubicacion.puesto ? `, puesto ${dos(v.ubicacion.puesto)}` : ''}. Entraste a las ${v.horaEntrada}.`
      : `Aún no tengo registrado dónde estacionaste. Entraste a las ${v.horaEntrada}; al llegar a tu puesto toca "Confirmar que estacioné aquí".`;
    return { respuesta, motor: 'REGLAS', herramientas: ['ver_mi_vehiculo'] };
  }
  if (/(reserv|retenc|vence|apartad|mi puesto)/.test(q) && !/(libre|disponib|hay)/.test(q)) {
    const r = await usar('ver_mi_reserva');
    const respuesta = r.reserva
      ? `Tienes reservado el puesto ${r.reserva.zona}-${dos(r.reserva.puesto)} (${r.reserva.piso}); te quedan ${r.reserva.minutosRestantes} min. Toca "Ir" en el Mapa para seguir la flecha.`
      : 'No tienes una reserva vigente. En Mapa toca un puesto libre y pulsa "Reservar 7 min".';
    return { respuesta, motor: 'REGLAS', herramientas: ['ver_mi_reserva'] };
  }
  if (/(pag|debo|cuanto|valor|cobr|cuenta|tarifa|precio|salir|salida)/.test(q)) {
    const c = await usar('ver_mi_cuenta');
    const respuesta = c.pagado
      ? `Ya pagaste ${COP(c.valor)} por ${c.minutos} min. Puedes salir hasta las ${c.salidaHasta}.`
      : `Llevas ${c.minutos} min: el valor es ${COP(c.valor)} (tarifa ilustrativa de ${COP(c.tarifaPorMinuto)}/min). Paga en Billetera y obtén tu QR de salida.`;
    return { respuesta, motor: 'REGLAS', herramientas: ['ver_mi_cuenta'] };
  }
  if (/(libre|disponib|hay|cupo|espacio|lugar)/.test(q)) {
    const piso = q.match(/s\s?([123])/)?.[1];
    const zonas: { piso: string; zona: string; libres: number }[] = await usar('ver_disponibilidad', piso ? { piso: `S${piso}` } : {});
    const mejores = zonas.filter((z) => z.libres > 0).sort((a, b) => b.libres - a.libres).slice(0, 3);
    const respuesta = mejores.length
      ? `Ahora hay más puestos libres en ${mejores.map((z) => `${z.zona} (${z.libres})`).join(', ')}. Tócalos en el Mapa para reservar.`
      : 'En este momento no hay puestos libres en esa zona. Prueba otro piso en el Mapa.';
    return { respuesta, motor: 'REGLAS', herramientas: ['ver_disponibilidad'] };
  }
  return {
    respuesta:
      'Puedo decirte dónde quedó tu carro, cuánto llevas por pagar, cuánto le queda a tu reserva o dónde hay puestos libres. ¿Qué necesitas?',
    motor: 'REGLAS',
    herramientas: [],
  };
}

/** Responde una pregunta del conductor con el LLM y sus herramientas; ante cualquier falla, plan B. */
export async function responderPregunta(idSesion: string, pregunta: string, historial: TurnoChat[] = []): Promise<RespuestaAsistente> {
  const proveedor = obtenerProveedorLLM();
  if (!proveedor) return responderPorReglas(idSesion, pregunta);

  const h = herramientasDe(idSesion);
  const usadas: string[] = [];
  const conversacion: MensajeLLM[] = [
    { role: 'system', content: INSTRUCCIONES },
    ...historial.slice(-6).map((t): MensajeLLM => ({ role: t.rol === 'usuario' ? 'user' : 'assistant', content: t.texto })),
    { role: 'user', content: pregunta },
  ];
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), config.llm.timeoutMs);
  try {
    for (let turno = 0; turno < 4; turno++) {
      const r = await proveedor.completar(conversacion, HERRAMIENTAS_ASISTENTE, controlador.signal);
      conversacion.push(r);
      const llamadas = r.tool_calls ?? [];
      if (llamadas.length === 0) {
        const texto = (r.content ?? '').trim();
        if (!texto) break;
        return { respuesta: texto.slice(0, 500), motor: 'LLM', herramientas: usadas };
      }
      for (const ll of llamadas) {
        const fn = h[ll.function.name];
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(ll.function.arguments || '{}');
        } catch {
          /* argumentos inválidos: se ignoran */
        }
        usadas.push(ll.function.name);
        conversacion.push({ role: 'tool', tool_call_id: ll.id, content: fn ? await fn(args) : '{"error":"herramienta desconocida"}' });
      }
    }
  } catch (err) {
    registrarErrorLLM('asistente', controlador.signal.aborted ? new Error(`Tiempo agotado (${config.llm.timeoutMs} ms)`) : err);
  } finally {
    clearTimeout(temporizador);
  }
  return responderPorReglas(idSesion, pregunta);
}
