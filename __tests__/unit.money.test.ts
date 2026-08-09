import { describe, expect, it } from 'vitest';
import { addMinor, minor, multiplyMinor } from '@/src/domain/money';

describe('Money', () => {
  it('sums ten 10-cent items to exactly 100', () => {
    // As a float this is 0.9999999999999999.
    let total = minor(0);
    for (let i = 0; i < 10; i++) total = addMinor(total, minor(10));
    expect(total).toBe(100);
  });

  it('multiplies by quantity', () => {
    expect(multiplyMinor(minor(1299), 3)).toBe(3897);
  });

  it('rejects non-integers, negatives and bad quantities', () => {
    expect(() => minor(10.5)).toThrow(TypeError);
    expect(() => minor(-1)).toThrow(RangeError);
    expect(() => multiplyMinor(minor(10), -1)).toThrow(RangeError);
    expect(() => multiplyMinor(minor(10), 1.5)).toThrow(RangeError);
  });
});
