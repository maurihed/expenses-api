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
it('cubre el ciclo completo cuando el clamp hace start === cut', () => {
  const result = creditPeriodPayment({
    closingDay: 31,
    today: new Date('2026-05-30'),
    charges: [{ date: new Date('2026-04-15'), amount: 2000 }],
    payments: [],
  });
  expect(result).toBe(2000);
});
it('cubre el ciclo previo cuando el corte clampeado cae tras febrero', () => {
  const result = creditPeriodPayment({
    closingDay: 30,
    today: new Date('2026-03-29'),
    charges: [{ date: new Date('2026-02-10'), amount: 1500 }],
    payments: [],
  });
  expect(result).toBe(1500);
});
