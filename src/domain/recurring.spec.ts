import { clampDayOfMonth, nextOccurrence } from './recurring';

const iso = (date: Date) => date.toISOString().slice(0, 10);

describe('clampDayOfMonth', () => {
  it('devuelve el mismo día cuando existe en el mes', () => {
    expect(iso(clampDayOfMonth(2026, 0, 15))).toBe('2026-01-15');
  });

  it('clampea 31 a fin de mes en febrero no bisiesto', () => {
    expect(iso(clampDayOfMonth(2026, 1, 31))).toBe('2026-02-28');
  });

  it('clampea 31 a 29 en febrero bisiesto', () => {
    expect(iso(clampDayOfMonth(2024, 1, 31))).toBe('2024-02-29');
  });

  it('normaliza meses fuera de rango', () => {
    expect(iso(clampDayOfMonth(2026, 12, 10))).toBe('2027-01-10');
  });
});

describe('nextOccurrence MONTHLY', () => {
  it('usa dayOfMonth dentro del mismo mes si es posterior a from', () => {
    expect(iso(nextOccurrence('monthly', new Date('2026-01-15'), 31))).toBe('2026-01-31');
  });

  it('clampea a fin de mes y avanza al siguiente mes cuando ya pasó', () => {
    expect(iso(nextOccurrence('monthly', new Date('2026-01-31'), 31))).toBe('2026-02-28');
  });

  it('recupera el día 31 en un mes que sí lo tiene', () => {
    expect(iso(nextOccurrence('monthly', new Date('2026-02-28'), 31))).toBe('2026-03-31');
  });

  it('es estrictamente posterior cuando from cae justo en dayOfMonth', () => {
    expect(iso(nextOccurrence('monthly', new Date('2026-01-15'), 15))).toBe('2026-02-15');
  });

  it('usa el día de from cuando dayOfMonth es null', () => {
    expect(iso(nextOccurrence('monthly', new Date('2026-01-15'), null))).toBe('2026-02-15');
  });
});

describe('nextOccurrence WEEKLY', () => {
  it('avanza a la próxima fecha con el dayOfWeek pedido', () => {
    expect(iso(nextOccurrence('weekly', new Date('2026-01-14'), null, 1))).toBe('2026-01-19');
  });

  it('avanza 7 días cuando from ya cae en dayOfWeek', () => {
    expect(iso(nextOccurrence('weekly', new Date('2026-01-19'), null, 1))).toBe('2026-01-26');
  });
});

describe('nextOccurrence BIWEEKLY', () => {
  it('avanza 14 días cuando from ya cae en dayOfWeek', () => {
    expect(iso(nextOccurrence('biweekly', new Date('2026-01-19'), null, 1))).toBe('2026-02-02');
  });

  it('avanza a la próxima fecha con el dayOfWeek pedido', () => {
    expect(iso(nextOccurrence('biweekly', new Date('2026-01-14'), null, 1))).toBe('2026-01-19');
  });
});
