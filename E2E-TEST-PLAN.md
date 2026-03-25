# MatrixHub E2E 测试计划

为 MatrixHub (Electron + React 多平台内容管理工具) 建立完整的 E2E 测试覆盖。

---

## 测试文件结构

```
e2e/
├── app.spec.ts              # 基础导航测试 (已存在)
├── accounts.spec.ts         # 账号管理测试 (14 用例)
├── ai-creation.spec.ts     # AI 创作测试 (15 用例)
├── content.spec.ts          # 内容管理测试 (10 用例)
├── schedule.spec.ts         # 定时发布测试 (8 用例)
├── insights.spec.ts         # 数据洞察测试 (2 用例)
├── settings.spec.ts         # 设置页测试 (2 用例)
├── common/
│   ├── fixtures.ts          # 测试数据 fixtures
│   ├── helpers.ts          # 通用辅助函数
│   └── selectors.ts         # CSS 选择器常量
└── pages/                   # Page Object Models
    ├── BasePage.ts
    ├── AccountPage.ts
    ├── AICreationPage.ts
    ├── ContentPage.ts
    └── SchedulePage.ts
```

---

## 选择器规范

### 全局选择器

| 用途 | 选择器 | 示例 |
|------|--------|------|
| 侧边栏导航项 | `.sidebar >> text=XXX` | `await page.click('.sidebar >> text=账号管理')` |
| 主内容区 | `.main-content` | `await expect(page.locator('.main-content')).toBeVisible()` |
| 卡片组件 | `.card` | `await expect(page.locator('.card').first()).toBeVisible()` |
| 按钮-主要 | `.btn.btn-primary` | `await page.click('.btn.btn-primary')` |
| 按钮-次要 | `.btn.btn-secondary` | `await page.click('.btn.btn-secondary')` |
| 按钮-幽灵 | `.btn.btn-ghost` | `await page.click('.btn.btn-ghost')` |
| 输入框 | `.input` | `await page.fill('.input', 'text')` |
| 弹窗 | `[role="dialog"]` | `await expect(page.locator('[role="dialog"]')).toBeVisible()` |
| Toast 提示 | `.toast` | `await expect(page.locator('.toast')).toBeVisible()` |

### 账号管理选择器

| 用途 | 选择器 |
|------|--------|
| 添加账号按钮 | `button:has-text("添加账号")` |
| 账号卡片 | `.card:has(.badge)` |
| 用户名输入 | `[placeholder="输入用户名或手机号"]` |
| 密码输入 | `[type="password"]` |
| 显示名称输入 | `[placeholder="选填，默认使用用户名"]` |
| 标签输入 | `[placeholder="逗号分隔，如: 美妆,种草"]` |
| 平台按钮-抖音 | `button:has-text("🎵 抖音")` |
| 平台按钮-快手 | `button:has-text("📱 快手")` |
| 平台按钮-小红书 | `button:has-text("📕 小红书")` |
| 删除按钮 | `button:has-text("删除")` |
| 确认删除弹窗 | `#delete-confirm-title` |
| 取消删除按钮 | `[role="dialog"] button:has-text("取消")` |
| 确认删除按钮 | `[role="dialog"] button:has-text("删除")` |
| 分组按钮 | `.btn:has-text("测试分组")` |
| 全部按钮 | `button:has-text("全部")` |
| 管理分组按钮 | `button:has-text("管理分组")` |

### AI 创作选择器

| 用途 | 选择器 |
|------|--------|
| 平台按钮-抖音 | `button:has-text("🎵 抖音")` |
| 内容类型-文案 | `button:has-text("📝 文案")` |
| 内容类型-图片 | `button:has-text("🖼️ 图片")` |
| 内容类型-语音 | `button:has-text("🔊 语音")` |
| AI 模型下拉 | `select.input` |
| 创作类型按钮 | `button:has-text("短视频脚本")` |
| 主题输入框 | `textarea.input` |
| 生成按钮 | `button:has-text("✨ 开始生成")` |
| 生成中按钮 | `button:has-text("🤖 生成中...")` |
| 生成结果 | `.card:has(h3:has-text("生成结果"))` |
| 复制按钮 | `button:has-text("复制")` |
| 已复制按钮 | `button:has-text("✓ 已复制")` |
| 编辑按钮 | `button:has-text("编辑")` |
| 完成编辑按钮 | `button:has-text("✓ 完成编辑")` |
| 一键发布按钮 | `button:has-text("一键发布")` |
| 快速优化-太正式 | `button:has-text("太正式")` |
| 快速优化-太长 | `button:has-text("太长")` |
| 快速优化-开头弱 | `button:has-text("开头弱")` |
| 快速优化-加梗 | `button:has-text("加梗")` |
| 迭代历史 | `.card:has-text("迭代历史")` |

