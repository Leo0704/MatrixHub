import { getDb } from './db.js';
import log from 'electron-log';
import { v4 as uuidv4 } from 'uuid';
import type { Platform } from '../shared/types.js';

/**
 * AI Provider 类型
 */
export type AIProviderType = 'openai' | 'anthropic' | 'ollama' | 'zhipu';

/**
 * AI Provider 配置
 */
export interface AIProvider {
  id: string;
  name: string;
  type: AIProviderType;
  apiKey?: string;           // 存储在 Keychain 中的 key
  baseUrl: string;
  models: string[];
  isDefault: boolean;
  status: 'active' | 'inactive' | 'error';
}

/**
 * AI 生成请求
 */
export interface AIRequest {
  providerType?: AIProviderType;
  model?: string;
  prompt: string;
  system?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * AI 生成响应
 */
export interface AIResponse {
  success: boolean;
  content?: string;
  error?: string;
  provider?: string;
  model?: string;
  latencyMs?: number;
  tokensUsed?: number;
}

// ============ 熔断器实现 ============

enum CircuitState {
  CLOSED = 'closed',     // 正常
  OPEN = 'open',         // 熔断中
  HALF_OPEN = 'half_open', // 半开
}

interface CircuitBreaker {
  state: CircuitState;
  failureCount: number;
  lastFailureTime: number;
  successCount: number;
}

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_RESET_TIMEOUT = 60000;  // 1分钟后重试
const DEFAULT_SUCCESS_THRESHOLD = 3;   // 半开后需要 3 次成功才关闭

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private readonly failureThreshold: number;
  private readonly resetTimeout: number;
  private readonly successThreshold: number;

  constructor(options?: {
    failureThreshold?: number;
    resetTimeout?: number;
    successThreshold?: number;
  }) {
    this.failureThreshold = options?.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
    this.resetTimeout = options?.resetTimeout ?? DEFAULT_RESET_TIMEOUT;
    this.successThreshold = options?.successThreshold ?? DEFAULT_SUCCESS_THRESHOLD;
  }

  /**
   * 执行带熔断保护的调用
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
        this.state = CircuitState.HALF_OPEN;
        log.info(`CircuitBreaker: OPEN -> HALF_OPEN`);
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
        this.successCount = 0;
        log.info(`CircuitBreaker: HALF_OPEN -> CLOSED`);
      }
    } else {
      this.failureCount = 0;
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.OPEN;
      log.warn(`CircuitBreaker: HALF_OPEN -> OPEN (failure ${this.failureCount})`);
    } else if (this.failureCount >= this.failureThreshold) {
      this.state = CircuitState.OPEN;
      log.warn(`CircuitBreaker: CLOSED -> OPEN (failure ${this.failureCount})`);
    }
  }

  getState(): { state: CircuitState; failureCount: number } {
    return { state: this.state, failureCount: this.failureCount };
  }
}

// ============ AI Gateway ============

/**
 * AI Gateway
 * - 多 Provider 路由
 * - 熔断保护
 * - Prompt 模板管理
 */
export class AIGateway {
  private providers: Map<AIProviderType, AIProvider> = new Map();
  private circuitBreakers: Map<AIProviderType, CircuitBreaker> = new Map();

  constructor() {
    // 初始化熔断器
    for (const type of ['openai', 'anthropic', 'ollama', 'zhipu'] as AIProviderType[]) {
      this.circuitBreakers.set(type, new CircuitBreaker());
    }
  }

