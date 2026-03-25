import { Page, expect } from '@playwright/test';
import { GlobalSelectors } from '../common/selectors';
import { clickSidebarNav, waitForModal, closeModal, waitForToast } from '../common/helpers';

export type Platform = 'douyin' | 'kuaishou' | 'xiaohongshu';

const platformNames: Record<Platform, string> = {
  douyin: '🎵 抖音',
  kuaishou: '📱 快手',
  xiaohongshu: '📕 小红书',
};

/**
 * 页面对象基类
 */
export abstract class BasePage {
  constructor(protected page: Page) {}

  async goto() {
    await this.page.goto('http://localhost:3000');
    await this.page.waitForSelector('.app-layout');
  }

  async clickSidebar(label: string) {
    await clickSidebarNav(this.page, label);
  }

  async waitForModal() {
    await waitForModal(this.page);
  }

  async closeModal() {
    await closeModal(this.page);
  }

  async waitForToast(message?: string) {
    await waitForToast(this.page, message);
  }

  async expectModalVisible(title?: string) {
    if (title) {
      await expect(this.page.locator(GlobalSelectors.modalTitle(title))).toBeVisible();
    } else {
      await expect(this.page.locator(GlobalSelectors.modal)).toBeVisible();
    }
  }

  async expectModalHidden() {
    await expect(this.page.locator(GlobalSelectors.modal)).toBeHidden();
  }

  getPlatformSelector(platform: Platform): string {
    return platformNames[platform];
  }
}
