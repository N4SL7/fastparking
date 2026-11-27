# FastParking v2.1 — mejoras de experiencia y de la demostración (27 nov 2026)

Origen: auditoría de usabilidad (camino feliz en celular 390×844 + vista /simulacion) y revisión de código.

## Fallas corregidas (causa raíz)

| Falla | Causa raíz | Solución |
|---|---|---|
| El mapa 3D "se volvía loco" al reasignar | 1) Al ocuparse el puesto, los datos lo mostraban ocupado y el destino quedaba vacío, así que la navegación se cortaba y la cámara pasaba a vista general. 2) La ruta nueva siempre salía desde la entrada del sótano. 3) Se desplazaba la página. | El destino es el puesto de la retención aunque figure ocupado; la ruta nueva sale desde donde va la flecha (`rutaDesde`); la cámara sigue en modo GPS y no hay desplazamiento. El celular envía el punto `desde` y el carro vinotinto del iPad continúa desde el mismo lugar. |
| El carro intruso llegaba "de golpe" | Solo existía "lanzar ya", que llegaba a los 9 s. | Intruso en dos tiempos: **Preparar** (espera en la puerta trasera) → arranca 1,5 s después de que el conductor reserva → se estaciona → pausa de 1,5 s → ocupación y reasignación. |

## Mejoras de la app del conductor

- Encabezado limpio (sin código del tiquete ni "Salir"); una pastilla "Demo".
- Barra inferior compacta tipo pastilla y botón del asistente a su lado (ya no flota sobre las tarjetas).
- Avisos sobre la barra inferior (ya no tapan el encabezado).
- Un solo aviso de simulación por pantalla.
- Pantalla de escaneo nueva: QR enmarcado con esquinas, poco texto, un botón y animación sutil de escaneo.
- "Mi vehículo" con el mapa del sótano, el carro resaltado y "Llévame a mi carro" en la misma pantalla.
- "Salir de FastParking" al final del recorrido (Billetera / comprobante).
- Navegación de al menos 16 s (se lee mejor y el intruso preparado alcanza a llegar primero).

## Mejoras de la vista /simulacion (iPad)

- Controles del intruso: Preparar · Cancelar · Lanzar ahora, con su estado en vivo.
- "Paso a paso": reserva, navegación, intruso, reasignación y llegada, en orden y con hora.
- "Reiniciar demo": cancela retenciones vigentes, retira los carros de la app y olvida navegaciones.
- La decisión del agente explica por qué decidió el plan B (cuota, tiempo de espera, propuesta inválida o sin LLM).

## Pruebas

50 pruebas automatizadas (3 nuevas en CP-16: intruso preparado, cancelación y reinicio de la demo).
