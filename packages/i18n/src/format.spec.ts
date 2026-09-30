import { describe, expect, it } from 'vitest';

import { formatDate, formatMoney, formatNumber, formatTime } from './format.js';

describe('formatMoney (G-08, C-40)', () => {
  it('uses Indian grouping with 2 decimals by default (exit gate)', () => {
    expect(formatMoney(10_000_000, 'INR')).toBe('₹1,00,000.00');
  });

  it('drops .00 in compact mode, keeps real paise (exit gate)', () => {
    expect(formatMoney(10_000_000, 'INR', { compact: true })).toBe('₹1,00,000');
    expect(formatMoney(10_000_050, 'INR', { compact: true })).toBe('₹1,00,000.50');
  });

  it('handles small, large, negative and bigint amounts', () => {
    expect(formatMoney(5, 'INR')).toBe('₹0.05');
    expect(formatMoney(1_23_45_67_890_00, 'INR')).toBe('₹1,23,45,67,890.00');
    expect(formatMoney(-150_00, 'INR')).toBe('-₹150.00');
    expect(formatMoney(250_000n, 'INR', { compact: true })).toBe('₹2,500');
  });

  it('respects currencies without minor units', () => {
    expect(formatMoney(1500, 'JPY')).toBe('JP¥1,500');
  });

  it('formats pseudo-locales like en-IN', () => {
    expect(formatMoney(10_000_000, 'INR', { locale: 'en-XA' })).toBe('₹1,00,000.00');
  });
});

describe('dates and times', () => {
  it('never shifts calendar dates across time zones', () => {
    expect(formatDate('2026-09-30')).toBe('30 Sept 2026');
    expect(formatDate('2026-01-01', { timeZone: 'America/Los_Angeles' })).toBe('1 Jan 2026');
  });

  it('shows instants in the tenant time zone', () => {
    expect(formatDate(new Date('2026-09-30T20:00:00Z'))).toBe('1 Oct 2026');
    expect(formatTime('2026-09-30T12:00:00Z')).toBe('5:30 pm');
    expect(formatTime('2026-09-30T12:00:00Z', { timeZone: 'Asia/Dubai' })).toBe('4:00 pm');
  });

  it('groups plain numbers the Indian way', () => {
    expect(formatNumber(1_234_567)).toBe('12,34,567');
  });
});
