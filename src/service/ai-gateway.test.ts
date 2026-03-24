import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIGateway, AIProviderType } from './ai-gateway.js';
import type { AIRequest } from '../shared/types.js';

describe('AIGateway', () => {
  let gateway: AIGateway;

  beforeEach(() => {
    vi.clearAllMocks();
    gateway = new AIGateway();
  });

  describe('constructor', () => {
    it('should initialize with empty providers map', () => {
      const providers = gateway.providers;
      expect(providers).toBeDefined();
      expect(providers.size).toBe(0);
    });

    it('should initialize circuit breakers for all provider types', () => {
      // Circuit breakers are initialized in constructor for all provider types
      const status = gateway.getCircuitBreakerStatus('openai');
      expect(status).toBeDefined();
      expect(status.state).toBe('closed');
    });
  });

  describe('generate', () => {
    it('should return error when no providers configured', async () => {
      const request: AIRequest = {
        prompt: 'test',
        model: 'gpt-4',
      };

      const result = await gateway.generate(request);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No AI provider configured');
    });
  });

  describe('circuit breaker status', () => {
    it('should report circuit breaker status correctly', () => {
      const status = gateway.getCircuitBreakerStatus('openai');
      expect(status).toBeDefined();
      expect(status.state).toBe('closed');
      expect(status.failureCount).toBe(0);
    });

    it('should return default status for unknown provider', () => {
      const status = gateway.getCircuitBreakerStatus('anthropic');
      expect(status).toBeDefined();
      expect(status.state).toBe('closed');
    });
  });

  describe('addProvider', () => {
    it('should be a function', () => {
      expect(typeof gateway.addProvider).toBe('function');
    });
  });

  describe('getDefaultProvider', () => {
    it('should return undefined when no providers exist', () => {
      const defaultProvider = (gateway as any).getDefaultProvider();
      expect(defaultProvider).toBeUndefined();
    });
  });

  describe('bindTaskType', () => {
    it('should be a function', () => {
      expect(typeof gateway.bindTaskType).toBe('function');
    });
  });

  describe('iterate', () => {
    it('should be a function', () => {
      expect(typeof gateway.iterate).toBe('function');
    });
  });

  describe('getProviderForTaskType', () => {
    it('should return undefined when no binding exists', () => {
      const provider = gateway.getProviderForTaskType('text');
      expect(provider).toBeUndefined();
    });
  });

  describe('getTaskTypeBindings', () => {
    it('should return empty map when no bindings exist', () => {
      const bindings = gateway.getTaskTypeBindings();
      expect(bindings).toBeDefined();
      expect(bindings.size).toBe(0);
    });
  });

  describe('providers property', () => {
    it('should return a Map', () => {
      expect(gateway.providers).toBeInstanceOf(Map);
    });
  });
});
