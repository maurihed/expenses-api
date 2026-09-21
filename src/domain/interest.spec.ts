import { computeInterest } from './interest';

const tiers = [
  { upTo: 10000, annualRate: 0.1 },
  { upTo: null, annualRate: 0.02 },
];

describe('computeInterest', () => {
  it('aplica tramos marginales al excedente (balance 15000)', () => {
    expect(computeInterest(15000, tiers)).toBe(91.67);
  });

  it('aplica solo el tramo cubierto (balance 5000)', () => {
    expect(computeInterest(5000, tiers)).toBe(41.67);
  });

  it('devuelve 0 sin tramos', () => {
    expect(computeInterest(15000, [])).toBe(0);
  });

  it('devuelve 0 con balance 0', () => {
    expect(computeInterest(0, tiers)).toBe(0);
  });

  it('ordena tramos desordenados con el null al final', () => {
    const shuffled = [
      { upTo: null, annualRate: 0.02 },
      { upTo: 10000, annualRate: 0.1 },
    ];
    expect(computeInterest(15000, shuffled)).toBe(91.67);
  });

  it('aplica la tasa del primer tramo a un balance parcial', () => {
    expect(computeInterest(500, [{ upTo: 10000, annualRate: 0.1 }, { upTo: null, annualRate: 0.02 }])).toBe(4.17);
  });

  it('usa 365 periodos al año con frecuencia diaria', () => {
    // 10000*0.1 + 5000*0.02 = 1100 anual → /365
    expect(computeInterest(15000, tiers, 'daily')).toBe(3.01);
  });

  it('la frecuencia mensual es el default', () => {
    expect(computeInterest(15000, tiers)).toBe(computeInterest(15000, tiers, 'monthly'));
  });
});
