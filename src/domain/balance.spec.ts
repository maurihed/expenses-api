import { balanceDelta, computeOpeningBalance } from './balance';

describe('balanceDelta', () => {
  it('expense en efectivo resta', () => {
    expect(balanceDelta({ type: 'EXPENSE', accountType: 'CASH', role: 'SOURCE', amount: 100 })).toBe(-100);
  });
  it('income en débito suma', () => {
    expect(balanceDelta({ type: 'INCOME', accountType: 'DEBIT', role: 'SOURCE', amount: 100 })).toBe(100);
  });
  it('expense en crédito aumenta la deuda', () => {
    expect(balanceDelta({ type: 'EXPENSE', accountType: 'CREDIT', role: 'SOURCE', amount: 100 })).toBe(100);
  });
  it('transfer saliente resta en origen no-crédito', () => {
    expect(balanceDelta({ type: 'TRANSFER', accountType: 'DEBIT', role: 'SOURCE', amount: 100 })).toBe(-100);
  });
  it('transfer entrante en crédito reduce la deuda', () => {
    expect(balanceDelta({ type: 'TRANSFER', accountType: 'CREDIT', role: 'DESTINATION', amount: 100 })).toBe(-100);
  });
});

describe('computeOpeningBalance', () => {
  it('descuenta el efecto neto del saldo almacenado', () => {
    expect(computeOpeningBalance(5000, -2000)).toBe(7000);
  });
});
