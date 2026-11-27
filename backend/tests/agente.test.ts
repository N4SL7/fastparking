/**
 * Pruebas del agente de reasignación (RF-18, RF-19) — actividad 4.6 del plan de trabajo.
 * El LLM se reemplaza por proveedores falsos: así se prueban el caso feliz, la caída del servicio
 * y las propuestas inválidas sin gastar cuota ni depender de internet.
 */
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import { distanciaEstimada, ordenarCandidatos } from '../src/modules/agent/agent.rules.js';
import { fijarProveedorLLM, type MensajeLLM, type ProveedorLLM } from '../src/modules/agent/llm.provider.js';
import { generarMovimiento } from '../src/modules/traffic/traffic.service.js';
import { app, crearSesion, prepararEsquema, reiniciarDatos, zona } from './helpers.js';

const PIN = 'pin-de-pruebas';

beforeAll(prepararEsquema);
beforeEach(reiniciarDatos);
afterEach(() => fijarProveedorLLM(undefined));
afterAll(() => pool.end());

/** Proveedor falso: devuelve, en orden, las llamadas a herramientas indicadas (una respuesta por turno). */
function proveedorGuionado(turnos: { name: string; args: Record<string, unknown> }[][]): ProveedorLLM & { vistos: MensajeLLM[][] } {
  let i = 0;
  const vistos: MensajeLLM[][] = [];
  return {
    modelo: 'modelo-falso',
    vistos,
    async completar(mensajes) {
      vistos.push(structuredClone(mensajes));
      const turno = turnos[i++] ?? [];
      return {
        role: 'assistant',
        content: turno.length ? null : 'Listo.',
        tool_calls: turno.map((t, k) => ({ id: `c${i}-${k}`, type: 'function', function: { name: t.name, arguments: JSON.stringify(t.args) } })),
      };
    },
  };
}

async function retenerPuesto(idSesion: string, codigoZona: string, puesto?: number) {
  const z = await zona(codigoZona);
  return request(app).post('/api/retentions').set('x-session-id', idSesion).send({ idZona: z.idZona, puesto });
}

function intruso(idSesion?: string, pin = PIN) {
  return request(app).post('/api/demo/intruso').set('x-demo-pin', pin).send(idSesion ? { idSesion } : {});
}

async function decisiones() {
  const { rows } = await pool.query('SELECT * FROM decision_agente ORDER BY creada_en');
  return rows;
}

describe('Reglas del agente (plan B)', () => {
  it('prefiere el mismo piso, luego la zona más cercana y luego el puesto más cercano', () => {
    const origen = { idZona: 3, pisoOrden: 1, ordenCercania: 3, puesto: 4 };
    const c = (idZona: number, pisoOrden: number, ordenCercania: number, puesto: number) => ({
      idZona, zona: `Z${idZona}`, piso: `S${pisoOrden}`, pisoOrden, ordenCercania, puesto,
    });
    const orden = ordenarCandidatos(origen, [c(7, 2, 3, 1), c(1, 1, 1, 2), c(3, 1, 3, 8), c(3, 1, 3, 5)]);
    expect(orden.map((x) => `${x.idZona}-${x.puesto}`)).toEqual(['3-5', '3-8', '1-2', '7-1']);
    expect(distanciaEstimada(origen, c(3, 1, 3, 5))).toBeLessThan(distanciaEstimada(origen, c(7, 2, 3, 1)));
  });
});

describe('Ocupación por puesto (D-23)', () => {
  it('GET /api/zones entrega el estado de cada puesto y coincide con los ocupados de la zona', async () => {
    const s1c = await zona('S1-C');
    expect(s1c.puestos).toHaveLength(s1c.capacidadTotal);
    expect(s1c.puestos.filter((p: { estado: string }) => p.estado === 'OCUPADO')).toHaveLength(s1c.ocupados);
  });

  it('toda retención queda sobre un puesto libre y ese puesto aparece RETENIDO', async () => {
    const sesion = await crearSesion();
    const res = await retenerPuesto(sesion, 'S1-C');
    expect(res.status).toBe(201);
    expect(res.body.puesto).toBeGreaterThan(0);
    const s1c = await zona('S1-C');
    expect(s1c.puestos.find((p: { numero: number }) => p.numero === res.body.puesto).estado).toBe('RETENIDO');
  });

  it('rechaza retener un puesto que ya está ocupado (409 PUESTO_OCUPADO)', async () => {
    const s1c = await zona('S1-C');
    const ocupado = s1c.puestos.find((p: { estado: string }) => p.estado === 'OCUPADO').numero;
    const res = await retenerPuesto(await crearSesion(), 'S1-C', ocupado);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PUESTO_OCUPADO');
  });
});