### 内容管理选择器

| 用途 | 选择器 |
|------|--------|
| 平台筛选下拉 | `select.input >> nth=0` |
| 状态筛选下拉 | `select.input >> nth=1` |
| 新建内容按钮 | `button:has-text("+ 新建内容")` |
| 内容卡片 | `.card:has(.badge)` |
| 状态徽章 | `.badge` |
| 取消按钮 | `button:has-text("取消")` |
| 重试按钮 | `button:has-text("重试")` |
| 详情按钮 | `button:has-text("详情")` |
| 加载更多按钮 | `button:has-text("加载更多")` |
| 空状态插画 | `.empty-state` |

### 定时发布选择器

| 用途 | 选择器 |
|------|--------|
| 创建定时任务按钮 | `button:has-text("+ 创建定时任务")` |
| 日历容器 | `.card:has-text("2026年")` |
| 上月箭头 | `button:has-text("◀")` |
| 下月箭头 | `button:has-text("▶")` |
| 今日日期 | `[style*="border: 2px solid var(--primary)"]` |
| 日期格子 | `.card:has(.empty-state) >> nth=0 >> .. >> [style*="aspect-ratio: 1"]` |
| 定时任务列表 | `.card:has(h3:has-text("定时任务"))` |
| 任务行 | `[style*="borderRadius: var(--radius-md)"][style*="background: var(--bg-elevated)"]` |
| 取消按钮 | `[style*="color: var(--error)"]` |
| 重试按钮 | `[style*="color: var(--primary)"]` |

### 发布弹窗选择器

| 用途 | 选择器 |
|------|--------|
| 弹窗标题 | `h3:has-text("一键发布")` |
| 平台提示 | `[style*="bg: var(--bg-elevated)"]` |
| 发布按钮 | `[role="dialog"] .btn.btn-primary` |
| 取消按钮 | `[role="dialog"] .btn.btn-secondary` |
| 账号选择标签 | `[style*="cursor: pointer"]` |
| 部分选择标记 | `text="(部分)"` |

---

## 测试用例详情

### 账号管理测试 (accounts.spec.ts)

#### 1. should open add account modal
```typescript
test('should open add account modal', async ({ page }) => {
  await page.goto('http://localhost:3000');
  await page.click('.sidebar >> text=账号管理');
  await page.click('button:has-text("添加账号")');

  // 验证弹窗打开
  await expect(page.locator('[role="dialog"]')).toBeVisible();
  await expect(page.locator('h3:has-text("添加账号")')).toBeVisible();
});
```

#### 2. should select platform in add modal
```typescript
test('should select platform in add modal', async ({ page }) => {
  await openAddAccountModal(page);

  // 验证默认平台是抖音
  await expect(page.locator('button:has-text("🎵 抖音")')).toHaveClass(/btn-primary/);

  // 切换到快手
  await page.click('button:has-text("📱 快手")');
  await expect(page.locator('button:has-text("📱 快手")')).toHaveClass(/btn-primary/);

  // 切换到小红书
  await page.click('button:has-text("📕 小红书")');
  await expect(page.locator('button:has-text("📕 小红书")')).toHaveClass(/btn-primary/);
});
```

