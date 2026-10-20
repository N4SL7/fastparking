"""
Genera con Graphviz (dot) el MER y los 4 niveles del modelo C4 de FastParking.
Uso: python3 docs/diagramas/fuentes/diagramas_graphviz.py   (requiere Graphviz instalado)
Los nombres de entidades, contenedores, componentes y archivos coinciden con el código del repositorio.
"""
import subprocess
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent
BRAND, INK, SOFT, EXT = "#083E4D", "#10242a", "#e3eef1", "#8a9aa0"
FONT = "Segoe UI,Arial,Helvetica,sans-serif"

def render(name, dot):
    src = OUT / "fuentes" / f"{name}.dot"
    src.write_text(dot, encoding="utf-8")
    for fmt in ("svg", "png"):
        args = ["dot", f"-T{fmt}", str(src), "-o", str(OUT / f"{name}.{fmt}")]
        if fmt == "png":
            args.insert(1, "-Gdpi=150")
        subprocess.run(args, check=True)
    print("generado", name)

# ------------------------------------------------------------------ MER
def entidad(nombre, filas, nota=""):
    rows = "".join(
        (f'<TR><TD ALIGN="LEFT" WIDTH="34"><FONT COLOR="{BRAND}"><B>{k}</B></FONT></TD>' if k else '<TR><TD WIDTH="34"> </TD>')
        + f'<TD ALIGN="LEFT">{c}</TD><TD ALIGN="LEFT"><FONT COLOR="#4b6169">{t}</FONT></TD></TR>'
        for k, c, t in filas)
    nota_html = f'<TR><TD COLSPAN="3" ALIGN="LEFT"><FONT POINT-SIZE="9" COLOR="#4b6169">{nota}</FONT></TD></TR>' if nota else ""
    return (f'{nombre} [label=<<TABLE BORDER="1" COLOR="{BRAND}" CELLBORDER="0" CELLSPACING="0" CELLPADDING="4">'
            f'<TR><TD COLSPAN="3" BGCOLOR="{BRAND}"><FONT COLOR="white"><B>{nombre.upper()}</B></FONT></TD></TR>{rows}{nota_html}</TABLE>>];')

