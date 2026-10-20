# Modelo Entidad-Relación v1.0

Diagrama: `diagramas/mer.png` · Implementación: `backend/db/migrations/001_esquema_inicial.sql` (misma nomenclatura).

## Diccionario de entidades

| Entidad | Atributos principales | Claves | Restricciones | Requerimientos |
|---|---|---|---|---|
| PISO | id_piso, codigo, nombre, orden | PK id_piso · UK codigo · UK orden | NOT NULL | RF-02, RF-10, RF-15 |
| ZONA | id_zona, id_piso, codigo, nombre, capacidad_total, ocupados, orden_cercania, ultimo_evento_en, actualizado_en, es_simulada | PK id_zona · FK id_piso → PISO · UK codigo · UK (id_piso, orden_cercania) | capacidad_total > 0 · 0 ≤ ocupados ≤ capacidad_total | RF-02, RF-03, RF-06, RF-13, RF-15 |
| SESION_VISITA | id_sesion, token_hash, creada_en, expira_en | PK id_sesion · UK token_hash | expira_en > creada_en · solo hash SHA-256 del QR | RF-01 |
| RETENCION | id_retencion, id_sesion, id_zona, id_retencion_origen, estado, creada_en, vence_en, cerrada_en, motivo_cierre | PK id_retencion · FK id_sesion → SESION_VISITA · FK id_zona → ZONA · FK id_retencion_origen → RETENCION | estado ∈ {VIGENTE, CANCELADA, EXPIRADA, REASIGNADA, INVALIDADA} · vence_en > creada_en · cerrada_en nula ⇔ VIGENTE · índice único parcial: una VIGENTE por sesión | RF-04, RF-05, RF-08, RF-15 |
| HISTORIAL_RETENCION | id_historial, id_retencion, id_evento, estado_anterior, estado_nuevo, motivo, registrado_en | PK id_historial · FK id_retencion → RETENCION · FK id_evento → EVENTO_OCUPACION (nula) | NOT NULL en estado_nuevo y motivo | RF-12, RNF-09 |
| EVENTO_OCUPACION | id_evento, id_zona, tipo, cantidad, fuente, ocurrido_en, recibido_en, resultado | PK id_evento (lo asigna la fuente → idempotencia) · FK id_zona → ZONA | tipo ∈ {ENTRADA, SALIDA} · cantidad > 0 · fuente = SIMULADOR · resultado ∈ {APLICADO, DESCARTADO_TARDIO} | RF-06, RF-12 |
| UBICACION_VEHICULO | id_ubicacion, id_sesion, id_zona, referencia, registrada_en | PK id_ubicacion · FK+UK id_sesion → SESION_VISITA · FK id_zona → ZONA | referencia ≤ 80 caracteres · sin GPS | RF-09 |

## Relaciones y cardinalidades

| Relación | Cardinalidad | Significado |
|---|---|---|
| PISO contiene ZONA | 1 : 1..N | Cada zona pertenece a un piso |
| ZONA es retenida en RETENCION | 1 : 0..N | Histórico de retenciones; las reglas controlan las vigentes |
| SESION_VISITA solicita RETENCION | 1 : 0..N | Máximo una VIGENTE a la vez (RN-11) |
| RETENCION origina RETENCION | 0..1 : 0..1 | Una reasignación crea exactamente una retención nueva |
| RETENCION registra HISTORIAL_RETENCION | 1 : 1..N | Cada cambio de estado deja constancia |
| EVENTO_OCUPACION provoca HISTORIAL_RETENCION | 0..1 : 0..N | Cambios causados por un evento |
| ZONA recibe EVENTO_OCUPACION | 1 : 0..N | Eventos de prueba a lo largo del tiempo |
| SESION_VISITA guarda UBICACION_VEHICULO | 1 : 0..1 | Una ubicación por sesión (se actualiza) |
| ZONA ubica UBICACION_VEHICULO | 1 : 0..N | Zona donde quedó el vehículo |

## Entidades retiradas respecto a la versión 0.9

| Entidad v0.9 | Motivo |
|---|---|
| ESTADO_ZONA | Se integró en ZONA (`ocupados`, `actualizado_en`); las retenidas se calculan, no se duplican |
| ADMINISTRADOR | Sin RF que la justifique (D-07) |
| AUDITORIA | Reemplazada por HISTORIAL_RETENCION + EVENTO_OCUPACION (D-10) |
| PAGO_SIMULADO | RF-11 retirado (D-08) |
| NODO_PLANO, TRAMO_PLANO | Sin rutas ni Dijkstra (D-05, D-06) |
