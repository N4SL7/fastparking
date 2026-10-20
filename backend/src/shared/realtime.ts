import type { Response } from 'express';
import { randomUUID } from 'node:crypto';

interface Suscriptor {
  res: Response;
  idSesion: string | null;
}

/**
 * Notificador en tiempo real con Server-Sent Events (D-09, RF-06, RNF-04).
 * - "zonas": cambió la disponibilidad; todas las PWA vuelven a consultar /api/zones.
 * - "retencion": cambió la retención de UNA sesión (reasignada, invalidada, expirada...).
 */
export class NotificadorSSE {
  private readonly suscriptores = new Map<string, Suscriptor>();

  suscribir(res: Response, idSesion: string | null): () => void {
    const id = randomUUID();
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // evita que nginx acumule los eventos
    });
    res.write('retry: 5000\n\n');
    this.suscriptores.set(id, { res, idSesion });
    const latido = setInterval(() => res.write(': latido\n\n'), 25_000);
    return () => {
      clearInterval(latido);
      this.suscriptores.delete(id);
    };
  }

  publicarZonasActualizadas(): void {
    this.enviar('zonas', { actualizadoEn: new Date().toISOString() }, () => true);
  }

  publicarRetencion(idSesion: string, datos: unknown): void {
    this.enviar('retencion', datos, (s) => s.idSesion === idSesion);
  }

  get totalSuscriptores(): number {
    return this.suscriptores.size;
  }

  private enviar(evento: string, datos: unknown, filtro: (s: Suscriptor) => boolean): void {
    const mensaje = `event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`;
    for (const s of this.suscriptores.values()) {
      if (filtro(s)) s.res.write(mensaje);
    }
  }
}

export const notificador = new NotificadorSSE();