describe('CP-12 carro intruso sin LLM → plan B por reglas (RF-19, D-21)', () => {
  it('reasigna al puesto libre más cercano de la misma zona y registra la decisión', async () => {
    fijarProveedorLLM(null);
    const sesion = await crearSesion();
    const ret = await retenerPuesto(sesion, 'S1-C');
    const res = await intruso(sesion);
    expect(res.status).toBe(201);
    expect(res.body.conflictos).toHaveLength(1);
    expect(res.body.conflictos[0]).toMatchObject({ tipo: 'REASIGNADA', zonaNueva: 'S1-C', motor: 'REGLAS' });
    expect(res.body.conflictos[0].mensaje).toContain('Otro vehículo ocupó tu puesto');

    const actual = await request(app).get('/api/retentions/current').set('x-session-id', sesion);
    expect(actual.body.retencion ?? actual.body).toBeTruthy();
    const anterior = await request(app).get(`/api/retentions/${ret.body.idRetencion}`).set('x-session-id', sesion);
    expect(anterior.body).toMatchObject({ estado: 'REASIGNADA', motivoCierre: 'PUESTO_OCUPADO' });

    const s1c = await zona('S1-C');
    expect(s1c.puestos.find((p: { numero: number }) => p.numero === ret.body.puesto).estado).toBe('OCUPADO');
    const [d] = await decisiones();
    expect(d).toMatchObject({ motor: 'REGLAS', motivo: 'PUESTO_OCUPADO', propuesta_valida: false });
  });

  it('los controles de la demo exigen el PIN', async () => {
    const res = await intruso(undefined, 'pin-equivocado');
    expect(res.status).toBe(401);
  });
});

