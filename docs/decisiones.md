# Registro de decisiones (ADR resumido)

| ID | Decisión | Motivo | Consecuencia |
|---|---|---|---|
| D-01 | Stack: React + Vite (PWA), Node.js + Express + TypeScript, PostgreSQL con driver `pg` y SQL explícito, Vitest, Docker | Un solo lenguaje; PostgreSQL ofrece transacciones y bloqueo de filas para la concurrencia | Se descartó Prisma: el SQL explícito hace visible el control de concurrencia y el esquema coincide 1:1 con el MER |
| D-02 | Sesión anónima creada desde el token del QR | Minimiza datos personales y alcance | Solo se guarda el hash SHA-256 del token; sin cuentas ni login |
| D-03 | Retención por zona | No existen datos validados por espacio individual | RN-01, RN-12 |
| D-04 | Vigencia de 7 min (flujo de 7 min definido por la autora) y 1 retención vigente por sesión | Evita acaparar cupos y simplifica la concurrencia | Índice único parcial `uq_retencion_vigente_por_sesion` |
| D-05 | Reasignación automática simple (mismo piso → pisos vecinos), sin grafo ni Dijkstra | Conserva la idea original con un alcance realista | RF-15; se eliminaron NODO_PLANO y TRAMO_PLANO |
| D-06 | Plano SVG ilustrativo en perspectiva 3D con ruta simple (rampa → vía → puesto) y flecha animada; sin grafos | No hay planos oficiales autorizados; la flecha comunica la navegación sin simular un GPS real | RF-10, RN-09 |
| D-07 | Sin módulo de administrador; el simulador se protege con `SIMULATOR_API_KEY` | No había RF que justificara cuentas de administrador | Se eliminó la entidad ADMINISTRADOR |
| D-08 | Pago **simulado** dentro del alcance (revisado): la autora definió que pagar desde la app es parte central del objetivo de ahorrar tiempo | Sin pasarelas reales ni datos financieros | RF-11, RF-17, entidad PAGO |
| D-09 | SSE con respaldo de sondeo cada 15 s | Comunicación servidor → cliente unidireccional y simple | RNF-04, RNF-10 |
| D-10 | Historial de estados por retención en lugar de una tabla AUDITORIA genérica | Trazabilidad sin entidades redundantes | Tabla `historial_retencion` |
| D-11 | Catálogo único de estados: VIGENTE, CANCELADA, EXPIRADA, REASIGNADA, INVALIDADA, UTILIZADA | Coherencia entre documento, BPMN, MER y código | CHECK en la BD y `retention.rules.ts` |
| D-12 | Despliegue local con Docker Compose | Ejecución reproducible para el docente sin costos de nube | Nube como mejora futura |
| D-13 | Objetivo general reescrito sin prometer reducción de filas de pago | Coherencia con el alcance | Ver `requerimientos.md` |
| D-14 | Estado UTILIZADA al confirmar la llegada (RF-16) | El proceso necesitaba un final exitoso; la llegada convierte la retención en ocupación física | Evento de ocupación con fuente CONDUCTOR y ubicación con puesto |
| D-15 | Simulación de la máquina de ingreso con QR real | Demostrar RF-01 sin hardware del centro comercial | Pantalla Tiquete; no se almacena la placa |
| D-16 | Navegación por pestañas: Inicio, Mapa, Mi vehículo, Billetera; el tiquete con QR es la pantalla de entrada | Flujo real: el QR está en la máquina de ingreso; la billetera concentra pago e historial | Diseño solo para celular (marco de teléfono en computador) |
| D-17 | El conductor elige el puesto tocándolo en el mapa | Experiencia directa; la retención sigue siendo por zona (RN-01) y el puesto es ilustrativo | Columna `retencion.puesto` |
