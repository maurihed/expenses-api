import {
  convertToAccountCurrency,
  dayChangePercent,
  previousPositionsValue,
  sumPositionValues,
  valuePosition,
} from './portfolio';

describe('convertToAccountCurrency', () => {
  it('misma moneda es identidad', () => {
    expect(convertToAccountCurrency(100, 'USD', 'USD', null)).toBe(100);
    expect(convertToAccountCurrency(100, 'MXN', 'MXN', null)).toBe(100);
  });

  it('USD→MXN usa la tasa; sin tasa devuelve null', () => {
    expect(convertToAccountCurrency(10, 'USD', 'MXN', 17.5)).toBeCloseTo(175, 6);
    expect(convertToAccountCurrency(10, 'USD', 'MXN', null)).toBeNull();
  });

  it('moneda no soportada devuelve null', () => {
    expect(convertToAccountCurrency(10, 'EUR', 'MXN', 17)).toBeNull();
  });
});

describe('valuePosition', () => {
  it('valúa en cuenta MXN con tasa', () => {
    expect(
      valuePosition({
        quantity: 2,
        price: 700,
        previousClose: 690,
        priceCurrency: 'USD',
        accountCurrency: 'MXN',
        usdRate: 17,
      }),
    ).toEqual({
      marketValue: 1400,
      marketValueAccountCurrency: 23800,
      changePercent: expect.closeTo(((700 - 690) / 690) * 100, 6),
    });
  });

  it('sin precio no valúa', () => {
    expect(
      valuePosition({
        quantity: 2,
        price: null,
        previousClose: null,
        priceCurrency: 'USD',
        accountCurrency: 'USD',
        usdRate: null,
      }),
    ).toEqual({ marketValue: null, marketValueAccountCurrency: null, changePercent: null });
  });

  it('precio sin cierre previo deja changePercent null', () => {
    expect(
      valuePosition({
        quantity: 1,
        price: 100,
        previousClose: null,
        priceCurrency: 'USD',
        accountCurrency: 'USD',
        usdRate: null,
      }).changePercent,
    ).toBeNull();
  });
});

describe('sumPositionValues', () => {
  it('suma valores completos', () => {
    expect(sumPositionValues([100, 200.5])).toBeCloseTo(300.5, 6);
  });

  it('devuelve null si algún valor es null', () => {
    expect(sumPositionValues([100, null])).toBeNull();
  });

  it('lista vacía es 0', () => {
    expect(sumPositionValues([])).toBe(0);
  });
});

describe('previousPositionsValue', () => {
  it('convierte el valor previo y suma', () => {
    expect(
      previousPositionsValue(
        [{ quantity: 2, previousClose: 690, priceCurrency: 'USD' }],
        'MXN',
        17,
      ),
    ).toBeCloseTo(2 * 690 * 17, 6);
  });

  it('devuelve null si falta el cierre previo', () => {
    expect(
      previousPositionsValue(
        [{ quantity: 2, previousClose: null, priceCurrency: 'USD' }],
        'USD',
        null,
      ),
    ).toBeNull();
  });
});

describe('dayChangePercent', () => {
  it('calcula el porcentaje', () => {
    expect(dayChangePercent(110, 100)).toBeCloseTo(10, 6);
  });

  it('null si falta un valor o el previo es 0', () => {
    expect(dayChangePercent(null, 100)).toBeNull();
    expect(dayChangePercent(110, 0)).toBeNull();
  });
});