describe('CP-13 agente LLM con herramientas (RF-18, D-18, D-20)', () => {
  it('el LLM usa sus herramientas, elige un puesto válido y redacta el aviso', async () => {
    const sesion = await crearSesion();
    const ret = await retenerPuesto(sesion, 'S1-C');
    const s1c = await zona('S1-C');
    const libre = s1c.puestos.filter((p: { estado: string }) => p.estado === 'LIBRE').at(-1).numero;
    const llm = proveedorGuionado([
      [{ name: 'ver_puestos_libres', args: { piso: 'S1' } }],
      [{ name: 'calcular_distancia', args: { zona: 'S1-C', puesto: libre } }],
      [
        { name: 'reasignar_puesto', args: { zona: 'S1-C', puesto: libre, razon: 'misma zona' } },
        { name: 'avisar_conductor', args: { mensaje: `Te moví al S1-C-${libre}, sigue la flecha.` } },
      ],
    ]);
    fijarProveedorLLM(llm);

    const res = await intruso(sesion);
    expect(res.body.conflictos[0]).toMatchObject({ tipo: 'REASIGNADA', motor: 'LLM', zonaNueva: 'S1-C', puestoNuevo: libre });
    expect(res.body.conflictos[0].mensaje).toBe(`Te moví al S1-C-${libre}, sigue la flecha.`);
    // El LLM recibió la lista real de puestos libres como resultado de la herramienta.
    const resultadoHerramienta = llm.vistos[1].find((m) => m.role === 'tool')!.content!;
    expect(JSON.parse(resultadoHerramienta).length).toBeGreaterThan(0);

    const [d] = await decisiones();
    expect(d).toMatchObject({ motor: 'LLM', modelo: 'modelo-falso', propuesta_valida: true, puesto_propuesto: libre });
    expect(d.pasos.map((p: { herramienta: string }) => p.herramienta)).toEqual([
      'ver_puestos_libres', 'calcular_distancia', 'reasignar_puesto', 'avisar_conductor',
    ]);
    expect(ret.body.puesto).not.toBe(libre);
  });

  it('si el LLM se cae (error), deciden las reglas y la demo sigue', async () => {
    fijarProveedorLLM({ modelo: 'caido', completar: async () => { throw new Error('503 Service Unavailable'); } });
    const sesion = await crearSesion();
    await retenerPuesto(sesion, 'S1-C');
    const res = await intruso(sesion);
    expect(res.body.conflictos[0]).toMatchObject({ tipo: 'REASIGNADA', motor: 'REGLAS' });
    const [d] = await decisiones();
    expect(d.error).toContain('503');
  });

  it('si el LLM no responde a tiempo, se aborta y deciden las reglas', async () => {
    fijarProveedorLLM({
      modelo: 'lento',
      completar: (_m, _h, senal) => new Promise((_, rechazar) => senal.addEventListener('abort', () => rechazar(new Error('abortado')))),
    });
    const sesion = await crearSesion();
    await retenerPuesto(sesion, 'S1-C');
    const res = await intruso(sesion);
    expect(res.body.conflictos[0].motor).toBe('REGLAS');
    const [d] = await decisiones();
    expect(d.error).toContain('Tiempo agotado');
  });

  it('una propuesta inválida del LLM (puesto ocupado o inventado) nunca se aplica', async () => {
    const sesion = await crearSesion();
    await retenerPuesto(sesion, 'S1-C');
    const s1c = await zona('S1-C');
    const ocupado = s1c.puestos.find((p: { estado: string }) => p.estado === 'OCUPADO').numero;
    fijarProveedorLLM(
      proveedorGuionado([
        [{ name: 'reasignar_puesto', args: { zona: 'S1-C', puesto: ocupado } }],
        [{ name: 'reasignar_puesto', args: { zona: 'S9-Z', puesto: 99 } }],
        [],
      ]),
    );
    const res = await intruso(sesion);
    expect(res.body.conflictos[0]).toMatchObject({ tipo: 'REASIGNADA', motor: 'REGLAS' });
    expect(res.body.conflictos[0].puestoNuevo).not.toBe(ocupado);
    const [d] = await decisiones();
    expect(d).toMatchObject({ propuesta_valida: false, zona_propuesta: 'S9-Z', puesto_propuesto: 99 });
  });

  it('GET /api/demo/estado muestra el motor y las últimas decisiones', async () => {
    fijarProveedorLLM(null);
    const sesion = await crearSesion();
    await retenerPuesto(sesion, 'S1-C');
    await intruso(sesion);
    const res = await request(app).get('/api/demo/estado');
    expect(res.status).toBe(200);
    expect(res.body.agente.motor).toBe('REGLAS');
    expect(res.body.decisiones[0]).toMatchObject({ motivo: 'PUESTO_OCUPADO', zonaAnterior: 'S1-C' });
  });
});

describe('CP-14 tráfico simulado (RF-20)', () => {
  it('cada movimiento mantiene zona.ocupados = puestos ocupados y nunca toca puestos retenidos', async () => {
    const sesion = await crearSesion();
    const ret = await retenerPuesto(sesion, 'S1-C');
    let semilla = 7;
    const azar = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 40; i++) await generarMovimiento(azar);
    const { rows } = await pool.query(
      `SELECT z.codigo, z.ocupados, (SELECT COUNT(*)::int FROM puesto p WHERE p.id_zona = z.id_zona AND p.ocupado) AS reales FROM zona z`,
    );
    for (const r of rows) expect(r.ocupados).toBe(r.reales);
    const actual = await request(app).get(`/api/retentions/${ret.body.idRetencion}`).set('x-session-id', sesion);
    expect(actual.body.estado).toBe('VIGENTE');
  });
});

