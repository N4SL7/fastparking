/**
 * Pruebas de integración de la API contra PostgreSQL real.
 * Cada bloque "CP-xx" corresponde a un caso de prueba del documento técnico (sección 10).
 */
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import { ejecutarExpiracion } from '../src/modules/retentions/expiration.scheduler.js';
import { app, crearSesion, enviarEvento, fijarOcupacion, prepararEsquema, reiniciarDatos, retener, zona } from './helpers.js';

beforeAll(prepararEsquema);
beforeEach(reiniciarDatos);
afterAll(() => pool.end());

describe('CP-01 acceso a la API (RF-01)', () => {
  it('el servicio y la base de datos responden', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ estado: 'ok', baseDatos: 'ok' });
  });

  it('el mismo QR reanuda la misma sesión anónima', async () => {
    const a = await crearSesion('TIQUETE-REPETIDO-01');
    const b = await crearSesion('TIQUETE-REPETIDO-01');
    expect(a).toBe(b);
  });
});

describe('CP-02 zonas con estados mixtos (RF-02, RF-03, RF-13)', () => {
  it('lista zonas por piso con estado textual, cupo y fecha de actualización', async () => {
    const res = await request(app).get('/api/zones');
    expect(res.status).toBe(200);
    expect(res.body.datosSimulados).toBe(true);
    expect(res.body.pisos).toHaveLength(3);
    const estados = new Set(res.body.pisos.flatMap((p: { zonas: { estado: string }[] }) => p.zonas.map((z) => z.estado)));
    expect([...estados].sort()).toEqual(['DISPONIBLE', 'LLENA', 'POCOS_CUPOS']);
    const s1b = await zona('S1-B');
    expect(s1b).toMatchObject({ estado: 'LLENA', cupoLogico: 0 });
    expect(typeof s1b.actualizadoEn).toBe('string');
  });
});

describe('CP-03 solicitar retención (RF-04)', () => {
  it('crea una retención VIGENTE con vencimiento a 10 minutos y descuenta el cupo', async () => {
    const sesion = await crearSesion();
    const antes = await zona('S1-C');
    const res = await retener(sesion, antes.idZona);
    expect(res.status).toBe(201);
    expect(res.body.estado).toBe('VIGENTE');
    const minutos = (Date.parse(res.body.venceEn) - Date.parse(res.body.creadaEn)) / 60_000;
    expect(minutos).toBe(10);
    expect(res.body.aviso).toContain('no garantiza');
    expect((await zona('S1-C')).cupoLogico).toBe(antes.cupoLogico - 1);
  });

  it('RN-11: una sesión no puede tener dos retenciones vigentes', async () => {
    const sesion = await crearSesion();
    await retener(sesion, 3);
    const res = await retener(sesion, 1);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RETENCION_VIGENTE_EXISTE');
  });

  it('RF-07: una zona sin cupo se rechaza y se sugieren alternativas', async () => {
    const sesion = await crearSesion();
    const res = await retener(sesion, 2); // S1-B está llena
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ZONA_SIN_CUPO');
    expect(res.body.error.details.alternativas.length).toBeGreaterThan(0);
    expect(res.body.error.details.alternativas[0].codigo).toBe('S1-A'); // la más cercana en el mismo piso
  });
});

describe('CP-04 expiración (RF-05)', () => {
  it('una retención vencida pasa a EXPIRADA y deja de contar', async () => {
    const sesion = await crearSesion();
    const { body } = await retener(sesion, 3);
    await pool.query(
      `UPDATE retencion SET creada_en = now() - interval '11 minutes', vence_en = now() - interval '1 minute'
       WHERE id_retencion = $1`,
      [body.idRetencion],
    );
    expect(await ejecutarExpiracion()).toBe(1);
    const res = await request(app).get(`/api/retentions/${body.idRetencion}`).set('x-session-id', sesion);
    expect(res.body.estado).toBe('EXPIRADA');
    const actual = await request(app).get('/api/retentions/current').set('x-session-id', sesion);
    expect(actual.body.retencion).toBeNull();
  });
});

