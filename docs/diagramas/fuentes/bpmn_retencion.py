"""
Genera el BPMN 2.0 del proceso principal de FastParking:
  docs/diagramas/bpmn-retencion.bpmn  (abrir/editar en https://demo.bpmn.io o Camunda Modeler)
  docs/diagramas/bpmn-retencion.svg   (vista para el documento)
Ambos salen de las MISMAS coordenadas, así el XML y la imagen no se contradicen.
"""
from pathlib import Path
from xml.sax.saxutils import escape

OUT = Path(__file__).resolve().parent.parent
W = 2060
# ---- Participantes y carriles ---------------------------------------------------------------
POOL_COND = dict(id="P_Conductor", name="Conductor (visitante)", x=40, y=20, w=W - 60, h=70)
POOL_FP = dict(id="P_FastParking", name="FastParking", x=40, y=120, w=W - 60, h=700)
LANE_PWA = dict(id="L_PWA", name="PWA (navegador móvil)", x=70, y=120, w=W - 90, h=230)
LANE_API = dict(id="L_API", name="API y dominio (Node.js + PostgreSQL)", x=70, y=350, w=W - 90, h=470)
POOL_SIM = dict(id="P_Simulador", name="Simulador de eventos de ocupación (fuente SIMULADOR)", x=40, y=850, w=W - 60, h=70)

P1, R1, R2, R3, R4 = 235, 420, 540, 660, 770  # filas (centro y)
TW, TH = 130, 70

nodes = {}
def task(i, name, cx, cy, lane): nodes[i] = dict(t="task", name=name, cx=cx, cy=cy, w=TW, h=TH, lane=lane)
def ev(i, kind, name, cx, cy, lane, deco=None): nodes[i] = dict(t=kind, name=name, cx=cx, cy=cy, w=36, h=36, lane=lane, deco=deco)
def gw(i, kind, name, cx, cy, lane): nodes[i] = dict(t=kind, name=name, cx=cx, cy=cy, w=50, h=50, lane=lane)

# Carril PWA
ev("S_QR", "startEvent", "QR del tiquete escaneado", 145, P1, "L_PWA", "message")
task("T_Sesion", "Abrir sesión anónima", 262, P1, "L_PWA")
task("T_Zonas", "Mostrar zonas por piso con hora de actualización", 400, P1, "L_PWA")
task("T_Solicitar", "Enviar solicitud de retención", 560, P1, "L_PWA")
task("T_Alternativas", "Mostrar alternativas cercanas", 760, P1, "L_PWA")
task("T_Mostrar", "Mostrar retención y cuenta regresiva", 1010, P1, "L_PWA")
task("T_NotifReasig", "Notificar reasignación (SSE)", 1880, P1, "L_PWA")
# Carril API
task("T_Bloquear", "Bloquear zona y calcular cupo lógico", 560, R1, "L_API")
gw("G_Cupo", "exclusiveGateway", "¿Cupo lógico > 0 y sin retención vigente?", 760, R1, "L_API")
task("T_Crear", "Crear retención VIGENTE (10 min) y registrar historial", 900, R1, "L_API")
gw("G_Espera", "eventBasedGateway", "", 1130, R1, "L_API")
ev("C_Cancel", "intermediateCatchEvent", "Cancelación solicitada", 1250, R1, "L_API", "message")
ev("C_Timer", "intermediateCatchEvent", "Vence a los 10 min", 1250, R2, "L_API", "timer")
ev("C_Ocup", "intermediateCatchEvent", "Evento de ocupación recibido", 1250, R3, "L_API", "message")
task("T_Cancelar", "Marcar CANCELADA y liberar cupo", 1400, R1, "L_API")
ev("E_Cancel", "endEvent", "Retención cancelada", 1540, R1, "L_API")
task("T_Expirar", "Marcar EXPIRADA", 1400, R2, "L_API")
ev("E_Expira", "endEvent", "Retención expirada", 1540, R2, "L_API")
task("T_Evento", "Validar evento (duplicado / tardío) y actualizar ocupación", 1400, R3, "L_API")
gw("G_Conflicto", "exclusiveGateway", "¿Ocupados + retenidas > capacidad?", 1550, R3, "L_API")
ev("E_SinConf", "endEvent", "Retención sigue vigente", 1550, R4, "L_API")
task("T_Buscar", "Buscar zona más cercana con cupo", 1690, R3, "L_API")
gw("G_Alt", "exclusiveGateway", "¿Hay alternativa?", 1880, R3, "L_API")
task("T_Reasignar", "Marcar REASIGNADA y crear nueva VIGENTE", 1880, R1, "L_API")
task("T_Invalidar", "Marcar INVALIDADA y notificar (SSE)", 1880, R4, "L_API")
ev("E_Invalida", "endEvent", "Retención invalidada", 2010, R4, "L_API")

