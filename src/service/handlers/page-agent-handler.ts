/**
 * Page Agent Handler - 基于 LLM 的浏览器自动化
 *
 * 实现 ReAct Agent Loop:
 * 1. observe - 提取页面快照
 * 2. think - 调用 LLM 理解页面并生成操作
 * 3. act - 执行操作
 */
import type { Page } from 'playwright';
import type { Task, Platform } from '../../shared/types.js';
import { aiGateway } from '../ai-gateway.js';
import {
  extractPageSnapshot,
  formatSnapshotForLLM,
  type PageSnapshot,
  type InteractiveElement,
} from '../utils/dom-extractor.js';
import {
  PAGE_AGENT_SYSTEM_PROMPT,
  buildUserPrompt,
  parseLLMAction,
  type AgentHistoryEntry,
  type PageAgentAction,
} from '../config/page-agent-prompts.js';
import { randomDelay } from '../utils/page-helpers.js';
import log from 'electron-log';

/**
 * Page Agent Payload
 */
export interface PageAgentPayload {
  goal: string;           // 自然语言目标
  platform: Platform;
  accountId: string;
  url?: string;           // 目标 URL，默认导航到发布页
  maxSteps?: number;      // 最大步数，默认 20
  taskType?: 'text' | 'image' | 'video' | 'voice';  // AI 任务类型
}

/**
 * Page Agent 执行结果
 */
export interface PageAgentResult {
  success: boolean;
  actions: string[];
  observations: string[];
  finalText?: string;
  error?: string;
}

/**
 * 执行 Page Agent 任务
 */
export async function executePageAgentTask(
  page: Page,
  task: Task,
  signal: AbortSignal
): Promise<PageAgentResult> {
  const payload = task.payload as unknown as PageAgentPayload;
  const goal = payload.goal;
  const platform = payload.platform;
  const maxSteps = payload.maxSteps ?? 20;
  const taskType = payload.taskType ?? 'text';

  log.info(`[PageAgent] 开始执行: ${goal}`);

  const history: AgentHistoryEntry[] = [];
  const actions: string[] = [];
  const observations: string[] = [];

  // 获取初始页面快照
  const initialSnapshot = await extractPageSnapshot(page);
  observations.push(`页面加载: ${initialSnapshot.info.url}`);

  let step = 0;
  let isDone = false;
  let finalText = '';
  let error: string | undefined;

  while (step < maxSteps && !isDone) {
    // 检查中止信号
    signal.throwIfAborted();

    try {
      // 1. Observe - 获取当前页面状态
      const snapshot = await extractPageSnapshot(page);
      const browserState = formatSnapshotForLLM(snapshot);

      // 2. Think - 调用 LLM
      const userPrompt = buildUserPrompt({
        task: goal,
        step,
        maxSteps,
        browserState,
        history,
      });

      const llmResponse = await aiGateway.generate({
        taskType,
        prompt: userPrompt,
        system: PAGE_AGENT_SYSTEM_PROMPT,
        temperature: 0.7,
        maxTokens: 2000,
      });

      if (!llmResponse.success || !llmResponse.content) {
        error = `LLM 调用失败: ${llmResponse.error}`;
        log.error(`[PageAgent] ${error}`);
        break;
      }

      // 解析 LLM 响应
      const parsed = parseLLMAction(llmResponse.content);
      if (!parsed) {
        error = '无法解析 LLM 响应';
        log.error(`[PageAgent] ${error}`);
        break;
      }

      // 记录历史
      history.push({
        evaluation: parsed.evaluation,
        memory: parsed.memory,
        nextGoal: parsed.nextGoal,
        actionResult: '',
      });

      // 3. Act - 执行操作
      const actionResult = await executeAction(page, parsed.action, snapshot, signal);
      actions.push(`${Object.keys(parsed.action)[0]}: ${JSON.stringify(Object.values(parsed.action)[0])}`);

      // 更新历史中的 action result
      if (history.length > 0) {
        history[history.length - 1].actionResult = actionResult;
      }

      // 检查是否是 done 动作
      if ('done' in parsed.action) {
        isDone = true;
        finalText = parsed.action.done.text || '任务完成';
        log.info(`[PageAgent] 任务完成: ${finalText}`);
        break;
      }

      step++;

      // 等待页面稳定
      await randomDelay(500, 1000);

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      log.error(`[PageAgent] Step ${step} 错误:`, errorMsg);

      if (errorMsg.includes('AbortError')) {
        throw err;
      }

      error = `Step ${step} 失败: ${errorMsg}`;
      observations.push(`错误: ${errorMsg}`);
      break;
    }
  }

  if (!isDone && step >= maxSteps) {
    error = '达到最大步数限制';
    observations.push(error);
  }

  return {
    success: isDone && !error,
    actions,
    observations,
    finalText: isDone ? finalText : undefined,
    error,
  };
}

/**
 * 执行单个操作
 */
