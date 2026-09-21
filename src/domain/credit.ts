export interface CreditPeriodPaymentInput {
  closingDay: number;
  today: Date;
  charges: { date: Date; amount: number }[];
  payments: { date: Date; amount: number }[];
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function dateWithClampedDay(year: number, month: number, day: number): Date {
  const normalized = new Date(Date.UTC(year, month, 1));
  const y = normalized.getUTCFullYear();
  const m = normalized.getUTCMonth();
  const clamped = Math.min(day, daysInMonth(y, m));
  return new Date(Date.UTC(y, m, clamped));
}

function mostRecentCut(closingDay: number, today: Date): Date {
  const candidate = dateWithClampedDay(today.getUTCFullYear(), today.getUTCMonth(), closingDay);
  if (candidate.getTime() > today.getTime()) {
    return dateWithClampedDay(today.getUTCFullYear(), today.getUTCMonth() - 1, closingDay);
  }
  return candidate;
}

function oneMonthBefore(date: Date): Date {
  return dateWithClampedDay(date.getUTCFullYear(), date.getUTCMonth() - 1, date.getUTCDate());
}

export interface CreditPeriodRange {
  start: Date;
  cut: Date;
}

export function creditPeriodRange(closingDay: number, today: Date): CreditPeriodRange {
  const day = startOfUtcDay(today);
  const cut = mostRecentCut(closingDay, day);
  let start = oneMonthBefore(day);
  if (start.getTime() >= cut.getTime()) {
    start = oneMonthBefore(cut);
  }
  return { start, cut };
}

export function isInCreditPeriod(date: Date, range: CreditPeriodRange): boolean {
  const d = startOfUtcDay(date);
  return d.getTime() > range.start.getTime() && d.getTime() <= range.cut.getTime();
}

export function isAfterCreditPeriod(date: Date, range: CreditPeriodRange): boolean {
  const d = startOfUtcDay(date);
  return d.getTime() > range.cut.getTime();
}

export function creditPeriodPayment(input: CreditPeriodPaymentInput): number {
  const range = creditPeriodRange(input.closingDay, input.today);

  const charges = input.charges.reduce(
    (sum, c) => (isInCreditPeriod(c.date, range) ? sum + c.amount : sum),
    0,
  );
  const payments = input.payments.reduce(
    (sum, p) => (isInCreditPeriod(p.date, range) ? sum + p.amount : sum),
    0,
  );

  return Math.max(0, charges - payments);
}

/**
 * Deuda inicial que debe pagarse en el corte del periodo actual. Cuenta solo si
 * se registró dentro del periodo vigente; al avanzar el corte deja de contar
 * (la deuda sigue en el saldo total hasta que se pague).
 */
export function initialDebtDue(
  initialDebt: number | null,
  initialDebtDate: Date | null,
  range: CreditPeriodRange,
): number {
  if (initialDebt == null || initialDebtDate == null) return 0;
  return isInCreditPeriod(initialDebtDate, range) ? initialDebt : 0;
}