#### 3. should require username and password
```typescript
test('should require username and password', async ({ page }) => {
  await openAddAccountModal(page);

  // 验证添加按钮禁用
  await expect(page.locator('[role="dialog"] .btn.btn-primary')).toBeDisabled();

  // 输入用户名
  await page.fill('[placeholder="输入用户名或手机号"]', 'testuser');

  // 仍然禁用（需要密码）
  await expect(page.locator('[role="dialog"] .btn.btn-primary')).toBeDisabled();

  // 输入密码
  await page.fill('[type="password"]', 'test123');

  // 现在应该启用
  await expect(page.locator('[role="dialog"] .btn.btn-primary')).toBeEnabled();
});
```

#### 4. should add account successfully
```typescript
test('should add account successfully', async ({ page }) => {
  await openAddAccountModal(page);

  await page.fill('[placeholder="输入用户名或手机号"]', 'newtestuser');
  await page.fill('[type="password"]', 'test123');

  await page.click('[role="dialog"] .btn.btn-primary');

  // 等待弹窗关闭
  await expect(page.locator('[role="dialog"]')).not.toBeVisible();

  // 验证账号出现在列表中
  await expect(page.locator('.card:has-text("newtestuser")')).toBeVisible();
});
```

#### 5. should show delete confirmation dialog
```typescript
test('should show delete confirmation dialog', async ({ page }) => {
  // 先确保有账号可以删除
  await ensureTestAccountExists(page);

  // 点击删除按钮
  await page.locator('.card').last().locator('button:has-text("删除")').click();

  // 验证确认弹窗
  await expect(page.locator('#delete-confirm-title')).toHaveText('确认删除');
  await expect(page.locator('[role="dialog"]')).toContainText('确定要删除这个账号吗');
});
```

#### 6. should confirm account deletion
```typescript
test('should confirm account deletion', async ({ page }) => {
  await ensureTestAccountExists(page);
  const accountCard = page.locator('.card:has-text("testaccount")');

  await accountCard.locator('button:has-text("删除")').click();
  await page.click('[role="dialog"] button:has-text("删除")');

  // 验证账号已删除
  await expect(accountCard).not.toBeVisible();
});
```

#### 7. should cancel account deletion
```typescript
test('should cancel account deletion', async ({ page }) => {
  await ensureTestAccountExists(page);
  const accountCard = page.locator('.card:has-text("testaccount")');

  await accountCard.locator('button:has-text("删除")').click();
  await page.click('[role="dialog"] button:has-text("取消")');

  // 验证账号仍在
  await expect(accountCard).toBeVisible();
  // 验证确认弹窗关闭
  await expect(page.locator('[role="dialog"]')).not.toBeVisible();
});
```

#### 8. should filter accounts by group
```typescript
test('should filter accounts by group', async ({ page }) => {
  // 需要先创建分组和账号
  await createTestGroup(page, '测试分组A');

  // 验证"全部"按钮高亮
  await expect(page.locator('button:has-text("全部")')).toHaveClass(/btn-primary/);

  // 点击分组按钮
  await page.click('button:has-text("测试分组A")');

  // 验证该分组按钮高亮
  await expect(page.locator('button:has-text("测试分组A")')).toHaveClass(/btn-primary/);
});
```

#### 9. should open group manager modal
```typescript
test('should open group manager modal', async ({ page }) => {
  await page.click('button:has-text("管理分组")');

  await expect(page.locator('h3:has-text("管理分组")')).toBeVisible();
});
```

#### 10. should create new group
```typescript
test('should create new group', async ({ page }) => {
  await openGroupManager(page);

  await page.click('button:has-text("+ 新建分组")');
  await page.fill('[placeholder="分组名称"]', '新分组');
  await page.click('[style*="background: #6366f1"]'); // 点击第一个颜色
  await page.click('button:has-text("创建")');

  // 验证分组出现在列表
  await expect(page.locator('text=新分组')).toBeVisible();
});
```

#### 11. should edit existing group
```typescript
test('should edit existing group', async ({ page }) => {
  await createTestGroup(page, '待编辑分组');
  await openGroupManager(page);

  // 点击编辑
  await page.locator('text=待编辑分组').locator('..').locator('button:has-text("编辑")').click();

  // 修改名称
  await page.fill('[placeholder="分组名称"]', '已编辑分组');
  await page.click('button:has-text("保存")');

  await expect(page.locator('text=已编辑分组')).toBeVisible();
});
```

