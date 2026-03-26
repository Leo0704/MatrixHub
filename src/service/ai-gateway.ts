import { getDb } from './db.js';
import { aiKeyManager } from './credential-manager.js';
import log from 'electron-log';
import { v4 as uuidv4 } from 'uuid';
import type { Platform, AIRequest, AIResponse, AIIterationRequest } from '../shared/types.js';
import { isUrlSafe } from '../shared/url-utils.js';
import type { AiProviderRow } from './db-types.js';
import { asRow, asRows } from './db-types.js';

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

// 使用从 shared/types.ts 导入的 AIRequest 和 AIResponse

// ============ 熔断器实现 ============

enum CircuitState {
  CLOSED = 'closed',     // 正常
  OPEN = 'open',         // 熔断中
  HALF_OPEN = 'half_open', // 半开
}

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_RESET_TIMEOUT = 60000;  // 1分钟后重试
const DEFAULT_SUCCESS_THRESHOLD = 3;   // 半开后需要 3 次成功才关闭
const REQUEST_TIMEOUT_MS = 60000;      // 所有 fetch 请求的统一超时

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

export type TaskType = 'text' | 'image' | 'video' | 'voice' | 'core_director';

/**
 * AI Gateway
 * - 多 Provider 路由
 * - 熔断保护
 * - Prompt 模板管理
 * - 每个任务类型独立选择 AI Provider
 */
export class AIGateway {
  private _providers: Map<AIProviderType, AIProvider> = new Map();
  private circuitBreakers: Map<AIProviderType, Breaker> = new Map();
  private taskTypeBindings: Map<TaskType, AIProvider> = new Map();

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
   * 优先级：explicit providerType > taskType binding > default provider
   * 支持故障转移：当主 provider 失败时，自动尝试其他 provider
   */
  async generate(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();

    // 获取所有可用 provider，按优先级排序
    const providers = this.getOrderedProviders(request);

    if (providers.length === 0) {
      return { success: false, error: 'No AI provider configured' };
    }

    // 尝试每个 provider，直到成功
    let lastError: Error | null = null;
    for (const { provider, providerType } of providers) {
      const circuitBreaker = this.circuitBreakers.get(providerType)!;

      try {
        const content = await circuitBreaker.execute(async () => {
          return this.callProvider(provider, request);
        });

        // 如果请求了 JSON 格式响应，尝试解析（带 fallback）
        if (request.responseFormat === 'json') {
          try {
            const structuredContent = JSON.parse(content);
            return {
              success: true,
              content,
              structuredContent,
              contentType: 'text',
              provider: provider.name,
              model: request.model ?? provider.models[0],
              latencyMs: Date.now() - startTime,
            };
          } catch {
            // JSON 解析失败，尝试从损坏内容中提取 JSON（fallback）
            const extracted = this.tryExtractJSON(content);
            if (extracted !== null) {
              return {
                success: true,
                content,
                structuredContent: extracted,
                contentType: 'text',
                provider: provider.name,
                model: request.model ?? provider.models[0],
                latencyMs: Date.now() - startTime,
              };
            }
            return {
              success: false,
              error: `JSON解析失败: ${content.substring(0, 100)}...`,
              content,
              provider: provider.name,
              model: request.model ?? provider.models[0],
              latencyMs: Date.now() - startTime,
            };
          }
        }

        return {
          success: true,
          content,
          provider: provider.name,
          model: request.model ?? provider.models[0],
          latencyMs: Date.now() - startTime,
        };
      } catch (error) {
        lastError = error as Error;
        log.warn(`AI Gateway provider ${providerType} failed: ${lastError.message}, trying next...`);
        continue; // 尝试下一个 provider
      }
    }

    // 所有 provider 都失败了
    log.error(`AI Gateway all providers failed: ${lastError?.message}`);
    return {
      success: false,
      error: lastError?.message ?? 'All AI providers failed',
      provider: providers[0]?.provider.name,
      latencyMs: Date.now() - startTime,
    };
  }

