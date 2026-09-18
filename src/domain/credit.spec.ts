import { creditPeriodPayment } from './credit';

it('suma cargos del periodo y resta pagos', () => {
  const result = creditPeriodPayment({
    closingDay: 15,
    today: new Date('2026-03-20'),
    charges: [
      { date: new Date('2026-03-10'), amount: 1000 },
      { date: new Date('2026-02-20'), amount: 5000 },
    ],
    payments: [{ date: new Date('2026-03-12'), amount: 300 }],
  });
  expect(result).toBe(700);
});
it('clampea el día de corte en meses cortos', () => {
  const result = creditPeriodPayment({
    closingDay: 31, today: new Date('2026-02-28'), charges: [], payments: [],
  });
  expect(result).toBe(0);
});