#### 12. should delete a group
```typescript
test('should delete a group', async ({ page }) => {
  await createTestGroup(page, '待删除分组');
  await openGroupManager(page);

  await page.locator('text=待删除分组').locator('..').locator('button:has-text("删除")').click();

  // 确认删除
  await page.evaluate(() => window.confirm = () => true);
  await page.click('button:has-text("删除")');

  await expect(page.locator('text=待删除分组')).not.toBeVisible();
});
```

---

## Page Object Model 实现

### BasePage.ts
```typescript
export abstract class BasePage {
  constructor(protected page: Page) {}

  async goto() {
    await this.page.goto('http://localhost:3000');
  }

  async clickSidebar(label: string) {
    await this.page.click(`.sidebar >> text=${label}`);
  }

  async waitForModal() {
    await this.page.waitForSelector('[role="dialog"]');
  }

  async closeModal() {
    await this.page.click('[role="dialog"] button:has-text("×")]');
  }

  async expectToast(message: string) {
    await expect(this.page.locator('.toast')).toContainText(message);
  }
}
```

### AccountPage.ts
```typescript
export class AccountPage extends BasePage {
  async goto() {
    await super.goto();
    await this.clickSidebar('账号管理');
  }

  async openAddModal() {
    await this.page.click('button:has-text("添加账号")');
    await this.waitForModal();
  }

  async addAccount(data: { username: string; password: string; platform?: Platform }) {
    await this.openAddModal();

    if (data.platform) {
      await this.page.click(`button:has-text("${data.platform}")`);
    }

    await this.page.fill('[placeholder="输入用户名或手机号"]', data.username);
    await this.page.fill('[type="password"]', data.password);

    await this.page.click('[role="dialog"] .btn.btn-primary');
  }

  async deleteAccount(username: string) {
    const card = this.page.locator(`.card:has-text("${username}")`);
    await card.locator('button:has-text("删除")').click();
    await this.waitForModal();
    await this.page.click('button:has-text("删除")');
  }

  async openGroupManager() {
    await this.page.click('button:has-text("管理分组")');
    await this.waitForModal();
  }

  async createGroup(name: string, color: string = '#6366f1') {
    await this.openGroupManager();
    await this.page.click('button:has-text("+ 新建分组")');
    await this.page.fill('[placeholder="分组名称"]', name);
    await this.page.click(`[style*="background: ${color}"]`);
    await this.page.click('button:has-text("创建")');
  }

  async filterByGroup(groupName: string) {
    await this.page.click(`button:has-text("${groupName}")`);
  }
}
```

### AICreationPage.ts
```typescript
export class AICreationPage extends BasePage {
  async goto() {
    await super.goto();
    await this.clickSidebar('AI 创作');
  }

  async selectPlatform(platform: 'douyin' | 'kuaishou' | 'xiaohongshu') {
    const platformNames = {
      douyin: '🎵 抖音',
      kuaishou: '📱 快手',
      xiaohongshu: '📕 小红书',
    };
    await this.page.click(`button:has-text("${platformNames[platform]}")`);
  }

  async selectContentType(type: 'text' | 'image' | 'voice') {
    const typeNames = {
      text: '📝 文案',
      image: '🖼️ 图片',
      voice: '🔊 语音',
    };
    await this.page.click(`button:has-text("${typeNames[type]}")`);
  }

  async selectPromptTemplate(templateName: string) {
    await this.page.click(`button:has-text("${templateName}")`);
  }

  async inputTopic(topic: string) {
    await this.page.fill('textarea.input', topic);
  }

  async clickGenerate() {
    await this.page.click('button:has-text("✨ 开始生成")');
  }

  async waitForResult() {
    await expect(this.page.locator('text=生成结果')).toBeVisible();
  }

  async clickCopy() {
    await this.page.click('button:has-text("复制")');
  }

  async clickPublish() {
    await this.page.click('button:has-text("一键发布")');
  }

  async clickQuickOptimize(type: '太正式' | '太长' | '开头弱' | '加梗') {
    await this.page.click(`button:has-text("${type}")`);
  }
}
```

---

## 测试数据 Fixtures

