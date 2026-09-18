function startOfWeek(d: Date): Date {
  const day = d.getUTCDay(); // 0 = domingo
  const r = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  r.setUTCDate(r.getUTCDate() - day);
  return r;
}

export function weeksElapsed(start: Date, today: Date): number {
  const ms = startOfWeek(today).getTime() - startOfWeek(start).getTime();
  return Math.floor(ms / (7 * 86400000)) + 1;
}

export function computePersonalBudget(input: {
  allowanceStartDate: Date; weeklyAllowance: number; today: Date;
  adjustmentTotal: number; spent: number;
}) {
  const accrued = weeksElapsed(input.allowanceStartDate, input.today) * input.weeklyAllowance;
  return {
    accrued,
    adjustmentTotal: input.adjustmentTotal,
    spent: input.spent,
    balance: accrued + input.adjustmentTotal - input.spent,
  };
}
