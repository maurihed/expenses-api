import { computePersonalBudget, weeksElapsed } from './personal-budget';

describe('weeksElapsed', () => {
  it('cuenta la semana inicial', () => {
    expect(weeksElapsed(new Date('2026-01-04'), new Date('2026-01-04'))).toBe(1);
  });
  it('cuenta semanas completas desde el domingo', () => {
    expect(weeksElapsed(new Date('2026-01-04'), new Date('2026-01-18'))).toBe(3);
  });
});

describe('computePersonalBudget', () => {
  it('acumula, ajusta y descuenta gastos', () => {
    const r = computePersonalBudget({
      allowanceStartDate: new Date('2026-01-04'),
      weeklyAllowance: 300,
      today: new Date('2026-01-18'),
      adjustmentTotal: -100,
      spent: 250,
    });
    expect(r).toEqual({ accrued: 900, adjustmentTotal: -100, spent: 250, balance: 550 });
  });
});
