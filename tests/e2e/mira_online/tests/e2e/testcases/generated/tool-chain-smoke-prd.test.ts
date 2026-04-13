// source: prd
// handoff: test-cases/generated/playwright-handoff-tool-chain-smoke.json
// generated: 2026-04-13T00:00:00Z

import { test, expect } from '../../fixtures';
import { TaskPage } from '../../pages/task.page';

// ════════════════════════════════════════════════════════════════════════════
// US-TOOL-SMOKE -- Multi-tool chain smoke tests
// Focus: tool chain completion + multi-format file generation verification
// Preview/download/view-all-files covered by canvas-preview-prd, canvas-download-prd, view-all-files-prd
// ════════════════════════════════════════════════════════════════════════════

test.describe('US-TOOL-SMOKE -- Multi-tool chain smoke', () => {
  test(
    'TC-PRD-TCS-001 多工具链任务正常完成并显示任务已完成',
    { tag: ['@P0', '@smoke', '@regression', '@full'] },
    async ({ page, i18n, taskWithToolChainUrl }) => {
      test.setTimeout(120_000);
      const taskPage = new TaskPage(page, i18n);
      await page.goto(taskWithToolChainUrl, { timeout: 60_000, waitUntil: 'domcontentloaded' });
      await taskPage.getChatLog().waitFor({ state: 'visible', timeout: 30_000 });

      // Verify "任务已完成" / "Task completed" indicator is visible
      await expect(taskPage.getTaskCompletedLabel()).toBeVisible({ timeout: 30_000 });
    }
  );

  test(
    'TC-PRD-TCS-002 多工具链任务生成的文件卡片可见（至少3种格式）',
    { tag: ['@P0', '@smoke', '@regression', '@full'] },
    async ({ page, i18n, taskWithToolChainUrl }) => {
      test.setTimeout(120_000);
      const taskPage = new TaskPage(page, i18n);
      await page.goto(taskWithToolChainUrl, { timeout: 60_000, waitUntil: 'domcontentloaded' });
      await taskPage.getChatLog().waitFor({ state: 'visible', timeout: 30_000 });

      // Verify file cards are visible and at least 3 exist
      const fileCards = taskPage.getFileCards();
      await expect(fileCards.first()).toBeVisible({ timeout: 30_000 });
      const count = await fileCards.count();
      expect(count).toBeGreaterThanOrEqual(3);

      // Verify at least 3 different file format extensions are present
      const allTexts: string[] = [];
      for (let i = 0; i < count; i++) {
        const text = await fileCards.nth(i).textContent();
        if (text) allTexts.push(text);
      }
      const extensions = new Set<string>();
      for (const text of allTexts) {
        const match = text.match(/\.(md|xlsx|pptx|pdf|docx|png|jpg|csv)/i);
        if (match) extensions.add(match[1].toLowerCase());
      }
      expect(extensions.size).toBeGreaterThanOrEqual(3);
    }
  );

  test(
    'TC-PRD-TCS-003 多工具链任务生成的文件卡片包含预期文件类型标签',
    { tag: ['@P1', '@regression', '@full'] },
    async ({ page, i18n, taskWithToolChainUrl }) => {
      test.setTimeout(120_000);
      const taskPage = new TaskPage(page, i18n);
      await page.goto(taskWithToolChainUrl, { timeout: 60_000, waitUntil: 'domcontentloaded' });
      await taskPage.getChatLog().waitFor({ state: 'visible', timeout: 30_000 });

      // Verify file cards show file type info
      // ArtifactEntry renders fileTypeDisplay via getFileTypeLabel(): "表格", "演示文稿", "文档", etc.
      const fileCards = taskPage.getFileCards();
      await expect(fileCards.first()).toBeVisible({ timeout: 30_000 });
      const count = await fileCards.count();
      expect(count).toBeGreaterThan(0);

      let cardsWithTypeInfo = 0;
      for (let i = 0; i < count; i++) {
        const text = await fileCards.nth(i).textContent();
        if (text && /表格|文档|演示文稿|图片|文本|文件|Excel|PPT|PDF|Image|Text|Document/i.test(text)) {
          cardsWithTypeInfo++;
        }
      }
      expect(cardsWithTypeInfo).toBeGreaterThan(0);
    }
  );

  test(
    'TC-PRD-TCS-004 多工具链任务中工具调用卡片可见',
    { tag: ['@P1', '@regression', '@full'] },
    async ({ page, i18n, taskWithToolChainUrl }) => {
      test.setTimeout(120_000);
      const taskPage = new TaskPage(page, i18n);
      await page.goto(taskWithToolChainUrl, { timeout: 60_000, waitUntil: 'domcontentloaded' });
      await taskPage.getChatLog().waitFor({ state: 'visible', timeout: 30_000 });

      // Verify tool invocation cards are visible in the chat log
      const toolCards = taskPage.getToolCards();
      await expect(toolCards.first()).toBeVisible({ timeout: 30_000 });
      const count = await toolCards.count();
      expect(count).toBeGreaterThanOrEqual(1);
    }
  );
});
