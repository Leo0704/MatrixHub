import { Page, expect } from '@playwright/test';
import { BasePage, Platform } from './BasePage';
import { AccountSelectors } from '../common/selectors';
import { waitForModal, closeModal } from '../common/helpers';
import { testAccounts, testGroups, uniqueId } from '../common/fixtures';

export class AccountPage extends BasePage {
  /**
   * 导航到账号管理页面
   */
  async goto() {
    await super.goto();
    await this.clickSidebar('账号管理');
  }

  /**
   * 点击添加账号按钮
   */
  async clickAddAccount() {
    await this.page.click(AccountSelectors.addAccountBtn);
  }

  /**
   * 打开添加账号弹窗
   */
  async openAddModal() {
    await this.clickAddAccount();
    await this.waitForModal();
    await expect(this.page.locator(AccountSelectors.modalAddTitle)).toBeVisible();
  }

  /**
   * 选择平台
   */
  async selectPlatform(platform: Platform) {
    const selector = this.getPlatformSelector(platform);
    await this.page.click(`button:has-text("${selector}")`);
  }

  /**
   * 填写账号表单
   */
  async fillAccountForm(data: {
    username: string;
    password: string;
    displayName?: string;
    tags?: string;
    groupId?: string;
  }) {
    await this.page.fill(AccountSelectors.usernameInput, data.username);
    if (data.displayName) {
      await this.page.fill(AccountSelectors.displayNameInput, data.displayName);
    }
    if (data.tags) {
      await this.page.fill(AccountSelectors.tagsInput, data.tags);
    }
    await this.page.fill(AccountSelectors.passwordInput, data.password);
  }

  /**
   * 添加账号（完整流程）
   */
  async addAccount(data: {
    platform?: Platform;
    username?: string;
    password?: string;
    displayName?: string;
  }) {
    await this.openAddModal();

    const platform = data.platform || 'douyin';
    const username = data.username || `test_${uniqueId()}`;
    const password = data.password || 'Test123456';

    await this.selectPlatform(platform);
    await this.fillAccountForm({ username, password, displayName: data.displayName });

    // 找到弹窗中的"添加"按钮并点击
    const modal = this.page.locator(AccountSelectors.modalAddTitle).locator('..').locator('..');
    const addBtn = modal.locator('button:has-text("添加")');
    await addBtn.click();

    // 等待一小段时间让API处理
    await this.page.waitForTimeout(1000);
  }

  /**
   * 点击删除按钮（针对特定账号）
   */
  async clickDeleteButton(username: string) {
    const card = this.page.locator(`.card:has-text("${username}")`);
    await card.locator(AccountSelectors.deleteBtn).click();
    await this.waitForModal();
  }

  /**
   * 确认删除
   */
  async confirmDelete() {
    await this.page.click(AccountSelectors.confirmDeleteBtn);
    await expect(this.page.locator(AccountSelectors.modalConfirmTitle)).toBeHidden();
  }

  /**
   * 取消删除
   */
  async cancelDelete() {
    await this.page.click(AccountSelectors.cancelDeleteBtn);
    await expect(this.page.locator(AccountSelectors.modalConfirmTitle)).toBeHidden();
  }

  /**
   * 删除账号（完整流程）
   */
  async deleteAccount(username: string) {
    await this.clickDeleteButton(username);
    await this.confirmDelete();
  }

  /**
   * 筛选账号分组
   */
  async filterByGroup(groupName: string) {
    await this.page.click(AccountSelectors.groupBtn(groupName));
  }

  /**
   * 显示全部账号
   */
  async showAllAccounts() {
    await this.page.click(AccountSelectors.allAccountsBtn);
  }

  /**
   * 打开分组管理弹窗
   */
  async openGroupManager() {
    await this.page.click(AccountSelectors.manageGroupsBtn);
    await this.waitForModal();
    await expect(this.page.locator(AccountSelectors.modalGroupTitle)).toBeVisible();
  }

  /**
   * 点击新建分组按钮
   */
  async clickCreateGroup() {
    await this.page.click(AccountSelectors.createGroupBtn);
  }

  /**
   * 填写分组表单
   */
  async fillGroupForm(name: string, colorIndex = 0) {
    await this.page.fill(AccountSelectors.groupNameInput, name);
    // 点击颜色选择按钮（使用第一个圆形按钮）
    const colorBtns = this.page.locator('.card button[style]').filter({ has: this.page.locator('[style*="border-radius"]') });
    if (await colorBtns.count() > colorIndex) {
      await colorBtns.nth(colorIndex).click();
    }
  }

  /**
   * 创建分组（完整流程）
   */
  async createGroup(name: string, colorIndex = 0) {
    await this.openGroupManager();
    await this.clickCreateGroup();
    await this.fillGroupForm(name, colorIndex);
    await this.page.click(AccountSelectors.modalCreateBtn);
    // 关闭弹窗
    await this.page.keyboard.press('Escape');
  }

  /**
   * 编辑分组
   */
  async editGroup(oldName: string, newName: string, colorIndex = 0) {
    await this.openGroupManager();

    // 找到分组行
    const groupRow = this.page.locator(`text=${oldName}`).locator('..');
    await groupRow.locator('button:has-text("编辑")').click();

    // 填写新名称
    await this.page.fill(AccountSelectors.groupNameInput, newName);

    // 选择颜色
    const colorBtns = this.page.locator(AccountSelectors.colorBtn);
    if (await colorBtns.count() > colorIndex) {
      await colorBtns.nth(colorIndex).click();
    }

    await this.page.click(AccountSelectors.saveGroupBtn);
  }

  /**
   * 删除分组
   */
  async deleteGroup(groupName: string) {
    await this.openGroupManager();

    // 模拟 confirm 对话框
    await this.page.evaluate(() => {
      (window as any).confirm = () => true;
    });

    const groupRow = this.page.locator(`text=${groupName}`).locator('..');
    await groupRow.locator('button:has-text("删除")').click();
  }

  /**
   * 检查账号是否存在
   */
  async accountExists(username: string): Promise<boolean> {
    const card = this.page.locator(`.card:has-text("${username}")`);
    return (await card.count()) > 0;
  }

  /**
   * 检查分组是否存在
   */
  async groupExists(groupName: string): Promise<boolean> {
    return (await this.page.locator(AccountSelectors.groupBtn(groupName)).count()) > 0;
  }

  /**
   * 获取账号卡片数量
   */
  async getAccountCardCount(): Promise<number> {
    return await this.page.locator(AccountSelectors.accountCard).count();
  }

  /**
   * 获取分组按钮数量
   */
  async getGroupButtonCount(): Promise<number> {
    // "全部" 按钮 + 分组按钮
    const allBtn = await this.page.locator(AccountSelectors.allAccountsBtn).count();
    return allBtn;
  }
}
