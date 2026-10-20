-- FastParking — Esquema inicial (MER v1.0)
-- Cada tabla se traza a requerimientos funcionales (ver docs/trazabilidad.md).

-- PISO: niveles del parqueadero (RF-02, RF-10)
CREATE TABLE piso (
  id_piso   SMALLINT     PRIMARY KEY,
  codigo    VARCHAR(10)  NOT NULL UNIQUE,
  nombre    VARCHAR(40)  NOT NULL,
  orden     SMALLINT     NOT NULL UNIQUE          -- posición vertical; se usa para buscar el piso más cercano (RF-15)
);

-- ZONA: unidad de disponibilidad agregada (RN-01). Guarda la ocupación física reportada por eventos.
CREATE TABLE zona (
  id_zona          SMALLINT     PRIMARY KEY,
  id_piso          SMALLINT     NOT NULL REFERENCES piso(id_piso),
  codigo           VARCHAR(10)  NOT NULL UNIQUE,
  nombre           VARCHAR(40)  NOT NULL,
  capacidad_total  INTEGER      NOT NULL CHECK (capacidad_total > 0),
  ocupados         INTEGER      NOT NULL DEFAULT 0,
  orden_cercania   SMALLINT     NOT NULL,          -- orden dentro del piso; menor diferencia = más cercana (RF-15)
  ultimo_evento_en TIMESTAMPTZ,                    -- marca del último evento aplicado; descarta eventos tardíos
  actualizado_en   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  es_simulada      BOOLEAN      NOT NULL DEFAULT TRUE,
  CONSTRAINT ck_zona_ocupados CHECK (ocupados BETWEEN 0 AND capacidad_total),
  CONSTRAINT uq_zona_piso_orden UNIQUE (id_piso, orden_cercania)
);

-- SESION_VISITA: sesión anónima creada desde el QR del tiquete (D-02). No guarda datos personales.
CREATE TABLE sesion_visita (
  id_sesion   UUID         PRIMARY KEY,
  token_hash  CHAR(64)     NOT NULL UNIQUE,        -- SHA-256 del token del QR; el token original no se almacena
  creada_en   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  expira_en   TIMESTAMPTZ  NOT NULL,
  CONSTRAINT ck_sesion_vigencia CHECK (expira_en > creada_en)
);

-- RETENCION: retención temporal simulada sobre una zona (RF-04, RF-05, RF-08, RF-15, RF-16)
CREATE TABLE retencion (
  id_retencion         UUID         PRIMARY KEY,
  id_sesion            UUID         NOT NULL REFERENCES sesion_visita(id_sesion),
  id_zona              SMALLINT     NOT NULL REFERENCES zona(id_zona),
  id_retencion_origen  UUID         REFERENCES retencion(id_retencion), -- se llena cuando nace de una reasignación
  estado               VARCHAR(12)  NOT NULL,
  creada_en            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  vence_en             TIMESTAMPTZ  NOT NULL,
  cerrada_en           TIMESTAMPTZ,
  motivo_cierre        VARCHAR(60),
  CONSTRAINT ck_retencion_estado CHECK (estado IN ('VIGENTE','CANCELADA','EXPIRADA','REASIGNADA','INVALIDADA','UTILIZADA')),
  CONSTRAINT ck_retencion_vence CHECK (vence_en > creada_en),
  CONSTRAINT ck_retencion_cierre CHECK ((estado = 'VIGENTE') = (cerrada_en IS NULL))
);
-- RN-11: una sola retención VIGENTE por sesión (garantizado por la base de datos, no solo por la API)
CREATE UNIQUE INDEX uq_retencion_vigente_por_sesion ON retencion (id_sesion) WHERE estado = 'VIGENTE';
CREATE INDEX ix_retencion_zona_vigente ON retencion (id_zona) WHERE estado = 'VIGENTE';

-- EVENTO_OCUPACION: eventos normalizados (RF-06, RF-12). Fuentes: SIMULADOR (adaptador) o CONDUCTOR (llegada confirmada, RF-16)
CREATE TABLE evento_ocupacion (
  id_evento    UUID         PRIMARY KEY,           -- lo asigna la fuente; repetirlo no duplica el efecto (idempotencia)
  id_zona      SMALLINT     NOT NULL REFERENCES zona(id_zona),
  tipo         VARCHAR(8)   NOT NULL CHECK (tipo IN ('ENTRADA','SALIDA')),
  cantidad     SMALLINT     NOT NULL CHECK (cantidad > 0),
  fuente       VARCHAR(12)  NOT NULL CHECK (fuente IN ('SIMULADOR','CONDUCTOR')),
  ocurrido_en  TIMESTAMPTZ  NOT NULL,
  recibido_en  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  resultado    VARCHAR(20)  NOT NULL CHECK (resultado IN ('APLICADO','DESCARTADO_TARDIO'))
);

-- HISTORIAL_RETENCION: cada cambio de estado de una retención (RF-12, RNF-09)
CREATE TABLE historial_retencion (
  id_historial     BIGSERIAL    PRIMARY KEY,
  id_retencion     UUID         NOT NULL REFERENCES retencion(id_retencion),
  estado_anterior  VARCHAR(12),
  estado_nuevo     VARCHAR(12)  NOT NULL,
  motivo           VARCHAR(60)  NOT NULL,
  id_evento        UUID         REFERENCES evento_ocupacion(id_evento),
  registrado_en    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX ix_historial_retencion ON historial_retencion (id_retencion);

-- UBICACION_VEHICULO: dónde dejó el vehículo el conductor (RF-09, RF-16). Una por sesión.
CREATE TABLE ubicacion_vehiculo (
  id_ubicacion   UUID         PRIMARY KEY,
  id_sesion      UUID         NOT NULL UNIQUE REFERENCES sesion_visita(id_sesion),
  id_zona        SMALLINT     NOT NULL REFERENCES zona(id_zona),
  puesto         SMALLINT     CHECK (puesto > 0),   -- número de puesto ilustrativo dentro de la zona
  referencia     VARCHAR(80),
  registrada_en  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
