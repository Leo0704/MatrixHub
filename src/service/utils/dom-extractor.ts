/**
 * DOM 提取工具 - Page Agent 风格
 *
 * 将浏览器 DOM 转换为 LLM 可读的文本格式
 * 参考 page-agent 的 flatTreeToString 实现
 */
import type { Page } from 'playwright';

/**
 * 页面基本信息
 */
export interface PageInfo {
  url: string;
  title: string;
  viewportWidth: number;
  viewportHeight: number;
  pageWidth: number;
  pageHeight: number;
  scrollX: number;
  scrollY: number;
  pixelsAbove: number;
  pixelsBelow: number;
  pagesAbove: number;
  pagesBelow: number;
  totalPages: number;
  currentPagePosition: number;
}

/**
 * 可交互元素
 */
export interface InteractiveElement {
  index: number;
  tag: string;
  text: string;
  type?: string;
  placeholder?: string;
  ariaLabel?: string;
  role?: string;
  value?: string;
  name?: string;
  checked?: boolean;
  rect: { x: number; y: number; width: number; height: number };
  isVisible: boolean;
  isNew?: boolean;
}

/**
 * 页面快照
 */
export interface PageSnapshot {
  info: PageInfo;
  elements: InteractiveElement[];
  header: string;
  footer: string;
}

/**
 * 获取页面基本信息
 */
export function getPageInfo(): PageInfo {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const pageWidth = Math.max(
    document.documentElement.scrollWidth,
    document.body.scrollWidth || 0
  );
  const pageHeight = Math.max(
    document.documentElement.scrollHeight,
    document.body.scrollHeight || 0
  );

  const scrollX = window.scrollX || window.pageXOffset || document.documentElement.scrollLeft || 0;
  const scrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;

  const pixelsBelow = Math.max(0, pageHeight - (window.innerHeight + scrollY));
  const pixelsAbove = scrollY;

  return {
    url: window.location.href,
    title: document.title,
    viewportWidth,
    viewportHeight,
    pageWidth,
    pageHeight,
    scrollX,
    scrollY,
    pixelsAbove,
    pixelsBelow,
    pagesAbove: viewportHeight > 0 ? scrollY / viewportHeight : 0,
    pagesBelow: viewportHeight > 0 ? pixelsBelow / viewportHeight : 0,
    totalPages: viewportHeight > 0 ? pageHeight / viewportHeight : 0,
    currentPagePosition: scrollY / Math.max(1, pageHeight - viewportHeight),
  };
}

/**
 * 提取可交互元素
 */
export function extractInteractiveElements(): InteractiveElement[] {
  const elements: InteractiveElement[] = [];

  // 可交互元素选择器
  const interactiveSelectors = [
    'button:not([disabled])',
    'input:not([disabled])',
    'textarea:not([disabled])',
    'select:not([disabled])',
    '[role="button"]:not([disabled])',
    '[role="textbox"]:not([disabled])',
    '[contenteditable="true"]',
    'a[href]',
  ];

  let index = 0;
  const seenElements = new Set<Element>();

  for (const selector of interactiveSelectors) {
    const els = Array.from(document.querySelectorAll(selector));
    for (const el of els) {
      // 跳过不可见或已处理过的元素
      if (seenElements.has(el)) continue;
      if (!isElementVisible(el)) continue;

      seenElements.add(el);

      const rect = el.getBoundingClientRect();
      const tag = el.tagName.toLowerCase();
      const attributes = getRelevantAttributes(el);

      elements.push({
        index,
        tag,
        text: getElementText(el),
        type: attributes.type,
        placeholder: attributes.placeholder,
        ariaLabel: attributes.ariaLabel,
        role: attributes.role,
        value: attributes.value,
        name: attributes.name,
        checked: attributes.checked,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        isVisible: isElementVisible(el),
      });

      index++;
    }
  }

  return elements;
}

/**
 * 检查元素是否可见
 */
function isElementVisible(el: Element): boolean {
  const style = window.getComputedStyle(el);
  if (style.display === 'none') return false;
  if (style.visibility === 'hidden') return false;
  if (style.opacity === '0') return false;

  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  if (rect.x < -rect.width || rect.y < -rect.height) return false;
  if (rect.x > window.innerWidth || rect.y > window.innerHeight) return false;

  return true;
}

/**
 * 获取元素的可读文本
 */
