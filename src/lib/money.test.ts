import { describe, expect, it } from 'vitest';
import { formatMoney, parseDollarsToCents } from './money';

describe('formatMoney', () => {
  it('formats integer cents', () => {
    expect(formatMoney(22_000)).toBe('$220.00');
    expect(formatMoney(668)).toBe('$6.68');
    expect(formatMoney(0)).toBe('$0.00');
  });
  it('drops cents only when asked and when they are zero', () => {
    expect(formatMoney(20_000, 'USD', { whole: true })).toBe('$200');
    expect(formatMoney(20_050, 'USD', { whole: true })).toBe('$200.50');
  });
  it('refuses floating-point money', () => {
    expect(() => formatMoney(220.5)).toThrow();
  });
});

describe('parseDollarsToCents', () => {
  it('parses typed amounts', () => {
    expect(parseDollarsToCents('200')).toBe(20_000);
    expect(parseDollarsToCents('200.5')).toBe(20_050);
    expect(parseDollarsToCents('$1,200.05')).toBe(120_005);
    expect(parseDollarsToCents('0.1')).toBe(10);
  });
  it('rejects junk', () => {
    expect(parseDollarsToCents('')).toBeNull();
    expect(parseDollarsToCents('12.345')).toBeNull();
    expect(parseDollarsToCents('-5')).toBeNull();
    expect(parseDollarsToCents('abc')).toBeNull();
  });
});
