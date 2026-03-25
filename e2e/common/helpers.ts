import { Page, expect } from '@playwright/test';
import { GlobalSelectors } from './selectors';

/**
 * 等待页面应用加载完成
 */
export async function waitForAppLoad(page: Page) {
  await page.goto('http://localhost:3000');
  await page.waitForSelector('.app-layout');
}

/**
 * 等待 Toast 提示出现
 */
export async function waitForToast(page: Page, message?: string, timeout = 5000) {
  const toast = page.locator(GlobalSelectors.toast);
  if (message) {
    await expect(toast).toContainText(message, { timeout });
  } else {
    await expect(toast).toBeVisible({ timeout });
  }
}

/**
 * 等待 Toast 消失
 */
export async function waitForToastDismiss(page: Page, timeout = 5000) {
  await page.waitForSelector(GlobalSelectors.toast, { state: 'hidden', timeout });
}

/**
 * 点击侧边栏导航项
 */
export async function clickSidebarNav(page: Page, label: string) {
  await page.click(`${GlobalSelectors.sidebar} >> text=${label}`);
}

/**
 * 等待弹窗打开 - 通过检查 h3 标题是否存在
 */
export async function waitForModal(page: Page, timeout = 5000) {
  // 等待任意一个弹窗标题出现
  await page.waitForSelector(
    'h3:has-text("添加账号"), h3:has-text("管理分组"), h3:has-text("确认删除"), h3:has-text("一键发布"), h3:has-text("新建内容"), h3:has-text("创建定时任务")',
    { state: 'visible', timeout }
  );
}

/**
 * 关闭弹窗
 */
export async function closeModal(page: Page) {
  const closeBtn = page.locator('button:has-text("×")').first();
  if (await closeBtn.isVisible()) {
    await closeBtn.click();
  } else {
    // 尝试 ESC 键
    await page.keyboard.press('Escape');
  }
  await page.waitForSelector(GlobalSelectors.modal, { state: 'hidden' }).catch(() => {
    // 忽略超时错误
  });
}

/**
 * 等待加载状态结束
 */
export async function waitForLoading(page: Page) {
  await page.waitForSelector('.empty-state-icon:has-text("⏳")', { state: 'hidden', timeout: 10000 }).catch(() => {
    // 忽略超时，因为可能没有加载状态
  });
}

/**
 * 截图辅助函数
 */
export async function screenshot(page: Page, name: string, path = 'e2e/screenshots') {
  await page.screenshot({ path: `${path}/${name}.png` });
}

/**
 * 创建测试账号（通过 Electron API）
 */
export async function createTestAccountViaAPI(
  page: Page,
  data: { platform: string; username: string; password: string; displayName?: string }
) {
  await page.evaluate(
    async (accountData) => {
      try {
        await window.electronAPI?.addAccount(accountData);
      } catch (e) {
        console.error('Failed to create account:', e);
        throw e;
      }
    },
    data
  );
}

/**
 * 创建测试分组（通过 Electron API）
 */
export async function createTestGroupViaAPI(page: Page, name: string, color: string) {
  await page.evaluate(
    async ({ groupName, groupColor }) => {
      try {
        await window.electronAPI?.createGroup(groupName, groupColor);
      } catch (e) {
        console.error('Failed to create group:', e);
        throw e;
      }
    },
    { groupName: name, groupColor: color }
  );
}

/**
 * 清除所有测试账号
 */
export async function cleanupTestAccounts(page: Page) {
  await page.evaluate(async () => {
    const accounts = await window.electronAPI?.listAccounts();
    if (accounts) {
      for (const account of accounts) {
        if (account.username.startsWith('e2e_') || account.username.startsWith('test_')) {
          await window.electronAPI?.removeAccount(account.id);
        }
      }
    }
  });
}

/**
 * 清除所有测试分组
 */
export async function cleanupTestGroups(page: Page) {
  await page.evaluate(async () => {
    const groups = await window.electronAPI?.listGroups();
    if (groups) {
      for (const group of groups) {
        if (group.name.includes('E2E') || group.name.includes('测试')) {
          await window.electronAPI?.deleteGroup(group.id);
        }
      }
    }
  });
}

/**
 * 清除所有测试数据
 */
export async function cleanupAllTestData(page: Page) {
  await cleanupTestAccounts(page);
  await cleanupTestGroups(page);
}

/**
 * 检查元素是否存在
 */
export async function elementExists(page: Page, selector: string): Promise<boolean> {
  return (await page.locator(selector).count()) > 0;
}

/**
 * 等待元素可点击
 */
export async function waitForClickable(page: Page, selector: string, timeout = 5000) {
  await page.waitForSelector(selector, { state: 'visible', timeout });
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    },
    selector
  );
}

/**
 * 双击元素
 */
export async function doubleClick(page: Page, selector: string) {
  await page.locator(selector).dblclick();
}

/**
 * 悬停到元素
 */
export async function hover(page: Page, selector: string) {
  await page.locator(selector).hover();
}
