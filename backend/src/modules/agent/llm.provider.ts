import { config } from '../../config.js';

/**
 * Proveedor LLM intercambiable (D-19). Usa el formato "chat completions" compatible con OpenAI,
 * que ofrecen Gemini, Groq y OpenAI: cambiar de proveedor = cambiar LLM_BASE_URL y LLM_MODEL.
 * Se usa fetch nativo de Node.js: no se agregan dependencias.
 */
export interface MensajeLLM {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: LlamadaHerramienta[];
  tool_call_id?: string;
}

export interface LlamadaHerramienta {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface DefinicionHerramienta {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ProveedorLLM {
  readonly modelo: string;
  completar(mensajes: MensajeLLM[], herramientas: DefinicionHerramienta[], senal: AbortSignal): Promise<MensajeLLM>;
}

export class ProveedorCompatibleOpenAI implements ProveedorLLM {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    readonly modelo: string,
  ) {}

  async completar(mensajes: MensajeLLM[], herramientas: DefinicionHerramienta[], senal: AbortSignal): Promise<MensajeLLM> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.modelo, messages: mensajes, tools: herramientas, tool_choice: 'auto', temperature: 0.2 }),
      signal: senal,
    });
    if (!res.ok) {
      const detalle = (await res.text()).slice(0, 160);
      throw new Error(`LLM respondió ${res.status}: ${detalle}`);
    }
    const datos = (await res.json()) as { choices?: { message?: MensajeLLM }[] };
    const mensaje = datos.choices?.[0]?.message;
    if (!mensaje) throw new Error('Respuesta del LLM sin mensaje');
    return { role: 'assistant', content: mensaje.content ?? null, tool_calls: mensaje.tool_calls };
  }
}

/** Último error del LLM (para diagnóstico en /api/demo/estado y en los logs de Render). Nunca incluye la clave. */
export let ultimoErrorLLM: { mensaje: string; en: string } | null = null;
export function registrarErrorLLM(origen: string, err: unknown): void {
  const mensaje = `${origen}: ${(err as Error)?.message ?? String(err)}`.replace(/AIza[0-9A-Za-z_-]+/g, '[clave]').slice(0, 400);
  ultimoErrorLLM = { mensaje, en: new Date().toISOString() };
  console.warn('[llm]', mensaje);
}

let proveedorDePrueba: ProveedorLLM | null | undefined;

/** Solo para pruebas automatizadas: reemplaza el proveedor (null = sin LLM). */
export function fijarProveedorLLM(p: ProveedorLLM | null | undefined): void {
  proveedorDePrueba = p;
}

/** Proveedor configurado, o null si no hay clave (entonces actúa el plan B por reglas). */
export function obtenerProveedorLLM(): ProveedorLLM | null {
  if (proveedorDePrueba !== undefined) return proveedorDePrueba;
  if (!config.llm.apiKey) return null;
  return new ProveedorCompatibleOpenAI(config.llm.baseUrl, config.llm.apiKey, config.llm.model);
}