  /**
   * 获取按优先级排序的 provider 列表
   */
  private getOrderedProviders(request: AIRequest): Array<{ provider: AIProvider; providerType: AIProviderType }> {
    const result: Array<{ provider: AIProvider; providerType: AIProviderType }> = [];

    if (request.providerType) {
      // 显式指定了 provider 类型
      const provider = this._providers.get(request.providerType);
      if (provider) {
        result.push({ provider, providerType: request.providerType });
      }
    } else if (request.taskType) {
      // 按任务类型路由 - 首先尝试绑定的 provider
      const boundProvider = this.getProviderForTaskType(request.taskType);
      if (boundProvider) {
        result.push({ provider: boundProvider, providerType: boundProvider.type });
      }
      // 然后添加其他可用 provider 作为后备
      for (const [type, provider] of this._providers) {
        if (type !== boundProvider?.type && this.circuitBreakers.get(type)?.getState().state !== 'open') {
          result.push({ provider, providerType: type });
        }
      }
    } else {
      // 使用默认 provider，然后是其他活跃 provider
      const defaultProvider = this.getDefaultProvider();
      if (defaultProvider) {
        result.push({ provider: defaultProvider, providerType: defaultProvider.type });
      }
      for (const [type, provider] of this._providers) {
        if (type !== defaultProvider?.type && this.circuitBreakers.get(type)?.getState().state !== 'open') {
          result.push({ provider, providerType: type });
        }
      }
    }

    return result;
  }

  /**
   * 尝试从损坏的文本中提取 JSON（fallback when JSON.parse fails）
   */
  private tryExtractJSON(content: string): Record<string, unknown> | null {
    // 策略1：trim 后直接 JSON.parse
    const trimmed = content.trim();
    try { return JSON.parse(trimmed); } catch { /* ignore */ }

    // 策略2：去掉 markdown code fence（如 ```json ... ```）
    const withoutFence = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    try { return JSON.parse(withoutFence); } catch { /* ignore */ }

    // 策略3：找到第一个 { 到最后一个 } 之间的内容
    const firstBrace = withoutFence.indexOf('{');
    const lastBrace = withoutFence.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const substr = withoutFence.substring(firstBrace, lastBrace + 1);
      try { return JSON.parse(substr); } catch { /* ignore */ }
    }

