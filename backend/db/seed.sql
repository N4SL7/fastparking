-- Datos de prueba ILUSTRATIVOS. No son datos oficiales del Centro Comercial Parque La Colina.
-- Capacidades pequeñas para poder demostrar conflictos con pocos eventos.
TRUNCATE pago, ubicacion_vehiculo, historial_retencion, evento_ocupacion, retencion, sesion_visita, zona, piso RESTART IDENTITY CASCADE;

INSERT INTO piso (id_piso, codigo, nombre, orden) VALUES
  (1, 'S1', 'Sótano 1', 1),
  (2, 'S2', 'Sótano 2', 2),
  (3, 'S3', 'Sótano 3', 3);

INSERT INTO zona (id_zona, id_piso, codigo, nombre, capacidad_total, ocupados, orden_cercania) VALUES
  (1,  1, 'S1-A', 'Zona A — Entrada principal', 12, 9,  1),
  (2,  1, 'S1-B', 'Zona B — Ascensores',        10, 10, 2),
  (3,  1, 'S1-C', 'Zona C — Plazoleta',          8, 3,  3),
  (4,  1, 'S1-D', 'Zona D — Salida norte',       8, 5,  4),
  (5,  2, 'S2-A', 'Zona A — Rampa',             14, 6,  1),
  (6,  2, 'S2-B', 'Zona B — Ascensores',        12, 11, 2),
  (7,  2, 'S2-C', 'Zona C — Escaleras',         10, 2,  3),
  (8,  2, 'S2-D', 'Zona D — Cine',              6, 6,  4),
  (9,  3, 'S3-A', 'Zona A — Rampa',             16, 4,  1),
  (10, 3, 'S3-B', 'Zona B — Ascensores',        12, 1,  2),
  (11, 3, 'S3-C', 'Zona C — Escaleras',         6, 0,  3),
  (12, 3, 'S3-D', 'Zona D — Salida sur',        10, 7,  4);
