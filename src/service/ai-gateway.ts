import { getDb } from './db.js';
import { aiKeyManager } from './credential-manager.js';
import log from 'electron-log';
import { v4 as uuidv4 } from 'uuid';
import type { Platform, AIRequest, AIResponse, AIIterationRequest } from '../shared/types.js';

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

export type TaskType = 'text' | 'image' | 'video' | 'voice';

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

        // 如果请求了 JSON 格式响应，尝试解析
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
            // JSON 解析失败，返回错误而不是 fallback
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
   * 调用具体的 Provider
   * 根据 request.taskType + provider.type 分发到不同的生成器
   */
  private async callProvider(provider: AIProvider, request: AIRequest): Promise<string> {
    const model = request.model ?? provider.models[0];
    const apiKey = await this.getProviderAPIKey(provider);

    if (!apiKey) {
      throw new Error(`API key not configured for provider: ${provider.type}`);
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

    return Buffer.from(audioData, 'base64').toString('base64');
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

    // 加载任务类型绑定
    await this.loadTaskTypeBindings();
  }

  /**
   * 加载任务类型 AI 绑定
   */
  async loadTaskTypeBindings(): Promise<void> {
    const db = getDb();
    const rows = db.prepare(`
      SELECT tb.task_type, tb.provider_id,
             p.id as p_id, p.name as p_name, p.provider_type, p.api_key_keychain_key,
             p.base_url, p.models, p.is_default, p.status
      FROM task_type_bindings tb
      JOIN ai_providers p ON p.id = tb.provider_id
    `).all() as any[];

    this.taskTypeBindings.clear();
    for (const row of rows) {
      const provider: AIProvider = {
        id: row.p_id,
        name: row.p_name,
        type: row.provider_type,
        apiKeyKeychainKey: row.api_key_keychain_key,
        baseUrl: row.base_url,
        models: JSON.parse(row.models),
        isDefault: row.p_is_default === 1,
        status: row.status,
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
}

export const aiGateway = new AIGateway();
