#!/usr/bin/env node
/**
 * Simulador de eventos de ocupación de FastParking (actor ACT-03).
 * Genera eventos SINTÉTICOS etiquetados como fuente SIMULADOR. No representa sensores reales.
 *
 * Uso:
 *   node simulator/simular.mjs zonas                         muestra la disponibilidad actual
 *   node simulator/simular.mjs evento S1-C ENTRADA [n]        n vehículos entran a la zona S1-C
 *   node simulator/simular.mjs evento S1-C SALIDA [n]         n vehículos salen de la zona S1-C
 *   node simulator/simular.mjs llenar S1-C                    ocupa físicamente todos los cupos de la zona
 *   node simulator/simular.mjs escenario hora-pico            ejecuta simulator/escenarios/hora-pico.json
 *
 * Variables: API_URL (por defecto http://localhost:3000) y SIMULATOR_API_KEY (o se leen de backend/.env).
 */
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const envBackend = join(aqui, '..', 'backend', '.env');
if (!process.env.SIMULATOR_API_KEY && existsSync(envBackend)) process.loadEnvFile(envBackend);

const API = process.env.API_URL ?? 'http://localhost:3000';
const CLAVE = process.env.SIMULATOR_API_KEY ?? '';

async function api(ruta, opciones = {}) {
  const res = await fetch(`${API}${ruta}`, opciones);
  const cuerpo = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 200) {
    throw new Error(`${res.status} ${cuerpo?.error?.code ?? ''} ${cuerpo?.error?.message ?? ''}`.trim());
  }
  return cuerpo;
}

async function zonas() {
  const { pisos } = await api('/api/zones');
  return pisos.flatMap((p) => p.zonas);
}

async function evento(zona, tipo, cantidad = 1) {
  const r = await api('/api/simulator/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-simulator-key': CLAVE },
    body: JSON.stringify({ idEvento: randomUUID(), zona, tipo, cantidad, ocurridoEn: new Date().toISOString() }),
  });
  const conflictos = r.conflictos?.length
    ? ' | conflictos: ' + r.conflictos.map((c) => (c.tipo === 'REASIGNADA' ? `reasignada → ${c.zonaNueva}` : 'invalidada (sin alternativa)')).join(', ')
    : '';
  console.log(`[SIMULADOR] ${tipo} x${cantidad} en ${zona} → ${r.resultado}, ocupados=${r.ocupados ?? '-'}${conflictos}`);
  return r;
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const [, , comando, ...args] = process.argv;

try {
  switch (comando) {
    case 'zonas': {
      console.table(
        (await zonas()).map((z) => ({ zona: z.codigo, piso: z.pisoNombre, capacidad: z.capacidadTotal, ocupados: z.ocupados, retenidas: z.retenidas, cupo: z.cupoLogico, estado: z.estado })),
      );
      break;
    }
    case 'evento': {
      const [zona, tipo, n] = args;
      if (!zona || !['ENTRADA', 'SALIDA'].includes(tipo)) throw new Error('Uso: evento <ZONA> <ENTRADA|SALIDA> [cantidad]');
      await evento(zona.toUpperCase(), tipo, Number(n ?? 1));
      break;
    }
    case 'llenar': {
      const z = (await zonas()).find((x) => x.codigo === (args[0] ?? '').toUpperCase());
      if (!z) throw new Error('Zona no encontrada. Ejemplo: llenar S1-C');
      const libres = z.capacidadTotal - z.ocupados;
      if (libres === 0) console.log(`${z.codigo} ya está físicamente llena.`);
      else await evento(z.codigo, 'ENTRADA', libres);
      break;
    }
    case 'escenario': {
      const archivo = join(aqui, 'escenarios', `${args[0]}.json`);
      if (!existsSync(archivo)) throw new Error(`No existe el escenario ${args[0]}`);
      const escenario = JSON.parse(readFileSync(archivo, 'utf8'));
      console.log(`Escenario: ${escenario.descripcion}`);
      for (const paso of escenario.pasos) {
        await espera(paso.esperarMs ?? 0);
        await evento(paso.zona, paso.tipo, paso.cantidad ?? 1);
      }
      break;
    }
    default:
      console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]);
  }
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exitCode = 1;
}