  /**
   * 生成内容
   */
  async generate(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();
    const providerType = request.providerType ?? 'openai';

    const provider = this.providers.get(providerType);
    if (!provider) {
      return { success: false, error: `Provider not configured: ${providerType}` };
    }

    const circuitBreaker = this.circuitBreakers.get(providerType)!;

    try {
      const content = await circuitBreaker.execute(async () => {
        return this.callProvider(provider, request);
      });

      return {
        success: true,
        content,
        provider: provider.name,
        model: request.model ?? provider.models[0],
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      const err = error as Error;
      log.error(`AI Gateway error: ${providerType} - ${err.message}`);

      return {
        success: false,
        error: err.message,
        provider: provider.name,
        latencyMs: Date.now() - startTime,
      };
    }
  }

  /**
   * 调用具体的 Provider
   */
  private async callProvider(provider: AIProvider, request: AIRequest): Promise<string> {
    const model = request.model ?? provider.models[0];

    switch (provider.type) {
      case 'openai':
        return this.callOpenAI(provider, model, request);
      case 'anthropic':
        return this.callAnthropic(provider, model, request);
      case 'ollama':
        return this.callOllama(provider, model, request);
      case 'zhipu':
        return this.callZhipu(provider, model, request);
      default:
        throw new Error(`Unsupported provider: ${provider.type}`);
    }
  }

  private async callOpenAI(provider: AIProvider, model: string, request: AIRequest): Promise<string> {
    // TODO: 实现 OpenAI API 调用
    // const apiKey = await getKeychainKey(provider.apiKeyKeychainKey);
    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey ?? ''}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          ...(request.system ? [{ role: 'system', content: request.system }] : []),
          { role: 'user', content: request.prompt },
        ],
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 2000,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json() as any;
    return data.choices[0].message.content;
  }

  private async callAnthropic(provider: AIProvider, model: string, request: AIRequest): Promise<string> {
    const response = await fetch(`${provider.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': provider.apiKey ?? '',
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: request.prompt }],
        system: request.system,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 2000,
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json() as any;
    return data.content[0].text;
  }

  private async callOllama(provider: AIProvider, model: string, request: AIRequest): Promise<string> {
    const response = await fetch(`${provider.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: request.prompt,
        system: request.system,
        temperature: request.temperature ?? 0.7,
        options: { num_predict: request.maxTokens ?? 2000 },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const data = await response.json() as any;
    return data.response;
  }

  private async callZhipu(provider: AIProvider, model: string, request: AIRequest): Promise<string> {
    // 智谱 GLM API
    const response = await fetch(`${provider.baseUrl}/api/parompt/v1/text/chatcompletion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey ?? ''}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          ...(request.system ? [{ role: 'system', content: request.system }] : []),
          { role: 'user', content: request.prompt },
        ],
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 2000,
      }),
    });

    if (!response.ok) {
      throw new Error(`Zhipu API error: ${response.status}`);
    }

    const data = await response.json() as any;
    return data.choices[0].message.content;
  }

  /**
   * 添加/更新 Provider
   */
  addProvider(config: {
    name: string;
    type: AIProviderType;
    apiKey?: string;
    baseUrl: string;
    models: string[];
    isDefault?: boolean;
  }): AIProvider {
    const db = getDb();
    const now = Date.now();

    const provider: AIProvider = {
      id: uuidv4(),
      name: config.name,
      type: config.type,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      models: config.models,
      isDefault: config.isDefault ?? false,
      status: 'active',
    };

    db.prepare(`
      INSERT INTO ai_providers (id, name, provider_type, base_url, models, is_default, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      provider.id,
      provider.name,
      provider.type,
      provider.baseUrl,
      JSON.stringify(provider.models),
      provider.isDefault ? 1 : 0,
      provider.status,
      now,
      now
    );

    this.providers.set(provider.type, provider);
    log.info(`AI Provider added: ${provider.name} (${provider.type})`);

    return provider;
  }

  /**
   * 加载所有 Provider
   */
  loadProviders(): void {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM ai_providers WHERE status = ?').all('active') as any[];

    for (const row of rows) {
      const provider: AIProvider = {
        id: row.id,
        name: row.name,
        type: row.provider_type,
        apiKey: undefined,  // 从 Keychain 加载
        baseUrl: row.base_url,
        models: JSON.parse(row.models),
        isDefault: row.is_default === 1,
        status: row.status,
      };

      this.providers.set(provider.type, provider);
    }

    log.info(`Loaded ${this.providers.size} AI providers`);
  }

  /**
   * 获取熔断器状态
   */
  getCircuitBreakerStatus(providerType: AIProviderType): { state: CircuitState; failureCount: number } {
    return this.circuitBreakers.get(providerType)?.getState() ?? { state: CircuitState.CLOSED, failureCount: 0 };
  }
}

export const aiGateway = new AIGateway();
