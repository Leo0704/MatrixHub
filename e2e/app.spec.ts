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

    // Check nav items exist
    await expect(page.locator('text=概览')).toBeVisible();
    await expect(page.locator('text=内容管理')).toBeVisible();
    await expect(page.locator('text=AI 创作')).toBeVisible();
    await expect(page.locator('text=定时发布')).toBeVisible();
    await expect(page.locator('text=数据洞察')).toBeVisible();
    await expect(page.locator('text=账号管理')).toBeVisible();
  });

  test('should navigate between pages', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Navigate to Settings
    await page.click('text=设置');
    await expect(page.locator('h2:has-text("设置")')).toBeVisible();
  });
});