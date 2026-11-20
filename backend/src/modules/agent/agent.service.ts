import { config } from '../../config.js';
import type { PuestoCandidato } from '../zones/puestos.service.js';
import { distanciaEstimada, mensajeReglas, ordenarCandidatos, type Origen } from './agent.rules.js';
import { obtenerProveedorLLM, registrarErrorLLM, type DefinicionHerramienta, type MensajeLLM } from './llm.provider.js';

/**
 * Agente de reasignación (RF-18, D-18). Ciclo: el LLM PIENSA → USA HERRAMIENTAS → el backend VALIDA → se AVISA.
 * El LLM solo PROPONE: reasignar_puesto valida contra la lista real de puestos libres (D-20) y, si no hay LLM,
 * se agota el tiempo o la propuesta es inválida, decide el plan B por reglas (D-21).
 */
export type MotivoReasignacion = 'PUESTO_OCUPADO' | 'CONFLICTO_OCUPACION';

export interface ContextoAgente {
  origen: Origen & { zona: string; piso: string };
  motivo: MotivoReasignacion;
  candidatos: PuestoCandidato[];
}

export interface PasoAgente {
  herramienta: string;
  argumentos: unknown;
  resultado: string;
}

export interface DecisionAgente {
  motor: 'LLM' | 'REGLAS';
  modelo: string | null;
  elegido: (PuestoCandidato & { distanciaMetros: number }) | null;
  propuesta: { zona: string; puesto: number } | null;
  propuestaValida: boolean;
  mensaje: string;
  pasos: PasoAgente[];
  error: string | null;
  latenciaMs: number;
}

const MAX_TURNOS = 5;
const MAX_CANDIDATOS_VISIBLES = 12;

