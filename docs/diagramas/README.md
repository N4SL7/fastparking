# Diagramas

| Archivo | Contenido | Cómo editar |
|---|---|---|
| `bpmn-retencion.bpmn` | BPMN 2.0 del proceso principal (pools, lanes, eventos, gateways, flujos de mensaje) | Abrir en https://demo.bpmn.io o Camunda Modeler |
| `bpmn-retencion.png/.svg` | Vista del BPMN | Generada por `fuentes/bpmn_retencion.py` |
| `mer.png/.svg` | Modelo Entidad-Relación | `fuentes/mer.dot` (Graphviz) |
| `c4-nivel1-contexto.*` … `c4-nivel4-codigo.*` | Modelo C4 niveles 1 a 4 | `fuentes/*.dot` (Graphviz) |

Regenerar: `python3 docs/diagramas/fuentes/bpmn_retencion.py && python3 docs/diagramas/fuentes/diagramas_graphviz.py`
