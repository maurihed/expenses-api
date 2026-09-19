export type RecurringFrequency = 'weekly' | 'biweekly' | 'monthly';

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

export function clampDayOfMonth(year: number, monthIndex0: number, day: number): Date {
  const normalized = new Date(Date.UTC(year, monthIndex0, 1));
  const y = normalized.getUTCFullYear();
  const m = normalized.getUTCMonth();
  const clamped = Math.min(Math.max(1, day), daysInMonth(y, m));
  return new Date(Date.UTC(y, m, clamped));
}

export function nextOccurrence(
  frequency: RecurringFrequency,
  from: Date,
  dayOfMonth?: number | null,
  dayOfWeek?: number | null,
): Date {
  const base = startOfUtcDay(from);

  if (frequency === 'monthly') {
    const day = dayOfMonth ?? base.getUTCDate();
    const candidate = clampDayOfMonth(base.getUTCFullYear(), base.getUTCMonth(), day);
    if (candidate.getTime() > base.getTime()) return candidate;
    return clampDayOfMonth(base.getUTCFullYear(), base.getUTCMonth() + 1, day);
  }

  const target = dayOfWeek ?? base.getUTCDay();
  const delta = (target - base.getUTCDay() + 7) % 7;

  if (frequency === 'biweekly') {
    return addDays(base, delta === 0 ? 14 : delta);
  }
  return addDays(base, delta === 0 ? 7 : delta);
}
