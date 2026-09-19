import { debtBalance } from './debt';

describe('debtBalance', () => {
  it('calcula pendiente con abonos parciales', () => {
    expect(debtBalance(1000, [200, 300])).toEqual({
      paid: 500,
      remaining: 500,
      status: 'OPEN',
    });
  });

  it('queda liquidada cuando los abonos cubren el monto', () => {
    expect(debtBalance(1000, [1000])).toEqual({
      paid: 1000,
      remaining: 0,
      status: 'SETTLED',
    });
  });

  it('sin abonos el pendiente es el monto', () => {
    expect(debtBalance(750, [])).toEqual({ paid: 0, remaining: 750, status: 'OPEN' });
  });

  it('nunca deja pendiente negativo ante sobrepago', () => {
    expect(debtBalance(100, [120])).toEqual({ paid: 120, remaining: 0, status: 'SETTLED' });
  });

  it('redondea a 2 decimales', () => {
    expect(debtBalance(100, [33.333, 33.333])).toEqual({
      paid: 66.67,
      remaining: 33.33,
      status: 'OPEN',
    });
  });
});