def b(i):
    n = nodes[i]; return n["cx"] - n["w"] / 2, n["cy"] - n["h"] / 2, n["w"], n["h"]
def L(i): n = nodes[i]; return (n["cx"] - n["w"] / 2, n["cy"])
def Rr(i): n = nodes[i]; return (n["cx"] + n["w"] / 2, n["cy"])
def T(i): n = nodes[i]; return (n["cx"], n["cy"] - n["h"] / 2)
def B(i): n = nodes[i]; return (n["cx"], n["cy"] + n["h"] / 2)

flows = []  # (id, src, tgt, name, waypoints)
def f(s, t, wp, name=""): flows.append((f"F_{s}_{t}", s, t, name, wp))
f("S_QR", "T_Sesion", [Rr("S_QR"), L("T_Sesion")])
f("T_Sesion", "T_Zonas", [Rr("T_Sesion"), L("T_Zonas")])
f("T_Zonas", "T_Solicitar", [Rr("T_Zonas"), L("T_Solicitar")])
f("T_Solicitar", "T_Bloquear", [B("T_Solicitar"), T("T_Bloquear")])
f("T_Bloquear", "G_Cupo", [Rr("T_Bloquear"), L("G_Cupo")])
f("G_Cupo", "T_Alternativas", [T("G_Cupo"), B("T_Alternativas")], "No")
f("T_Alternativas", "T_Solicitar", [T("T_Alternativas"), (760, 150), (560, 150), T("T_Solicitar")], "elige otra zona")
f("G_Cupo", "T_Crear", [Rr("G_Cupo"), L("T_Crear")], "Sí")
f("T_Crear", "T_Mostrar", [Rr("T_Crear"), (1010, R1), B("T_Mostrar")])
f("T_Mostrar", "G_Espera", [Rr("T_Mostrar"), (1130, P1), T("G_Espera")])
f("G_Espera", "C_Cancel", [Rr("G_Espera"), L("C_Cancel")])
f("G_Espera", "C_Timer", [B("G_Espera"), (1130, R2), L("C_Timer")])
f("G_Espera", "C_Ocup", [(1130, R2), (1130, R3), L("C_Ocup")])
f("C_Cancel", "T_Cancelar", [Rr("C_Cancel"), L("T_Cancelar")])
f("T_Cancelar", "E_Cancel", [Rr("T_Cancelar"), L("E_Cancel")])
f("C_Timer", "T_Expirar", [Rr("C_Timer"), L("T_Expirar")])
f("T_Expirar", "E_Expira", [Rr("T_Expirar"), L("E_Expira")])
f("C_Ocup", "T_Evento", [Rr("C_Ocup"), L("T_Evento")])
f("T_Evento", "G_Conflicto", [Rr("T_Evento"), L("G_Conflicto")])
f("G_Conflicto", "E_SinConf", [B("G_Conflicto"), T("E_SinConf")], "No")
f("G_Conflicto", "T_Buscar", [Rr("G_Conflicto"), L("T_Buscar")], "Sí")
f("T_Buscar", "G_Alt", [Rr("T_Buscar"), L("G_Alt")])
f("G_Alt", "T_Reasignar", [T("G_Alt"), B("T_Reasignar")], "Sí")
f("G_Alt", "T_Invalidar", [B("G_Alt"), T("T_Invalidar")], "No")
f("T_Invalidar", "E_Invalida", [Rr("T_Invalidar"), L("E_Invalida")])
f("T_Reasignar", "T_NotifReasig", [T("T_Reasignar"), B("T_NotifReasig")])
f("T_NotifReasig", "T_Mostrar", [T("T_NotifReasig"), (1880, 150), (1010, 150), T("T_Mostrar")], "nueva retención vigente")