NOTA_RET = 'estado ∈ VIGENTE·CANCELADA·EXPIRADA·REASIGNADA·INVALIDADA·UTILIZADA<BR ALIGN="LEFT"/>CHECK vence_en &gt; creada_en · única VIGENTE por sesión<BR ALIGN="LEFT"/>'
mer = f'''digraph MER {{
graph [rankdir=LR, splines=ortho, nodesep=0.7, ranksep=1.1, fontname="{FONT}", pad=0.3, bgcolor="white",
       label="FastParking — Modelo Entidad-Relación v1.0 (PostgreSQL)   ·   PK clave primaria · FK clave foránea · UK única", labelloc=t, fontsize=16, fontcolor="{BRAND}"];
node [shape=plaintext, fontname="{FONT}", fontsize=10];
edge [fontname="{FONT}", fontsize=9, color="{INK}", dir=both, fontcolor="{BRAND}"];
{entidad("piso", [("PK","id_piso","SMALLINT"),("UK","codigo","VARCHAR(10)"),("","nombre","VARCHAR(40)"),("UK","orden","SMALLINT")])}
{entidad("zona", [("PK","id_zona","SMALLINT"),("FK","id_piso","SMALLINT"),("UK","codigo","VARCHAR(10)"),("","nombre","VARCHAR(40)"),("","capacidad_total","INTEGER &gt; 0"),("","ocupados","INTEGER 0..capacidad"),("","orden_cercania","SMALLINT"),("","ultimo_evento_en","TIMESTAMPTZ"),("","actualizado_en","TIMESTAMPTZ"),("","es_simulada","BOOLEAN")], "UK (id_piso, orden_cercania)")}
{entidad("sesion_visita", [("PK","id_sesion","UUID"),("UK","token_hash","CHAR(64) SHA-256"),("","creada_en","TIMESTAMPTZ"),("","expira_en","TIMESTAMPTZ")], "CHECK expira_en &gt; creada_en · sin datos personales")}
{entidad("retencion", [("PK","id_retencion","UUID"),("FK","id_sesion","UUID"),("FK","id_zona","SMALLINT"),("FK","id_retencion_origen","UUID (nula)"),("","puesto","SMALLINT &gt; 0 (nulo)"),("","estado","VARCHAR(12)"),("","creada_en","TIMESTAMPTZ"),("","vence_en","TIMESTAMPTZ"),("","cerrada_en","TIMESTAMPTZ (nula)"),("","motivo_cierre","VARCHAR(60)")], NOTA_RET)}
{entidad("historial_retencion", [("PK","id_historial","BIGSERIAL"),("FK","id_retencion","UUID"),("FK","id_evento","UUID (nula)"),("","estado_anterior","VARCHAR(12)"),("","estado_nuevo","VARCHAR(12)"),("","motivo","VARCHAR(60)"),("","registrado_en","TIMESTAMPTZ")])}
{entidad("evento_ocupacion", [("PK","id_evento","UUID (idempotencia)"),("FK","id_zona","SMALLINT"),("","tipo","ENTRADA · SALIDA"),("","cantidad","SMALLINT &gt; 0"),("","fuente","SIMULADOR · CONDUCTOR"),("","ocurrido_en","TIMESTAMPTZ"),("","recibido_en","TIMESTAMPTZ"),("","resultado","APLICADO · DESCARTADO_TARDIO")])}
{entidad("ubicacion_vehiculo", [("PK","id_ubicacion","UUID"),("FK UK","id_sesion","UUID"),("FK","id_zona","SMALLINT"),("","puesto","SMALLINT &gt; 0 (nulo)"),("","referencia","VARCHAR(80)"),("","registrada_en","TIMESTAMPTZ")])}
{entidad("pago", [("PK","id_pago","UUID"),("FK UK","id_sesion","UUID"),("UK","codigo","VARCHAR(12)"),("","minutos","INTEGER &gt; 0"),("","tarifa_minuto","INTEGER (COP)"),("","valor","INTEGER = min × tarifa"),("","metodo","TARJETA · NEQUI · PSE"),("","estado","APROBADO_SIMULADO"),("","pagado_en","TIMESTAMPTZ"),("","salida_hasta","TIMESTAMPTZ")], "Pago simulado: sin datos financieros")}
sesion_visita -> pago [arrowtail=teetee, arrowhead=teeodot, xlabel="paga  1 : 0..1"];
piso -> zona [arrowtail=teetee, arrowhead=crowtee, xlabel="contiene  1 : 1..N"];
zona -> retencion [arrowtail=teetee, arrowhead=crowodot, xlabel="es retenida en  1 : 0..N"];
sesion_visita -> retencion [arrowtail=teetee, arrowhead=crowodot, xlabel="solicita  1 : 0..N"];
retencion -> retencion [arrowtail=teeodot, arrowhead=teeodot, xlabel="origina (reasignación)  0..1 : 0..1"];
retencion -> historial_retencion [arrowtail=teetee, arrowhead=crowtee, xlabel="registra  1 : 1..N"];
evento_ocupacion -> historial_retencion [arrowtail=teeodot, arrowhead=crowodot, xlabel="provoca  0..1 : 0..N"];
zona -> evento_ocupacion [arrowtail=teetee, arrowhead=crowodot, xlabel="recibe  1 : 0..N"];
sesion_visita -> ubicacion_vehiculo [arrowtail=teetee, arrowhead=teeodot, xlabel="guarda  1 : 0..1"];
zona -> ubicacion_vehiculo [arrowtail=teetee, arrowhead=crowodot, xlabel="ubica  1 : 0..N"];
}}'''
render("mer", mer)

# ------------------------------------------------------------------ C4 helpers
def caja(id_, titulo, tipo, desc, fill=BRAND, font="white", dashed=False, shape="box"):
    style = "rounded,filled" + (",dashed" if dashed else "")
    return (f'{id_} [shape={shape}, style="{style}", fillcolor="{fill}", color="{INK if dashed else fill}", '
            f'label=<<B>{titulo}</B><BR/><FONT POINT-SIZE="9">[{tipo}]</FONT><BR/><BR/><FONT POINT-SIZE="10">{desc}</FONT>>, fontcolor="{font}"];')
def persona(id_, titulo, desc):
    return (f'{id_} [shape=box, style="rounded,filled", fillcolor="#052c37", color="#052c37", fontcolor="white", '
            f'label=<<FONT POINT-SIZE="20">👤</FONT><BR/><B>{titulo}</B><BR/><FONT POINT-SIZE="9">[Persona]</FONT><BR/><FONT POINT-SIZE="10">{desc}</FONT>>];')
