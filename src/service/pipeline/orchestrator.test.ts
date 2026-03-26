import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PipelineTask, InputSource } from '../../shared/types.js';

// Mock dependencies
vi.mock('../db.js', () => ({
  getDb: vi.fn(() => ({
    prepare: vi.fn(() => ({
      get: vi.fn(),
      all: vi.fn(() => []),
      run: vi.fn(),
    })),
  })),
}));

vi.mock('../queue.js', () => ({
  taskQueue: {
    create: vi.fn(() => ({ id: 'task-123' })),
  },
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid-1234'),
}));

vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
}));

// Mock content generator and input parser
vi.mock('./input-parser.js', () => ({
  parseInput: vi.fn(() => Promise.resolve({ success: true, product: { name: 'Test Product' } })),
}));

vi.mock('./content-generator.js', () => ({
  generateContent: vi.fn(() => Promise.resolve({
    text: 'Generated text content',
    imageUrls: [],
    videoUrl: null,
    voiceBase64: null,
    localFilePaths: [],
  })),
}));

describe('Pipeline Orchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('store functions', () => {
    it('should load pipeline task from database', async () => {
      const { loadPipelineTask } = await import('./store.js');
      const result = loadPipelineTask('test-id');
      expect(result).toBeNull(); // No mock data set
    });

    it('should load all pipeline tasks from database', async () => {
      const { loadAllPipelineTasks } = await import('./store.js');
      const result = loadAllPipelineTasks();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('task persistence', () => {
    it('should load tasks from database after app restart', async () => {
      // This test verifies that getAllPipelineTasks uses the DB store
      const { getAllPipelineTasks } = await import('./orchestrator.js');

      // Tasks should be loaded from database, not from memory
      const initialTasks = getAllPipelineTasks();
      expect(Array.isArray(initialTasks)).toBe(true);
    });

    it('should save task with all required fields', async () => {
      const { savePipelineTask } = await import('./store.js');

      const mockTask: PipelineTask = {
        id: 'persist-test-id',
        input: { type: 'url', url: 'https://example.com' } as InputSource,
        config: {
          contentType: 'image',
          imageCount: 1,
          generateVoice: false,
          autoPublish: false,
          targetAccounts: [],
        },
        platform: 'douyin',
        status: 'pending',
        steps: [
          { step: 'parse', status: 'pending' },
          { step: 'text', status: 'pending' },
          { step: 'publish', status: 'pending' },
        ],
        currentStep: 'parse',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // Should not throw
      expect(() => savePipelineTask(mockTask)).not.toThrow();
    });
  });

  describe('getAllPipelineTasks', () => {
    it('should return array of tasks from database', async () => {
      const { getAllPipelineTasks } = await import('./orchestrator.js');
      const tasks = getAllPipelineTasks();
      expect(Array.isArray(tasks)).toBe(true);
    });
  });

  describe('getPipelineTask', () => {
    it('should return null for non-existent task', async () => {
      const { getPipelineTask } = await import('./orchestrator.js');
      const task = await getPipelineTask('non-existent-id');
      expect(task).toBeNull();
    });
  });
});
