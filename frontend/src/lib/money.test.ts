import { describe, expect, it } from 'vitest';
import { formatMoney, formatMoneyShort, parseAmount } from './money';

describe('formatMoney', () => {
  it('formats integer paise as rupees with Indian grouping', () => {
    expect(formatMoney(1_100_000)).toBe('₹11,000.00');
    expect(formatMoney(12_500_000)).toBe('₹1,25,000.00');
    expect(formatMoney(668)).toBe('₹6.68');
    expect(formatMoney(0)).toBe('₹0.00');
  });
  it('drops paise only when asked and when they are zero', () => {
    expect(formatMoney(1_000_000, 'INR', { whole: true })).toBe('₹10,000');
    expect(formatMoney(1_000_050, 'INR', { whole: true })).toBe('₹10,000.50');
  });
  it('still formats other currencies', () => {
    expect(formatMoney(22_000, 'USD')).toBe('$220.00');
  });
  it('refuses floating-point money', () => {
    expect(() => formatMoney(220.5)).toThrow();
  });
});

describe('parseAmount', () => {
  it('parses typed amounts', () => {
    expect(parseAmount('10000')).toBe(1_000_000);
    expect(parseAmount('200.5')).toBe(20_050);
    expect(parseAmount('₹1,25,000.05')).toBe(12_500_005);
    expect(parseAmount('Rs. 500')).toBe(50_000);
    expect(parseAmount('0.1')).toBe(10);
  });
  it('rejects junk', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('12.345')).toBeNull();
    expect(parseAmount('-5')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
  });
});

describe('formatMoneyShort (phase E)', () => {
  it('uses lakh and crore, never overstating', () => {
    expect(formatMoneyShort(8_220_000)).toBe('₹82,200');
    expect(formatMoneyShort(10_000_000)).toBe('₹1L');
    expect(formatMoneyShort(12_990_000)).toBe('₹1.2L');
    expect(formatMoneyShort(2_500_000_000)).toBe('₹2.5Cr');
    expect(formatMoneyShort(99_999_900)).toBe('₹9.9L'); // ₹9,99,999 rounds down, never up to ₹10L
  });
});
