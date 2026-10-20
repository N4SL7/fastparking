import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { crearApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { aplicarMigraciones, cargarSeed } from '../src/db/migrate.js';

export const app = crearApp();
export const CLAVE_SIMULADOR = 'clave-de-pruebas';

/** Recrea el esquema completo una vez por archivo de pruebas. */
export async function prepararEsquema(): Promise<void> {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await aplicarMigraciones(pool);
}

/** Restaura los datos ilustrativos antes de cada prueba (escenario reproducible, RF-12). */
export async function reiniciarDatos(): Promise<void> {
  await cargarSeed(pool);
}

export async function crearSesion(qrToken = `TIQUETE-${randomUUID()}`): Promise<string> {
  const res = await request(app).post('/api/sessions').send({ qrToken });
  if (res.status !== 201) throw new Error(`No se pudo crear la sesión: ${res.status}`);
  return res.body.idSesion as string;
}

export function retener(idSesion: string, idZona: number) {
  return request(app).post('/api/retentions').set('x-session-id', idSesion).send({ idZona });
}

export function enviarEvento(zona: string, tipo: 'ENTRADA' | 'SALIDA', cantidad = 1, extra: Record<string, unknown> = {}) {
  return request(app)
    .post('/api/simulator/events')
    .set('x-simulator-key', CLAVE_SIMULADOR)
    .send({ idEvento: randomUUID(), zona, tipo, cantidad, ...extra });
}

export async function fijarOcupacion(codigoZona: string, ocupados: number): Promise<void> {
  await pool.query('UPDATE zona SET ocupados = $2 WHERE codigo = $1', [codigoZona, ocupados]);
}

export async function zona(codigo: string) {
  const res = await request(app).get('/api/zones');
  for (const p of res.body.pisos) for (const z of p.zonas) if (z.codigo === codigo) return z;
  throw new Error(`zona ${codigo} no encontrada`);
}
