import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Platform } from '../shared/types.js';

// Mock database
const mockDbInstance = {
  prepare: vi.fn(),
};

vi.mock('./db.js', () => ({
  getDb: () => mockDbInstance,
}));

// Import after mocking
import { SelectorManager, DEFAULT_SELECTORS } from './selector-versioning.js';

describe('SelectorManager', () => {
  let manager: SelectorManager;

  beforeEach(() => {
    manager = new SelectorManager();
    vi.clearAllMocks();
    mockDbInstance.prepare.mockReturnValue({
      run: vi.fn().mockReturnValue({}),
      get: vi.fn().mockReturnValue(undefined),
      all: vi.fn().mockReturnValue([]),
    });
  });

  describe('register()', () => {
    it('should register new selector with version 1', () => {
      const selector = manager.register({
        platform: 'douyin',
        selectorKey: 'publish_button',
        value: '[data-e2e="publish"]',
        type: 'css',
      });

      expect(selector.key).toBe('publish_button');
      expect(selector.value).toBe('[data-e2e="publish"]');
      expect(selector.version).toBe(1);
      expect(selector.isActive).toBe(true);
      expect(selector.successRate).toBe(1.0);
    });

    it('should default to css type when not specified', () => {
      const selector = manager.register({
        platform: 'douyin',
        selectorKey: 'title_input',
        value: '.title-input',
      });

      expect(selector.type).toBe('css');
    });

    it('should disable existing active selector when registering new version', () => {
      mockDbInstance.prepare.mockReturnValueOnce({
        get: vi.fn().mockReturnValue({
          id: 'existing-id',
          platform: 'douyin',
          selector_key: 'publish_button',
          selector_value: '[data-e2e="v1"]',
          version: 1,
          is_active: 1,
        }),
      });

      manager.register({
        platform: 'douyin',
        selectorKey: 'publish_button',
        value: '[data-e2e="v2"]',
      });

      // Should have called UPDATE to disable old version
      expect(mockDbInstance.prepare).toHaveBeenCalled();
    });
  });

  describe('get()', () => {
    it('should return null when selector not found', () => {
      const selector = manager.get('douyin', 'nonexistent');

      expect(selector).toBeNull();
    });

    it('should return selector with correct structure', () => {
      mockDbInstance.prepare.mockReturnValue({
        get: vi.fn().mockReturnValue({
          selector_key: 'title_input',
          selector_value: '.title',
          version: 1,
          is_active: 1,
          success_rate: 0.95,
          failure_count: 1,
        }),
      });

      const selector = manager.get('douyin', 'title_input');

      expect(selector?.key).toBe('title_input');
      expect(selector?.value).toBe('.title');
      expect(selector?.version).toBe(1);
      expect(selector?.successRate).toBe(0.95);
    });
  });

  describe('getAllVersions()', () => {
    it('should return empty array when no versions', () => {
      const versions = manager.getAllVersions('douyin', 'publish_button');

      expect(versions).toEqual([]);
    });

    it('should return all versions sorted by success_rate', () => {
      mockDbInstance.prepare.mockReturnValue({
        all: vi.fn().mockReturnValue([
          {
            selector_key: 'publish_button',
            selector_value: '[data-e2e="v2"]',
            version: 2,
            is_active: 1,
            success_rate: 0.8,
            failure_count: 2,
          },
          {
            selector_key: 'publish_button',
            selector_value: '[data-e2e="v1"]',
            version: 1,
            is_active: 0,
            success_rate: 0.5,
            failure_count: 5,
          },
        ]),
      });

      const versions = manager.getAllVersions('douyin', 'publish_button');

      expect(versions).toHaveLength(2);
      expect(versions[0].version).toBe(2);
    });
  });
});

describe('DEFAULT_SELECTORS', () => {
  it('should have selectors for all platforms', () => {
    expect(DEFAULT_SELECTORS.douyin).toBeDefined();
    expect(DEFAULT_SELECTORS.kuaishou).toBeDefined();
    expect(DEFAULT_SELECTORS.xiaohongshu).toBeDefined();
  });

  it('should have required selector keys for each platform', () => {
    const requiredKeys = [
      'login_username',
      'login_password',
      'login_button',
      'publish_button',
      'title_input',
      'content_input',
      'publish_confirm',
      'login_state',
    ];

    for (const platform of ['douyin', 'kuaishou', 'xiaohongshu'] as Platform[]) {
      for (const key of requiredKeys) {
        expect(DEFAULT_SELECTORS[platform][key]).toBeDefined();
      }
    }
  });

  it('should have css property for each selector', () => {
    for (const platform of ['douyin', 'kuaishou', 'xiaohongshu'] as Platform[]) {
      for (const selector of Object.values(DEFAULT_SELECTORS[platform])) {
        expect(selector.css).toBeDefined();
        expect(typeof selector.css).toBe('string');
        expect(selector.css.length).toBeGreaterThan(0);
      }
    }
  });

  it('should include publish_confirm selector', () => {
    expect(DEFAULT_SELECTORS.douyin.publish_confirm.css).toContain('publish');
    expect(DEFAULT_SELECTORS.kuaishou.publish_confirm.css).toContain('发布');
    expect(DEFAULT_SELECTORS.xiaohongshu.publish_confirm.css).toContain('发布');
  });
});
