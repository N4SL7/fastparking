# Matriz de trazabilidad

**Necesidad → Requerimiento → Proceso (BPMN) → Arquitectura (C4) → Datos (MER) → Código → Prueba**

Necesidad N-1: incertidumbre del conductor sobre dónde hay cupo y cambios de ocupación mientras busca.
Necesidad N-2: dificultad para recordar dónde quedó el vehículo.

| Necesidad | Req. | Tarea / evento BPMN | Componente C4 (nivel 3) | Entidad MER | Código | Prueba |
|---|---|---|---|---|---|---|
| N-1 | RF-01 | QR del tiquete escaneado · Abrir sesión anónima | Sesiones | SESION_VISITA | `modules/sessions/sessions.service.ts` · `frontend/src/components/Tiquete.tsx` · `hooks/useSesion.ts` | CP-01 |
| N-1 | RF-02, RF-03, RF-13 | Mostrar zonas por piso con hora de actualización | Disponibilidad | PISO, ZONA | `modules/zones/availability.service.ts` · `availability.rules.ts` · `frontend/src/components/Disponibilidad.tsx` · `hooks/useTiempoReal.ts` | CP-02 |
| N-1 | RF-04, RNF-03, RN-07, RN-11 | Bloquear zona y calcular cupo lógico · ¿Cupo lógico > 0? · Crear retención VIGENTE | Retenciones · Acceso a datos | RETENCION, HISTORIAL_RETENCION | `retentions.service.ts#solicitarRetencion` · `availability.service.ts#bloquearZona` · `db/pool.ts#withTransaction` | CP-03, CP-06 |
| N-1 | RF-07 | Mostrar alternativas cercanas | Retenciones · Disponibilidad | ZONA | `retentions.service.ts#sugerirAlternativas` · `availability.rules.ts#ordenarAlternativas` · `PanelAlternativas` | CP-03 |
| N-1 | RF-05 | Vence a los 7 min → Marcar EXPIRADA | Planificador de expiraciones | RETENCION, HISTORIAL_RETENCION | `expiration.scheduler.ts` · `retentions.repository.ts#expirarVencidas` | CP-04 |
| N-1 | RF-08 | Cancelación solicitada → Marcar CANCELADA | Retenciones | RETENCION, HISTORIAL_RETENCION | `retentions.service.ts#cancelarRetencion` · `PanelRetencion.tsx` | CP-07 |
| N-1 | RF-06, RF-12, RN-15 | Evento de ocupación recibido → Validar evento y actualizar ocupación | Adaptador de eventos · Procesador de eventos | EVENTO_OCUPACION, ZONA | `events/event.adapter.ts` · `events/events.service.ts` · `simulator/simular.mjs` | CP-05 |
| N-1 | RF-15, RN-13, RN-14 | ¿Hay alternativa? → Marcar REASIGNADA y crear nueva VIGENTE / Marcar INVALIDADA | Motor de reasignación · Notificador | RETENCION (id_retencion_origen), HISTORIAL_RETENCION | `retentions/reassignment.service.ts` · `shared/realtime.ts` · `App.tsx#alCambiarRetencion` | CP-05 |
| N-1, N-2 | RF-10 | Mostrar retención, cuenta regresiva y ruta animada | PWA (contenedor) | ZONA, PISO | `frontend/src/lib/plano.ts` · `components/MapaSotano.tsx` | Prueba de interfaz |
| N-1, N-2 | RF-16 | Llegada confirmada → Marcar UTILIZADA, sumar ocupación y guardar ubicación | Retenciones · Ubicación | RETENCION, EVENTO_OCUPACION (fuente CONDUCTOR), UBICACION_VEHICULO (puesto) | `retentions.service.ts#confirmarLlegada` | CP-10 |
| N-2 | RF-09 | (manual) | Ubicación del vehículo | UBICACION_VEHICULO | `modules/locations/*` · `frontend/src/components/MiVehiculo.tsx` | CP-08 |
| — | RF-14, RNF-05, RNF-10 | (transversal) | Capa HTTP | — | `shared/errors.ts` · `frontend/src/api.ts` · `EstadoDatos` | CP-09 |

## Casos de prueba automatizados

| ID | Escenario | Resultado esperado | Archivo |
|---|---|---|---|
| CP-01 | Health y sesión desde QR | API y BD responden; el mismo QR reanuda la sesión | `backend/tests/api.test.ts` |
| CP-02 | Zonas con estados mixtos | Aparecen DISPONIBLE, POCOS_CUPOS y LLENA con marca de tiempo | idem |
| CP-03 | Solicitar retención | VIGENTE a 7 min, cupo −1; 2.ª retención de la misma sesión → 409; zona llena → 409 con alternativas | idem |
| CP-04 | Vencimiento | EXPIRADA y deja de ser vigente | idem |
| CP-05 | Evento de ocupación | Reasignación a S1-D; invalidación sin alternativas; idempotencia; descarte de tardíos; clave del simulador | idem |
| CP-06 | Concurrencia | Dos conductores por el último cupo: estados [201, 409] y una sola VIGENTE | idem |
| CP-07 | Cancelar | CANCELADA, libera cupo, no se cancela dos veces, otra sesión no puede cancelarla | idem |
| CP-10 | Llegada confirmada | UTILIZADA, ocupados +1, cupo igual al que tenía con la retención, ubicación con puesto, evento CONDUCTOR, no se confirma dos veces | idem |
| CP-08 | Ubicación | Se guarda y recupera zona, piso y referencia | idem |
| CP-09 | Errores | 401 sin sesión, 400 validación, 404 ruta | idem |
| Unitarias | Reglas de negocio puras | Cupo lógico, clasificación, orden de alternativas, transiciones, afectadas | `backend/tests/reglas.test.ts` |
