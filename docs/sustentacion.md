# Guion de sustentación — FastParking v2.0

> Artefacto 6.4 del plan de trabajo · Duración: 10 minutos · Autora: Nasly Trujillo
> Equipos: **iPad** (simulación), **celular** (app del conductor), **PC** (código).

## Antes de empezar (5 minutos antes)

1. Abrir **https://fastparking.onrender.com** en el PC. El plan gratuito de Render se duerme: la primera carga tarda unos 50 s.
2. **iPad:** abrir `/simulacion`, escribir el PIN y elegir **S1**. Verificar que arriba diga **"Agente: LLM · gemini-3.8-flash"**.
3. **Celular:** abrir la app y dejar el tiquete con el QR a la vista.
4. **PC:** VS Code con `backend/src/modules/agent/agent.service.ts` abierto.
5. No hacer muchas pruebas antes: la cuota gratuita de Gemini es limitada.

## Guion (10 min)

| Min | Qué digo | Qué muestro |
|---|---|---|
| 0–1 | **Problema:** en un centro comercial se pierde tiempo buscando parqueadero y haciendo fila para pagar. FastParking **complementa** el tiquete físico, no lo reemplaza. | Tiquete con QR en el celular |
| 1–2 | **Entrada sin instalar nada:** el QR del tiquete abre la PWA. Sesión anónima, sin datos personales. | Escanear el QR → Inicio |
| 2–3 | **Reserva de 7 minutos:** toco un puesto libre en el mapa 3D y lo reservo. En el iPad aparece mi carro **vinotinto** en la rampa. | Mapa → puesto → "Reservar 7 min" · panel "Conductores con FastParking" |
| 3–4 | **Navegación:** la flecha me guía como un GPS. El carro del iPad avanza **sincronizado** con mi flecha. | "Ir a…" en el celular, carro en el iPad |
| 4–6 | **El problema real: el carro intruso.** Un conductor sin la app entra por la otra puerta (carro **naranja**) y llega primero. El **agente de IA** decide el nuevo puesto, me avisa y la flecha cambia sola. | Botón "Carro intruso" → aviso en el celular → carro vinotinto redirigido |
| 6–7 | **Cómo decidió la IA:** "Decisiones de la IA → Ver detalle": motor LLM, las 4 herramientas, el mensaje y la latencia. **La IA solo propone; el sistema valida.** Si falla, decide el plan B. | Panel del iPad · código de `agent.service.ts` |
| 7–8 | **Llegada y pago:** confirmo que estacioné, veo "Mi vehículo" con "Llévame a mi carro", pago en la Billetera (simulado) y obtengo el QR de salida. Pregunto al asistente "¿cuánto debo?". | Celular |
| 8–9 | **Arquitectura:** PWA (React + Three.js) → API Node.js en Render → PostgreSQL en Neon; Gemini por HTTPS con herramientas; avisos en vivo por SSE. | `docs/diagramas/componentes-v2.png` |
| 9–10 | **Calidad y límites:** 47 pruebas automáticas, CI en GitHub, trazabilidad completa. Datos ilustrativos, la reserva no garantiza el cupo físico, el pago no mueve dinero. | README y documento técnico |

## Explicación corta de la IA

> "FastParking tiene **dos agentes** que usan **Gemini**. Son agentes porque no solo responden: **usan herramientas para actuar**.
> El **agente de reasignación** ve los puestos libres, calcula distancias, propone el puesto y avisa al conductor.
> El **asistente** responde dudas consultando los datos de la visita, solo en modo lectura.
> **La IA solo propone; el sistema valida** contra la base de datos, y si la IA falla actúa un plan B por reglas. Cada decisión queda registrada."

## 10 preguntas probables del jurado

| # | Pregunta | Respuesta preparada |
|---|---|---|
| 1 | ¿Por qué es un agente y no un chatbot? | Porque actúa con herramientas sobre datos reales en un ciclo: percibe (ver_puestos_libres), razona, actúa (reasignar_puesto) y comunica (avisar_conductor). |
| 2 | ¿Qué pasa si Gemini se equivoca o inventa un puesto? | La propuesta se valida con la zona bloqueada en PostgreSQL; si el puesto no existe o está ocupado no se aplica y decide el plan B. Prueba CP-13. |
| 3 | ¿Y si Gemini no responde o se acaba la cuota? | Hay un tiempo límite (`LLM_TIMEOUT_MS`) y ante error, timeout o 429 decide el plan B por reglas. La demo nunca se cae. |
| 4 | ¿Gemini tiene acceso a la base de datos? | No. No tiene credenciales: solo pide herramientas; el servidor las ejecuta y le devuelve el resultado. |
| 5 | ¿Cómo evitan que dos personas reserven el mismo puesto? | Transacción con `SELECT … FOR UPDATE` sobre la zona e índices únicos parciales (una retención vigente por sesión y por puesto). |
| 6 | ¿Cómo se calcula el puesto más cercano? | RN-14: mismo piso, luego la zona más cercana, luego el número de puesto más cercano; distancia estimada en metros. |
| 7 | ¿Cómo se sincronizan el celular y el iPad? | Server-Sent Events: el servidor avisa ocupación, reasignaciones, navegación e intrusos; ambos dibujan lo mismo. Sondeo cada 15 s como respaldo. |
| 8 | ¿Dónde están los datos y cómo se despliega? | PostgreSQL en Neon (conexión SSL). Render construye la PWA y la API desde GitHub en cada push (`render.yaml`). |
| 9 | ¿Qué datos personales guardan? | Ninguno: sesión anónima con hash del token del QR, sin placa, nombre ni GPS (Ley 1581 de 2012). Las claves viven en variables de entorno. |
| 10 | ¿Qué falta para producción real? | Integración autorizada con los sensores del centro comercial, pasarela de pago real, pruebas con usuarios y mover la decisión del LLM fuera de la transacción. |

## Plan B si algo falla en vivo

- **No carga la página:** Render estaba dormido; esperar 1 minuto o mostrar el video y las capturas de `docs/capturas/`.
- **La IA responde "REGLAS":** explicar que es el plan B (RNF-11) y mostrar la prueba CP-13 que valida el camino LLM con un proveedor simulado.
- **Sin internet:** ejecutar local con `docker compose up --build` (README, opción A).
