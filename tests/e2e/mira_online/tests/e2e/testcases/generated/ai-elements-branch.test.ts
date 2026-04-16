// source: branch
// handoff: test-cases/generated/playwright-handoff-ai-elements.json
// baseline: test-cases/generated/page-baseline-ai-elements.json
// generated: 2026-04-10T00:00:00Z

import { test, expect } from '../../fixtures';
import { AiElementsPage } from '../../pages/ai-elements.page';

// ════════════════════════════════════════════════════════════════════════════
// US-AIE-CONVERSATION · AI 对话元素渲染
// ════════════════════════════════════════════════════════════════════════════

test.describe('US-AIE-CONVERSATION · AI 对话元素渲染', () => {

  test('TC-BR-AIE-001 已完成任务页面显示用户消息和助手消息', { tag: ['@P0', '@smoke', '@regression', '@full'] }, async ({ page, i18n, taskWithCodeUrl }) => {
    test.setTimeout(180_000);
    const aiPage = new AiElementsPage(page, i18n);
    await aiPage.gotoTaskWithAI(taskWithCodeUrl);

    // Verify conversation log exists
    await expect(aiPage.getConversationLog()).toBeVisible();

    // Verify at least one user message
    const userMsgCount = await aiPage.getUserMessages().count();
    expect(userMsgCount).toBeGreaterThan(0);

    // Verify at least one assistant message
    const assistantMsgCount = await aiPage.getAssistantMessages().count();
    expect(assistantMsgCount).toBeGreaterThan(0);

    // Verify assistant message contains "Mira" label
    await expect(aiPage.getMiraLabel()).toBeVisible();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// US-AIE-CODEBLOCK · 代码块渲染（重构后的模块化 CodeBlock 组件）
// ════════════════════════════════════════════════════════════════════════════

test.describe('US-AIE-CODEBLOCK · 代码块渲染', () => {

  test('TC-BR-AIE-002 工作区面板中代码块正确渲染（Shiki 语法高亮）', { tag: ['@P1', '@regression', '@full'] }, async ({ page, i18n, taskWithCodeUrl }) => {
    test.setTimeout(180_000);
    const aiPage = new AiElementsPage(page, i18n);
    await aiPage.gotoTaskWithAI(taskWithCodeUrl);

    // Code blocks are rendered in the workspace panel (not inline in conversation)
    // Must open workspace by clicking tool card first
    const toolCardCount = await aiPage.getToolCards().count();
    if (toolCardCount === 0) {
      test.skip(true, 'No tool cards found — cannot open workspace to verify code blocks');
      return;
    }

    await aiPage.clickFirstToolCard();
    await aiPage.waitForWorkspaceOpen();

    // Verify Shiki code viewer: pre.shiki > code
    await expect(aiPage.getCodeBlockPre()).toBeVisible();
    await expect(aiPage.getCodeBlockCode()).toBeVisible();
  });

  test('TC-BR-AIE-003 工作区代码查看器包含有效代码内容', { tag: ['@P1', '@regression', '@full'] }, async ({ page, i18n, taskWithCodeUrl }) => {
    test.setTimeout(180_000);
    const aiPage = new AiElementsPage(page, i18n);
    await aiPage.gotoTaskWithAI(taskWithCodeUrl);

    const toolCardCount = await aiPage.getToolCards().count();
    if (toolCardCount === 0) {
      test.skip(true, 'No tool cards found — cannot open workspace to verify code');
      return;
    }

    // Open workspace panel
    await aiPage.clickFirstToolCard();
    await aiPage.waitForWorkspaceOpen();

    // Verify code content is non-empty
    await expect(aiPage.getCodeBlockPre()).toBeVisible();
    const codeText = await aiPage.getCodeBlockCode().textContent();
    expect(codeText?.trim().length).toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// US-AIE-WORKSPACE · 工作区面板（工具卡片交互）
// ════════════════════════════════════════════════════════════════════════════

test.describe('US-AIE-WORKSPACE · 工作区面板', () => {

  test('TC-BR-AIE-004 点击工具卡片打开工作区面板并显示代码查看器', { tag: ['@P1', '@regression', '@full'] }, async ({ page, i18n, taskWithCodeUrl }) => {
    test.setTimeout(180_000);
    const aiPage = new AiElementsPage(page, i18n);
    await aiPage.gotoTaskWithAI(taskWithCodeUrl);

    // Verify tool card exists and click it
    const toolCardCount = await aiPage.getToolCards().count();
    if (toolCardCount === 0) {
      test.skip(true, 'No tool cards found on this task — skipping workspace panel test');
      return;
    }

    await aiPage.clickFirstToolCard();
    await aiPage.waitForWorkspaceOpen();

    // Verify workspace heading
    await expect(aiPage.getWorkspaceHeading()).toBeVisible();
    await expect(aiPage.getWorkspaceHeading()).toHaveText(
      i18n.t('workspace.title')
    );

    // Verify code viewer (pre.shiki for syntax highlighted code)
    await expect(aiPage.getCodeViewer()).toBeVisible();

    // Verify timeline slider
    await expect(aiPage.getTimelineSlider()).toBeVisible();
  });

  test('TC-BR-AIE-005 工作区面板打开后关闭恢复到对话视图', { tag: ['@P1', '@regression', '@full'] }, async ({ page, i18n, taskWithCodeUrl }) => {
    test.setTimeout(180_000);
    const aiPage = new AiElementsPage(page, i18n);
    await aiPage.gotoTaskWithAI(taskWithCodeUrl);

    const toolCardCount = await aiPage.getToolCards().count();
    if (toolCardCount === 0) {
      test.skip(true, 'No tool cards found on this task — skipping workspace close test');
      return;
    }

    // Open workspace panel
    await aiPage.clickFirstToolCard();
    await aiPage.waitForWorkspaceOpen();
    await expect(aiPage.getWorkspaceHeading()).toBeVisible();

    // Close workspace panel
    await aiPage.closeWorkspacePanel();
    await aiPage.waitForWorkspaceClosed();

    // Verify workspace heading is hidden
    await expect(aiPage.getWorkspaceHeading()).toBeHidden();
  });

  test('TC-BR-AIE-008 工作区面板时间线滑块可见且可交互', { tag: ['@P2', '@full'] }, async ({ page, i18n, taskWithCodeUrl }) => {
    test.setTimeout(180_000);
    const aiPage = new AiElementsPage(page, i18n);
    await aiPage.gotoTaskWithAI(taskWithCodeUrl);

    const toolCardCount = await aiPage.getToolCards().count();
    if (toolCardCount === 0) {
      test.skip(true, 'No tool cards found on this task — skipping timeline slider test');
      return;
    }

    await aiPage.clickFirstToolCard();
    await aiPage.waitForWorkspaceOpen();

    // Verify timeline slider is visible
    await expect(aiPage.getTimelineSlider()).toBeVisible();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// US-AIE-SCENARIO · 端到端场景
// ════════════════════════════════════════════════════════════════════════════

test.describe('US-AIE-SCENARIO · 端到端场景', () => {

  test('TC-BR-AIE-006 完整的任务对话浏览场景——查看消息、代码块、工具卡片、完成状态', { tag: ['@P1', '@regression', '@full'] }, async ({ page, i18n, taskWithFilesUrl }) => {
    test.setTimeout(180_000);
    const aiPage = new AiElementsPage(page, i18n);
    await aiPage.gotoTaskWithAI(taskWithFilesUrl);

    // 1. Conversation log visible
    await expect(aiPage.getConversationLog()).toBeVisible();

    // 2. User message exists
    const userMsgCount = await aiPage.getUserMessages().count();
    expect(userMsgCount).toBeGreaterThan(0);

    // 3. Assistant message with Mira label
    await expect(aiPage.getMiraLabel()).toBeVisible();

    // 4. Tool card visible (file creation task should have tool execution cards)
    const toolCardCount = await aiPage.getToolCards().count();
    // Tool cards are expected for file-creation tasks — soft assert
    expect.soft(toolCardCount).toBeGreaterThan(0);

    // 5. Completed indicator — needs extra time for API metadata to load after navigation
    await expect(aiPage.getCompletedIndicator()).toBeVisible({ timeout: 30_000 });

    // 6. If tool cards exist, open workspace panel
    if (toolCardCount > 0) {
      await aiPage.clickFirstToolCard();
      await aiPage.waitForWorkspaceOpen();
      await expect(aiPage.getWorkspaceHeading()).toBeVisible();
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// US-AIE-TOOLCARD · 工具卡片内容
// ════════════════════════════════════════════════════════════════════════════

test.describe('US-AIE-TOOLCARD · 工具卡片内容', () => {

  test('TC-BR-AIE-007 工具卡片工具名和描述文本正确显示', { tag: ['@P1', '@regression', '@full'] }, async ({ page, i18n, taskWithCodeUrl }) => {
    test.setTimeout(180_000);
    const aiPage = new AiElementsPage(page, i18n);
    await aiPage.gotoTaskWithAI(taskWithCodeUrl);

    const toolCardCount = await aiPage.getToolCards().count();
    if (toolCardCount === 0) {
      test.skip(true, 'No tool cards found on this task — skipping tool card content test');
      return;
    }

    // Verify tool card title (shrink-0 font-medium element) is visible and has text
    await expect(aiPage.getFirstToolCardTitle()).toBeVisible();
    const titleText = await aiPage.getFirstToolCardTitle().textContent();
    expect(titleText?.trim().length).toBeGreaterThan(0);

    // Verify tool card description (text-muted-foreground element) is visible
    await expect(aiPage.getFirstToolCardDescription()).toBeVisible();
  });
});
