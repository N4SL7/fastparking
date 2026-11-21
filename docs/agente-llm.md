# Agente LLM de reasignación — FastParking v2.0

> Artefacto 4.2 del plan de trabajo · Asignatura Inteligencia Artificial · Autora: Nasly Trujillo
> Código: [`backend/src/modules/agent`](../backend/src/modules/agent) · Pruebas: [`backend/tests/agente.test.ts`](../backend/tests/agente.test.ts)

## 1. Problema que resuelve

FastParking **no reemplaza** el parqueadero: convive con conductores que no usan la app. Si un conductor reservó (retención temporal simulada de 7 min) el puesto **S1-C-05** y otro vehículo lo ocupa antes de que llegue, el sistema debe:

1. darse cuenta (evento de ocupación del puesto);
2. **decidir** a qué puesto enviarlo ahora;
3. **avisarle** en su celular y **redirigir la flecha** de navegación.

El paso 2 lo toma un **agente de IA**.

## 2. ¿Por qué es un agente y no solo un chatbot?

Un **agente** es un LLM que, dentro de un ciclo, **razona y actúa usando herramientas** sobre un entorno, hasta cumplir un objetivo. En FastParking:

| Elemento del agente | En FastParking |
|---|---|
| Objetivo | Reubicar al conductor en el puesto que le ahorre más camino |
| Entorno | Estado real del parqueadero (PostgreSQL) |
| Percepción | Herramientas `ver_puestos_libres` y `calcular_distancia` |
| Acción | Herramientas `reasignar_puesto` y `avisar_conductor` |
| Ciclo | Hasta 5 turnos: el LLM pide herramientas → el backend las ejecuta → el LLM recibe el resultado |
| Guardarraíles | El backend valida cada acción (D-20) y existe un plan B por reglas (D-21) |

## 3. Herramientas

| Herramienta | Tipo | Qué hace | Validación del backend |
|---|---|---|---|
| `ver_puestos_libres(piso?)` | Percepción | Devuelve hasta 12 puestos libres reales, ordenados por cercanía, con distancia estimada en metros | Solo lee datos reales: el LLM no puede "ver" puestos inexistentes |
| `calcular_distancia(zona, puesto)` | Percepción | Distancia estimada desde el puesto original | Error si el puesto no está libre |
| `reasignar_puesto(zona, puesto, razon)` | Acción | Propone el nuevo puesto | Con la zona **bloqueada** (`SELECT … FOR UPDATE`) se comprueba que siga libre y con cupo; si no, devuelve error y el LLM puede corregir |
| `avisar_conductor(mensaje)` | Acción | Mensaje (máx. 220 caracteres) que llega al celular por SSE | Se recorta y se guarda en `decision_agente` |

## 4. Ciclo de decisión

```mermaid
sequenceDiagram
  autonumber
  participant SIM as Simulador / iPad (carro intruso)
  participant API as API FastParking
  participant AG as Agente (agent.service)
  participant LLM as LLM (Gemini)
  participant DB as PostgreSQL
  participant PWA as Celular del conductor

  SIM->>API: OCUPAR puesto S1-C-05
  API->>DB: bloquea zona, marca puesto ocupado
  API->>DB: ¿había una retención VIGENTE en ese puesto? → sí
  API->>AG: decidirReasignacion(origen, candidatos)
  AG->>LLM: instrucciones + herramientas
  LLM-->>AG: ver_puestos_libres(piso S1)
  AG-->>LLM: [S1-C-06 5 m, S1-C-08 10 m, S1-D-02 27 m…]
  LLM-->>AG: reasignar_puesto(S1-C, 6) + avisar_conductor("…")
  AG->>DB: valida S1-C-06 con la zona bloqueada → libre ✔
  AG-->>API: decisión (motor LLM)
  API->>DB: retención anterior → REASIGNADA; nueva VIGENTE en S1-C-06; registra decision_agente
  API-->>PWA: SSE "retencion" (mensaje del agente)
  PWA->>PWA: muestra el aviso y la flecha recalcula la ruta
```

## 5. Plan B y guardarraíles

| Situación | Qué pasa | Prueba |
|---|---|---|
| Sin `LLM_API_KEY` | Deciden las reglas (RN-14 por puesto: mismo piso → zona más cercana → puesto más cercano) | CP-12 |
| El LLM responde error (cuota, 503…) | Deciden las reglas; se guarda el error | CP-13 "se cae" |
| El LLM tarda más de `LLM_TIMEOUT_MS` (8 s) | Se aborta la petición y deciden las reglas | CP-13 "no responde a tiempo" |
| El LLM propone un puesto ocupado o inventado | No se aplica nunca; deciden las reglas | CP-13 "propuesta inválida" |
| No hay ningún puesto libre | La retención pasa a INVALIDADA y se avisa | Reglas existentes (CP-05) |

