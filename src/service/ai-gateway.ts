import { getDb } from './db.js';
import { aiKeyManager } from './credential-manager.js';
import log from 'electron-log';
import { v4 as uuidv4 } from 'uuid';
import type { Platform } from '../shared/types.js';

/**
 * AI Provider 类型
 */
export type AIProviderType =
  | 'openai'
  | 'anthropic'
  | 'ollama'
  | 'zhipu'
  | 'minimax'
  | 'kimi'
  | 'qwen'
  | 'doubao'
  | 'deepseek'
  | 'spark'
  | 'yi'
  | 'siliconflow';

/**
 * AI Provider 配置
 */
export interface AIProvider {
  id: string;
  name: string;
  type: AIProviderType;
  apiKeyKeychainKey?: string; // Keychain 中存储 API Key 的 key
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

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_RESET_TIMEOUT = 60000;  // 1分钟后重试
const DEFAULT_SUCCESS_THRESHOLD = 3;   // 半开后需要 3 次成功才关闭

class Breaker {
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
  private _providers: Map<AIProviderType, AIProvider> = new Map();
  private circuitBreakers: Map<AIProviderType, Breaker> = new Map();

  get providers(): Map<AIProviderType, AIProvider> {
    return this._providers;
  }

  constructor() {
    // 初始化熔断器
    const allProviders: AIProviderType[] = [
      'openai', 'anthropic', 'ollama', 'zhipu',
      'minimax', 'kimi', 'qwen', 'doubao',
      'deepseek', 'spark', 'yi', 'siliconflow',
    ];
    for (const type of allProviders) {
      this.circuitBreakers.set(type, new Breaker());
    }
  }

  /**
   * 生成内容
   */
  async generate(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();
    const providerType = request.providerType ?? 'openai';

    const provider = this._providers.get(providerType);
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
    const apiKey = await this.getProviderAPIKey(provider);

    if (!apiKey) {
      throw new Error(`API key not configured for provider: ${provider.type}`);
    }

    switch (provider.type) {
      case 'openai':
        return this.callOpenAI(provider, model, request, apiKey);
      case 'anthropic':
        return this.callAnthropic(provider, model, request, apiKey);
      case 'ollama':
        return this.callOllama(provider, model, request);
      case 'zhipu':
        return this.callOpenAICompatible(provider, model, request, apiKey);
      case 'minimax':
        return this.callOpenAICompatible(provider, model, request, apiKey);
      case 'kimi':
        return this.callOpenAICompatible(provider, model, request, apiKey);
      case 'qwen':
        return this.callOpenAICompatible(provider, model, request, apiKey);
      case 'doubao':
        return this.callOpenAICompatible(provider, model, request, apiKey);
      case 'deepseek':
        return this.callOpenAICompatible(provider, model, request, apiKey);
      case 'yi':
        return this.callOpenAICompatible(provider, model, request, apiKey);
      case 'siliconflow':
        return this.callOpenAICompatible(provider, model, request, apiKey);
      case 'spark':
        return this.callSpark(provider, model, request, apiKey);
      default:
        throw new Error(`Unsupported provider: ${provider.type}`);
    }
  }

  private async callOpenAI(provider: AIProvider, model: string, request: AIRequest, apiKey: string): Promise<string> {
    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
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
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as any;
    return data.choices[0].message.content;
  }