async function executeAction(
  page: Page,
  action: PageAgentAction,
  snapshot: PageSnapshot,
  signal: AbortSignal
): Promise<string> {
  signal.throwIfAborted();

  // 查找元素索引对应的实际元素
  const findElement = (index: number): InteractiveElement | undefined => {
    return snapshot.elements.find(el => el.index === index);
  };

  if ('click_element' in action) {
    const { index } = action.click_element;
    const element = findElement(index);

    if (!element) {
      throw new Error(`元素索引 ${index} 不存在`);
    }

    log.info(`[PageAgent] 点击元素 [${index}]: ${element.tag} ${element.text || element.ariaLabel || element.placeholder}`);

    // 使用 Playwright 点击元素
    // 由于我们没有保存元素引用，需要通过 JavaScript 重新获取
    const clicked = await page.evaluate((idx) => {
      const interactiveSelectors = [
        'button', 'input', 'textarea', 'select',
        '[role="button"]', '[role="textbox"]', 'a', '[contenteditable="true"]'
      ];

      let elIndex = 0;
      const elements = Array.from(document.querySelectorAll(interactiveSelectors.join(',')));

      for (const el of elements) {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        if (el.getAttribute('disabled') !== null) continue;

        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;

        if (elIndex === idx) {
          (el as HTMLElement).click();
          return true;
        }
        elIndex++;
      }
      return false;
    }, index);

    if (!clicked) {
      throw new Error(`无法点击元素 [${index}]`);
    }

    return `点击了元素 [${index}]`;

  } else if ('input_text' in action) {
    const { index, text } = action.input_text;
    const element = findElement(index);

    if (!element) {
      throw new Error(`元素索引 ${index} 不存在`);
    }

    log.info(`[PageAgent] 输入文本到元素 [${index}]: ${text.substring(0, 50)}...`);

    const filled = await page.evaluate(({ idx, txt }) => {
      const interactiveSelectors = [
        'button', 'input:not([type="file"])', 'textarea',
        '[role="textbox"]', '[contenteditable="true"]'
      ];

      let elIndex = 0;
      const elements = Array.from(document.querySelectorAll(interactiveSelectors.join(',')));

      for (const el of elements) {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        if (el.getAttribute('disabled') !== null) continue;

        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;

        if (elIndex === idx) {
          const htmlEl = el as HTMLElement;
          htmlEl.focus();

          // 清空现有内容
          if (htmlEl.tagName === 'INPUT' || htmlEl.tagName === 'TEXTAREA') {
            (htmlEl as HTMLInputElement).value = '';
          } else {
            htmlEl.textContent = '';
          }

          // 输入新内容
          htmlEl.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertText',
            data: txt,
          }));

          htmlEl.blur();
          return true;
        }
        elIndex++;
      }
      return false;
    }, { idx: index, txt: text });

    if (!filled) {
      throw new Error(`无法输入文本到元素 [${index}]`);
    }

    return `向元素 [${index}] 输入了文本: ${text.substring(0, 50)}...`;

  } else if ('scroll' in action) {
    const { down, num_pages } = action.scroll;
    const viewport = page.viewportSize();
    const pixels = num_pages * (down ? 1 : -1) * (viewport?.height ?? 800);

    log.info(`[PageAgent] 滚动页面: ${down ? '下' : '上'} ${num_pages} 页`);

    await page.evaluate((px) => {
      window.scrollBy(0, px);
    }, pixels);

    // 等待滚动完成
    await page.waitForTimeout(500);

    return `滚动了 ${num_pages} 页`;

  } else if ('wait' in action) {
    const { seconds } = action.wait;
    log.info(`[PageAgent] 等待 ${seconds} 秒`);

    await page.waitForTimeout(seconds * 1000);

    return `等待了 ${seconds} 秒`;

  } else if ('done' in action) {
    return `任务完成: ${action.done.text}`;

  } else {
    throw new Error(`未知操作类型: ${JSON.stringify(action)}`);
  }
}

/**
 * 检查登录状态（使用 Page Agent 方式）
 */
export async function checkLoginStatePageAgent(page: Page, platform: Platform): Promise<boolean> {
  const snapshot = await extractPageSnapshot(page);

  // 查找登录相关的元素
  const loginIndicators = [
    { pattern: '登录', description: '登录按钮' },
    { pattern: 'login', description: '登录入口' },
    { pattern: '注册', description: '注册按钮' },
    { pattern: 'sign in', description: '登录入口(英文)' },
  ];

  for (const el of snapshot.elements) {
    const text = (el.text || '').toLowerCase();
    const ariaLabel = (el.ariaLabel || '').toLowerCase();

    for (const indicator of loginIndicators) {
      if (text.includes(indicator.pattern.toLowerCase()) ||
          ariaLabel.includes(indicator.pattern.toLowerCase())) {
        log.info(`[PageAgent] 检测到未登录状态: ${indicator.description}`);
        return false;
      }
    }
  }

  return true;
}
