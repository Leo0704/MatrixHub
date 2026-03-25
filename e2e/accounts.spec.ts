import { test, expect } from '@playwright/test';
import { AccountPage } from './pages/AccountPage';
import { AccountSelectors } from './common/selectors';
import { testAccounts, testGroups, uniqueId } from './common/fixtures';
import { createTestAccountViaAPI, createTestGroupViaAPI, cleanupAllTestData } from './common/helpers';

test.describe('账号管理 (Account Management)', () => {
  let accountPage: AccountPage;

  test.beforeEach(async ({ page }) => {
    accountPage = new AccountPage(page);
  });

  test.afterEach(async ({ page }) => {
    // 清理测试数据
    await cleanupAllTestData(page);
  });

  test.describe('添加账号', () => {
    test('should open add account modal', async ({ page }) => {
      await accountPage.goto();

      // 点击添加账号按钮
      await page.click(AccountSelectors.addAccountBtn);

      // 等待弹窗标题出现
      await expect(page.locator('h3:has-text("添加账号")')).toBeVisible({ timeout: 5000 });

      // 验证表单元素存在
      await expect(page.locator(AccountSelectors.platformDouyin)).toBeVisible();
      await expect(page.locator(AccountSelectors.usernameInput)).toBeVisible();
      await expect(page.locator(AccountSelectors.passwordInput)).toBeVisible();
    });

    test('should select platform in add modal', async ({ page }) => {
      await accountPage.goto();
      await accountPage.openAddModal();

      // 验证默认平台是抖音
      await expect(page.locator(AccountSelectors.platformDouyin)).toHaveClass(/btn-primary/);

      // 切换到快手
      await page.click(AccountSelectors.platformKuaishou);
      await expect(page.locator(AccountSelectors.platformKuaishou)).toHaveClass(/btn-primary/);
      await expect(page.locator(AccountSelectors.platformDouyin)).not.toHaveClass(/btn-primary/);

      // 切换到小红书
      await page.click(AccountSelectors.platformXiaohongshu);
      await expect(page.locator(AccountSelectors.platformXiaohongshu)).toHaveClass(/btn-primary/);
      await expect(page.locator(AccountSelectors.platformKuaishou)).not.toHaveClass(/btn-primary/);
    });

    test('should require username and password', async ({ page }) => {
      await accountPage.goto();
      await accountPage.openAddModal();

      // 验证添加按钮禁用（空表单）
      const modal = page.locator(AccountSelectors.modalAddTitle).locator('..').locator('..');
      const addBtn = modal.locator('button:has-text("添加")');
      await expect(addBtn).toBeDisabled();

      // 输入用户名
      await page.fill(AccountSelectors.usernameInput, 'testuser');
      await expect(addBtn).toBeDisabled();

      // 输入密码
      await page.fill(AccountSelectors.passwordInput, 'test123');
      await expect(addBtn).toBeEnabled();
    });

    test('should add account successfully', async ({ page }) => {
      await accountPage.goto();
      const username = `add_test_${uniqueId()}`;

      // 添加账号
      await accountPage.addAccount({
        platform: 'douyin',
        username,
        password: 'Test123456',
      });

      // 验证账号出现在列表中
      await expect(page.locator(`.card:has-text("${username}")`)).toBeVisible();
    });

    test('should add account with display name', async ({ page }) => {
      await accountPage.goto();
      const username = `display_name_test_${uniqueId()}`;
      const displayName = '自定义显示名称';

      await accountPage.openAddModal();
      await accountPage.fillAccountForm({
        username,
        password: 'Test123456',
        displayName,
      });

      // 点击添加按钮
      const modal = page.locator(AccountSelectors.modalAddTitle).locator('..').locator('..');
      await modal.locator('button:has-text("添加")').click();

      // 验证显示名称显示
      await expect(page.locator(`.card:has-text("${displayName}")`)).toBeVisible();
    });

    test('should add account with tags', async ({ page }) => {
      await accountPage.goto();
      const username = `tags_test_${uniqueId()}`;
      const tags = '美妆,种草,日常';

      await accountPage.openAddModal();
      await accountPage.fillAccountForm({
        username,
        password: 'Test123456',
        tags,
      });

      // 点击添加按钮
      const modal = page.locator(AccountSelectors.modalAddTitle).locator('..').locator('..');
      await modal.locator('button:has-text("添加")').click();

      // 验证账号添加成功（标签不影响卡片显示）
      await expect(page.locator(`.card:has-text("${username}")`)).toBeVisible();
    });
  });

  test.describe('删除账号', () => {
    test('should show delete confirmation dialog', async ({ page }) => {
      // 先创建一个测试账号
      await createTestAccountViaAPI(page, testAccounts.douyin);

      await accountPage.goto();
      const username = testAccounts.douyin.username;

      // 点击删除按钮
      await page.locator(`.card:has-text("${username}")`).locator(AccountSelectors.deleteBtn).click();

      // 验证确认弹窗
      await expect(page.locator(AccountSelectors.modalConfirmTitle)).toHaveText('确认删除');
      await expect(page.locator('text=确定要删除这个账号吗')).toBeVisible();
      await expect(page.locator(AccountSelectors.cancelDeleteBtn)).toBeVisible();
      await expect(page.locator(AccountSelectors.confirmDeleteBtn)).toBeVisible();
    });

    test('should confirm account deletion', async ({ page }) => {
      // 先创建一个测试账号
      await createTestAccountViaAPI(page, testAccounts.douyin);

      await accountPage.goto();
      const username = testAccounts.douyin.username;

      // 删除账号
      await accountPage.deleteAccount(username);

      // 验证账号已删除
      await expect(page.locator(`.card:has-text("${username}")`)).not.toBeVisible();
    });

    test('should cancel account deletion', async ({ page }) => {
      // 先创建一个测试账号
      await createTestAccountViaAPI(page, testAccounts.douyin);

      await accountPage.goto();
      const username = testAccounts.douyin.username;

      // 点击删除，然后取消
      await accountPage.clickDeleteButton(username);
      await accountPage.cancelDelete();

      // 验证账号仍在列表中
      await expect(page.locator(`.card:has-text("${username}")`)).toBeVisible();
    });
  });

  test.describe('分组筛选', () => {
    test('should filter accounts by group', async ({ page }) => {
      // 先创建一个分组和一个账号
      await createTestGroupViaAPI(page, testGroups[0].name, testGroups[0].color);
      await createTestAccountViaAPI(page, {
        ...testAccounts.douyin,
        groupId: 'test-group-id', // 假设这个分组 ID
      });

      await accountPage.goto();

      // 点击分组按钮
      await page.click(AccountSelectors.groupBtn(testGroups[0].name));

      // 验证该分组按钮高亮
      await expect(page.locator(AccountSelectors.groupBtn(testGroups[0].name))).toHaveClass(/btn-primary/);
    });

    test('should show all accounts', async ({ page }) => {
      // 创建多个账号
      await createTestAccountViaAPI(page, testAccounts.douyin);
      await createTestAccountViaAPI(page, testAccounts.kuaishou);

      await accountPage.goto();

      // 点击"全部"按钮
      await page.click(AccountSelectors.allAccountsBtn);

      // 验证所有账号都显示
      await expect(page.locator(`.card:has-text("${testAccounts.douyin.username}")`)).toBeVisible();
      await expect(page.locator(`.card:has-text("${testAccounts.kuaishou.username}")`)).toBeVisible();
    });
  });

  test.describe('分组管理', () => {
    test('should open group manager modal', async ({ page }) => {
      await accountPage.goto();

      // 点击管理分组按钮
      await page.click(AccountSelectors.manageGroupsBtn);

      // 验证弹窗打开
      await expect(page.locator(AccountSelectors.groupManagerTitle)).toBeVisible();
    });

    test('should create new group', async ({ page }) => {
      await accountPage.goto();
      const groupName = `新分组_${uniqueId()}`;

      // 创建分组
      await accountPage.createGroup(groupName, testGroups[0].color);

      // 验证分组按钮出现在列表
      await expect(page.locator(AccountSelectors.groupBtn(groupName))).toBeVisible();
    });

    test('should edit existing group', async ({ page }) => {
      // 先创建一个分组
      await createTestGroupViaAPI(page, '待编辑分组', testGroups[0].color);

      await accountPage.goto();
      const newGroupName = `已编辑分组_${uniqueId()}`;

      // 编辑分组
      await accountPage.editGroup('待编辑分组', newGroupName, testGroups[1].color);

      // 验证分组名称已更改
      await expect(page.locator(AccountSelectors.groupBtn(newGroupName))).toBeVisible();
    });

    test('should delete a group', async ({ page }) => {
      // 先创建一个分组
      const groupName = `待删除分组_${uniqueId()}`;
      await createTestGroupViaAPI(page, groupName, testGroups[0].color);

      await accountPage.goto();

      // 删除分组
      await accountPage.deleteGroup(groupName);

      // 验证分组按钮消失
      await expect(page.locator(AccountSelectors.groupBtn(groupName))).not.toBeVisible();
    });
  });

  test.describe('账号卡片显示', () => {
    test('should display account card with correct info', async ({ page }) => {
      await accountPage.goto();
      const username = `display_test_${uniqueId()}`;

      // 添加账号
      await accountPage.addAccount({
        platform: 'douyin',
        username,
        password: 'Test123456',
      });

      // 验证卡片显示正确信息
      const card = page.locator(`.card:has-text("${username}")`);
      await expect(card).toBeVisible();

      // 验证平台图标显示
      await expect(card.locator('text=🎵')).toBeVisible();

      // 验证状态显示
      await expect(card.locator('text=正常')).toBeVisible();
    });

    test('should show platform badge on account card', async ({ page }) => {
      await accountPage.goto();
      const username = `badge_test_${uniqueId()}`;

      // 添加抖音账号
      await accountPage.addAccount({
        platform: 'douyin',
        username,
        password: 'Test123456',
      });

      // 验证抖音徽章
      const card = page.locator(`.card:has-text("${username}")`);
      await expect(card.locator('.badge')).toContainText('抖音');
    });
  });
});
