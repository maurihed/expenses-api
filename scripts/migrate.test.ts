import { computeOpeningBalance } from '../src/domain/balance';

test('opening balance compensa el efecto neto', () => {
  expect(computeOpeningBalance(750, -250)).toBe(1000);
});
