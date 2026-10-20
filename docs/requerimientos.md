# FastParking — Requerimientos v1.0

## 1. Problema

Entre el ingreso al parqueadero del Centro Comercial Parque La Colina y el momento de estacionar, el conductor no tiene información comprensible sobre qué zonas tienen cupo. La ocupación cambia mientras busca, y al salir del centro comercial no siempre recuerda dónde dejó el vehículo. FastParking estudia si una interfaz por zonas, una retención lógica temporal con reasignación automática y un plano de referencia ayudan a organizar ese proceso. La posible reducción de tiempos de búsqueda es un **resultado por evaluar**, no un beneficio ya demostrado.

## 2. Objetivo general

Diseñar y desarrollar una aplicación web progresiva (FastParking) que permita a los visitantes del Centro Comercial Parque La Colina **consultar la disponibilidad de parqueadero por zona y piso**, **solicitar retenciones temporales simuladas de 7 minutos** con **reasignación automática** cuando la zona elegida se ocupa, **seguir una ruta de referencia simulada hasta el puesto** y **registrar la ubicación de su vehículo**, como prototipo para evaluar su aporte a la búsqueda de estacionamiento.

## 3. Actores

| ID | Actor | Responsabilidad | Estado |
|---|---|---|---|
| ACT-01 | Conductor / visitante | Abre la PWA con el QR, consulta zonas, solicita o cancela una retención y guarda su ubicación | Implementado |
| ACT-02 | Operador de pruebas | Ejecuta el simulador para producir escenarios de ocupación durante la demostración | Implementado (CLI con clave) |
| ACT-03 | Simulador de eventos (sistema) | Emite eventos ENTRADA/SALIDA normalizados, etiquetados como SIMULADOR | Implementado |
| ACT-04 | Sensores / controlador del parqueadero (externo) | Fuente real de ocupación | Futuro; sin integración ni autorización |
| ACT-05 | Sistema de tiquetes y pago del centro comercial (externo) | Proceso tradicional de tiquete físico y pago | Fuera de alcance; FastParking lo complementa |

## 4. Requerimientos funcionales

| ID | Nombre | Descripción | Criterio de aceptación | Prueba |
|---|---|---|---|---|
| RF-01 | Acceso por QR | Se simula la máquina de ingreso: el tiquete físico trae un QR con un token. Al escanearlo (o con "Simular escaneo") la PWA abre por URL (`?t=<token>`) y crea o reanuda una sesión anónima | Sin token se muestra el tiquete con su QR; al escanearlo se muestra la pantalla de zonas sin instalar una app; el mismo QR reanuda la misma sesión | CP-01 |
| RF-02 | Consultar disponibilidad | Lista las zonas agrupadas por piso con capacidad, ocupados, retenidas y cupo lógico | La respuesta incluye piso, zona, cupo, estado y marca de tiempo | CP-02 |
| RF-03 | Representación accesible | El estado de cada zona se muestra con texto, símbolo y color | Cada zona muestra "Disponible", "Pocos cupos" o "Llena"; el color nunca es la única señal | CP-02 |
| RF-04 | Solicitar retención | El conductor solicita una retención temporal simulada sobre una zona con cupo | Se crea una retención VIGENTE con id, creación y vencimiento a 7 min; el cupo lógico baja en 1 | CP-03 |
| RF-05 | Expirar retención | El sistema finaliza las retenciones vencidas | Al superar `vence_en` el estado pasa a EXPIRADA y deja de contar en el cupo | CP-04 |
| RF-06 | Procesar evento de ocupación | El backend procesa eventos ENTRADA/SALIDA y detecta conflictos con retenciones vigentes | Si ocupados + retenidas > capacidad, las retenciones afectadas cambian de estado y la PWA recibe aviso | CP-05 |
| RF-07 | Proponer alternativa | Si la zona solicitada no tiene cupo, se sugieren zonas cercanas con cupo | Respuesta 409 `ZONA_SIN_CUPO` con hasta 3 alternativas ordenadas por cercanía; si no hay, se informa | CP-03 |
| RF-08 | Cancelar retención | El conductor cancela su retención vigente | El estado pasa a CANCELADA, el cupo se libera y no puede cancelarse dos veces | CP-07 |
| RF-09 | Guardar ubicación | El conductor guarda piso, zona y una referencia libre del vehículo | La ubicación se recupera en la misma sesión | CP-08 |
| RF-10 | Mapa del sótano y ruta simulada | Plano ilustrativo en perspectiva 3D de cada sótano (rampa, vía, zonas, puestos y vehículos según la ocupación) con la ruta de referencia desde la rampa hasta el puesto asignado y una flecha que la recorre (navegación simulada) | El plano indica que es referencia y no localización en vivo; la flecha recorre la ruta y anuncia la llegada al puesto | Prueba de interfaz (Playwright / manual) |
| RF-11 | ~~Pago demostrativo~~ | **Retirado del alcance (D-08)** | — | — |
| RF-12 | Registrar eventos | Se registran eventos de ocupación y cada cambio de estado de una retención | `evento_ocupacion` e `historial_retencion` guardan id, fecha, tipo, fuente, motivo y resultado | CP-05 |
| RF-13 | Frescura de datos | La interfaz muestra la hora de actualización y advierte si los datos están desactualizados | Se ve "Actualizado a las hh:mm:ss"; tras 45 s sin datos aparece la advertencia | CP-09 / interfaz |
| RF-14 | Manejo de errores | Errores comprensibles con formato uniforme | `{error:{code,message}}`; sin conexión no se presentan datos antiguos como actuales | CP-09 |
| RF-16 | Confirmar llegada | Al terminar la ruta, el conductor confirma que estacionó | La retención pasa a UTILIZADA, la zona suma un vehículo (evento con fuente CONDUCTOR), el cupo lógico se mantiene y se guarda la ubicación con el puesto | CP-10 |
| RF-15 | Reasignación automática | Si un evento deja sin cupo la zona de una retención vigente, el sistema la reasigna a la zona con cupo más cercana | La retención original pasa a REASIGNADA y nace una VIGENTE en la zona alternativa (mismo piso primero); si no hay alternativa pasa a INVALIDADA | CP-05 |