### fixtures.ts
```typescript
import { test as base } from '@playwright/test';

export const test = base.extend({
  accountPage: async ({ page }, use) => {
    const accountPage = new AccountPage(page);
    await use(accountPage);
  },
  aiCreationPage: async ({ page }, use) => {
    const aiCreationPage = new AICreationPage(page);
    await use(aiCreationPage);
  },
});

// 测试账号数据
export const testAccounts = {
  douyin: {
    username: 'e2e_douyin_test',
    password: 'Test123456',
    displayName: '抖音测试账号',
  },
  kuaishou: {
    username: 'e2e_kuaishou_test',
    password: 'Test123456',
    displayName: '快手测试账号',
  },
  xiaohongshu: {
    username: 'e2e_xhs_test',
    password: 'Test123456',
    displayName: '小红书测试账号',
  },
};

// 测试分组数据
export const testGroups = [
  { name: 'E2E测试分组A', color: '#6366f1' },
  { name: 'E2E测试分组B', color: '#ec4899' },
];

// AI 测试数据
export const aiTestData = {
  topic: '如何制作美味的咖啡',
  longTopic: '这是一个非常长的话题，用于测试输入框是否能够正确处理长文本内容的输入和显示，特别关注文本截断和换行处理机制',
};
```

---

## 辅助函数

### helpers.ts
```typescript
import { Page, expect } from '@playwright/test';

/**
 * 等待页面加载完成
 */
export async function waitForAppLoad(page: Page) {
  await page.goto('http://localhost:3000');
  await page.waitForSelector('.app-layout');
}

/**
 * 等待 Toast 消失
 */
export async function waitForToastDismiss(page: Page, timeout = 3000) {
  await page.waitForSelector('.toast', { state: 'hidden', timeout });
}

/**
 * 创建测试账号（通过 API）
 * 注意：需要 Electron API 支持
 */
export async function createTestAccountViaAPI(
  page: Page,
  data: { platform: string; username: string; password: string }
) {
  await page.evaluate(
    async ({ platform, username, password }) => {
      await window.electronAPI?.addAccount({ platform, username, password });
    },
    data
  );
}

/**
 * 清除所有测试数据
 */
export async function cleanupTestData(page: Page) {
  // 清理逻辑...
}

/**
 * 截图辅助函数
 */
export async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: `e2e/screenshots/${name}.png` });
}
```

---

## Playwright 配置建议

### playwright.config.ts 扩展
```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'cd dist/renderer && python3 -m http.server 3000',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
```

---

## 测试执行策略

### 1. 本地开发
```bash
# 运行单个测试文件
npm run test:e2e -- e2e/accounts.spec.ts

# 运行单个测试
npm run test:e2e -- --grep "should add account"

# UI 模式
npm run test:e2e:ui
```

### 2. CI/CD
```bash
# 完整测试（无 UI）
npm run test:e2e

# 带报告
npx playwright test --reporter=html
```

### 3. 调试技巧
```typescript
// 在测试中添加断点
test('debug test', async ({ page }) => {
  await page.pause(); // 暂停并打开 Playwright inspector
});
```

---

## 测试覆盖率目标

| 阶段 | 用例数 | 覆盖内容 | 预计时间 |
|------|--------|---------|---------|
| Phase 1 | 14 | 账号管理 | 2-3 小时 |
| Phase 2 | 15 | AI 创作 | 2-3 小时 |
| Phase 3 | 10 | 内容管理 | 1-2 小时 |
| Phase 4 | 8 | 定时发布 | 1-2 小时 |
| Phase 5 | 4 | 其他页面 | 30 分钟 |
| **总计** | **51** | | **~8 小时** |

---

## 注意事项

1. **Electron 特殊处理**: 应用是 Electron，需要 `webServer` 配置来启动渲染进程
2. **状态隔离**: 每个测试必须独立，不依赖其他测试的数据
3. **选择器稳定性**: 优先使用语义化选择器，避免 fragile XPath
4. **异步等待**: 使用 `waitFor` 系列方法而非固定 `sleep`
5. **CI 环境**: GitHub Actions 中需要先 build 再运行测试
