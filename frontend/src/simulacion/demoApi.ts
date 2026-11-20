/** Llamadas a /api/demo/* (D-24). El PIN viaja en una cabecera y solo lo conoce quien presenta. */
export async function pedirDemo<T = unknown>(ruta: string, opciones: RequestInit = {}, pin?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(ruta, {
      ...opciones,
      headers: { 'content-type': 'application/json', ...(pin ? { 'x-demo-pin': pin } : {}), ...opciones.headers },
    });
  } catch {
    throw new Error('Sin conexión con el servidor de FastParking.');
  }
  const cuerpo = await res.json().catch(() => null);
  if (!res.ok) throw new Error(cuerpo?.error?.message ?? `Error ${res.status}`);
  return cuerpo as T;
}