export const HERRAMIENTAS: DefinicionHerramienta[] = [
  {
    type: 'function',
    function: {
      name: 'ver_puestos_libres',
      description: 'Lista los puestos libres más cercanos al puesto original, con su distancia estimada en metros.',
      parameters: {
        type: 'object',
        properties: { piso: { type: 'string', description: 'Opcional: filtra por piso (S1, S2 o S3).' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calcular_distancia',
      description: 'Distancia estimada en metros desde el puesto original hasta un puesto candidato.',
      parameters: {
        type: 'object',
        properties: { zona: { type: 'string', description: 'Código de zona, p. ej. S1-C' }, puesto: { type: 'integer' } },
        required: ['zona', 'puesto'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reasignar_puesto',
      description: 'Propone el nuevo puesto para el conductor. El sistema valida que siga libre.',
      parameters: {
        type: 'object',
        properties: {
          zona: { type: 'string' },
          puesto: { type: 'integer' },
          razon: { type: 'string', description: 'Por qué este puesto (una frase).' },
        },
        required: ['zona', 'puesto'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'avisar_conductor',
      description: 'Mensaje corto (máx. 200 caracteres, español, tuteo) que verá el conductor en su celular.',
      parameters: { type: 'object', properties: { mensaje: { type: 'string' } }, required: ['mensaje'] },
    },
  },
];

function instrucciones(ctx: ContextoAgente): string {
  const puesto = ctx.origen.puesto ? `puesto ${ctx.origen.puesto} de la zona ${ctx.origen.zona}` : `zona ${ctx.origen.zona}`;
  const causa = ctx.motivo === 'PUESTO_OCUPADO' ? 'otro vehículo (que no usa FastParking) ocupó ese puesto' : 'la zona se llenó';
  return [
    'Eres el agente de reasignación de FastParking, una PWA de parqueadero de un centro comercial (prototipo académico, datos simulados).',
    `Un conductor tenía retenido el ${puesto} (piso ${ctx.origen.piso}) y ${causa}.`,
    'Tu tarea: 1) usa ver_puestos_libres (y si quieres calcular_distancia); 2) elige el puesto que le ahorre más camino,',
    'prefiriendo el mismo piso y la misma zona; 3) llama reasignar_puesto UNA vez; 4) llama avisar_conductor con un mensaje',
    'amable y concreto que diga qué pasó, cuál es el nuevo puesto (formato S1-C-05) y que siga la flecha.',
    'No inventes puestos: solo puedes usar los que devuelve ver_puestos_libres. Responde siempre usando herramientas.',
  ].join(' ');
}

/** Decisión del plan B por reglas (D-21): el candidato más cercano según RN-14. */
function decidirPorReglas(ctx: ContextoAgente, inicio: number, base?: Partial<DecisionAgente>): DecisionAgente {
  const elegido = ordenarCandidatos(ctx.origen, ctx.candidatos)[0] ?? null;
  return {
    motor: 'REGLAS',
    modelo: base?.modelo ?? null,
    elegido,
    propuesta: base?.propuesta ?? null,
    propuestaValida: false,
    mensaje: elegido
      ? mensajeReglas({ zona: ctx.origen.zona, puesto: ctx.origen.puesto }, { zona: elegido.zona, puesto: elegido.puesto, distanciaMetros: elegido.distanciaMetros }, ctx.motivo)
      : 'Tu puesto ya no está disponible y no hay otro puesto libre en este momento.',
    pasos: base?.pasos ?? [],
    error: base?.error ?? null,
    latenciaMs: Date.now() - inicio,
  };
}

function leerArgumentos(texto: string): Record<string, unknown> {
  try {
    const v = JSON.parse(texto || '{}');
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Ejecuta el agente. Nunca lanza error: ante cualquier falla devuelve la decisión del plan B.
 * `esValido` permite que el backend confirme, con la base de datos bloqueada, que el puesto sigue libre.
 */
export async function decidirReasignacion(
  ctx: ContextoAgente,
  esValido: (c: PuestoCandidato) => Promise<boolean> = async () => true,
): Promise<DecisionAgente> {
  const inicio = Date.now();
  if (ctx.candidatos.length === 0) return decidirPorReglas(ctx, inicio);

  const proveedor = obtenerProveedorLLM();
  if (!proveedor) return decidirPorReglas(ctx, inicio, { error: 'Sin LLM configurado (LLM_API_KEY vacía)' });

  const ordenados = ordenarCandidatos(ctx.origen, ctx.candidatos);
  const pasos: PasoAgente[] = [];
  let propuesta: { zona: string; puesto: number } | null = null;
  let elegido: (PuestoCandidato & { distanciaMetros: number }) | null = null;
  let mensaje: string | null = null;

  const herramientas: Record<string, (a: Record<string, unknown>) => Promise<string>> = {
    ver_puestos_libres: async (a) => {
      const piso = typeof a.piso === 'string' ? a.piso.toUpperCase() : null;
      const lista = ordenados.filter((c) => !piso || c.piso === piso).slice(0, MAX_CANDIDATOS_VISIBLES);
      return JSON.stringify(lista.map((c) => ({ zona: c.zona, piso: c.piso, puesto: c.puesto, distanciaMetros: c.distanciaMetros })));
    },
    calcular_distancia: async (a) => {
      const c = ordenados.find((x) => x.zona === String(a.zona ?? '').toUpperCase() && x.puesto === Number(a.puesto));
      if (!c) return JSON.stringify({ error: 'Ese puesto no está en la lista de puestos libres.' });
      return JSON.stringify({ distanciaMetros: distanciaEstimada(ctx.origen, c) });
    },
    reasignar_puesto: async (a) => {
      propuesta = { zona: String(a.zona ?? '').toUpperCase(), puesto: Number(a.puesto) };
      const c = ordenados.find((x) => x.zona === propuesta!.zona && x.puesto === propuesta!.puesto);
      if (!c) return JSON.stringify({ ok: false, error: 'Puesto inexistente u ocupado. Elige uno de ver_puestos_libres.' });
      if (!(await esValido(c))) return JSON.stringify({ ok: false, error: 'Ese puesto acaba de ocuparse. Elige otro.' });
      elegido = c;
      return JSON.stringify({ ok: true, zona: c.zona, puesto: c.puesto, distanciaMetros: c.distanciaMetros });
    },
    avisar_conductor: async (a) => {
      mensaje = String(a.mensaje ?? '').trim().slice(0, 220) || null;
      return JSON.stringify({ ok: mensaje !== null });
    },
  };

  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), config.llm.timeoutMs);
  const conversacion: MensajeLLM[] = [
    { role: 'system', content: instrucciones(ctx) },
    { role: 'user', content: 'Reasigna al conductor ahora.' },
  ];

  try {
    for (let turno = 0; turno < MAX_TURNOS && !(elegido && mensaje); turno++) {
      const respuesta = await proveedor.completar(conversacion, HERRAMIENTAS, controlador.signal);
      conversacion.push(respuesta);
      const llamadas = respuesta.tool_calls ?? [];
      if (llamadas.length === 0) break;
      for (const llamada of llamadas) {
        const args = leerArgumentos(llamada.function.arguments);
        const fn = herramientas[llamada.function.name];
        const resultado = fn ? await fn(args) : JSON.stringify({ error: 'Herramienta desconocida' });
        pasos.push({ herramienta: llamada.function.name, argumentos: args, resultado: resultado.slice(0, 300) });
        conversacion.push({ role: 'tool', tool_call_id: llamada.id, content: resultado });
      }
    }
  } catch (err) {
    const error = controlador.signal.aborted ? `Tiempo agotado (${config.llm.timeoutMs} ms)` : (err as Error).message.slice(0, 200);
    registrarErrorLLM('reasignacion', new Error(error));
    return decidirPorReglas(ctx, inicio, { modelo: proveedor.modelo, pasos, propuesta, error });
  } finally {
    clearTimeout(temporizador);
  }

  if (!elegido) {
    return decidirPorReglas(ctx, inicio, {
      modelo: proveedor.modelo,
      pasos,
      propuesta,
      error: propuesta ? 'El LLM propuso un puesto inválido' : 'El LLM no propuso ningún puesto',
    });
  }
  const final = elegido as PuestoCandidato & { distanciaMetros: number };
  return {
    motor: 'LLM',
    modelo: proveedor.modelo,
    elegido: final,
    propuesta,
    propuestaValida: true,
    mensaje:
      mensaje ??
      mensajeReglas({ zona: ctx.origen.zona, puesto: ctx.origen.puesto }, { zona: final.zona, puesto: final.puesto, distanciaMetros: final.distanciaMetros }, ctx.motivo),
    pasos,
    error: null,
    latenciaMs: Date.now() - inicio,
  };
}