describe('CP-15 asistente de ayuda del conductor (RF-21)', () => {
  function preguntar(idSesion: string, pregunta: string) {
    return request(app).post('/api/asistente').set('x-session-id', idSesion).send({ pregunta });
  }

  it('sin LLM responde por reglas con los datos reales de la sesión', async () => {
    fijarProveedorLLM(null);
    const sesion = await crearSesion();
    const cuenta = await preguntar(sesion, '¿Cuánto debo pagar?');
    expect(cuenta.status).toBe(200);
    expect(cuenta.body).toMatchObject({ motor: 'REGLAS', herramientas: ['ver_mi_cuenta'] });
    expect(cuenta.body.respuesta).toContain('Billetera');
    await retenerPuesto(sesion, 'S1-C');
    const reserva = await preguntar(sesion, '¿cuánto le queda a mi reserva?');
    expect(reserva.body.respuesta).toContain('S1-C');
  });

  it('con LLM usa herramientas de solo lectura y devuelve su respuesta', async () => {
    let turno = 0;
    const vistos: MensajeLLM[][] = [];
    fijarProveedorLLM({
      modelo: 'modelo-falso',
      async completar(mensajes) {
        vistos.push(structuredClone(mensajes));
        if (turno++ === 0) {
          return { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'ver_mi_vehiculo', arguments: '{}' } }] };
        }
        return { role: 'assistant', content: 'Aún no registras tu puesto; entraste hace un momento.' };
      },
    });
    const sesion = await crearSesion();
    const res = await preguntar(sesion, '¿dónde dejé mi carro?');
    expect(res.body).toMatchObject({ motor: 'LLM', herramientas: ['ver_mi_vehiculo'], respuesta: 'Aún no registras tu puesto; entraste hace un momento.' });
    // El LLM recibió el resultado real de la herramienta (hora de entrada de ESTA sesión).
    expect(vistos[1].find((m) => m.role === 'tool')!.content).toContain('horaEntrada');
  });

  it('si el LLM falla, responde el plan B', async () => {
    fijarProveedorLLM({ modelo: 'caido', completar: async () => { throw new Error('500'); } });
    const res = await preguntar(await crearSesion(), '¿hay puestos libres en S2?');
    expect(res.body).toMatchObject({ motor: 'REGLAS', herramientas: ['ver_disponibilidad'] });
    expect(res.body.respuesta).toContain('S2-');
  });

  it('exige sesión y valida la pregunta', async () => {
    expect((await request(app).post('/api/asistente').send({ pregunta: 'hola' })).status).toBe(401);
    const sesion = await crearSesion();
    expect((await preguntar(sesion, '')).status).toBe(400);
  });
});

describe('CP-16 intruso preparado y reinicio de la demo (v2.1)', () => {
  const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
  // El estado del intruso vive en memoria del servidor: cada prueba parte de una demo reiniciada.
  beforeEach(async () => {
    await request(app).post('/api/demo/reiniciar').set('x-demo-pin', PIN);
  });

  it('el intruso preparado espera y arranca solo cuando un conductor reserva; luego el agente reasigna', async () => {
    fijarProveedorLLM(null);
    const prep = await request(app).post('/api/demo/intruso/preparar').set('x-demo-pin', PIN);
    expect(prep.status).toBe(200);
    expect(prep.body.fase).toBe('ESPERANDO');
    const estado = await request(app).get('/api/demo/estado');
    expect(estado.body.intruso.fase).toBe('ESPERANDO');

    const sesion = await crearSesion();
    const ret = await retenerPuesto(sesion, 'S1-C');
    expect(ret.status).toBe(201);
    await esperar(300);

    const anterior = await request(app).get(`/api/retentions/${ret.body.idRetencion}`).set('x-session-id', sesion);
    expect(anterior.body).toMatchObject({ estado: 'REASIGNADA', motivoCierre: 'PUESTO_OCUPADO' });
    const [d] = await decisiones();
    expect(d).toMatchObject({ motor: 'REGLAS', motivo: 'PUESTO_OCUPADO' });
  });

  it('exige PIN y se puede cancelar mientras espera', async () => {
    expect((await request(app).post('/api/demo/intruso/preparar')).status).toBe(401);
    await request(app).post('/api/demo/intruso/preparar').set('x-demo-pin', PIN);
    const c = await request(app).post('/api/demo/intruso/cancelar').set('x-demo-pin', PIN);
    expect(c.body.fase).toBe('INACTIVO');
    const sesion = await crearSesion();
    const ret = await retenerPuesto(sesion, 'S1-C');
    await esperar(200);
    const r = await request(app).get(`/api/retentions/${ret.body.idRetencion}`).set('x-session-id', sesion);
    expect(r.body.estado).toBe('VIGENTE');
  });

  it('reiniciar la demo cancela las retenciones vigentes y retira los carros de la app', async () => {
    const sesion = await crearSesion();
    const ret = await retenerPuesto(sesion, 'S1-C');
    const res = await request(app).post('/api/demo/reiniciar').set('x-demo-pin', PIN);
    expect(res.status).toBe(200);
    expect(res.body.retencionesCanceladas).toBeGreaterThanOrEqual(1);
    const r = await request(app).get(`/api/retentions/${ret.body.idRetencion}`).set('x-session-id', sesion);
    expect(r.body).toMatchObject({ estado: 'CANCELADA', motivoCierre: 'REINICIO_DEMO' });
  });
});
