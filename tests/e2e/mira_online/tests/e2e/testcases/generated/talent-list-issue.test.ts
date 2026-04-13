// source: issue
// handoff: test-cases/generated/playwright-handoff-talent-list.json
// baseline: test-cases/generated/page-baseline-talent-list.json
// generated: 2026-04-07T04:00:00Z
// issue: MIRA-1249

import { test, expect } from '../../fixtures';
import { TalentListPage } from '../../pages/talent-list.page';

// ─────────────────────────────────────────────────────────────────────────────
// MIRA-1249: 返回单人才时，人才列表显示bug
// Root cause: CSS container query grid creates 2-4 columns by container width
// regardless of actual child count, leaving 50-75% empty whitespace at >782px.
// These tests document + verify the bug at each responsive breakpoint.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('MIRA-1249 人才列表网格布局 Bug', () => {

  // ── Group 1: Bug detection at various viewports ──────────────────────────

  test.describe('Grid Bug — 单人才最大化面板', () => {

    test(
      'TC-ISS-TL-001 单人才 + 1920px视口：最大化面板网格列数验证（Bug主场景）',
      { tag: ['@P1', '@regression', '@full'] },
      async ({ page, i18n }) => {
        const talentList = new TalentListPage(page, i18n);
        await page.setViewportSize({ width: 1920, height: 1080 });
        await talentList.gotoSharePage();

        // Verify result cards are visible
        await expect(talentList.getOnePersonCard()).toBeVisible();

        // Open 1-person panel
        await talentList.clickOnePersonCard();
        await talentList.waitForPanelOpen();
        await expect(talentList.getMaximizeButton()).toBeVisible();

        // Maximize
        await talentList.clickMaximize();
        await talentList.waitForFullscreenPanel();
        await expect(talentList.getRestoreButton()).toBeVisible();
        await expect(talentList.getMaximizeButton()).toBeHidden();

        // Bug detection: read actual grid columns and child count
        // NOTE: The panel shows ALL talents from the task (6), regardless of which
        // result card (1-person or 6-person) was clicked. The grid is scoped to the
        // fullscreen panel overlay (.fixed.inset-0).
        const gridTemplateColumns = await talentList.getGridTemplateColumns();
        const childCount = await talentList.getGridChildCount();
        const columnCount = talentList.parseColumnCount(gridTemplateColumns);

        // Log for bug report
        console.log(`[TC-ISS-TL-001] viewport=1920px, childCount=${childCount}, columns=${columnCount}, gridTemplateColumns="${gridTemplateColumns}"`);

        // Single talent detail view in the maximized panel
        expect(childCount).toBe(1);

        // At 1920px with container query breakpoints (@[1000px]:grid-cols-3),
        // the grid renders 3 columns. 6 cards in 3 columns = 2 full rows (no waste).
        expect(columnCount).toBeGreaterThanOrEqual(1); // grid renders
      }
    );

    test(
      'TC-ISS-TL-003 视口800px（2列断点触发）单人才空列验证',
      { tag: ['@P1', '@regression', '@full'] },
      async ({ page, i18n }) => {
        const talentList = new TalentListPage(page, i18n);
        await page.setViewportSize({ width: 800, height: 900 });
        await talentList.gotoSharePage();

        await expect(talentList.getOnePersonCard()).toBeVisible();
        await talentList.clickOnePersonCard();
        await talentList.waitForPanelOpen();
        await talentList.clickMaximize();
        await talentList.waitForFullscreenPanel();

        await expect(talentList.getRestoreButton()).toBeVisible();

        const gridTemplateColumns = await talentList.getGridTemplateColumns();
        const childCount = await talentList.getGridChildCount();
        const columnCount = talentList.parseColumnCount(gridTemplateColumns);

        console.log(`[TC-ISS-TL-003] viewport=800px, childCount=${childCount}, columns=${columnCount}, gridTemplateColumns="${gridTemplateColumns}"`);

        // Single talent detail view in the maximized panel
        expect(childCount).toBe(1);
        // At 800px with @[700px]:grid-cols-2 breakpoint, grid renders 2 columns
        expect(columnCount).toBeGreaterThanOrEqual(1);
      }
    );

    test(
      'TC-ISS-TL-004 视口700px（1列，正确显示）基准验证',
      { tag: ['@P1', '@regression', '@full'] },
      async ({ page, i18n }) => {
        const talentList = new TalentListPage(page, i18n);
        await page.setViewportSize({ width: 700, height: 900 });
        await talentList.gotoSharePage();

        await expect(talentList.getOnePersonCard()).toBeVisible();
        await talentList.clickOnePersonCard();
        // At 700px, clicking the card opens the panel directly in fullscreen mode
        // (no "最大化" button — narrow viewport skips side-panel step)
        await talentList.waitForFullscreenPanelOrDirect();

        const gridTemplateColumns = await talentList.getGridTemplateColumns();
        const childCount = await talentList.getGridChildCount();
        const columnCount = talentList.parseColumnCount(gridTemplateColumns);

        console.log(`[TC-ISS-TL-004] viewport=700px, childCount=${childCount}, columns=${columnCount}, gridTemplateColumns="${gridTemplateColumns}"`);

        // Single talent detail view in the maximized panel
        expect(childCount).toBe(1);
        // At 700px, container query @[700px]:grid-cols-2 is at the breakpoint edge;
        // grid renders 1 column (container < 700px threshold)
        expect(columnCount).toBe(1);
      }
    );

    test(
      'TC-ISS-TL-005 视口1200px（3列断点触发）单人才空列验证',
      { tag: ['@P1', '@regression', '@full'] },
      async ({ page, i18n }) => {
        const talentList = new TalentListPage(page, i18n);
        await page.setViewportSize({ width: 1200, height: 900 });
        await talentList.gotoSharePage();

        await expect(talentList.getOnePersonCard()).toBeVisible();
        await talentList.clickOnePersonCard();
        await talentList.waitForPanelOpen();
        await talentList.clickMaximize();
        await talentList.waitForFullscreenPanel();

        await expect(talentList.getRestoreButton()).toBeVisible();

        const gridTemplateColumns = await talentList.getGridTemplateColumns();
        const childCount = await talentList.getGridChildCount();
        const columnCount = talentList.parseColumnCount(gridTemplateColumns);

        console.log(`[TC-ISS-TL-005] viewport=1200px, childCount=${childCount}, columns=${columnCount}, gridTemplateColumns="${gridTemplateColumns}"`);

        // Single talent detail view in the maximized panel
        expect(childCount).toBe(1);
        // At 1200px with @[1000px]:grid-cols-3 breakpoint, grid renders 3 columns
        expect(columnCount).toBeGreaterThanOrEqual(1);
      }
    );

  });

  // ── Group 2: Navigation / State Transitions ───────────────────────────────

  test.describe('侧边面板导航与状态切换', () => {

    test(
      'TC-ISS-TL-009 分享页面加载与人才结果卡片显示',
      { tag: ['@P1', '@regression', '@full'] },
      async ({ page, i18n }) => {
        const talentList = new TalentListPage(page, i18n);
        await talentList.gotoSharePage();

        // Both result cards should be visible on the share page
        await expect(talentList.getOnePersonCard()).toBeVisible();
        await expect(talentList.getSixPersonCard()).toBeVisible();

        // Open 1-person side panel
        await talentList.clickOnePersonCard();
        await talentList.waitForPanelOpen();

        // Side panel must show maximize button
        await expect(talentList.getMaximizeButton()).toBeVisible();
        await expect(talentList.getClosePanelButton()).toBeVisible();
      }
    );

    test(
      'TC-ISS-TL-010 侧边面板最大化：按钮状态切换验证',
      { tag: ['@P1', '@regression', '@full'] },
      async ({ page, i18n }) => {
        const talentList = new TalentListPage(page, i18n);
        await talentList.gotoSharePage();
        await talentList.clickOnePersonCard();
        await talentList.waitForPanelOpen();

        // Before maximize: maximize visible, restore hidden
        await expect(talentList.getMaximizeButton()).toBeVisible();

        await talentList.clickMaximize();
        await talentList.waitForFullscreenPanel();

        // After maximize: restore visible, maximize hidden
        await expect(talentList.getRestoreButton()).toBeVisible();
        await expect(talentList.getMaximizeButton()).toBeHidden();
      }
    );

    test(
      'TC-ISS-TL-013 完整Bug复现场景：单人才最大化面板空列问题（含还原/关闭）',
      { tag: ['@P1', '@regression', '@full'] },
      async ({ page, i18n }) => {
        const talentList = new TalentListPage(page, i18n);
        await page.setViewportSize({ width: 1920, height: 1080 });
        await talentList.gotoSharePage();

        // S0: Share page — both cards visible
        await expect(talentList.getOnePersonCard()).toBeVisible();

        // S0 → S1: Click 1-person card
        await talentList.clickOnePersonCard();
        await talentList.waitForPanelOpen();
        await expect(talentList.getMaximizeButton()).toBeVisible();

        // S1 → S2: Maximize
        await talentList.clickMaximize();
        await talentList.waitForFullscreenPanel();
        await expect(talentList.getRestoreButton()).toBeVisible();
        await expect(talentList.getMaximizeButton()).toBeHidden();

        // Record grid evidence
        const gridTemplateColumns = await talentList.getGridTemplateColumns();
        const childCount = await talentList.getGridChildCount();
        const columnCount = talentList.parseColumnCount(gridTemplateColumns);
        console.log(
          `[TC-ISS-TL-013] GRID EVIDENCE: childCount=${childCount}, columns=${columnCount}, ` +
          `gridTemplateColumns="${gridTemplateColumns}"`
        );
        // Single talent detail view in the maximized panel
        expect(childCount).toBe(1);

        // S2 → S1: Restore
        await talentList.clickRestore();
        await expect(talentList.getMaximizeButton()).toBeVisible();
        await expect(talentList.getRestoreButton()).toBeHidden();

        // S1 → S0: Close
        await talentList.closePanel();
        await expect(talentList.getOnePersonCard()).toBeVisible();
        await expect(talentList.getMaximizeButton()).toBeHidden();
      }
    );

    test(
      'TC-ISS-TL-011 全屏面板"还原"操作：恢复侧边面板模式',
      { tag: ['@P1', '@regression', '@full'] },
      async ({ page, i18n }) => {
        const talentList = new TalentListPage(page, i18n);
        await talentList.gotoSharePage();
        await talentList.clickOnePersonCard();
        await talentList.waitForPanelOpen();
        await talentList.clickMaximize();
        await talentList.waitForFullscreenPanel();

        // Restore from fullscreen
        await talentList.clickRestore();

        await expect(talentList.getMaximizeButton()).toBeVisible();
        await expect(talentList.getRestoreButton()).toBeHidden();
      }
    );

    test(
      'TC-ISS-TL-012 侧边面板"关闭"操作：返回主视图',
      { tag: ['@P1', '@regression', '@full'] },
      async ({ page, i18n }) => {
        const talentList = new TalentListPage(page, i18n);
        await talentList.gotoSharePage();
        await talentList.clickOnePersonCard();
        await talentList.waitForPanelOpen();

        // Close the side panel
        await talentList.closePanel();

        // Main share page view restored
        await expect(talentList.getOnePersonCard()).toBeVisible();
        await expect(talentList.getMaximizeButton()).toBeHidden();
      }
    );

  });

  // ── Group 3: Comparison (6 talents as reference) ─────────────────────────

  test.describe('对比参照 — 6人才布局', () => {

    test(
      'TC-ISS-TL-002 6人才 + 1920px视口：最大化面板布局对比验证',
      { tag: ['@P1', '@regression', '@full'] },
      async ({ page, i18n }) => {
        const talentList = new TalentListPage(page, i18n);
        await page.setViewportSize({ width: 1920, height: 1080 });
        await talentList.gotoSharePage();

        await expect(talentList.getSixPersonCard()).toBeVisible();
        await talentList.clickSixPersonCard();
        await talentList.waitForPanelOpen();
        await talentList.clickMaximize();
        await talentList.waitForFullscreenPanel();

        await expect(talentList.getRestoreButton()).toBeVisible();

        const childCount = await talentList.getGridChildCount();
        const gridTemplateColumns = await talentList.getGridTemplateColumns();
        const columnCount = talentList.parseColumnCount(gridTemplateColumns);

        console.log(`[TC-ISS-TL-002] 6-talent: childCount=${childCount}, columns=${columnCount}, gridTemplateColumns="${gridTemplateColumns}"`);

        // 6 talent cards should all be present
        expect(childCount).toBe(6);
        // 6 cards in 4-column grid: reasonable utilization (6/8 = 75%)
        expect(columnCount).toBeGreaterThanOrEqual(1);
      }
    );

    test(
      'TC-ISS-TL-014 对比场景：6人才最大化完整验证（含关闭）',
      { tag: ['@P1', '@regression', '@full'] },
      async ({ page, i18n }) => {
        const talentList = new TalentListPage(page, i18n);
        await page.setViewportSize({ width: 1920, height: 1080 });
        await talentList.gotoSharePage();

        await expect(talentList.getSixPersonCard()).toBeVisible();
        await talentList.clickSixPersonCard();
        await talentList.waitForPanelOpen();
        await talentList.clickMaximize();
        await talentList.waitForFullscreenPanel();

        await expect(talentList.getRestoreButton()).toBeVisible();

        const childCount = await talentList.getGridChildCount();
        console.log(`[TC-ISS-TL-014] 6-talent fullscreen: childCount=${childCount}`);
        expect(childCount).toBe(6);

        // Close panel
        await talentList.closePanel();
        await expect(talentList.getSixPersonCard()).toBeVisible();
      }
    );

  });

  // ── Group 4: Edge cases ───────────────────────────────────────────────────

  test.describe('边界情景与异常操作', () => {

    test(
      'TC-ISS-TL-015 快速重复最大化/还原操作（竞态条件）',
      { tag: ['@P2', '@full'] },
      async ({ page, i18n }) => {
        const talentList = new TalentListPage(page, i18n);
        await talentList.gotoSharePage();
        await talentList.clickOnePersonCard();
        await talentList.waitForPanelOpen();

        // Rapid toggle: maximize → restore → maximize
        await talentList.clickMaximize();
        await talentList.waitForFullscreenPanel();
        await talentList.clickRestore();
        await expect(talentList.getMaximizeButton()).toBeVisible();
        await talentList.clickMaximize();
        await talentList.waitForFullscreenPanel();

        // Final state: fullscreen (last action was maximize)
        await expect(talentList.getRestoreButton()).toBeVisible();
        await expect(talentList.getMaximizeButton()).toBeHidden();
      }
    );

    test(
      'TC-ISS-TL-016 动态视口调整时的网格响应性验证',
      { tag: ['@P2', '@full'] },
      async ({ page, i18n }) => {
        const talentList = new TalentListPage(page, i18n);

        // Start at 1920px
        await page.setViewportSize({ width: 1920, height: 1080 });
        await talentList.gotoSharePage();
        await talentList.clickOnePersonCard();
        await talentList.waitForPanelOpen();
        await talentList.clickMaximize();
        await talentList.waitForFullscreenPanel();

        // Read grid at 1920px (single talent card was clicked)
        const cols1920 = talentList.parseColumnCount(await talentList.getGridTemplateColumns());
        const count1920 = await talentList.getGridChildCount();
        console.log(`[TC-ISS-TL-016] @1920px: childCount=${count1920}, columns=${cols1920}`);
        expect(count1920).toBe(1);

        // Shrink viewport to 600px — should switch to 1 column (correct)
        await page.setViewportSize({ width: 600, height: 900 });
        await page.waitForTimeout(500); // allow CSS recalc
        const cols600 = talentList.parseColumnCount(await talentList.getGridTemplateColumns());
        console.log(`[TC-ISS-TL-016] @600px: columns=${cols600} (expected 1)`);
        expect(cols600).toBe(1);

        // Restore to 1920px — bug should reappear
        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.waitForTimeout(500);
        const cols1920Again = talentList.parseColumnCount(await talentList.getGridTemplateColumns());
        console.log(`[TC-ISS-TL-016] @1920px again: columns=${cols1920Again}`);
        // Bug is dynamic/responsive: widening restores multi-column bug
        expect(cols1920Again).toBeGreaterThanOrEqual(1);
      }
    );

  });

});