describe('CP-05 conflicto por evento de ocupación (RF-06, RF-07, RF-15)', () => {
  it('reasigna automáticamente a la zona más cercana con cupo', async () => {
    const sesion = await crearSesion();
    const { body: original } = await retener(sesion, 3); // S1-C: 8 de capacidad, 3 ocupados
    const ev = await enviarEvento('S1-C', 'ENTRADA', 5); // 3 + 5 = 8 físicos → la retención ya no cabe
    expect(ev.status).toBe(201);
    expect(ev.body.conflictos).toHaveLength(1);
    expect(ev.body.conflictos[0]).toMatchObject({ tipo: 'REASIGNADA', zonaNueva: 'S1-D' });

    const anterior = await request(app).get(`/api/retentions/${original.idRetencion}`).set('x-session-id', sesion);
    expect(anterior.body).toMatchObject({ estado: 'REASIGNADA', motivoCierre: 'CONFLICTO_OCUPACION' });
    const actual = await request(app).get('/api/retentions/current').set('x-session-id', sesion);
    expect(actual.body.retencion).toMatchObject({ estado: 'VIGENTE', zonaCodigo: 'S1-D', idRetencionOrigen: original.idRetencion });
  });

  it('invalida la retención cuando no existe ninguna alternativa', async () => {
    const sesion = await crearSesion();
    const { body } = await retener(sesion, 3);
    await pool.query('UPDATE zona SET ocupados = capacidad_total WHERE id_zona <> 3');
    const ev = await enviarEvento('S1-C', 'ENTRADA', 5);
    expect(ev.body.conflictos[0].tipo).toBe('INVALIDADA');
    const res = await request(app).get(`/api/retentions/${body.idRetencion}`).set('x-session-id', sesion);
    expect(res.body).toMatchObject({ estado: 'INVALIDADA', motivoCierre: 'SIN_ALTERNATIVA' });
  });

  it('un evento repetido no se aplica dos veces (idempotencia)', async () => {
    const primero = await enviarEvento('S2-A', 'ENTRADA', 2);
    const repetido = await request(app)
      .post('/api/simulator/events')
      .set('x-simulator-key', 'clave-de-pruebas')
      .send({ idEvento: primero.body.idEvento, zona: 'S2-A', tipo: 'ENTRADA', cantidad: 2 });
    expect(repetido.body.resultado).toBe('DUPLICADO');
    expect((await zona('S2-A')).ocupados).toBe(8);
  });

  it('un evento tardío (más antiguo que el último aplicado) se descarta', async () => {
    await enviarEvento('S2-A', 'ENTRADA', 1, { ocurridoEn: new Date().toISOString() });
    const tardio = await enviarEvento('S2-A', 'SALIDA', 1, { ocurridoEn: new Date(Date.now() - 60_000).toISOString() });
    expect(tardio.body.resultado).toBe('DESCARTADO_TARDIO');
    expect((await zona('S2-A')).ocupados).toBe(7);
  });

  it('el simulador exige su clave (D-07)', async () => {
    const res = await request(app).post('/api/simulator/events').send({});
    expect(res.status).toBe(401);
  });
});

describe('CP-06 solicitudes concurrentes (RNF-03)', () => {
  it('dos conductores por el último cupo: solo uno obtiene la retención', async () => {
    await fijarOcupacion('S1-C', 7); // queda 1 cupo lógico
    const [a, b] = await Promise.all([crearSesion(), crearSesion()]);
    const resultados = await Promise.all([retener(a, 3), retener(b, 3)]);
    expect(resultados.map((r) => r.status).sort()).toEqual([201, 409]);
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM retencion WHERE id_zona = 3 AND estado = 'VIGENTE'`);
    expect(rows[0].n).toBe(1);
  });
});

describe('CP-07 cancelar retención (RF-08)', () => {
  it('pasa a CANCELADA, libera el cupo y no se puede cancelar dos veces', async () => {
    const sesion = await crearSesion();
    const antes = (await zona('S1-C')).cupoLogico;
    const { body } = await retener(sesion, 3);
    const res = await request(app).post(`/api/retentions/${body.idRetencion}/cancel`).set('x-session-id', sesion);
    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('CANCELADA');
    expect((await zona('S1-C')).cupoLogico).toBe(antes);
    const otra = await request(app).post(`/api/retentions/${body.idRetencion}/cancel`).set('x-session-id', sesion);
    expect(otra.status).toBe(409);
  });

  it('una sesión no puede cancelar la retención de otra', async () => {
    const [a, b] = await Promise.all([crearSesion(), crearSesion()]);
    const { body } = await retener(a, 3);
    const res = await request(app).post(`/api/retentions/${body.idRetencion}/cancel`).set('x-session-id', b);
    expect(res.status).toBe(404);
  });
});

describe('CP-08 guardar y recuperar ubicación (RF-09)', () => {
  it('guarda piso, zona y referencia, y los recupera en la misma sesión', async () => {
    const sesion = await crearSesion();
    const guardar = await request(app)
      .put('/api/vehicle-location')
      .set('x-session-id', sesion)
      .send({ idZona: 7, referencia: 'Columna C-12, cerca del ascensor' });
    expect(guardar.status).toBe(200);
    const res = await request(app).get('/api/vehicle-location').set('x-session-id', sesion);
    expect(res.body.ubicacion).toMatchObject({ zonaCodigo: 'S2-C', pisoNombre: 'Sótano 2', referencia: 'Columna C-12, cerca del ascensor' });
  });
});

describe('CP-09 manejo de errores (RF-14, RNF-05)', () => {
  it('sin sesión responde 401 con un mensaje comprensible', async () => {
    const res = await request(app).post('/api/retentions').send({ idZona: 3 });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SESION_REQUERIDA');
  });

  it('datos inválidos responden 400 VALIDACION', async () => {
    const sesion = await crearSesion();
    const res = await request(app).post('/api/retentions').set('x-session-id', sesion).send({ idZona: 'tres' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDACION');
  });

  it('una ruta inexistente responde 404 con el formato uniforme', async () => {
    const res = await request(app).get('/api/no-existe');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('RUTA_NO_ENCONTRADA');
  });
});