HEAD = f'''graph [fontname="{FONT}", pad=0.4, nodesep=0.9, ranksep=1.0, bgcolor="white", labelloc=t, fontsize=16, fontcolor="{BRAND}"];
node [fontname="{FONT}", fontsize=11, margin="0.25,0.15", width=2.6];
edge [fontname="{FONT}", fontsize=9.5, color="#4b6169", fontcolor="#33474e", arrowsize=0.8];'''
EXTF = "#9aa8ad"

c1 = f'''digraph C4_1 {{ {HEAD}
graph [label="C4 · Nivel 1 — Contexto del sistema FastParking"];
{persona("conductor", "Conductor / visitante", "Escanea el QR del tiquete, elige un puesto,<BR/>sigue la ruta simulada, guarda dónde<BR/>parqueó y paga (simulado) desde la app")}
{persona("operador", "Operador de pruebas", "Ejecuta escenarios de ocupación<BR/>simulados durante la demostración")}
{caja("fp", "FastParking", "Sistema de software", "PWA + API: disponibilidad por zona, retención<BR/>simulada de 7 min con reasignación, mapa con<BR/>ruta simulada, ubicación y pago simulado")}
{caja("sens", "Sensores / controlador del parqueadero", "Sistema externo — FUTURO", "Indicadores de cupos por piso de Parque La Colina.<BR/>Sin fabricante, API ni autorización: NO integrado", fill=EXTF, dashed=True)}
{caja("cc", "Sistema de tiquetes y pago del centro comercial", "Sistema externo — FUERA DE ALCANCE", "Tiquete físico, talanqueras y pago tradicional.<BR/>FastParking lo complementa, no lo reemplaza", fill=EXTF, dashed=True)}
conductor -> fp [label="  Usa desde el navegador móvil\\n  (QR → HTTPS)"];
operador -> fp [label="  Inyecta eventos de ocupación\\n  simulados (clave del simulador)"];
sens -> fp [style=dashed, label="  (futuro) eventos de ocupación\\n  vía adaptador"];
cc -> conductor [style=dashed, label="  entrega el tiquete físico\\n  (con QR, propuesto)"];
{{rank=same; conductor; operador}}
{{rank=same; sens; cc}}
}}'''
render("c4-nivel1-contexto", c1)

c2 = f'''digraph C4_2 {{ {HEAD}
graph [label="C4 · Nivel 2 — Contenedores de FastParking", compound=true];
{persona("conductor", "Conductor / visitante", "Navegador móvil")}
{persona("operador", "Operador de pruebas", "Terminal")}
subgraph cluster_fp {{ label=<<B>FastParking</B> [Sistema de software]>; style="dashed,rounded"; color="{BRAND}"; fontcolor="{BRAND}"; fontsize=12;
  {caja("pwa", "PWA FastParking", "Contenedor: React 18 + TypeScript + Vite, servida por nginx", "Solo celular. Tiquete con QR simulado, Inicio,<BR/>Mapa 3D (elegir puesto + ruta simulada),<BR/>Mi vehículo y Billetera (pago simulado).<BR/>Service worker: solo cachea la interfaz")}
  {caja("api", "API FastParking", "Contenedor: Node.js + Express + TypeScript", "Monolito modular: reglas de negocio,<BR/>concurrencia, expiración, reasignación,<BR/>adaptador de eventos y notificaciones SSE")}
  {caja("db", "Base de datos", "Contenedor: PostgreSQL 16", "Pisos, zonas, sesiones, retenciones,<BR/>historial, eventos y ubicaciones", shape="cylinder")}
  {caja("sim", "Simulador de eventos", "Contenedor: CLI Node.js (simulator/simular.mjs)", "Genera eventos ENTRADA/SALIDA<BR/>etiquetados como SIMULADOR")}
}}
{caja("sens", "Sensores del parqueadero", "Sistema externo — FUTURO", "No integrado", fill=EXTF, dashed=True)}
conductor -> pwa [label="  Usa (HTTPS)"];
operador -> sim [label="  Ejecuta escenarios"];
pwa -> api [label="  REST JSON /api/*\\n  + SSE /api/events/stream"];
sim -> api [label="  POST /api/simulator/events\\n  (x-simulator-key)"];
api -> db [label="  SQL (pg) con transacciones\\n  y SELECT … FOR UPDATE"];
sens -> api [style=dashed, label="  (futuro) mismo contrato\\n  del adaptador"];
{{rank=same; conductor; operador}}
{{rank=same; pwa; sim}}
}}'''
render("c4-nivel2-contenedores", c2)

