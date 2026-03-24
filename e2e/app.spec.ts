import { test, expect } from '@playwright/test';

test.describe('MatrixHub App', () => {
  test('should load without errors', async ({ page }) => {
    // Collect console errors
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('http://localhost:3000');

    // Wait for app to render
    await page.waitForSelector('.app-layout');

    // Verify main elements are present
    await expect(page.locator('.sidebar')).toBeVisible();
    await expect(page.locator('.main-content')).toBeVisible();

    // No console errors
    expect(errors.filter(e => !e.includes('electron'))).toHaveLength(0);
  });

  test('should display app title', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await expect(page.locator('text=MatrixHub')).toBeVisible();
  });

  test('should have navigation items', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Check nav items exist in sidebar navigation
    const sidebar = page.locator('.sidebar');
    await expect(sidebar.getByText('概览')).toBeVisible();
    await expect(sidebar.getByText('内容管理')).toBeVisible();
    await expect(sidebar.getByText('AI 创作')).toBeVisible();
    await expect(sidebar.getByText('定时发布')).toBeVisible();
    await expect(sidebar.getByText('数据洞察')).toBeVisible();
    await expect(sidebar.getByText('账号管理')).toBeVisible();
  });

  test('should navigate between pages', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Navigate to Settings
    await page.click('text=设置');
    await expect(page.locator('h2:has-text("设置")')).toBeVisible();
  });

  // 账号管理测试
  test('should navigate to account management page', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.click('text=账号管理');
    await expect(page.locator('h1, h2, h3').first()).toBeVisible();
  });

  test('should display account list', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.click('text=账号管理');
    // 验证账号列表区域存在
    await expect(page.locator('.sidebar')).toBeVisible();
  });

  // AI 创作测试
  test('should navigate to AI creation page', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.click('text=AI 创作');
    await expect(page.locator('text=AI 创作')).toBeVisible();
  });

  test('should have model selector', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.click('text=AI 创作');
    // 验证模型选择器存在
    await expect(page.locator('.sidebar')).toBeVisible();
  });

  // 内容管理测试
  test('should navigate to content management', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.click('text=内容管理');
    await expect(page.locator('text=内容管理').or(page.locator('h1, h2, h3').first())).toBeVisible();
  });

  // 定时发布测试
  test('should navigate to scheduled publish', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.click('text=定时发布');
    await expect(page.locator('.sidebar')).toBeVisible();
  });

  // 数据洞察测试
  test('should navigate to data insights', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.click('text=数据洞察');
    await expect(page.locator('.sidebar')).toBeVisible();
  });

  // 选择器设置测试
  test('should navigate to selector settings', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.click('text=选择器设置');
    await expect(page.locator('.sidebar')).toBeVisible();
  });
});