msgs = []  # (id, src, tgt, name, waypoints)
CY = POOL_COND["y"] + POOL_COND["h"]; SY = POOL_SIM["y"]
def m(i, s, t, name, wp): msgs.append((i, s, t, name, wp))
m("M_QR", "P_Conductor", "S_QR", "escanea QR", [(145, CY), T("S_QR")])
m("M_Zonas", "T_Zonas", "P_Conductor", "zonas y estado", [T("T_Zonas"), (400, CY)])
m("M_Eleccion", "P_Conductor", "T_Solicitar", "zona elegida", [(590, CY), (590, P1 - TH / 2)])
m("M_Retencion", "T_Mostrar", "P_Conductor", "retención y aviso", [(1050, P1 - TH / 2), (1050, CY)])
m("M_Cancel", "P_Conductor", "C_Cancel", "cancelar", [(1250, CY), T("C_Cancel")])
m("M_Reasig", "T_NotifReasig", "P_Conductor", "nueva zona", [(1910, P1 - TH / 2), (1910, CY)])
m("M_Ocup", "P_Simulador", "C_Ocup", "ENTRADA / SALIDA", [(1250, SY), B("C_Ocup")])

# ---------------------------------- XML BPMN 2.0 ---------------------------------------------
def bounds(x, y, w, h): return f'<dc:Bounds x="{x:.0f}" y="{y:.0f}" width="{w:.0f}" height="{h:.0f}" />'
def wps(wp): return "".join(f'<di:waypoint x="{x:.0f}" y="{y:.0f}" />' for x, y in wp)
inc = {k: [] for k in nodes}; out = {k: [] for k in nodes}
for fid, s, t, _, _ in flows: out[s].append(fid); inc[t].append(fid)

x = ['<?xml version="1.0" encoding="UTF-8"?>',
     '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" '
     'xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" '
     'id="Def_FastParking" targetNamespace="https://fastparking.local/bpmn" exporter="FastParking generador" exporterVersion="1.0">',
     '<bpmn:message id="Msg_QR" name="QR escaneado" /><bpmn:message id="Msg_Cancel" name="Cancelación" /><bpmn:message id="Msg_Ocup" name="Evento de ocupación" />',
     '<bpmn:collaboration id="Collab_Retencion">',
     f'<bpmn:participant id="{POOL_COND["id"]}" name="{escape(POOL_COND["name"])}" />',
     f'<bpmn:participant id="{POOL_FP["id"]}" name="FastParking" processRef="Proc_Retencion" />',
     f'<bpmn:participant id="{POOL_SIM["id"]}" name="{escape(POOL_SIM["name"])}" />']
for i, s, t, name, _ in msgs:
    x.append(f'<bpmn:messageFlow id="{i}" name="{escape(name)}" sourceRef="{s}" targetRef="{t}" />')
x.append('</bpmn:collaboration>')
x.append('<bpmn:process id="Proc_Retencion" name="Solicitud de retención temporal simulada y resolución de conflictos" isExecutable="false">')
x.append('<bpmn:laneSet id="LaneSet_1">')
for lane in (LANE_PWA, LANE_API):
    x.append(f'<bpmn:lane id="{lane["id"]}" name="{escape(lane["name"])}">' + "".join(
        f"<bpmn:flowNodeRef>{k}</bpmn:flowNodeRef>" for k, n in nodes.items() if n["lane"] == lane["id"]) + "</bpmn:lane>")
