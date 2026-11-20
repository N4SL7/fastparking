# Arquitectura de FastParking

## Estilo

**Cliente-servidor con backend en monolito modular** y un **adaptador de eventos desacoplado**.

| Decisión | Por qué responde al problema |
|---|---|
| PWA en el navegador | El conductor llega desde un QR en el tiquete: no puede instalar una app en la entrada del parqueadero |
| Monolito modular (un solo despliegue) | Un proyecto individual con plazo corto: un despliegue, una base de datos y módulos con límites claros, sin el costo operativo de microservicios |
| Reglas en la API y en PostgreSQL | La concurrencia (dos conductores por el último cupo) solo se resuelve de forma confiable en el servidor con transacciones y bloqueo de filas |
| Adaptador de eventos | No se conoce el fabricante de los sensores: el dominio depende de un contrato (`FuenteOcupacion`), no de una marca |
| SSE + sondeo | La ocupación cambia sin que el conductor haga nada: el servidor debe empujar los cambios (reasignación, expiración) |

## Diagramas C4

- Nivel 1 — Contexto: `diagramas/c4-nivel1-contexto.png`
- Nivel 2 — Contenedores: `diagramas/c4-nivel2-contenedores.png`
- Nivel 3 — Componentes de la API: `diagramas/c4-nivel3-componentes.png`
- Nivel 4 — Código del flujo de retenciones: `diagramas/c4-nivel4-codigo.png`

Fuentes editables: `diagramas/fuentes/*.dot` (Graphviz) generados por `diagramas_graphviz.py`.

## Contenedores y responsabilidades

| Contenedor | Tecnología | Responsabilidad | No debe hacer |
|---|---|---|---|
| PWA FastParking | React 18 + TypeScript + Vite, nginx (solo celular) | Tiquete con QR simulado, Inicio (zonas), Mapa 3D con elección de puesto y navegación simulada, Mi vehículo y Billetera (pago simulado e historial) | Decidir si una retención es válida o resolver concurrencia |
| API FastParking | Node.js + Express + TypeScript | Validar, aplicar reglas, transacciones, expiración, reasignación, SSE | Exponer secretos o confiar en estados calculados en el cliente |
| Base de datos | PostgreSQL 16 | Persistir y garantizar integridad (FK, CHECK, índice único parcial) | Guardar datos personales o financieros |
| Simulador | CLI Node.js | Generar eventos ENTRADA/SALIDA etiquetados como SIMULADOR | Presentarse como sensor real |

## Componentes de la API (nivel 3)

| Componente | Carpeta | Responsabilidad |
|---|---|---|
| Capa HTTP | `app.ts`, `*.routes.ts`, `shared/errors.ts` | Rutas, validación con Zod, sesión requerida, formato de error |
| Sesiones | `modules/sessions` | Sesión anónima desde el token del QR |
| Disponibilidad | `modules/zones` | Cupo lógico, estado textual, bloqueo de zona |
| Retenciones | `modules/retentions/retentions.service.ts` | Solicitar, cancelar, consultar |
| Motor de reasignación | `modules/retentions/reassignment.service.ts` | Zona alternativa más cercana con cupo |
| Planificador de expiraciones | `modules/retentions/expiration.scheduler.ts` | Expira retenciones cada 15 s |
| Adaptador de eventos | `modules/events/event.adapter.ts` | Normaliza mensajes de la fuente |
| Procesador de eventos | `modules/events/events.service.ts` | Idempotencia, orden, ocupación, conflictos |
| Ubicación | `modules/locations` | Guardar/recuperar ubicación |
| Pagos | `modules/payments` | Liquidación por minuto, pago simulado con bloqueo de la sesión, comprobante e historial |
| Notificador | `shared/realtime.ts` | Server-Sent Events |
| Acceso a datos | `db/pool.ts`, `*.repository.ts` | SQL parametrizado y transacciones |

## Contratos de comunicación