function getElementText(el: Element): string {
  const clone = el.cloneNode(true) as Element;

  // 移除脚本和样式
  const scriptsAndStyles = clone.querySelectorAll('script, style, noscript');
  scriptsAndStyles.forEach(s => s.remove());

  let text = clone.textContent || '';

  // 截断过长的文本
  if (text.length > 100) {
    text = text.substring(0, 100) + '...';
  }

  return text.trim().replace(/\s+/g, ' ');
}

/**
 * 获取元素的相关属性
 */
function getRelevantAttributes(el: Element): {
  type?: string;
  placeholder?: string;
  ariaLabel?: string;
  role?: string;
  value?: string;
  name?: string;
  checked?: boolean;
} {
  const result: {
    type?: string;
    placeholder?: string;
    ariaLabel?: string;
    role?: string;
    value?: string;
    name?: string;
    checked?: boolean;
  } = {};

  const htmlEl = el as HTMLElement;

  const typeAttr = htmlEl.getAttribute('type');
  if (typeAttr) result.type = typeAttr;
  const placeholderAttr = htmlEl.getAttribute('placeholder');
  if (placeholderAttr) result.placeholder = placeholderAttr;
  const ariaLabelAttr = htmlEl.getAttribute('aria-label');
  if (ariaLabelAttr) result.ariaLabel = ariaLabelAttr;
  const roleAttr = htmlEl.getAttribute('role');
  if (roleAttr) result.role = roleAttr;
  const nameAttr = htmlEl.getAttribute('name');
  if (nameAttr) result.name = nameAttr;
  const valueAttr = htmlEl.getAttribute('value');
  if (valueAttr) result.value = valueAttr;

  // 处理 checked 状态
  if (htmlEl instanceof HTMLInputElement) {
    result.checked = htmlEl.checked;
  }

  return result;
}

/**
 * 将元素列表转换为 LLM 可读的字符串
 */
export function elementsToString(elements: InteractiveElement[]): string {
  if (elements.length === 0) {
    return '[NO INTERACTIVE ELEMENTS FOUND]';
  }

  const lines: string[] = [];

  for (const el of elements) {
    const attrs: string[] = [];

    if (el.type) attrs.push(`type='${el.type}'`);
    if (el.placeholder) attrs.push(`placeholder='${el.placeholder}'`);
    if (el.ariaLabel) attrs.push(`aria-label='${el.ariaLabel}'`);
    if (el.role) attrs.push(`role='${el.role}'`);
    if (el.name && !el.placeholder) attrs.push(`name='${el.name}'`);
    if (el.checked !== undefined) attrs.push(`checked=${el.checked}`);
    if (el.value && el.tag !== 'input') attrs.push(`value='${el.value}'`);

    const attrStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';
    const textStr = el.text ? `>${el.text}<` : '>';

    const line = `[${el.index}]<${el.tag}${attrStr}>${textStr}/>`;
    lines.push(line);
  }

  return lines.join('\n');
}

/**
 * 生成页面快照
 */
export function generatePageSnapshot(): PageSnapshot {
  const info = getPageInfo();
  const elements = extractInteractiveElements();

  // 生成 header
  const header = `Current Page: [${info.title}](${info.url})
Page info: ${info.viewportWidth}x${info.viewportHeight}px viewport, ${info.pageWidth}x${info.pageHeight}px total page size, ${info.pagesAbove.toFixed(1)} pages above, ${info.pagesBelow.toFixed(1)} pages below, ${info.totalPages.toFixed(1)} total pages, at ${(info.currentPagePosition * 100).toFixed(0)}% of page

Interactive elements (top layer, viewport only):`;

  // 生成 footer
  const hasContentBelow = info.pixelsBelow > 4;
  const footer = hasContentBelow
    ? `... ${info.pixelsBelow.toFixed(0)} pixels below (${info.pagesBelow.toFixed(1)} pages) - scroll to see more ...`
    : '[End of page]';

  return { info, elements, header, footer };
}

/**
 * 从 Playwright Page 提取页面快照
 */
export async function extractPageSnapshot(page: Page): Promise<PageSnapshot> {
  return await page.evaluate(() => {
    return generatePageSnapshot();
  });
}

/**
 * 将页面快照格式化为 LLM 可读的完整字符串
 */
export function formatSnapshotForLLM(snapshot: PageSnapshot): string {
  const content = elementsToString(snapshot.elements);

  return `${snapshot.header}

[Start of page]
${content}

${snapshot.footer}`;
}
