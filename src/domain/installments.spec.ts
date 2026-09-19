import { splitInstallments } from './installments';

describe('splitInstallments', () => {
  it('reparte 1000 en 3 y la última absorbe el redondeo', () => {
    expect(splitInstallments(1000, 3)).toEqual([333.33, 333.33, 333.34]);
  });

  it('reparte 100 en 3 y la última absorbe el redondeo', () => {
    expect(splitInstallments(100, 3)).toEqual([33.33, 33.33, 33.34]);
  });

  it('reparte en partes exactas cuando es divisible', () => {
    expect(splitInstallments(1200, 12)).toEqual(new Array(12).fill(100));
  });

  it('la suma siempre coincide exactamente con el total', () => {
    const total = 999.99;
    const parts = splitInstallments(total, 7);
    const sum = parts.reduce((acc, part) => acc + part, 0);
    expect(Number(sum.toFixed(2))).toBe(total);
    expect(parts).toHaveLength(7);
  });
});