| Interfaz | Operación | Descripción |
|---|---|---|
| REST | `POST /api/sessions` | Crea o reanuda la sesión anónima |
| REST | `GET /api/zones` | Disponibilidad agregada y marca temporal |
| REST | `POST /api/retentions` | Solicita retención (transacción + bloqueo) |
| REST | `GET /api/retentions/current`, `GET /api/retentions/:id` | Estado y vencimiento |
| REST | `GET /api/sessions/current` | Hora de entrada (RF-09) |
| REST | `GET /api/payments/quote` · `POST /api/payments` · `GET /api/payments` | Liquidación, pago simulado e historial (RF-11, RF-17) |
| REST | `POST /api/retentions/:id/arrive` | Confirma llegada: UTILIZADA + ocupación + ubicación (RF-16) |
| REST | `POST /api/retentions/:id/cancel` | Cancela (se conserva en el historial; por eso no es DELETE) |
| REST | `PUT/GET /api/vehicle-location` | Ubicación del vehículo |
| REST | `POST /api/simulator/events` | Evento simulado (cabecera `x-simulator-key`) |
| SSE | `GET /api/events/stream?sessionId=` | Eventos `zonas` y `retencion` |

## Concurrencia (RNF-03)

1. `solicitarRetencion` abre una transacción y ejecuta `SELECT … FROM zona WHERE id_zona = $1 FOR UPDATE`.
2. Una segunda solicitud por la misma zona **espera** hasta que la primera confirme.
3. Al continuar, recalcula el cupo lógico ya con la retención anterior y responde `409 ZONA_SIN_CUPO`.
4. El índice único parcial `uq_retencion_vigente_por_sesion` impide dos retenciones vigentes de la misma sesión aunque lleguen en paralelo.
5. Orden de bloqueo fijo en todo el sistema (zona → retención) y reintento ante deadlock en `withTransaction`.

## v2.0 — Guía visual 3D y modo simulación (artefactos 5.1 a 5.4)

**Estilo:** "maqueta arquitectónica premium". Piso de concreto gris mate, núcleos y columnas en blanco hueso, muros bajos cortados para ver el interior, **bordillo de cada zona en el color de marca `#083E4D` con línea neón** (emisiva; brilla con *bloom* en modo alto), demarcación blanca, carros procedurales en paleta sobria, puesto del conductor en teal pulsante, puesto invadido en rojo intermitente y ruta teal con chevrones animados.

| Pieza | Archivo | Qué hace |
|---|---|---|
| Convenciones y trayectos | `frontend/src/components/3d/escena.ts` | Escala plano → 3D, paleta, trayectos de entrada (en reversa) y salida de los carros |
| Carro | `frontend/src/components/3d/Carro3D.tsx` | Modelo procedural y animación por cuadros clave |
| Piso del sótano | `frontend/src/components/3d/PisoSotano3D.tsx` | Losa, vía, rampa, columnas, zonas, puestos tocables y carros que entran/salen según la ocupación real ("4D") |
| Ruta y flecha | `frontend/src/components/3d/Ruta3D.tsx` | Cinta, chevrones animados y flecha 3D |
| Lienzo y cámaras | `frontend/src/components/3d/Sotano3D.tsx` | Luces, *bloom*, cámara general (arrastrar/pellizcar/girar) y cámara de seguimiento tipo GPS |
| Modo simulación | `frontend/src/simulacion/Simulacion.tsx` | Ruta `/simulacion` para iPad: 3 pisos, tráfico aleatorio, carro intruso y registro del agente |
| Calidad adaptable | `frontend/src/lib/calidad.ts` | Alto (iPad/PC): DPR 2, sombras, bloom, faros · Liviano (celular): DPR 1, sombras simuladas, sin posprocesado. Se fuerza con `?calidad=alto` o `?calidad=liviano` |

Capturas reales: `docs/capturas/08-mapa-3d.png` a `14-simulacion-s1.png`.