def comp(id_, titulo, archivo, desc):
    return caja(id_, titulo, f"Componente · {archivo}", desc, fill="#0d5468")
c3 = f'''digraph C4_3 {{ {HEAD}
graph [label="C4 · Nivel 3 — Componentes del contenedor API FastParking (backend/src)", nodesep=0.6, ranksep=0.9];
node [width=2.4];
{caja("pwa", "PWA FastParking", "Contenedor", "React + TypeScript")}
{caja("sim", "Simulador de eventos", "Contenedor", "CLI Node.js")}
{caja("db", "PostgreSQL", "Contenedor", "Base de datos", shape="cylinder")}
subgraph cluster_api {{ label=<<B>API FastParking</B> [Contenedor: Node.js + Express]>; style="dashed,rounded"; color="{BRAND}"; fontcolor="{BRAND}";
  {comp("http", "Capa HTTP", "app.ts + *.routes.ts", "Enruta, valida con Zod, exige sesión<BR/>y unifica errores (errors.ts)")}
  {comp("ses", "Sesiones", "modules/sessions", "Sesión anónima desde el token<BR/>del QR (solo hash SHA-256)")}
  {comp("disp", "Disponibilidad", "modules/zones", "Cupo lógico = capacidad − ocupados<BR/>− retenidas; estado textual; bloqueo de zona")}
  {comp("ret", "Retenciones", "modules/retentions/retentions.service", "Solicita, cancela y confirma llegada<BR/>en transacción; 1 vigente por sesión")}
  {comp("reas", "Motor de reasignación", "modules/retentions/reassignment.service", "Busca la zona más cercana con cupo<BR/>(mismo piso → pisos vecinos)")}
  {comp("exp", "Planificador de expiraciones", "modules/retentions/expiration.scheduler", "Cada 15 s marca EXPIRADAS<BR/>las retenciones vencidas")}
  {comp("adap", "Adaptador de eventos", "modules/events/event.adapter", "Contrato FuenteOcupacion:<BR/>normaliza el mensaje de la fuente")}
  {comp("proc", "Procesador de eventos", "modules/events/events.service", "Idempotencia, descarte de tardíos,<BR/>actualiza ocupación y detecta conflictos")}
  {comp("ubi", "Ubicación del vehículo", "modules/locations", "Guarda y recupera zona<BR/>y referencia por sesión")}
  {comp("pagos", "Pagos", "modules/payments", "Liquidación por minuto, pago simulado<BR/>(1 por tiquete), comprobante e historial")}
  {comp("sse", "Notificador en tiempo real", "shared/realtime.ts", "Server-Sent Events: 'zonas'<BR/>y 'retencion' por sesión")}
  {comp("repo", "Acceso a datos", "db/pool.ts + *.repository.ts", "SQL parametrizado, withTransaction<BR/>con reintento ante deadlock")}
}}
pwa -> http [label="  REST + SSE"];
sim -> http [label="  POST /api/simulator/events"];
http -> ses; http -> disp; http -> ret; http -> ubi; http -> pagos; pagos -> repo; http -> adap [label=" evento crudo"];
adap -> proc [label=" evento normalizado"];
proc -> reas [label=" conflicto"];
reas -> disp [label=" alternativas"];
ret -> disp [label=" bloquear zona / cupo"];
ret -> sse; proc -> sse; exp -> sse;
sse -> pwa [style=dashed, label="  eventos SSE"];
ses -> repo; disp -> repo; ret -> repo; reas -> repo; exp -> repo; proc -> repo; ubi -> repo;
repo -> db [label="  SQL"];
{{rank=same; pwa; sim}}
}}'''
render("c4-nivel3-componentes", c3)

def modulo(id_, nombre, estereotipo, miembros):
    filas = "".join(f'<TR><TD ALIGN="LEFT"><FONT FACE="Consolas,monospace" POINT-SIZE="9.5">{m}</FONT></TD></TR>' for m in miembros)
    return (f'{id_} [shape=plaintext, label=<<TABLE BORDER="1" COLOR="{BRAND}" CELLBORDER="0" CELLSPACING="0" CELLPADDING="4">'
            f'<TR><TD BGCOLOR="{BRAND}"><FONT COLOR="white" POINT-SIZE="9">«{estereotipo}»</FONT><BR/><FONT COLOR="white"><B>{nombre}</B></FONT></TD></TR>{filas}</TABLE>>];')