  private async callAnthropic(provider: AIProvider, model: string, request: AIRequest, apiKey: string): Promise<string> {
    const response = await fetch(`${provider.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
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
      const errorText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
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
      const errorText = await response.text();
      throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as any;
    return data.response;
  }

  /**
   * OpenAI 兼容接口调用（minimax, kimi, qwen, doubao, deepseek, yi, siliconflow 等）
   */
  private async callOpenAICompatible(provider: AIProvider, model: string, request: AIRequest, apiKey: string): Promise<string> {
    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
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
      const errorText = await response.text();
      throw new Error(`${provider.name} API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as any;
    return data.choices[0].message.content;
  }

  /**
   * 讯飞星火 API（特殊接口）
   */
  private async callSpark(provider: AIProvider, model: string, request: AIRequest, apiKey: string): Promise<string> {
    // 讯飞星火使用不同的认证方式
    const messages: { role: string; content: string }[] = [];
    if (request.system) {
      messages.push({ role: 'system', content: request.system });
    }
    messages.push({ role: 'user', content: request.prompt });

    const response = await fetch(`${provider.baseUrl}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        header: {
          app_id: apiKey.split(':')[0] || '',
        },
        parameter: {
          chat: {
            domain: model,
            temperature: request.temperature ?? 0.7,
            max_tokens: request.maxTokens ?? 2000,
          },
        },
        payload: {
          message: {
            text: messages,
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Spark API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as any;
    return data.payload.choices.text[0].content;
  }

  /**
   * 添加/更新 Provider
   */
  async addProvider(config: {
    name: string;
    type: AIProviderType;
    apiKey?: string;
    baseUrl: string;
    models: string[];
    isDefault?: boolean;
  }): Promise<AIProvider> {
    const db = getDb();
    const now = Date.now();

    // 生成 keychain key 并存储 API Key
    const keychainKey = `ai:${config.type}:${uuidv4().slice(0, 8)}`;
    if (config.apiKey) {
      await aiKeyManager.storeAPIKey(keychainKey, config.apiKey);
    }

    const provider: AIProvider = {
      id: uuidv4(),
      name: config.name,
      type: config.type,
      apiKeyKeychainKey: keychainKey,
      baseUrl: config.baseUrl,
      models: config.models,
      isDefault: config.isDefault ?? false,
      status: 'active',
    };

    db.prepare(`
      INSERT INTO ai_providers (id, name, provider_type, api_key_keychain_key, base_url, models, is_default, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      provider.id,
      provider.name,
      provider.type,
      provider.apiKeyKeychainKey,
      provider.baseUrl,
      JSON.stringify(provider.models),
      provider.isDefault ? 1 : 0,
      provider.status,
      now,
      now
    );

    // 如果设为默认，取消其他默认
    if (provider.isDefault) {
      db.prepare('UPDATE ai_providers SET is_default = 0 WHERE id != ?').run(provider.id);
    }

    this._providers.set(provider.type, provider);
    log.info(`AI Provider added: ${provider.name} (${provider.type})`);

    return provider;
  }

  /**
   * 加载所有 Provider
   */
  async loadProviders(): Promise<void> {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM ai_providers WHERE status = ?').all('active') as any[];

    for (const row of rows) {
      const provider: AIProvider = {
        id: row.id,
        name: row.name,
        type: row.provider_type,
        apiKeyKeychainKey: row.api_key_keychain_key,
        baseUrl: row.base_url,
        models: JSON.parse(row.models),
        isDefault: row.is_default === 1,
        status: row.status,
      };

      this._providers.set(provider.type, provider);
    }

    log.info(`Loaded ${this._providers.size} AI providers`);
  }

  /**
   * 获取默认 Provider
   */
  getDefaultProvider(): AIProvider | undefined {
    for (const provider of this._providers.values()) {
      if (provider.isDefault) {
        return provider;
      }
    }
    // 如果没有设置默认，返回第一个活跃的
    return this._providers.values().next().value;
  }

  /**
   * 获取 Provider 的 API Key
   */
  async getProviderAPIKey(provider: AIProvider): Promise<string | null> {
    if (!provider.apiKeyKeychainKey) {
      return null;
    }
    return aiKeyManager.getAPIKey(provider.apiKeyKeychainKey);
  }

  /**
   * 获取熔断器状态
   */
  getCircuitBreakerStatus(providerType: AIProviderType): { state: CircuitState; failureCount: number } {
    return this.circuitBreakers.get(providerType)?.getState() ?? { state: CircuitState.CLOSED, failureCount: 0 };
  }
}

export const aiGateway = new AIGateway();
