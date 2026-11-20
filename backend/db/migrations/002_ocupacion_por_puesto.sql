-- FastParking v2.0 — Ocupación por puesto y decisiones del agente de IA (D-22, D-23)
-- RF-19 (carro intruso): un evento puede ocupar un puesto concreto. RF-18: cada decisión del agente queda registrada.

-- PUESTO: espacio individual de una zona. La zona sigue siendo la unidad de cupo (RN-01) y su campo
-- "ocupados" es siempre igual al número de puestos ocupados (lo mantiene fp_ajustar_puestos).
CREATE TABLE puesto (
  id_puesto       SERIAL       PRIMARY KEY,
  id_zona         SMALLINT     NOT NULL REFERENCES zona(id_zona),
  numero          SMALLINT     NOT NULL CHECK (numero > 0),   -- 1 = más cercano a la rampa
  ocupado         BOOLEAN      NOT NULL DEFAULT FALSE,
  actualizado_en  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_puesto_zona_numero UNIQUE (id_zona, numero)
);

-- Un puesto retenido solo puede estar en UNA retención vigente (RNF-03 a nivel de puesto).
CREATE UNIQUE INDEX uq_retencion_vigente_por_puesto ON retencion (id_zona, puesto) WHERE estado = 'VIGENTE' AND puesto IS NOT NULL;

-- Los eventos pueden referirse a un puesto concreto (OCUPAR/LIBERAR un puesto = ENTRADA/SALIDA de 1 vehículo).
ALTER TABLE evento_ocupacion ADD COLUMN numero_puesto SMALLINT CHECK (numero_puesto > 0);

-- DECISION_AGENTE: trazabilidad de cada reasignación decidida por el agente LLM o por el plan B de reglas (D-20, D-21, D-22).
CREATE TABLE decision_agente (
  id_decision          UUID         PRIMARY KEY,
  id_retencion         UUID         NOT NULL REFERENCES retencion(id_retencion), -- retención afectada
  id_retencion_nueva   UUID         REFERENCES retencion(id_retencion),          -- retención creada (si hubo alternativa)
  id_evento            UUID         REFERENCES evento_ocupacion(id_evento),
  motivo               VARCHAR(30)  NOT NULL CHECK (motivo IN ('PUESTO_OCUPADO','CONFLICTO_OCUPACION')),
  motor                VARCHAR(8)   NOT NULL CHECK (motor IN ('LLM','REGLAS')),
  modelo               VARCHAR(60),
  zona_propuesta       VARCHAR(10),
  puesto_propuesto     SMALLINT,
  propuesta_valida     BOOLEAN      NOT NULL,                                     -- el backend aceptó la propuesta del LLM
  pasos                JSONB        NOT NULL DEFAULT '[]'::jsonb,                 -- herramientas que usó el agente
  mensaje              VARCHAR(240),
  error                VARCHAR(200),
  latencia_ms          INTEGER      NOT NULL CHECK (latencia_ms >= 0),
  creada_en            TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX ix_decision_agente_fecha ON decision_agente (creada_en DESC);

-- Ajusta los puestos ocupados de una zona para que coincidan con zona.ocupados.
-- Ocupa puestos libres no retenidos (orden pseudoaleatorio estable) o libera puestos ocupados.
CREATE FUNCTION fp_ajustar_puestos(p_zona SMALLINT) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  objetivo INTEGER;
  actuales INTEGER;
BEGIN
  INSERT INTO puesto (id_zona, numero)
  SELECT z.id_zona, g.n FROM zona z CROSS JOIN LATERAL generate_series(1, z.capacidad_total) AS g(n)
  WHERE z.id_zona = p_zona
  ON CONFLICT (id_zona, numero) DO NOTHING;

  SELECT ocupados INTO objetivo FROM zona WHERE id_zona = p_zona;
  SELECT COUNT(*) INTO actuales FROM puesto WHERE id_zona = p_zona AND ocupado;

  IF actuales < objetivo THEN
    UPDATE puesto SET ocupado = TRUE, actualizado_en = now()
    WHERE id_puesto IN (
      SELECT p.id_puesto FROM puesto p
      WHERE p.id_zona = p_zona AND NOT p.ocupado
        AND NOT EXISTS (SELECT 1 FROM retencion r WHERE r.id_zona = p.id_zona AND r.puesto = p.numero AND r.estado = 'VIGENTE')
      ORDER BY md5(p.id_zona::text || '-' || p.numero::text)
      LIMIT objetivo - actuales);
  ELSIF actuales > objetivo THEN
    UPDATE puesto SET ocupado = FALSE, actualizado_en = now()
    WHERE id_puesto IN (
      SELECT p.id_puesto FROM puesto p
      WHERE p.id_zona = p_zona AND p.ocupado
        AND NOT EXISTS (SELECT 1 FROM ubicacion_vehiculo u WHERE u.id_zona = p.id_zona AND u.puesto = p.numero)
      ORDER BY md5(p.id_zona::text || '-' || p.numero::text) DESC
      LIMIT actuales - objetivo);
  END IF;
END;
$$;

CREATE FUNCTION fp_ajustar_todos_los_puestos() RETURNS void LANGUAGE plpgsql AS $$
DECLARE z RECORD;
BEGIN
  FOR z IN SELECT id_zona FROM zona ORDER BY id_zona LOOP
    PERFORM fp_ajustar_puestos(z.id_zona);
  END LOOP;
END;
$$;

-- Crea los puestos de las zonas que ya existen (por ejemplo, la base desplegada en Neon).
SELECT fp_ajustar_todos_los_puestos();
