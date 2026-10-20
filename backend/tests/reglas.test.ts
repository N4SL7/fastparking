/** Pruebas unitarias de las reglas de negocio puras (sin base de datos). */
import { describe, expect, it } from 'vitest';
import { calcularCupoLogico, clasificarZona, ordenarAlternativas } from '../src/modules/zones/availability.rules.js';
import { esTransicionValida, seleccionarAfectadas } from '../src/modules/retentions/retention.rules.js';
import { aplicarOcupacion } from '../src/modules/events/event.adapter.js';

describe('RN-12 cupo lógico', () => {
  it('resta ocupados y retenciones vigentes, sin bajar de cero', () => {
    expect(calcularCupoLogico(10, 6, 2)).toBe(2);
    expect(calcularCupoLogico(10, 10, 1)).toBe(0);
  });
});

describe('RF-03 clasificación textual de la zona', () => {
  it('clasifica LLENA, POCOS_CUPOS y DISPONIBLE', () => {
    expect(clasificarZona(0, 10)).toBe('LLENA');
    expect(clasificarZona(2, 10)).toBe('POCOS_CUPOS');
    expect(clasificarZona(3, 16)).toBe('POCOS_CUPOS');
    expect(clasificarZona(8, 10)).toBe('DISPONIBLE');
  });
});

describe('RF-15 orden de alternativas (D-05)', () => {
  const origen = { idZona: 3, pisoOrden: 1, ordenCercania: 3 };
  const candidatas = [
    { idZona: 1, pisoOrden: 1, ordenCercania: 1, cupoLogico: 2 },
    { idZona: 4, pisoOrden: 1, ordenCercania: 4, cupoLogico: 1 },
    { idZona: 2, pisoOrden: 1, ordenCercania: 2, cupoLogico: 0 },
    { idZona: 7, pisoOrden: 2, ordenCercania: 3, cupoLogico: 5 },
    { idZona: 3, pisoOrden: 1, ordenCercania: 3, cupoLogico: 9 },
  ];
  it('prefiere el mismo piso y la menor distancia; excluye origen y zonas llenas', () => {
    expect(ordenarAlternativas(origen, candidatas).map((z) => z.idZona)).toEqual([4, 1, 7]);
  });
});

describe('RN-13 retenciones afectadas por un conflicto', () => {
  it('ceden primero las más recientes', () => {
    const r = (id: string, ms: number) => ({ id, creadaEn: new Date(ms) });
    expect(seleccionarAfectadas([r('a', 1), r('b', 3), r('c', 2)], 2).map((x) => x.id)).toEqual(['b', 'c']);
    expect(seleccionarAfectadas([r('a', 1)], 0)).toEqual([]);
  });
});

describe('RN-06 transiciones de estado', () => {
  it('solo VIGENTE puede cambiar de estado', () => {
    expect(esTransicionValida('VIGENTE', 'CANCELADA')).toBe(true);
    expect(esTransicionValida('EXPIRADA', 'VIGENTE')).toBe(false);
    expect(esTransicionValida('CANCELADA', 'REASIGNADA')).toBe(false);
  });
});

describe('Adaptador: ocupación física', () => {
  it('limita la ocupación entre 0 y la capacidad', () => {
    expect(aplicarOcupacion(9, 10, 'ENTRADA', 5)).toBe(10);
    expect(aplicarOcupacion(1, 10, 'SALIDA', 3)).toBe(0);
  });
});
