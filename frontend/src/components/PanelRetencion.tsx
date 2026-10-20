import type { Retencion } from '../types';
import { IconoNavegar, IconoReloj } from './iconos';

function restante(venceEn: string, ahora: number) {
  const s = Math.max(0, Math.floor((Date.parse(venceEn) - ahora) / 1000));
  return { texto: `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`, segundos: s };
}

/** RF-04 / RF-08: retención vigente con cuenta regresiva (7 min), ruta y cancelación. */
export function PanelRetencion({
  retencion,
  ahora,
  ocupado,
  onCancelar,
  onVerRuta,
}: {
  retencion: Retencion;
  ahora: number;
  ocupado: boolean;
  onCancelar: () => void;
  onVerRuta: () => void;
}) {
  const r = restante(retencion.venceEn, ahora);
  const total = (Date.parse(retencion.venceEn) - Date.parse(retencion.creadaEn)) / 1000;
  const fraccion = Math.max(0, Math.min(1, r.segundos / total));
  const circ = 2 * Math.PI * 34;
  return (
    <section className="tarjeta tarjeta--marca retencion" aria-labelledby="titulo-retencion">
      <div className="retencion__fila">
        <div>
          <p className="etiqueta etiqueta--clara">Retención temporal simulada</p>
          <h2 id="titulo-retencion" className="titulo-grande">
            {retencion.zonaCodigo}
          </h2>
          <p className="texto-claro">
            {retencion.pisoNombre} · {retencion.zonaNombre.replace(/^Zona \w — /, '')}
          </p>
          {retencion.idRetencionOrigen && <p className="pastilla">↻ Reasignada automáticamente</p>}
        </div>
        <div className="anillo" aria-label={`Tiempo restante ${r.texto}`}>
          <svg viewBox="0 0 80 80" width="88" height="88" aria-hidden="true">
            <circle cx="40" cy="40" r="34" className="anillo__fondo" />
            <circle
              cx="40"
              cy="40"
              r="34"
              className="anillo__valor"
              strokeDasharray={circ}
              strokeDashoffset={circ * (1 - fraccion)}
              transform="rotate(-90 40 40)"
            />
          </svg>
          <span className="anillo__texto">
            <IconoReloj size={14} />
            {r.texto}
          </span>
        </div>
      </div>
      <p className="texto-claro texto-chico">{retencion.aviso}</p>
      <div className="retencion__acciones">
        <button type="button" className="boton boton--claro" onClick={onVerRuta}>
          <IconoNavegar size={16} /> Ir con la ruta
        </button>
        <button type="button" className="boton boton--contorno-claro" disabled={ocupado} onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </section>
  );
}
