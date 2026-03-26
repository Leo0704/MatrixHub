import { describe, it, expect } from 'vitest';
import { moderateText, moderateAndFix } from './content-moderator';

describe('content-moderator', () => {
  describe('moderateText', () => {
    it('should pass clean text', () => {
      const result = moderateText('这款产品非常好用，值得推荐');
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should detect extreme words', () => {
      const result = moderateText('这是全网最好的产品，第一名');
      expect(result.passed).toBe(false);
      expect(result.violations.some(v => v.type === 'extreme_words')).toBe(true);
    });

    it('should detect false claims', () => {
      const result = moderateText('七天美白，无效退款');
      expect(result.passed).toBe(false);
      expect(result.violations.some(v => v.type === 'false_claims')).toBe(true);
    });

    it('should detect sensitive industry terms', () => {
      const result = moderateText('保健品效果显著');
      expect(result.passed).toBe(false);
      expect(result.violations.some(v => v.type === 'sensitive_industry')).toBe(true);
    });
  });

  describe('moderateAndFix', () => {
    it('should return original if already passed', async () => {
      const text = '这款产品非常好用';
      const result = await moderateAndFix(text);
      expect(result.passed).toBe(true);
      expect(result.revisedContent).toBeUndefined();
    });

    it('should fix extreme words', async () => {
      const text = '这是全网最好的产品';
      const result = await moderateAndFix(text);
      expect(result.passed).toBe(true);
      expect(result.revisedContent).not.toContain('全网最好');
    });
  });
});