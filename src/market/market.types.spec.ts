import {
  parseNasdaqInfo,
  parseNasdaqSearch,
  parseYahooChart,
  parseYahooSearch,
} from './market.types';

describe('parseYahooChart', () => {
  const payload = {
    chart: {
      result: [
        {
          meta: {
            currency: 'USD',
            symbol: 'VOO',
            fullExchangeName: 'NYSEArca',
            longName: 'Vanguard S&P 500 ETF',
            regularMarketPrice: 712.8,
            chartPreviousClose: 701.78,
          },
        },
      ],
    },
  };

  it('extrae precio, cierre previo, nombre y bolsa', () => {
    expect(parseYahooChart(payload, 'VOO')).toEqual({
      price: 712.8,
      previousClose: 701.78,
      currency: 'USD',
      name: 'Vanguard S&P 500 ETF',
      exchange: 'NYSEArca',
      source: 'yahoo',
    });
  });

  it('acepta precio sin cierre previo (changePercent quedará null)', () => {
    const noPrev = { chart: { result: [{ meta: { regularMarketPrice: 10, currency: 'USD' } }] } };
    expect(parseYahooChart(noPrev, 'X')).toMatchObject({ price: 10, previousClose: null });
  });

  it('devuelve null si falta meta o el precio no es positivo', () => {
    expect(parseYahooChart({}, 'X')).toBeNull();
    expect(parseYahooChart({ chart: { result: [{ meta: { regularMarketPrice: 0 } }] } }, 'X')).toBeNull();
    expect(parseYahooChart(null, 'X')).toBeNull();
  });
});

describe('parseYahooSearch', () => {
  it('filtra solo ETFs y mapea nombre/bolsa', () => {
    const payload = {
      quotes: [
        { symbol: 'VOO', quoteType: 'ETF', longname: 'Vanguard S&P 500 ETF', exchDisp: 'NYSEArca' },
        { symbol: 'AAPL', quoteType: 'EQUITY', longname: 'Apple Inc.' },
      ],
    };
    expect(parseYahooSearch(payload)).toEqual([
      { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', exchange: 'NYSEArca', currency: null },
    ]);
  });

  it('devuelve [] con payload inválido', () => {
    expect(parseYahooSearch(null)).toEqual([]);
    expect(parseYahooSearch({})).toEqual([]);
  });
});

describe('parseNasdaqInfo', () => {
  it('parsea precio con símbolo de moneda y calcula el cierre previo', () => {
    const payload = {
      data: {
        symbol: 'VOO',
        companyName: 'Vanguard S&P 500 ETF',
        exchange: 'PSE',
        primaryData: { lastSalePrice: '$712.62', netChange: '-0.19' },
      },
    };
    expect(parseNasdaqInfo(payload, 'VOO')).toEqual({
      price: 712.62,
      previousClose: 712.81,
      currency: 'USD',
      name: 'Vanguard S&P 500 ETF',
      exchange: 'PSE',
      source: 'nasdaq',
    });
  });

  it('devuelve null si no hay precio válido', () => {
    expect(parseNasdaqInfo({ data: { primaryData: {} } }, 'X')).toBeNull();
    expect(parseNasdaqInfo(null, 'X')).toBeNull();
  });
});

describe('parseNasdaqSearch', () => {
  it('filtra solo ETFs', () => {
    const payload = {
      data: [
        { symbol: 'BIV', name: 'Vanguard Intermediate-Term Bond ETF', asset: 'ETF', exchange: 'PSE' },
        { symbol: 'ZZ', name: 'Not an ETF', asset: 'Stock' },
      ],
    };
    expect(parseNasdaqSearch(payload)).toEqual([
      { symbol: 'BIV', name: 'Vanguard Intermediate-Term Bond ETF', exchange: 'PSE', currency: null },
    ]);
  });

  it('devuelve [] con payload inválido', () => {
    expect(parseNasdaqSearch(null)).toEqual([]);
  });
});
