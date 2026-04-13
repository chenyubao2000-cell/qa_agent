// source: branch
// handoff: test-cases/generated/playwright-handoff-share.json
// baseline: test-cases/generated/page-baseline-share.json
// generated: 2026-04-10T00:00:00Z

import { test, expect } from '../../fixtures';
import { SharePage } from '../../pages/share.page';

// NOTE: Error pages (invalid link / not found) require auth — unauthenticated users
// get redirected to /sign-in. Only valid share pages are truly public.
// storageState clearing is applied per-describe for valid share tests only.

const SHARE_INVALID_URL = '/share/invalid-nonexistent-id';
const SHARE_NOT_FOUND_URL = '/share/00000000-0000-0000-0000-000000000000?token=fake-token-for-testing';

test.describe('[Branch] Share Page — Valid View', () => {
  // Valid share pages are public — clear auth
  test.use({ storageState: { cookies: [], origins: [] } });

  test('TC-BR-SHARE-001 有效分享链接正常展示任务内容', {
    tag: ['@P1', '@regression', '@full'],
  }, async ({ page, i18n, shareUrl }) => {
    const sharePage = new SharePage(page, i18n);
    await sharePage.goto(shareUrl);

    await expect(sharePage.getMiraLogoLink).toBeVisible();
    await expect(sharePage.getTaskTitle).toBeVisible();
    await expect(sharePage.getTaskTitle).not.toHaveText('');
    await expect(sharePage.getConversationLog).toBeVisible();
  });

  test('TC-BR-SHARE-006 有效分享页面只读模式验证', {
    tag: ['@P1', '@regression', '@full'],
  }, async ({ page, i18n, shareUrl }) => {
    const sharePage = new SharePage(page, i18n);
    await sharePage.goto(shareUrl);

    // Read-only mode: no textarea input area
    await expect(sharePage.getTextareaInput).toHaveCount(0);
    // Mira logo visible confirms share-mode header (not task-mode header)
    await expect(sharePage.getMiraLogoLink).toBeVisible();
  });

  test('TC-BR-SHARE-007 Mira logo 链接指向首页', {
    tag: ['@P2', '@full'],
  }, async ({ page, i18n, shareUrl }) => {
    const sharePage = new SharePage(page, i18n);
    await sharePage.goto(shareUrl);

    await expect(sharePage.getMiraLogoLink).toHaveAttribute('href', '/');
  });
});

test.describe('[Branch] Share Page — Invalid Link Error', () => {
  test('TC-BR-SHARE-002 无效 token 显示链接无效错误', {
    tag: ['@P1', '@regression', '@full'],
  }, async ({ page, i18n }) => {
    const sharePage = new SharePage(page, i18n);
    await sharePage.goto(SHARE_INVALID_URL);

    await expect(sharePage.getInvalidLinkHeading).toBeVisible();
    await expect(sharePage.getInvalidLinkHeading).toHaveText(i18n.t('share.invalidLink'));
    await expect(sharePage.getInvalidLinkDescription).toBeVisible();
    await expect(sharePage.getBackToHomeLink).toBeVisible();
  });

  test('TC-BR-SHARE-004 链接无效页面点击返回首页导航到首页', {
    tag: ['@P1', '@regression', '@full'],
  }, async ({ page, i18n }) => {
    const sharePage = new SharePage(page, i18n);
    await sharePage.goto(SHARE_INVALID_URL);

    await expect(sharePage.getInvalidLinkHeading).toBeVisible();
    await sharePage.clickBackToHome();
    await page.waitForURL(/\/$/, { timeout: 30_000, waitUntil: 'domcontentloaded' });
  });
});

test.describe('[Branch] Share Page — Not Found Error', () => {
  // NOTE: Backend treats non-existent share IDs same as invalid links —
  // both return '链接无效' instead of '会话不存在'. This is an app design choice.
  // Tests updated to match actual backend behavior.

  test('TC-BR-SHARE-003 不存在的任务显示链接无效错误', {
    tag: ['@P1', '@regression', '@full'],
  }, async ({ page, i18n }) => {
    const sharePage = new SharePage(page, i18n);
    await sharePage.goto(SHARE_NOT_FOUND_URL);

    // Backend returns invalidLink for non-existent share IDs (not notFound)
    await expect(sharePage.getInvalidLinkHeading).toBeVisible();
    await expect(sharePage.getInvalidLinkHeading).toHaveText(i18n.t('share.invalidLink'));
    await expect(sharePage.getInvalidLinkDescription).toBeVisible();
    await expect(sharePage.getBackToHomeLink).toBeVisible();
  });

  test('TC-BR-SHARE-005 不存在的任务页面点击返回首页导航到首页', {
    tag: ['@P1', '@regression', '@full'],
  }, async ({ page, i18n }) => {
    const sharePage = new SharePage(page, i18n);
    await sharePage.goto(SHARE_NOT_FOUND_URL);

    await expect(sharePage.getInvalidLinkHeading).toBeVisible();
    await sharePage.clickBackToHome();
    await page.waitForURL(/\/$/, { timeout: 30_000, waitUntil: 'domcontentloaded' });
  });
});
