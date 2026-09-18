import { computeOpeningBalance } from '../src/domain/balance';
import { toCalendarDate } from './migrate-from-mongo';

test('opening balance compensa el efecto neto', () => {
  expect(computeOpeningBalance(750, -250)).toBe(1000);
});

describe('toCalendarDate (America/Mexico_City)', () => {
  it('ISO antes de las 06:00 UTC cae al día anterior', () => {
    expect(toCalendarDate('2024-08-16T04:59:49.406Z').toISOString()).toBe(
      '2024-08-15T00:00:00.000Z',
    );
  });

  it('ISO después de las 06:00 UTC conserva el mismo día', () => {
    expect(toCalendarDate('2024-08-15T21:33:01.104Z').toISOString()).toBe(
      '2024-08-15T00:00:00.000Z',
    );
  });

  it('fecha plana YYYY-MM-DD se conserva', () => {
    expect(toCalendarDate('2024-08-15').toISOString()).toBe('2024-08-15T00:00:00.000Z');
  });

  it('Date se interpreta en la zona de la app', () => {
    expect(toCalendarDate(new Date('2024-08-16T04:59:49.406Z')).toISOString()).toBe(
      '2024-08-15T00:00:00.000Z',
    );
  });

  it('respeta un APP_TIMEZONE distinto', () => {
    expect(toCalendarDate('2024-08-16T04:59:49.406Z', 'UTC').toISOString()).toBe(
      '2024-08-16T00:00:00.000Z',
    );
  });
});