c4 = f'''digraph C4_4 {{ {HEAD}
graph [label="C4 · Nivel 4 — Código del flujo de retenciones (archivos y funciones reales del repositorio)", rankdir=TB, nodesep=0.5, ranksep=0.7];
edge [arrowhead=vee, style=dashed];
{modulo("routes", "retentions.routes.ts", "router Express", ["POST /api/retentions", "GET /api/retentions/current", "GET /api/retentions/:id", "POST /api/retentions/:id/cancel", "POST /api/retentions/:id/arrive", "use(requerirSesion)"])}
{modulo("service", "retentions.service.ts", "servicio", ["+ solicitarRetencion(idSesion, idZona): RetencionVista", "+ cancelarRetencion(idSesion, idRetencion): RetencionVista", "+ confirmarLlegada(idSesion, idRetencion, puesto?): RetencionVista", "+ obtenerRetencionActual(idSesion): RetencionVista | null", "+ obtenerRetencion(idSesion, idRetencion): RetencionVista", "- sugerirAlternativas(idZonaOrigen, limite)"])}
{modulo("reas", "reassignment.service.ts", "servicio", ["+ reasignarOInvalidar(tx, afectada, idEvento): ResultadoConflicto"])}
{modulo("events", "events.service.ts", "servicio", ["+ procesarEvento(evento: EventoNormalizado): ResultadoEvento"])}
{modulo("adapter", "event.adapter.ts", "interfaz + implementación", ["interface FuenteOcupacion { normalizar(mensaje) }", "+ fuenteSimulador: FuenteOcupacion", "+ aplicarOcupacion(ocupados, capacidad, tipo, n)"])}
{modulo("repo", "retentions.repository.ts", "repositorio", ["+ buscarPorId(db, id)", "+ buscarVigenteDeSesion(db, idSesion)", "+ bloquearVigentesDeZona(db, idZona)", "+ insertar(db, datos): id", "+ cerrar(db, id, estado, motivo): boolean", "+ registrarHistorial(db, datos)", "+ expirarVencidas(db, idSesion?)"])}
{modulo("rules", "retention.rules.ts", "reglas puras", ["ESTADOS_RETENCION (D-11)", "+ esTransicionValida(desde, hacia)", "+ seleccionarAfectadas(vigentes, exceso)"])}
{modulo("avail", "availability.service.ts", "servicio", ["+ listarZonas(db): ZonaVista[]", "+ bloquearZona(db, idZona): ZonaVista", "+ marcarZonaActualizada(db, idZona)"])}
{modulo("arules", "availability.rules.ts", "reglas puras", ["+ calcularCupoLogico(cap, ocupados, retenidas)", "+ clasificarZona(cupo, cap): EstadoZona", "+ ordenarAlternativas(origen, candidatas)"])}
{modulo("sched", "expiration.scheduler.ts", "temporizador", ["+ iniciarPlanificadorExpiraciones(ms)", "+ ejecutarExpiracion(): number"])}
{modulo("ubi", "locations.service.ts", "servicio", ["+ guardarUbicacion(db, idSesion, idZona, referencia?, puesto?)", "+ obtenerUbicacion(db, idSesion)"])}
{modulo("pool", "db/pool.ts", "infraestructura", ["+ pool: pg.Pool", "+ withTransaction(fn) — reintenta 40P01/40001"])}
{modulo("sse", "shared/realtime.ts", "clase", ["NotificadorSSE", "+ suscribir(res, idSesion)", "+ publicarZonasActualizadas()", "+ publicarRetencion(idSesion, datos)"])}
routes -> service;
events -> adapter [label=" tipos"];
events -> reas; events -> rules; events -> repo;
service -> repo; service -> avail; service -> ubi; service -> arules; service -> pool; service -> sse;
reas -> repo; reas -> avail; reas -> arules;
avail -> arules;
sched -> repo; sched -> sse;
repo -> rules [label=" tipos"];
service -> rules [style=invis];
}}'''
render("c4-nivel4-codigo", c4)