x.append('</bpmn:laneSet>')
for k, n in nodes.items():
    t = n["t"]; tag = "task" if t == "task" else t
    body = "".join(f"<bpmn:incoming>{i}</bpmn:incoming>" for i in inc[k]) + "".join(f"<bpmn:outgoing>{o}</bpmn:outgoing>" for o in out[k])
    if n.get("deco") == "message":
        ref = {"S_QR": "Msg_QR", "C_Cancel": "Msg_Cancel", "C_Ocup": "Msg_Ocup"}[k]
        body += f'<bpmn:messageEventDefinition id="MED_{k}" messageRef="{ref}" />'
    if n.get("deco") == "timer":
        body += f'<bpmn:timerEventDefinition id="TED_{k}"><bpmn:timeDuration>PT10M</bpmn:timeDuration></bpmn:timerEventDefinition>'
    x.append(f'<bpmn:{tag} id="{k}" name="{escape(n["name"])}">{body}</bpmn:{tag}>')
for fid, s, t, name, _ in flows:
    x.append(f'<bpmn:sequenceFlow id="{fid}" name="{escape(name)}" sourceRef="{s}" targetRef="{t}" />')
x.append('</bpmn:process>')
x.append('<bpmndi:BPMNDiagram id="Diag_1"><bpmndi:BPMNPlane id="Plane_1" bpmnElement="Collab_Retencion">')
for p in (POOL_COND, POOL_FP, POOL_SIM):
    x.append(f'<bpmndi:BPMNShape id="{p["id"]}_di" bpmnElement="{p["id"]}" isHorizontal="true">{bounds(p["x"], p["y"], p["w"], p["h"])}</bpmndi:BPMNShape>')
for lane in (LANE_PWA, LANE_API):
    x.append(f'<bpmndi:BPMNShape id="{lane["id"]}_di" bpmnElement="{lane["id"]}" isHorizontal="true">{bounds(lane["x"], lane["y"], lane["w"], lane["h"])}</bpmndi:BPMNShape>')
for k, n in nodes.items():
    bx, by, bw, bh = b(k)
    extra = ' isMarkerVisible="true"' if n["t"] == "exclusiveGateway" else ""
    lab = ""
    if n["t"] != "task" and n["name"]:
        lab = f'<bpmndi:BPMNLabel>{bounds(bx - 30, by + bh + 4, bw + 60, 28)}</bpmndi:BPMNLabel>'
    x.append(f'<bpmndi:BPMNShape id="{k}_di" bpmnElement="{k}"{extra}>{bounds(bx, by, bw, bh)}{lab}</bpmndi:BPMNShape>')
for fid, _, _, _, wp in flows:
    x.append(f'<bpmndi:BPMNEdge id="{fid}_di" bpmnElement="{fid}">{wps(wp)}</bpmndi:BPMNEdge>')
for i, _, _, _, wp in msgs:
    x.append(f'<bpmndi:BPMNEdge id="{i}_di" bpmnElement="{i}">{wps(wp)}</bpmndi:BPMNEdge>')
x.append('</bpmndi:BPMNPlane></bpmndi:BPMNDiagram></bpmn:definitions>')
(OUT / "bpmn-retencion.bpmn").write_text("\n".join(x), encoding="utf-8")

# ---------------------------------- SVG ------------------------------------------------------
INK = "#10242a"; BRAND = "#083E4D"
def wrap(text, width_chars):
    words, lines, cur = text.split(), [], ""
    for w_ in words:
        if len(cur) + len(w_) + 1 > width_chars and cur: lines.append(cur); cur = w_
        else: cur = (cur + " " + w_).strip()
    if cur: lines.append(cur)
    return lines