## 5. Requerimientos no funcionales

| ID | Atributo | Requerimiento verificable |
|---|---|---|
| RNF-01 | Usabilidad | Las tareas principales se completan con instrucciones mínimas (prueba de tareas con usuarios) |
| RNF-02 | Rendimiento | Meta: 95 % de consultas en menos de 2 s en el entorno de prueba (meta, no resultado medido) |
| RNF-03 | Consistencia | Dos solicitudes concurrentes por el último cupo nunca quedan ambas VIGENTES (bloqueo de fila + índice único) |
| RNF-04 | Actualización | La PWA recibe cambios por SSE y, como respaldo, consulta cada 15 s |
| RNF-05 | Seguridad | Validación en backend (Zod), endpoint del simulador con clave, sin secretos en el repositorio |
| RNF-06 | Compatibilidad | Navegadores actuales de escritorio y móvil; PWA instalable |
| RNF-07 | Accesibilidad | Texto + símbolo + color, foco visible, nombres accesibles, objetivos táctiles ≥ 44 px |
| RNF-08 | Mantenibilidad | Módulos separados (sesiones, zonas, retenciones, eventos, ubicación) y adaptador de eventos desacoplado |
| RNF-09 | Trazabilidad | Historial de estados con marca de tiempo y motivo; sin datos personales |
| RNF-10 | Resiliencia | Sin conexión se muestra el error; la API nunca se sirve desde caché |

## 6. Reglas de negocio

| ID | Regla |
|---|---|
| RN-01 | La disponibilidad se modela por zona; no se representan cupos individuales |
| RN-02 | Toda retención tiene vencimiento: 7 minutos desde su creación (flujo de 7 min, configurable con RETENTION_MINUTES) |
| RN-03 | La retención no garantiza ocupación física ni prioridad frente al proceso tradicional |
| RN-04 | Un evento válido que deja una zona sin cupo obliga a resolver las retenciones afectadas |
| RN-05 | Solo se sugieren o asignan zonas con cupo lógico > 0 en los datos actuales |
| RN-06 | Solo una retención VIGENTE cambia de estado; CANCELADA, EXPIRADA, REASIGNADA, INVALIDADA y UTILIZADA son finales |
| RN-07 | La concurrencia se valida en backend y base de datos, nunca solo en el navegador |
| RN-08 | FastParking no procesa pagos ni almacena datos financieros |
| RN-09 | El plano es de referencia; no representa posicionamiento en vivo |
| RN-10 | FastParking complementa el tiquete físico y no reemplaza el proceso del parqueadero |
| RN-11 | Una sesión puede tener como máximo una retención VIGENTE |
| RN-12 | Cupo lógico = capacidad − ocupados (eventos) − retenciones vigentes, nunca negativo |
| RN-13 | Si un evento genera exceso, ceden primero las retenciones más recientes |
| RN-14 | Orden de cercanía: mismo piso y menor diferencia de `orden_cercania`; luego pisos vecinos |
| RN-15 | Un evento repetido (mismo `id_evento`) no se aplica dos veces; un evento más antiguo que el último aplicado se descarta |

## 7. Restricciones

- Se desconocen fabricante, controlador, protocolo y API de los indicadores del parqueadero; no hay autorización del centro comercial.
- Los datos de pisos, zonas y capacidades son **ilustrativos**.
- No se procesan pagos ni se conectan pasarelas reales.
- No se recolectan placas, identidad ni ubicación GPS (Ley 1581 de 2012).
- No se puede afirmar reducción real de tiempos sin una evaluación con datos comparables.
- Proyecto individual con plazo académico: el alcance prioriza el flujo principal.
