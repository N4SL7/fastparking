import type { Retencion } from '../types';

function restante(venceEn: string, ahora: number): string {
  const s = Math.max(0, Math.floor((Date.parse(venceEn) - ahora) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** RF-04 / RF-08: retención vigente con cuenta regresiva y opción de cancelar. */
export function PanelRetencion({
  retencion,
  ahora,
  ocupado,
  onCancelar,
}: {
  retencion: Retencion;
  ahora: number;
  ocupado: boolean;
  onCancelar: () => void;
}) {
  const tiempo = restante(retencion.venceEn, ahora);
  return (
    <section className="panel panel--retencion" aria-labelledby="titulo-retencion">
      <div className="panel__fila">
        <div>
          <p className="panel__etiqueta">Retención temporal simulada</p>
          <h2 id="titulo-retencion" className="panel__titulo">
            {retencion.zonaCodigo} · {retencion.pisoNombre}
          </h2>
          <p className="panel__detalle">{retencion.zonaNombre}</p>
          {retencion.idRetencionOrigen && <p className="panel__detalle">↻ Reasignada automáticamente</p>}
        </div>
        <div className="contador" aria-label={`Tiempo restante ${tiempo}`}>
          <span className="contador__valor">{tiempo}</span>
          <span className="contador__texto">restante</span>
        </div>
      </div>
      <p className="panel__aviso">{retencion.aviso}</p>
      <button type="button" className="boton boton--secundario" disabled={ocupado} onClick={onCancelar}>
        Cancelar retención
      </button>
    </section>
  );
}
