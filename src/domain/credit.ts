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

export function creditPeriodPayment(input: CreditPeriodPaymentInput): number {
  const today = startOfUtcDay(input.today);
  const cut = mostRecentCut(input.closingDay, today);
  const start = oneMonthBefore(today);

  const inPeriod = (date: Date) => {
    const d = startOfUtcDay(date);
    return d.getTime() > start.getTime() && d.getTime() <= cut.getTime();
  };

  const charges = input.charges.reduce((sum, c) => (inPeriod(c.date) ? sum + c.amount : sum), 0);
  const payments = input.payments.reduce((sum, p) => (inPeriod(p.date) ? sum + p.amount : sum), 0);

  return Math.max(0, charges - payments);
}
