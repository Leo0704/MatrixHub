import { describe, it, expect } from 'vitest';
import { parseCount } from './douyin-metrics';

describe('douyin-metrics', () => {
  describe('parseCount', () => {
    it('should parse plain numbers', () => {
      expect(parseCount('12345')).toBe(12345);
      expect(parseCount('0')).toBe(0);
    });

    it('should parse numbers with commas', () => {
      expect(parseCount('12,345')).toBe(12345);
      expect(parseCount('1,234,567')).toBe(1234567);
    });

    it('should parse wan format', () => {
      expect(parseCount('1.2万')).toBe(12000);
      expect(parseCount('3.5万')).toBe(35000);
    });

    it('should parse yi format', () => {
      expect(parseCount('1.2亿')).toBe(120000000);
      expect(parseCount('3.5亿')).toBe(350000000);
    });

    it('should return 0 for invalid input', () => {
      expect(parseCount('')).toBe(0);
      expect(parseCount('abc')).toBe(0);
    });
  });
});