    return null;
  }

  /**
   * 调用具体的 Provider
   * 根据 request.taskType + provider.type 分发到不同的生成器
   */
  private async callProvider(provider: AIProvider, request: AIRequest): Promise<string> {
    const model = request.model ?? provider.models[0];
    const apiKey = await this.getProviderAPIKey(provider);

    if (!apiKey) {
      throw new Error(`API key not configured for provider: ${provider.type}`);
    }

    // Defense-in-depth: SSRF check before making fetch calls
    if (!isUrlSafe(provider.baseUrl)) {
      throw new Error(`SSRF protection: invalid baseUrl ${provider.baseUrl}`);
    }

    // 根据 taskType 分发到对应的生成器，再由生成器根据 provider.type 分发
    switch (request.taskType) {
      case 'image':
        return this.callImageProvider(provider, model, request, apiKey);
      case 'voice':
        return this.callVoiceProvider(provider, model, request, apiKey);
      case 'video':
        return this.callVideoProvider(provider, model, request, apiKey);
      default:
        return this.callTextProvider(provider, model, request, apiKey);
    }
  }

  /**
   * 文本生成调用（根据 provider.type 分发）
   */
  private async callTextProvider(provider: AIProvider, model: string, request: AIRequest, apiKey: string): Promise<string> {
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

  /**
   * 图片生成调用 - 根据 provider.type 分发到不同实现
   */
  private async callImageProvider(provider: AIProvider, model: string, request: AIRequest, apiKey: string): Promise<string> {
    switch (provider.type) {
      case 'openai':
      case 'zhipu':
      case 'deepseek':
      case 'kimi':
      case 'qwen':
      case 'siliconflow':
        // OpenAI 兼容格式 (DALL-E, CogView 等)
        return this.callImageOpenAICompatible(provider, model, request, apiKey);
      case 'doubao':
        return this.callImageDoubao(provider, model, request, apiKey);
      case 'minimax':
        return this.callImageMinimax(provider, model, request, apiKey);
      default:
        // 兜底：尝试 OpenAI 兼容格式
        return this.callImageOpenAICompatible(provider, model, request, apiKey);
    }
  }

  /**
   * OpenAI 兼容格式的图片生成 (OpenAI DALL-E, 智谱 CogView, DeepSeek, Kimi, Qwen, SiliconFlow 等)
   */
  private async callImageOpenAICompatible(provider: AIProvider, model: string, request: AIRequest, apiKey: string): Promise<string> {
    const imageModel = model || 'dall-e-3';

    const response = await fetch(`${provider.baseUrl}/images/generations`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: imageModel,
        prompt: request.prompt,
        size: '1024x1024',
        quality: 'standard',
        n: 1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Image API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as any;
    if (!data.data?.length) {
      throw new Error('Image generation failed');
    }

    return JSON.stringify({
      url: data.data[0].url,
      revisedPrompt: data.data[0].revised_prompt
    });
  }

  /**
   * 豆包 (Doubao) 图片生成 - Dreamina API
   * 文档: https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement?LLM=102
   */
  private async callImageDoubao(provider: AIProvider, model: string, request: AIRequest, apiKey: string): Promise<string> {
    // 豆包视觉生成使用 OpenAI 兼容接口
    const imageModel = model || 'doubao-image';

    const response = await fetch(`${provider.baseUrl}/images/generations`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: imageModel,
        prompt: request.prompt,
        size: '1024x1024',
        quality: 'standard',
        n: 1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Doubao Image API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as any;
    const imageUrl = data.data?.[0]?.url || data.url || data.output;
    if (!imageUrl) {
      throw new Error('Image generation failed - no URL in response');
    }

    return JSON.stringify({
      url: imageUrl,
      revisedPrompt: data.data?.[0]?.revised_prompt || data.revised_prompt || request.prompt
    });
  }

  /**
   * MiniMax 图片生成
   * MiniMax 的图片 API 为 OpenAI 兼容格式
   */
  private async callImageMinimax(provider: AIProvider, model: string, request: AIRequest, apiKey: string): Promise<string> {
    const imageModel = model || 'image-01';

    const response = await fetch(`${provider.baseUrl}/images/generations`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: imageModel,
        prompt: request.prompt,
        size: '1024x1024',
        quality: 'standard',
        n: 1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MiniMax Image API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as any;
    const imageUrl = data.data?.[0]?.url || data.urls?.[0] || data.output;
    if (!imageUrl) {
      throw new Error('Image generation failed - no URL in response');
    }

    return JSON.stringify({
      url: imageUrl,
      revisedPrompt: data.data?.[0]?.revised_prompt || request.prompt
    });
  }

  /**
   * 语音合成调用 - 根据 provider.type 分发到不同实现
   */
  private async callVoiceProvider(provider: AIProvider, model: string, request: AIRequest, apiKey: string): Promise<string> {
    switch (provider.type) {
      case 'openai':
      case 'zhipu':
      case 'deepseek':
      case 'kimi':
      case 'qwen':
      case 'siliconflow':
        return this.callVoiceOpenAICompatible(provider, model, request, apiKey);
      case 'doubao':
        return this.callVoiceDoubao(provider, model, request, apiKey);
      case 'minimax':
        return this.callVoiceMinimax(provider, model, request, apiKey);
      default:
        return this.callVoiceOpenAICompatible(provider, model, request, apiKey);
    }
  }

  /**
   * OpenAI 兼容格式的语音合成 (OpenAI TTS, 智谱, DeepSeek, Kimi, Qwen 等)
   */
  private async callVoiceOpenAICompatible(provider: AIProvider, model: string, request: AIRequest, apiKey: string): Promise<string> {
    const voiceModel = model || 'tts-1';

    const response = await fetch(`${provider.baseUrl}/audio/speech`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: voiceModel,
        input: request.prompt,
        voice: 'alloy',
        response_format: 'mp3',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Voice API error: ${response.status} - ${errorText}`);
    }

    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer).toString('base64');
  }

  /**
   * 豆包 (Doubao) 语音合成 - Cosmo TTS
   */
  private async callVoiceDoubao(provider: AIProvider, model: string, request: AIRequest, apiKey: string): Promise<string> {
    const voiceModel = model || 'Cosmos-1.0';

    const response = await fetch(`${provider.baseUrl}/audio/speech`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: voiceModel,
        input: request.prompt,
        voice_type: 'male-qn-qingse',
        speed_ratio: 1.0,
        pitch_ratio: 1.0,
        volume_ratio: 1.0,
        output_format: 'mp3',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Doubao Voice API error: ${response.status} - ${errorText}`);
    }

    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer).toString('base64');
  }

  /**
   * MiniMax 语音合成 - Speech-02 API
   */
  private async callVoiceMinimax(provider: AIProvider, model: string, request: AIRequest, apiKey: string): Promise<string> {
    const voiceModel = model || 'Speech-02-Hd';

    const response = await fetch(`${provider.baseUrl}/t2a_v2`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: voiceModel,
        text: request.prompt,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MiniMax Voice API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as any;
    const audioData = data.data?.audio || data.audio || data.base64;
    if (!audioData) {
      throw new Error('Voice generation failed - no audio in response');
    }

    return audioData;
  }

  /**
   * 视频生成调用 - 根据 provider.type 分发到不同实现
   */
  private async callVideoProvider(provider: AIProvider, model: string, request: AIRequest, apiKey: string): Promise<string> {
    switch (provider.type) {
      case 'doubao':
        return this.callVideoDoubao(provider, model, request, apiKey);
      case 'minimax':
        return this.callVideoMinimax(provider, model, request, apiKey);
      default:
        // 兜底：尝试通用端点
        return this.callVideoGeneric(provider, model, request, apiKey);
    }
  }

  /**
   * 豆包即梦 (Doubao Dreamina) 视频生成
   * 文档: https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement?LLM=102
   */
  private async callVideoDoubao(provider: AIProvider, model: string, request: AIRequest, apiKey: string): Promise<string> {
    const videoModel = model || 'dreamina-video';

    const response = await fetch(`${provider.baseUrl}/v1/video/generate`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: videoModel,
        prompt: request.prompt,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Doubao Video API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as any;

    // 即梦返回 task_id，需要轮询获取结果（同步直接返回 task_id）
    if (data.task_id || data.id) {
      return JSON.stringify({
        taskId: data.task_id || data.id,
        model: videoModel,
        status: 'processing',
        // 前端可据此轮询
      });
    }

    // 如果直接返回了视频 URL
    const videoUrl = data.video_url || data.url || data.output;
    if (videoUrl) {
      return JSON.stringify({ url: videoUrl, model: videoModel });
    }

    throw new Error('Video generation failed - unrecognized response');
  }

  /**
   * MiniMax 视频生成 - Video-01 API
   * 文档: https://www.minimaxi.com/document/Guides/Video Generation
   */
  private async callVideoMinimax(provider: AIProvider, model: string, request: AIRequest, apiKey: string): Promise<string> {
    const videoModel = model || 'video-01';

    const response = await fetch(`${provider.baseUrl}/v1/video/generate`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: videoModel,
        prompt: request.prompt,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MiniMax Video API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as any;

    // MiniMax 返回 task_id，前端需要轮询
    if (data.task_id || data.id) {
      return JSON.stringify({
        taskId: data.task_id || data.id,
        model: videoModel,
        status: 'processing',
      });
    }

    const videoUrl = data.video_url || data.url || data.output;
    if (videoUrl) {
      return JSON.stringify({ url: videoUrl, model: videoModel });
    }

    throw new Error('Video generation failed - unrecognized response');
  }

  /**
   * 通用视频生成 - 尝试多个常见端点
   * 作为未知 provider 的兜底
   */
  private async callVideoGeneric(provider: AIProvider, model: string, request: AIRequest, apiKey: string): Promise<string> {
    const videoModel = model || 'video-model';
    const endpoints = ['/video/generations', '/video/generate', '/v1/video/generate'];

    let lastError: Error | null = null;

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(`${provider.baseUrl}${endpoint}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: videoModel,
            prompt: request.prompt,
          }),
        });

        if (response.ok) {
          const data = await response.json() as any;

          const videoUrl = data.video_url || data.url || data.video?.url || data.output || data.data?.video_url;
          if (videoUrl) {
            return JSON.stringify({ url: videoUrl, model: videoModel });
          }

          if (data.video_data || data.base64) {
            return JSON.stringify({ videoData: data.video_data || data.base64, model: videoModel });
          }

          if (data.id || data.task_id) {
            return JSON.stringify({
              taskId: data.id || data.task_id,
              model: videoModel,
              status: data.status || 'processing'
            });
          }

          throw new Error('Video API response format not recognized');
        }

        const errorText = await response.text();
        lastError = new Error(`Video API error at ${endpoint}: ${response.status} - ${errorText}`);
      } catch (e) {
        lastError = e as Error;
        continue;
      }
    }

    throw lastError || new Error('Video generation failed - no valid endpoint found');
  }

  private async callOpenAI(provider: AIProvider, model: string, request: AIRequest, apiKey: string): Promise<string> {
    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
        ...(request.responseFormat === 'json' ? { response_format: { type: 'json_object' } } : {}),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as any;
    if (!data.choices?.length) {
      throw new Error('OpenAI API returned empty choices');
    }
    return data.choices[0].message.content;
  }

  private async callAnthropic(provider: AIProvider, model: string, request: AIRequest, apiKey: string): Promise<string> {
    const response = await fetch(`${provider.baseUrl}/messages`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
    if (!data.content?.length) {
      throw new Error('Anthropic API returned empty content');
    }
    return data.content[0].text;
  }

  private async callOllama(provider: AIProvider, model: string, request: AIRequest): Promise<string> {
    const response = await fetch(`${provider.baseUrl}/api/generate`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
        ...(request.responseFormat === 'json' ? { response_format: { type: 'json_object' } } : {}),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${provider.name} API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as any;
    if (!data.choices?.length) {
      throw new Error(`${provider.name} API returned empty choices`);
    }
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
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
    if (!data.payload?.choices?.text?.length) {
      throw new Error('Spark API returned empty choices');
    }
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
    // SSRF protection: validate baseUrl before storing
    if (!isUrlSafe(config.baseUrl)) {
      throw new Error(`SSRF protection: invalid baseUrl ${config.baseUrl}`);
    }

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
  async seedDefaultProviders(): Promise<void> {
    const db = getDb();
    const now = Date.now();

    const defaults: Array<{
      id: string; name: string; type: AIProviderType; baseUrl: string; models: string[];
    }> = [
      { id: 'prov-openai', name: 'OpenAI', type: 'openai', baseUrl: 'https://api.openai.com', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4', 'gpt-3.5-turbo'] },
      { id: 'prov-anthropic', name: 'Anthropic', type: 'anthropic', baseUrl: 'https://api.anthropic.com', models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'] },
      { id: 'prov-ollama', name: 'Ollama', type: 'ollama', baseUrl: 'http://localhost:11434', models: ['llama3.2', 'qwen2.5', 'deepseek-v2'] },
      { id: 'prov-zhipu', name: '智谱 AI', type: 'zhipu', baseUrl: 'https://open.bigmodel.cn', models: ['glm-4-flash', 'glm-4', 'glm-4-plus'] },
      { id: 'prov-minimax', name: 'MiniMax', type: 'minimax', baseUrl: 'https://api.minimax.chat', models: ['MiniMax-Text-01', 'abab6.5s-chat'] },
      { id: 'prov-kimi', name: 'Kimi', type: 'kimi', baseUrl: 'https://api.moonshot.cn', models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'] },
      { id: 'prov-qwen', name: '通义千问', type: 'qwen', baseUrl: 'https://dashscope.aliyuncs.com', models: ['qwen-turbo', 'qwen-plus', 'qwen-max'] },
      { id: 'prov-doubao', name: '豆包', type: 'doubao', baseUrl: 'https://ark.cn-beijing.volces.com', models: ['doubao-pro-32k', 'doubao-pro-128k', 'doubao-lite-32k'] },
      { id: 'prov-deepseek', name: 'DeepSeek', type: 'deepseek', baseUrl: 'https://api.deepseek.com', models: ['deepseek-chat', 'deepseek-coder'] },
      { id: 'prov-spark', name: '讯飞星火', type: 'spark', baseUrl: 'https://spark-api.xf-yun.com', models: ['v3.5', 'v3.0', 'v2.0'] },
      { id: 'prov-yi', name: '零一万物', type: 'yi', baseUrl: 'https://api.lingyiwanwu.com', models: ['yi-large', 'yi-medium', 'yi-small'] },
      { id: 'prov-siliconflow', name: 'SiliconFlow', type: 'siliconflow', baseUrl: 'https://api.siliconflow.cn', models: ['Qwen/Qwen2.5-7B-Instruct', 'deepseek-ai/DeepSeek-V2.5'] },
    ];

    for (const p of defaults) {
      db.prepare(`
        INSERT INTO ai_providers (id, name, provider_type, api_key_keychain_key, base_url, models, is_default, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(p.id, p.name, p.type, '', p.baseUrl, JSON.stringify(p.models), p.type === 'openai' ? 1 : 0, 'active', now, now);

      const provider: AIProvider = {
        id: p.id,
        name: p.name,
        type: p.type,
        apiKeyKeychainKey: '',
        baseUrl: p.baseUrl,
        models: p.models,
        isDefault: p.type === 'openai',
        status: 'active',
      };
      this._providers.set(p.type, provider);
    }

    log.info(`Seeded ${defaults.length} default AI providers`);
  }

  async loadProviders(): Promise<void> {
    const db = getDb();
    const rows = asRows<AiProviderRow>(db.prepare('SELECT * FROM ai_providers WHERE status = ?').all('active'));

    for (const row of rows) {
      const provider: AIProvider = {
        id: row.id,
        name: row.name,
        type: row.provider_type as AIProviderType,
        apiKeyKeychainKey: row.api_key_keychain_key,
        baseUrl: row.base_url ?? '',
        models: JSON.parse(row.models),
        isDefault: row.is_default === 1,
        status: row.status,
      };

      this._providers.set(provider.type, provider);
    }

    // 如果表为空，插入内置 provider 模板（用户需在 UI 配置 API Key）
    if (this._providers.size === 0) {
      await this.seedDefaultProviders();
    }

    log.info(`Loaded ${this._providers.size} AI providers`);

    // 加载任务类型绑定
    await this.loadTaskTypeBindings();
  }

  /**
   * 加载任务类型 AI 绑定
   */
  async loadTaskTypeBindings(): Promise<void> {
    const db = getDb();
    interface TaskTypeBindingRow {
      task_type: string;
      provider_id: string;
      p_id: string;
      p_name: string;
      provider_type: string;
      api_key_keychain_key: string;
      base_url: string | null;
      models: string;
      is_default: number;
      status: string;
    }
    const rows = asRows<TaskTypeBindingRow>(db.prepare(`
      SELECT tb.task_type, tb.provider_id,
             p.id as p_id, p.name as p_name, p.provider_type, p.api_key_keychain_key,
             p.base_url, p.models, p.is_default, p.status
      FROM task_type_bindings tb
      JOIN ai_providers p ON p.id = tb.provider_id
    `).all());

    this.taskTypeBindings.clear();
    for (const row of rows) {
      const provider: AIProvider = {
        id: row.p_id,
        name: row.p_name,
        type: row.provider_type as AIProviderType,
        apiKeyKeychainKey: row.api_key_keychain_key,
        baseUrl: row.base_url ?? '',
        models: JSON.parse(row.models),
        isDefault: row.is_default === 1,
        status: row.status as 'active' | 'inactive' | 'error',
      };
      this.taskTypeBindings.set(row.task_type as TaskType, provider);
    }

    log.info(`Loaded ${this.taskTypeBindings.size} task type bindings`);
  }

  /**
   * 绑定任务类型到 AI Provider
   */
  async bindTaskType(taskType: TaskType, providerId: string): Promise<void> {
    const db = getDb();
    const now = Date.now();

    const provider = Array.from(this._providers.values()).find(p => p.id === providerId);
    if (!provider) {
      throw new Error(`Provider not found: ${providerId}`);
    }

    db.prepare(`
      INSERT INTO task_type_bindings (task_type, provider_id, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(task_type) DO UPDATE SET provider_id = ?, updated_at = ?
    `).run(taskType, providerId, now, now, providerId, now);

    this.taskTypeBindings.set(taskType, provider);
    log.info(`Task type ${taskType} bound to provider ${provider.name}`);
  }

  /**
   * 获取任务类型对应的 Provider
   */
  getProviderForTaskType(taskType: TaskType): AIProvider | undefined {
    return this.taskTypeBindings.get(taskType);
  }

  /**
   * 获取所有任务类型绑定
   */
  getTaskTypeBindings(): Map<TaskType, AIProvider> {
    return this.taskTypeBindings;
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

  /**
   * 构建迭代优化的 prompt
   */
  private buildIterationPrompt(request: AIIterationRequest): string {
    return `【原始请求】
${request.originalPrompt}

【原始 AI 回复】
${request.originalResponse}

【用户反馈】
${request.feedback}

请根据用户反馈，修改/优化原始回复。直接输出修改后的内容，不要解释。`;
  }

  /**
   * 根据用户反馈迭代优化内容
   */
  async iterate(request: AIIterationRequest): Promise<AIResponse> {
    const iterationPrompt = this.buildIterationPrompt(request);

    return this.generate({
      prompt: iterationPrompt,
      system: '你是专业内容优化助手，根据用户反馈优化内容。直接输出优化后的内容，不要额外解释。',
      temperature: 0.7,
      maxTokens: 3000,
    });
  }

  /**
   * 查询视频生成状态（用于轮询异步视频生成任务）
   * @param taskId 视频生成任务ID
   * @param providerType 可选，指定provider类型
   * @returns 视频URL如果完成，null如果还在处理中
   */
  async checkVideoStatus(taskId: string, providerType?: string): Promise<string | null> {
    // 获取provider
    let provider: AIProvider | undefined;
    let actualProviderType: string | undefined;

    if (providerType) {
      provider = this._providers.get(providerType as AIProviderType);
      actualProviderType = providerType;
    } else {
      // 尝试获取视频provider
      for (const [type, p] of this._providers) {
        if (type === 'doubao' || type === 'minimax') {
          provider = p;
          actualProviderType = type;
          break;
        }
      }
      // 如果没找到，尝试默认provider
      if (!provider) {
        const defaultP = this.getDefaultProvider();
        if (defaultP) {
          provider = defaultP;
          actualProviderType = defaultP.type;
        }
      }
    }

    if (!provider || !actualProviderType) {
      log.warn('[AIGateway] checkVideoStatus: no video provider found');
      return null;
    }

    const apiKey = await this.getProviderAPIKey(provider);
    if (!apiKey) {
      log.warn('[AIGateway] checkVideoStatus: no API key for provider:', actualProviderType);
      return null;
    }

    try {
      switch (actualProviderType) {
        case 'doubao':
          return await this.checkDoubaoVideoStatus(provider.baseUrl, taskId, apiKey);
        case 'minimax':
          return await this.checkMinimaxVideoStatus(provider.baseUrl, taskId, apiKey);
        default:
          // 通用检查，尝试常见端点
          return await this.checkGenericVideoStatus(provider.baseUrl, taskId, apiKey);
      }
    } catch (error) {
      log.warn('[AIGateway] checkVideoStatus error:', error);
      return null;
    }
  }

  /**
   * 查询豆包视频生成状态
   */
  private async checkDoubaoVideoStatus(baseUrl: string, taskId: string, apiKey: string): Promise<string | null> {
    // 豆包视频状态查询端点
    const endpoints = [
      `/v1/video/generate/${taskId}`,
      `/v1/video/task/${taskId}`,
      `/api/video/status/${taskId}`,
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(`${baseUrl}${endpoint}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json() as any;
          // 检查视频是否完成
          const videoUrl = data.video_url || data.url || data.output || data.data?.video_url;
          if (videoUrl) {
            return videoUrl;
          }
          // 检查状态
          if (data.status === 'completed' || data.status === 'success' || data.status === 'done') {
            return videoUrl || null;
          }
        }
      } catch {
        // 继续尝试下一个端点
      }
    }

    return null; // 还在处理中或查询失败
  }

  /**
   * 查询MiniMax视频生成状态
   */
  private async checkMinimaxVideoStatus(baseUrl: string, taskId: string, apiKey: string): Promise<string | null> {
    // MiniMax 视频状态查询端点
    const endpoints = [
      `/v1/video/generate/${taskId}`,
      `/v1/video/task/${taskId}`,
      `/api/video/status/${taskId}`,
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(`${baseUrl}${endpoint}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json() as any;
          // MiniMax 返回格式
          const videoUrl = data.video_url || data.url || data.output || data.data?.video_url;
          if (videoUrl) {
            return videoUrl;
          }
          if (data.status === 'completed' || data.status === 'success' || data.status === 'done') {
            return videoUrl || null;
          }
        }
      } catch {
        // 继续尝试下一个端点
      }
    }

    return null;
  }

  /**
   * 通用视频状态查询（用于未知provider）
   */
  private async checkGenericVideoStatus(baseUrl: string, taskId: string, apiKey: string): Promise<string | null> {
    const endpoints = [
      `/v1/video/generate/${taskId}`,
      `/v1/video/task/${taskId}`,
      `/v1/video/status/${taskId}`,
      `/api/video/status/${taskId}`,
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(`${baseUrl}${endpoint}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json() as any;
          // 尝试多种可能的返回格式
          const videoUrl = data.video_url || data.url || data.output ||
                          data.data?.video_url || data.result?.video_url ||
                          data.task?.video_url;
          if (videoUrl) {
            return videoUrl;
          }
          // 检查各种可能的状态字段
          const status = data.status || data.state || data.progress;
          if (status === 'completed' || status === 'success' || status === 'done' ||
              status === 'succeeded' || status === 100) {
            return videoUrl || null;
          }
        }
      } catch {
        // 继续尝试
      }
    }

    return null;
  }
}

export const aiGateway = new AIGateway();