def mtext(cx, cy, text, size=12, chars=18, weight="normal", fill=INK):
    ls = wrap(text, chars); y0 = cy - (len(ls) - 1) * size * 0.6
    return "".join(f'<text x="{cx}" y="{y0 + i * size * 1.2:.1f}" font-size="{size}" font-weight="{weight}" fill="{fill}" text-anchor="middle" dominant-baseline="middle">{escape(l)}</text>' for i, l in enumerate(ls))

H = POOL_SIM["y"] + POOL_SIM["h"] + 30
s = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" font-family="Segoe UI, Arial, sans-serif">',
     '<defs><marker id="seq" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0,0L10,5L0,10z" fill="#10242a"/></marker>'
     '<marker id="msgEnd" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="9" markerHeight="9" orient="auto"><path d="M0,0L10,5L0,10z" fill="#fff" stroke="#10242a"/></marker>'
     '<marker id="msgStart" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7"><circle cx="5" cy="5" r="4" fill="#fff" stroke="#10242a"/></marker></defs>',
     f'<rect width="{W}" height="{H}" fill="#fff"/>']
def pool(p, label_band=True):
    s.append(f'<rect x="{p["x"]}" y="{p["y"]}" width="{p["w"]}" height="{p["h"]}" fill="#fff" stroke="{INK}" stroke-width="1.5"/>')
    if label_band:
        s.append(f'<line x1="{p["x"] + 30}" y1="{p["y"]}" x2="{p["x"] + 30}" y2="{p["y"] + p["h"]}" stroke="{INK}" stroke-width="1.5"/>')
        s.append(f'<text transform="translate({p["x"] + 19},{p["y"] + p["h"] / 2}) rotate(-90)" text-anchor="middle" font-size="14" font-weight="700" fill="{BRAND}">{escape(p["name"])}</text>')
for p in (POOL_COND, POOL_SIM):
    s.append(f'<rect x="{p["x"]}" y="{p["y"]}" width="{p["w"]}" height="{p["h"]}" fill="#f3f7f8" stroke="{INK}" stroke-width="1.5"/>')
    s.append(f'<text x="{p["x"] + p["w"] / 2}" y="{p["y"] + p["h"] / 2}" text-anchor="middle" dominant-baseline="middle" font-size="15" font-weight="700" fill="{BRAND}">{escape(p["name"])}</text>')
pool(POOL_FP)
for lane in (LANE_PWA, LANE_API):
    s.append(f'<rect x="{lane["x"]}" y="{lane["y"]}" width="{lane["w"]}" height="{lane["h"]}" fill="none" stroke="{INK}"/>')
    s.append(f'<line x1="{lane["x"] + 30}" y1="{lane["y"]}" x2="{lane["x"] + 30}" y2="{lane["y"] + lane["h"]}" stroke="{INK}"/>')
    s.append(f'<text transform="translate({lane["x"] + 19},{lane["y"] + lane["h"] / 2}) rotate(-90)" text-anchor="middle" font-size="12" font-weight="600" fill="{INK}">{escape(lane["name"])}</text>')
def poly(wp, dashed=False):
    d = " ".join(f"{x:.0f},{y:.0f}" for x, y in wp)
    if dashed:
        return f'<polyline points="{d}" fill="none" stroke="{INK}" stroke-width="1.3" stroke-dasharray="6 4" marker-start="url(#msgStart)" marker-end="url(#msgEnd)"/>'
    return f'<polyline points="{d}" fill="none" stroke="{INK}" stroke-width="1.5" marker-end="url(#seq)"/>'
for fid, sname, tname, name, wp in flows:
    s.append(poly(wp))
    if name:
        (x1, y1), (x2, y2) = wp[0], wp[1]
        lx, ly = (x1 + x2) / 2, (y1 + y2) / 2
        if name == "nueva retención vigente": lx, ly = 1450, 150
        s.append(f'<text x="{lx + 6}" y="{ly - 6}" font-size="11" font-style="italic" fill="{BRAND}">{escape(name)}</text>')
