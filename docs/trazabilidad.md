# Matriz de trazabilidad

**Necesidad → Requerimiento → Proceso (BPMN) → Arquitectura (C4) → Datos (MER) → Código → Prueba**

Necesidad N-1: incertidumbre del conductor sobre dónde hay cupo y cambios de ocupación mientras busca.
Necesidad N-2: dificultad para recordar dónde quedó el vehículo.
Necesidad N-3: tiempo perdido haciendo fila en las cajas para pagar el parqueadero (se aborda con un pago simulado).

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
| N-1, N-2 | RF-10 | Mostrar retención, cuenta regresiva y ruta animada | PWA (contenedor) | ZONA, PISO, RETENCION (puesto) | `frontend/src/lib/plano.ts` · `components/MapaSotano.tsx` | Prueba de interfaz |
| N-1, N-2 | RF-16 | Llegada confirmada → Marcar UTILIZADA, sumar ocupación y guardar ubicación | Retenciones · Ubicación | RETENCION, EVENTO_OCUPACION (fuente CONDUCTOR), UBICACION_VEHICULO (puesto) | `retentions.service.ts#confirmarLlegada` | CP-10 |
| N-2 | RF-09 | (resultado de la llegada confirmada) | Ubicación del vehículo · Sesiones | UBICACION_VEHICULO, SESION_VISITA (hora de entrada) | `modules/locations/*` · `GET /api/sessions/current` · `frontend/src/components/MiVehiculo.tsx` | CP-08, CP-10 |
| N-3 | RF-11, RF-17, RN-08, RN-16 | (proceso de pago, posterior al estacionamiento) | Pagos | PAGO, SESION_VISITA | `modules/payments/*` · `frontend/src/components/Billetera.tsx` | CP-11 |
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
| CP-11 | Pago simulado e historial | Liquidación por minuto, un solo pago (2.º → 409), método inválido → 400, historial con 1 pago; puesto elegido en el mapa se guarda | idem |
| CP-08 | Ubicación | Se guarda y recupera zona, piso y referencia | idem |
| CP-09 | Errores | 401 sin sesión, 400 validación, 404 ruta | idem |
| Unitarias | Reglas de negocio puras | Cupo lógico, clasificación, orden de alternativas, transiciones, afectadas | `backend/tests/reglas.test.ts` |

## Versión 2.0 — IA, simulación 3D y despliegue

Necesidad N-4: el puesto reservado puede ser ocupado por un conductor que no usa FastParking.

| Necesidad | Req. | Tarea / evento BPMN | Componente C4 (nivel 3) | Entidad MER | Código | Prueba |
|---|---|---|---|---|---|---|
| N-4 | RF-19 | Evento de mensaje "carro intruso ocupa el puesto" | Tráfico y demo · Procesador de eventos | PUESTO, EVENTO_OCUPACION | `modules/traffic/traffic.service.ts` · `modules/events/events.service.ts` | CP-12 |
| N-4 | RF-18, RN-17 | Agente decide el nuevo puesto · el sistema valida · aviso al conductor | Agente LLM de reasignación · Motor de reasignación · Proveedor LLM | DECISION_AGENTE, RETENCION | `modules/agent/agent.service.ts` · `agent.rules.ts` · `retentions/reassignment.service.ts` | CP-13 |
| N-1 | RF-20 | Seguir la ruta en el mapa 3D; tráfico en vivo | PWA (3D) · Notificador SSE · Tráfico y demo | PUESTO | `frontend/src/components/3d/*` · `frontend/src/simulacion/Simulacion.tsx` · `retentions/navigation.service.ts` | CP-14 + interfaz |
| N-2, N-3 | RF-21, RN-19 | Consultar al asistente | Agente asistente | SESION_VISITA, UBICACION_VEHICULO, PAGO, RETENCION (lectura) | `modules/agent/assistant.service.ts` · `frontend/src/components/Asistente.tsx` | CP-15 |
| N-1 | RNF-13 | — | Render (Web Service) + Neon | — | `render.yaml` · `backend/src/app.ts` (STATIC_DIR) | Verificación en producción |

| Caso | Qué prueba | Resultado esperado | Archivo |
|---|---|---|---|
| CP-12 | Carro intruso sin LLM | Reasigna al puesto libre más cercano de la misma zona; motor REGLAS; decisión registrada | `backend/tests/agente.test.ts` |
| CP-13 | Agente LLM (proveedor simulado) | Usa sus 4 herramientas, elige un puesto válido y redacta el aviso; error, timeout y propuesta inválida → plan B | idem |
| CP-14 | Tráfico simulado | 40 movimientos mantienen `zona.ocupados` = puestos ocupados y no tocan puestos retenidos | idem |
| CP-15 | Asistente | Responde por reglas y con LLM usando herramientas de solo lectura; exige sesión | idem |

Total: **47 pruebas automatizadas en verde** (Vitest + Supertest contra PostgreSQL real).