**Consecuencia:** la concurrencia y la integridad de los datos nunca dependen del LLM. El LLM aporta la elección del puesto y un aviso natural; la base de datos garantiza que la decisión sea válida.

## 6. Trazabilidad: tabla `decision_agente`

Cada decisión guarda motor (`LLM` / `REGLAS`), modelo, puesto propuesto, si la propuesta fue válida, herramientas usadas, mensaje, error y latencia. El iPad las muestra en vivo en `/simulacion` (endpoint `GET /api/demo/estado`).

## 7. Configuración del proveedor (sin secretos en el repositorio)

| Variable | Ejemplo | Dónde se define |
|---|---|---|
| `LLM_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta/openai` | `.env` local / Render |
| `LLM_API_KEY` | *(clave de Google AI Studio)* | **Solo** `.env` local y panel de Render |
| `LLM_MODEL` | `gemini-3.8-flash` | `.env` / Render (cámbialo si AI Studio indica otro modelo vigente) |
| `LLM_TIMEOUT_MS` | `8000` | `.env` / Render |

Cambiar a otro proveedor compatible (Groq, OpenAI) solo requiere cambiar `LLM_BASE_URL` y `LLM_MODEL` (D-19).

## 8. Requerimientos nuevos

| ID | Requerimiento | Criterio de aceptación |
|---|---|---|
| RF-18 | Reasignación por agente LLM | Ante un conflicto, el agente usa herramientas y propone un puesto; el backend lo valida; se registra en `decision_agente` |
| RF-19 | Carro intruso | Un evento de ocupación sobre un puesto retenido dispara la reasignación y el aviso al conductor en menos de 10 s |
| RF-20 | Simulación de tráfico | Desde `/simulacion` (con PIN) se enciende un tráfico aleatorio que entra, se estaciona y sale; celular e iPad ven lo mismo |
| RN-17 | El LLM solo propone | Ninguna propuesta del LLM se aplica sin validación del backend; sin LLM decide el plan B |

## 9. Limitaciones

- El parqueadero, los puestos y las distancias son **ilustrativos** (RN-09).
- El LLM puede variar su redacción: el mensaje se limita a 220 caracteres y su contenido no afecta los datos.
- Mientras el agente decide, la zona afectada permanece bloqueada (máximo `LLM_TIMEOUT_MS`): aceptable en un prototipo, documentado como mejora futura (decidir fuera de la transacción con reserva optimista).

## 10. Segundo agente: asistente de ayuda del conductor (RF-21)

Botón flotante en la app del celular que abre un chat. El conductor pregunta en lenguaje natural y el agente responde **con los datos de su propia visita**.

| Herramienta | Qué consulta | Alcance |
|---|---|---|
| `ver_mi_vehiculo` | Dónde quedó el carro y hora de entrada | Solo la sesión del conductor |
| `ver_mi_reserva` | Puesto retenido y minutos restantes | Solo la sesión del conductor |
| `ver_mi_cuenta` | Minutos, tarifa ilustrativa y valor, o pago ya hecho | Solo la sesión del conductor |
| `ver_disponibilidad` | Puestos libres por piso y zona | Dato agregado, público |

**Guardarraíles:**
- Todas las herramientas son de **solo lectura**: el asistente no reserva, no cancela ni paga. Indica qué botón usar.
- Sin LLM, ante un error o al agotarse el tiempo, responde un **plan B por palabras clave** con las mismas herramientas.
- La pregunta se valida en el servidor (máximo 300 caracteres) y el historial se limita a los últimos 6 turnos.

Código: [`assistant.service.ts`](../backend/src/modules/agent/assistant.service.ts) · Endpoint `POST /api/asistente` (requiere `X-Session-Id`) · Pruebas: CP-15 en `agente.test.ts` · Captura: `docs/capturas/16-asistente-ia.png`.

| ID | Requerimiento | Criterio de aceptación |
|---|---|---|
| RF-21 | Asistente de ayuda con IA | Responde dónde está el vehículo, el valor a pagar, el tiempo de la reserva y la disponibilidad usando herramientas de solo lectura; sin LLM responde por reglas |