for i, sname, tname, name, wp in msgs:
    s.append(poly(wp, dashed=True))
    (x1, y1), (x2, y2) = wp[0], wp[-1]
    s.append(f'<text x="{x1 + 8}" y="{(y1 + y2) / 2 if abs(y2-y1) < 200 else min(y1, y2) + 18}" font-size="10.5" fill="#4b6169">{escape(name)}</text>')
for k, n in nodes.items():
    cx, cy = n["cx"], n["cy"]; bx, by, bw, bh = b(k)
    if n["t"] == "task":
        s.append(f'<rect x="{bx}" y="{by}" width="{bw}" height="{bh}" rx="10" fill="#e3eef1" stroke="{BRAND}" stroke-width="1.6"/>')
        s.append(mtext(cx, cy, n["name"], 11.5, 20))
    elif "Gateway" in n["t"]:
        s.append(f'<polygon points="{cx},{cy - 25} {cx + 25},{cy} {cx},{cy + 25} {cx - 25},{cy}" fill="#fff" stroke="{INK}" stroke-width="1.6"/>')
        if n["t"] == "exclusiveGateway":
            s.append(f'<path d="M{cx - 8},{cy - 8}L{cx + 8},{cy + 8}M{cx + 8},{cy - 8}L{cx - 8},{cy + 8}" stroke="{INK}" stroke-width="3"/>')
        else:
            s.append(f'<circle cx="{cx}" cy="{cy}" r="13" fill="none" stroke="{INK}"/><circle cx="{cx}" cy="{cy}" r="10" fill="none" stroke="{INK}"/>')
            s.append(f'<polygon points="{cx},{cy - 6} {cx + 6},{cy - 2} {cx + 4},{cy + 5} {cx - 4},{cy + 5} {cx - 6},{cy - 2}" fill="none" stroke="{INK}"/>')
        if n["name"]:
            s.append(mtext(cx + (0 if k != "G_Cupo" else 0), cy + 44 if k not in ("G_Alt", "G_Conflicto") else cy - 48, n["name"], 10.5, 22))
    else:
        sw = {"startEvent": 1.6, "endEvent": 4, "intermediateCatchEvent": 1.4}[n["t"]]
        s.append(f'<circle cx="{cx}" cy="{cy}" r="18" fill="#fff" stroke="{INK}" stroke-width="{sw}"/>')
        if n["t"] == "intermediateCatchEvent":
            s.append(f'<circle cx="{cx}" cy="{cy}" r="14.5" fill="none" stroke="{INK}" stroke-width="1.2"/>')
        if n.get("deco") == "message":
            s.append(f'<rect x="{cx - 8}" y="{cy - 6}" width="16" height="12" fill="#fff" stroke="{INK}"/><path d="M{cx - 8},{cy - 6}L{cx},{cy + 1}L{cx + 8},{cy - 6}" fill="none" stroke="{INK}"/>')
        if n.get("deco") == "timer":
            s.append(f'<circle cx="{cx}" cy="{cy}" r="9" fill="#fff" stroke="{INK}"/><path d="M{cx},{cy - 6}L{cx},{cy}L{cx + 5},{cy + 2}" stroke="{INK}" fill="none"/>')
        if k == "C_Ocup":
            s.append(f'<text x="{cx - 24}" y="{cy + 30}" font-size="10.5" fill="{INK}" text-anchor="end">Evento de ocupación</text><text x="{cx - 24}" y="{cy + 43}" font-size="10.5" fill="{INK}" text-anchor="end">recibido</text>')
        else:
            s.append(mtext(cx, cy + 36, n["name"], 10.5, 18))
s.append('</svg>')
(OUT / "bpmn-retencion.svg").write_text("".join(s), encoding="utf-8")
print("BPMN generado:", OUT / "bpmn-retencion.bpmn")
