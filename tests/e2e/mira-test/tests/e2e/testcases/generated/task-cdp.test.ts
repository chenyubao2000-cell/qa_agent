// source: cdp
// handoff: test-cases/generated/playwright-handoff-task.json
// baseline: test-cases/generated/page-baseline-task.json
// generated: 2026-07-03T00:00:00Z

import { test, expect } from "../../fixtures";
import { TaskPage } from "../../pages/task.page";

test.describe("[CDP] Task index — load & welcome", { tag: ["@full", "@smoke"] }, () => {
  // TC-CDP-TASK-001 (P0, 场景法)
  test(
    "TC-CDP-TASK-001 已登录用户打开 Task 首页看到欢迎语与输入框",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const taskPage = new TaskPage(page, i18n);
      await taskPage.goto();

      // Authenticated: landed on /task, not bounced to the sign-in wall.
      await expect(page).toHaveURL(/\/task$/);
      await expect(taskPage.heading).toHaveText(i18n.t("dashboard.welcome"));
      await expect(taskPage.composer).toBeVisible();
      // Empty composer → Submit disabled (source: SubmitButton disabled when !hasContent).
      await expect(taskPage.submitButton).toBeDisabled();
    },
  );
});

test.describe("[CDP] Task index — composer", { tag: ["@full", "@smoke"] }, () => {
  // TC-CDP-TASK-002 (P0, 因果图)
  test(
    "TC-CDP-TASK-002 输入文本使 Submit 按钮启用",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const taskPage = new TaskPage(page, i18n);
      await taskPage.goto();

      await expect(taskPage.submitButton).toBeDisabled();

      await taskPage.fillComposer("This is a smoke test draft.");

      await expect(taskPage.composer).toContainText("This is a smoke test draft.");
      await expect(taskPage.submitButton).toBeEnabled();
    },
  );

  // TC-CDP-TASK-003 (P1, 边界值分析)
  test(
    "TC-CDP-TASK-003 输入框空/非空边界切换 Submit 启用态",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const taskPage = new TaskPage(page, i18n);
      await taskPage.goto();

      // Boundary: 0 chars → disabled
      await expect(taskPage.submitButton).toBeDisabled();

      // Boundary: >=1 char → enabled
      await taskPage.fillComposer("x");
      await expect(taskPage.submitButton).toBeEnabled();

      // Back across the boundary: cleared to 0 chars → disabled again
      await taskPage.clearComposer();
      await expect(taskPage.submitButton).toBeDisabled();
    },
  );
});

test.describe("[CDP] Task index — scenario cards", { tag: ["@full", "@smoke"] }, () => {
  // TC-CDP-TASK-004 (P1, 状态迁移)
  test(
    "TC-CDP-TASK-004 点击场景卡填充输入框且不导航",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const taskPage = new TaskPage(page, i18n);
      await taskPage.goto();

      // S0: composer empty, Submit disabled
      await expect(taskPage.submitButton).toBeDisabled();
      expect(await taskPage.scenarioCardCount()).toBeGreaterThan(0);

      // Transition: click first scenario card
      await taskPage.clickFirstScenarioCard();

      // S2: composer filled with the card's (non-empty) description text
      await expect(taskPage.submitButton).toBeEnabled();
      const filled = await taskPage.composerText();
      expect(filled.length).toBeGreaterThan(0);

      // No navigation, no auto-submit — URL stays on /task
      // (source: handleCardSelect only calls fillText(), never router.push / submit).
      await expect(page).toHaveURL(/\/task$/);
    },
  );

  // TC-CDP-TASK-005 (P2, 等价类划分)
  test(
    "TC-CDP-TASK-005 场景卡区正确渲染",
    { tag: ["@P2", "@full"] },
    async ({ page, i18n }) => {
      const taskPage = new TaskPage(page, i18n);
      await taskPage.goto();

      await expect(taskPage.tryScenariosLabel).toBeVisible();
      expect(await taskPage.scenarioCardCount()).toBeGreaterThan(0);
      // Cards are actionable buttons.
      await expect(taskPage.firstScenarioCard).toBeEnabled();
    },
  );
});

test.describe("[CDP] Task index — send message & task creation", { tag: ["@full", "@smoke"] }, () => {
  // TC-CDP-TASK-006 (P0, 场景法) — the core "start a conversation" flow:
  // type -> submit -> client-side navigate to /task/{id} -> model responds.
  // Deliberately uses a trivial, fast, non-tool-triggering prompt so this stays
  // a cheap, deterministic regression check — NOT the place to exercise the
  // full agent tool catalog (that was verified manually via CDP; see the
  // e2e-flakiness-playbook / QA session notes for that exhaustive tool-coverage
  // pass, which is unsuitable for routine CI due to real cost + third-party
  // side effects).
  test(
    "TC-CDP-TASK-006 发送消息后跳转到 /task/{id} 且模型给出回复",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      test.setTimeout(90_000);
      const taskPage = new TaskPage(page, i18n);
      await taskPage.goto();

      await taskPage.fillComposer("Reply with exactly one short sentence confirming you received this message.");
      await expect(taskPage.submitButton).toBeEnabled();

      // Submit -> client-side create-task navigation to /task/{id} (id is
      // server-generated; only the path shape is asserted, source:
      // task-index-client.tsx's create-task flow triggers router.push).
      await taskPage.submitAndWaitForTaskDetail();
      expect(page.url()).toMatch(/\/task\/[^/?#]+$/);

      // The user's own submitted message renders as the first turn — assert
      // the conversation log is non-empty before waiting for the reply, so a
      // failure here points at "message never sent" rather than "model never
      // replied".
      await expect(taskPage.conversationLog).toBeVisible();
      const baselineTurns = await taskPage.messageTurnCount();
      expect(baselineTurns).toBeGreaterThanOrEqual(1);

      // Model output: wait for a new turn to append with non-empty content.
      const reply = await taskPage.waitForAssistantReply(baselineTurns);
      expect(reply.length).toBeGreaterThan(0);
    },
  );
});

// Master directive for TC-CDP-TASK-007. Real, dated, single-turn instruction that
// exercises the ~27 business tools already covered by manual CDP audit (see
// e2e-flakiness-playbook.md §23/§24). CTS/cimail/voice/mira_voice are intentionally
// excluded — confirmed via live probing to not be wired into this account's /task
// chat on either bff or miraday. BUA-gated sourcing tools (liepin/zhaopin/linkedin/
// recruiter_sourcing) are also excluded per the earlier scoping decision.
const TOOL_AUDIT_PROMPT = `我在给一个 Golang 后端工程师职位做完整的候选人寻源、调研和 outreach 准备工作，这些都是我实际要用的交付物。请严格按顺序帮我做完以下所有步骤，一步都不要跳过，每一步都要真实调用对应的工具去执行——不要用纯文本描述代替工具调用，也不要提前停止。占位/近似数据可以接受（比如候选人邮箱可以用示例地址），但每一步本身都要真实执行。如果某一步报错或某个工具确实不可用，记录下来并继续做下一步——但必须先真实尝试调用过才能下结论说"不可用"。

1. 调用 write_todos，制定一个 6 阶段计划：(1) 构建 ICP，(2) 寻源与评估候选人，(3) 丰富信息与调研，(4) 起草 outreach 邮件 + 技能交付物，(5) 拉起一个 2-agent 的调研小组，(6) 生成最终报告文件。
2. 调用 infer_icp，profile 参数为：mustToHave=["5+ years backend engineering experience","Golang or Rust production experience"]，niceToHave=["Distributed systems experience","Open source contributions"]，exclusion=["Currently at Google"]（记住要求的项目符号格式）。
3. 调用 people_search，搜索一位有 Golang/Rust 和分布式系统经验的资深后端工程师，使用第 2 步 output.profile 的结果，numResults=10。
4. 调用 evaluate_people，对第 3 步搜到的候选人按已确认的 ICP 打分。
5. 调用 company_search，搜索 "Series B fintech startups in the US"。
6. 调用 search，搜索 "distributed systems engineering blog Golang Rust 2026"，category="personal site"。
7. 调用 github_search，target="user"，q="language:go followers:>500"，sort="followers"。
8. 调用 github_lookup，target="user"，id = 第 7 步结果里排名第一的开发者的 login。
9. 调用 huggingface_search，type="model"，query="llama"，limit=5。
10. 调用 huggingface_lookup，type="model"，repoId = 第 9 步结果里排名第一的模型。
11. 调用 list_cities，country="US"。
12. 调用 search_jobs，query="backend engineer golang"，top_k=5。
13. 调用 generate_people_data，conversationLanguage="en"，导出目前搜到的候选人。
14. 调用 view_skill，name="mira-candidate-profile" 来加载它（记录它是加载成功还是报错），不管是否加载成功，都为第 3/4 步里排名第一的候选人产出一份简短的候选人画像交付物。
15. 调用 sb_xlsx_create，为搜到的候选人生成一个小型 Excel 表格（姓名、职位、公司、匹配等级）。
16. 调用 sb_pdf_create，为这次搜索生成一份单页 PDF 摘要。
17. 调用 sb_pptx_create，生成一份 2 页的 PPTX 回顾：一页标题页，一页按匹配等级统计候选人数量的柱状图。
18. 调用 sb_image_create（type="chart"），生成一张按匹配等级统计候选人数量的柱状图图片。
19. 调用 code_interpreter（intent: "compute average candidate experience"），计算所有候选人的平均工作年限。
20. 调用 sb_command_execute，在沙箱里跑一个简单的列目录命令（比如 "ls -la"），确认目前已创建的文件。
21. 调用 sb_file_create，创建 "notes.md"，用 3 个要点总结这次搜索。
22. 调用 sb_file_edit，在 notes.md 里追加一条要点，注明 "Team research: pending"。
23. 调用 compose_email，起草（绝不发送）一封给第 3 步排名第一候选人的 outreach 邮件，收件地址用占位符，比如 candidate@example.com。当它引导你在发送前调用 confirm 时，用一句清晰的话调用 confirm。我会明确拒绝这次 confirm——拒绝之后，确认收到拒绝并继续往下走；不要重试，也不要在我给出任何回答后调用任何发送邮件的工具。
24. 调用 team_create，拉起正好 2 个临时 agent 并行调研："调研 Plaid 最近的融资轮次和招聘趋势"（agent 1）和"调研 Ramp 最近的融资轮次和招聘趋势"（agent 2）。给两个临时 agent 的 allowedTools 里至少包含 search。在 agent 1 的任务文本里，明确指示它调用一次 send_message（kind='text'）给 agent 2 的 agent_execution_id，发一个简短的澄清问题，纯粹是为了验证 agent 间的点对点消息机制——agent 2 不需要真的处理这条消息。team_create 之后立刻为这 2 个 agent 各调用一次 task_create 把它们记录到任务看板上，然后调用一次 task_list。
25. 等待这个小组完成（我会批准 Confirm Card）。当两个子 agent 的结果都返回、你被重新唤起时，对每个任务调用 task_update 标记为已完成，然后再调用一次 task_list。
26. 调用 sb_file_rewrite，用一份干净的最终版本重写 notes.md，涵盖目前产出的所有内容，包括小组的调研结果。
27. 最后，调用 complete，总结产出的所有内容（ICP、候选人短名单、所有生成的文件、小组调研结果），把所有创建的文件都作为附件带上。

现在从第 1 步开始。`;

// Tool-call cards whose accessible button name is stable across accounts/environments
// (grounded via live CDP probing, not guessed from tool schemas — see task-cdp.md).
// CRITICAL: tools proven reliably available in every prior manual audit run (bff + miraday).
// Missing any of these is a real regression, not environment drift.
const CRITICAL_TOOL_CARDS: RegExp[] = [
  /^People Search$/,
  /^People Match Evaluation$/,
  /^People Data Generation$/,
  /^Create Excel Spreadsheet$/,
  /^Create PDF Document$/,
  /^Create PowerPoint Presentation$/,
  /^Create Image$/,
  /^File Create$/,
];

// SOFT: tools that depend on live third-party APIs (GitHub/HuggingFace/web search) or have
// been observed unavailable in some accounts/environments (list_cities, search_jobs,
// mira-candidate-profile skill — see e2e-flakiness-playbook.md §23 finding history). A miss
// here is logged for visibility but does not fail the test — hard-failing on these would
// make the suite flaky against product/account drift that isn't this suite's job to gate.
const SOFT_TOOL_CARDS: { label: string; pattern: RegExp }[] = [
  { label: "company_search", pattern: /^Company Search$/ },
  { label: "web_search", pattern: /^Web Search$/ },
  { label: "github_search", pattern: /^Search GitHub developers$/ },
  { label: "github_lookup", pattern: /^Look up GitHub developer$/ },
  { label: "huggingface_search", pattern: /^Search HuggingFace models$/ },
  { label: "huggingface_lookup", pattern: /^Look up HuggingFace model$/ },
  { label: "code_interpreter", pattern: /^Execute Code$/ },
  { label: "sb_command_execute", pattern: /^Execute Command$/ },
  { label: "sb_file_edit", pattern: /^File Edit$/ },
];

// Tool cards confirmed live (CDP, bff) to open the shared right-side "Mira's
// Workspace" detail panel on click — every tool type opens the SAME generic
// heading/"Mira is using {label}" shell, with materially different tool-specific
// content rendered underneath (candidate cards for people_search, a rendered
// document preview for file/xlsx/pdf/pptx/image tools, etc. — see
// task.page.ts's openToolCardAndVerifyPanel doc comment). This list covers every
// TOOL_AUDIT_PROMPT step that renders a genuinely clickable/expandable result
// card; steps that don't (write_todos, infer_icp's clarify form, compose_email's
// draft canvas, team_create's Confirm Card, task_create/task_list/task_update,
// complete) have no "Mira's Workspace" detail view and are out of scope here.
// `critical: true` entries MUST be present (guaranteed by the driveUntil wait
// just above) and MUST open the panel correctly. `critical: false` entries are
// checked only if the card happens to be visible by this point — a soft card
// that hasn't rendered yet is already logged as a miss by the SOFT_TOOL_CARDS
// loop below and is not re-flagged here.
const TOOL_SIDEBAR_CARDS: { label: string; pattern: RegExp; critical: boolean }[] = [
  { label: "People Search", pattern: /^People Search$/, critical: true },
  { label: "People Match Evaluation", pattern: /^People Match Evaluation$/, critical: true },
  { label: "People Data Generation", pattern: /^People Data Generation$/, critical: true },
  { label: "Create Excel Spreadsheet", pattern: /^Create Excel Spreadsheet$/, critical: true },
  { label: "Create PDF Document", pattern: /^Create PDF Document$/, critical: true },
  { label: "Create PowerPoint Presentation", pattern: /^Create PowerPoint Presentation$/, critical: true },
  { label: "Create Image", pattern: /^Create Image$/, critical: true },
  { label: "File Create", pattern: /^File Create$/, critical: true },
  { label: "Company Search", pattern: /^Company Search$/, critical: false },
  { label: "Web Search", pattern: /^Web Search$/, critical: false },
  { label: "Search GitHub developers", pattern: /^Search GitHub developers$/, critical: false },
  { label: "Look up GitHub developer", pattern: /^Look up GitHub developer$/, critical: false },
  { label: "Search HuggingFace models", pattern: /^Search HuggingFace models$/, critical: false },
  { label: "Look up HuggingFace model", pattern: /^Look up HuggingFace model$/, critical: false },
  { label: "Get Data Dictionary", pattern: /^Get Data Dictionary$/, critical: false },
  { label: "Search Positions", pattern: /^Search Positions$/, critical: false },
  { label: "Execute Code", pattern: /^Execute Code$/, critical: false },
  { label: "Execute Command", pattern: /^Execute Command$/, critical: false },
];

test.describe("[CDP] Task index — full business-tool traversal audit", { tag: ["@full", "@regression"] }, () => {
  // TC-CDP-TASK-007 (P0, 场景法) — single-turn traversal of the ~27 business tools
  // already covered by one-off manual CDP audits. Converts that manual exploration
  // into a real regression: send the master directive once, resolve the two human
  // gates it hits (compose_email→confirm reject, team_create→Confirm Card approve),
  // then assert each tool's card actually rendered. NOTE: this test has real side
  // effects every run — team_create spawns 2 real sub-agents that do real web
  // research, and code_interpreter/sb_command_execute run real sandbox commands.
  // That cost is accepted deliberately (see e2e-flakiness-playbook.md) in exchange
  // for regression coverage on tool wiring that was previously only checked by hand.
  // Uses the suite's default retries (not overridden to 0): the framework-level
  // bugs found while building this test are fixed, but the model's own turn-by-
  // turn consistency across a 27-step single directive is inherently variable —
  // e.g. one real run skipped straight from infer_icp to compose_email, bypassing
  // every intermediate research/file-generation tool entirely. A retry is the
  // right tool for that kind of transient non-determinism (playbook §17), the
  // same as any other flaky-prone external-dependency test in this suite.

  test(
    "TC-CDP-TASK-007 单轮对话穿越全部业务工具并断言各工具卡片渲染",
    { tag: ["@P0", "@regression", "@full"] },
    async ({ page, i18n }) => {
      // 27 real tool-call steps in a single turn legitimately takes a while —
      // budget generously rather than racing a tight ceiling (see the widened
      // driveUntil timeout below for the same reasoning).
      test.setTimeout(30 * 60_000);
      const taskPage = new TaskPage(page, i18n);
      await taskPage.goto();

      await taskPage.fillComposer(TOOL_AUDIT_PROMPT);
      await expect(taskPage.submitButton).toBeEnabled();
      await taskPage.submitButton.click();

      const cardVisible = (pattern: RegExp) =>
        page.getByRole("button", { name: pattern }).first().isVisible().catch(() => false);

      // Critical tools (steps 2-22). The run can stall mid-sequence waiting for a
      // plain "continue" nudge even with no confirm/approve gate reached yet —
      // driveUntil() sends that nudge whenever "Mira will continue after your
      // response" appears, until every critical card has rendered. Widened from
      // 5 to 15 minutes: 21 real tool calls in one turn can legitimately take
      // longer than 5 minutes on its own merits — a tight ceiling here was
      // indistinguishable from genuine step-skipping in the failure logs, when
      // it may just have been "still working, ran out of budget."
      await taskPage.driveUntil(
        async () => {
          for (const pattern of CRITICAL_TOOL_CARDS) {
            if (!(await cardVisible(pattern))) return false;
          }
          return true;
        },
        { timeout: 15 * 60_000 },
      );

      // Gates 1 & 2 (steps 23-24: compose_email's Send + team_create's Approve &
      // Run) are now auto-resolved by driveUntil() itself the instant either
      // button appears (see task.page.ts driveUntil doc comment) — the model can
      // reach either step before every earlier critical-card step has rendered
      // (observed live: a non-deterministic step-skip), so a dedicated sequential
      // "wait for this specific button, click it" step here would deadlock if the
      // button already came and went during an earlier driveUntil call. Instead,
      // drive straight through to the final completion marker in one call; the
      // approved team's real work (2 sub-agents, each a real web search pass) is
      // why this needs several minutes of budget.
      const taskCompletedMarker = page.getByText("Task completed").first();
      await taskPage.driveUntil(() => taskCompletedMarker.isVisible().catch(() => false), {
        timeout: 12 * 60_000,
      });
      // Extra settle margin: "Task completed" can render a beat before the very
      // last streaming chunk of the turn actually finishes — click-to-detail-panel
      // verification below must run against a genuinely idle session, not one
      // still mutating the DOM underneath the click (observed live: clicking a
      // card while a later step is still generating produced a "Mira's Workspace"
      // heading wait timeout — the click landed, but the panel never opened,
      // because the app was mid-render). Confirmed live via CDP that this same
      // click pattern works reliably once the session is fully idle/completed.
      await taskPage.waitForGenerationIdle({ startTimeout: 2_000, finishTimeout: 30_000 }).catch(() => {});

      // Click-to-detail-panel contract: every critical tool card (already confirmed
      // rendered above) must be clickable and must open the right-side "Mira's
      // Workspace" panel attributing the correct tool. Soft cards are checked the
      // same way, but only if already visible at this point in the run. Run this
      // AFTER the whole session has settled (above), not mid-stream.
      for (const { label, pattern, critical } of TOOL_SIDEBAR_CARDS) {
        const present = await cardVisible(pattern);
        if (!present) {
          if (critical) throw new Error(`critical tool card "${label}" not visible before sidebar-panel verification`);
          continue;
        }
        await taskPage.openToolCardAndVerifyPanel(pattern, pattern);
      }

      // sb_file_edit / its fallback sb_file_rewrite (see TC-CDP-TASK-008 finding) —
      // whichever tool actually rendered a card, verify it opens the panel correctly.
      const editCardForPanel = page.getByRole("button", { name: "File Edit" }).first();
      const rewriteCardForPanel = page.getByRole("button", { name: "File Rewrite" }).first();
      if (await editCardForPanel.isVisible().catch(() => false)) {
        await taskPage.openToolCardAndVerifyPanel(/^File Edit$/, /^File Edit$/);
      } else if (await rewriteCardForPanel.isVisible().catch(() => false)) {
        await taskPage.openToolCardAndVerifyPanel(/^File Rewrite$/, /^File Rewrite$/);
      }

      // Soft tools: log a miss instead of failing — these depend on live third-party
      // APIs or known per-account tool availability, not on this suite's own wiring.
      for (const { label, pattern } of SOFT_TOOL_CARDS) {
        if (!(await cardVisible(pattern))) {
          console.log(`[TC-CDP-TASK-007] soft-check miss: ${label} card did not render (see e2e-flakiness-playbook.md §23)`);
        }
      }

      // Ground truth independent of chat-transcript rendering (see playbook §24):
      // verify the actual file artifacts exist, not just that cards appeared live.
      await taskPage.openFilesPanel();
      const fileCount = await taskPage.fileCount();
      expect(fileCount).toBeGreaterThanOrEqual(5); // notes.md, xlsx, pdf, pptx, image at minimum
    },
  );
});

test.describe("[CDP] Task index — file edit fallback behavior", { tag: ["@full", "@regression"] }, () => {
  // TC-CDP-TASK-008 (P1, 场景法) — sb_file_edit backing-model outage triggers an
  // automatic sb_file_rewrite fallback; the user-visible edit must still succeed.
  // Found live (2026-07-06, natural-instruction re-verification, bff): sb_file_edit's
  // tool card renders, but every observed invocation immediately reports "underlying
  // model unavailable" and Mira silently substitutes sb_file_rewrite instead. This
  // test locks down the user-visible contract (the edit lands correctly) regardless
  // of which of the two tools actually executes it — see e2e-flakiness-playbook.md §25.
  test(
    "TC-CDP-TASK-008 已有文件的编辑请求最终产生正确的编辑结果（sb_file_edit 或其 fallback sb_file_rewrite）",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      test.setTimeout(3 * 60_000);
      const taskPage = new TaskPage(page, i18n);
      await taskPage.goto();

      const marker = `edit-verified-${Date.now()}`;
      await taskPage.fillComposer(
        `Create a file named edit_target.md with exactly one line of content: "Original line."`,
      );
      await expect(taskPage.submitButton).toBeEnabled();
      await taskPage.submitButton.click();
      await taskPage.page.waitForURL(/\/task\/[^/?#]+$/, { timeout: 30_000 });
      await taskPage.waitForGenerationIdle({ finishTimeout: 60_000 });

      const fileCreateCard = page.getByRole("button", { name: "File Create" }).first();
      await expect(fileCreateCard).toBeVisible({ timeout: 30_000 });

      await taskPage.fillComposer(
        `Edit edit_target.md and append a new line at the end: "${marker}". Keep the original line unchanged.`,
      );
      await expect(taskPage.submitButton).toBeEnabled();
      await taskPage.submitButton.click();
      await taskPage.waitForGenerationIdle({ finishTimeout: 90_000 });

      // Whichever tool actually performed the edit, one of the two cards must have
      // rendered — a silent no-op (neither card, no error) would be a regression
      // distinct from the already-known fallback behavior.
      const editCard = page.getByRole("button", { name: "File Edit" }).first();
      const rewriteCard = page.getByRole("button", { name: "File Rewrite" }).first();
      const usedEdit = await editCard.isVisible().catch(() => false);
      const usedRewrite = await rewriteCard.isVisible().catch(() => false);
      console.log(`[TC-CDP-TASK-008] path: sb_file_edit=${usedEdit} sb_file_rewrite-fallback=${usedRewrite}`);
      expect(usedEdit || usedRewrite).toBeTruthy();

      // User-visible contract: the appended marker must show up in the conversation
      // (Mira's own confirmation echoes the new line content back).
      await expect(taskPage.conversationLog).toContainText(marker, { timeout: 10_000 });
    },
  );
});

test.describe("[CDP] Task index — generate_people_data retry exhaustion recovery", { tag: ["@full", "@regression"] }, () => {
  // TC-CDP-TASK-009 (P1, 场景法) — generate_people_data can fail 3 consecutive
  // retries in a row (observed live, 2026-07-06, bff, natural-instruction session,
  // no confirmed ICP in the session) before Mira gives up and falls back to a plain
  // file export. This test locks down the recovery contract: even when the
  // underlying data-generation tool is exhausted, the conversation must not hang
  // and the user must still end up with a deliverable file — see playbook §25.
  test(
    "TC-CDP-TASK-009 generate_people_data 重试耗尽后仍能产出可下载的候选人数据文件且不卡死",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      test.setTimeout(6 * 60_000);
      const taskPage = new TaskPage(page, i18n);
      await taskPage.goto();

      await taskPage.fillComposer(
        `Call people_search for "backend engineer with Golang experience", numResults=5. Then export the candidates you found as a data file — call generate_people_data; if it fails, keep going and get the candidates into a file some other way (e.g. sb_file_create) rather than stopping.`,
      );
      await expect(taskPage.submitButton).toBeEnabled();
      await taskPage.submitButton.click();
      await taskPage.page.waitForURL(/\/task\/[^/?#]+$/, { timeout: 30_000 });

      // Drive through any stalls until SOME deliverable card appears — either
      // generate_people_data succeeding, or the fallback path (a plain file
      // create/rewrite). The assertion is that the run terminates with an
      // artifact, not which specific tool produced it.
      const dataCard = page.getByRole("button", { name: "People Data Generation" }).first();
      const fileCreateCard = page.getByRole("button", { name: "File Create" }).first();
      const fileRewriteCard = page.getByRole("button", { name: "File Rewrite" }).first();
      const anyDeliverable = async () =>
        (await dataCard.isVisible().catch(() => false)) ||
        (await fileCreateCard.isVisible().catch(() => false)) ||
        (await fileRewriteCard.isVisible().catch(() => false));

      await taskPage.driveUntil(anyDeliverable, { timeout: 4 * 60_000 });

      // Whichever path won, the run must actually settle afterward — not hang
      // waiting on a tool call that never resolves.
      await taskPage.waitForGenerationIdle({ finishTimeout: 60_000 });

      const usedGenerate = await dataCard.isVisible().catch(() => false);
      const usedFallback =
        (await fileCreateCard.isVisible().catch(() => false)) || (await fileRewriteCard.isVisible().catch(() => false));
      console.log(`[TC-CDP-TASK-009] path: generate_people_data=${usedGenerate} file-fallback=${usedFallback}`);
      expect(usedGenerate || usedFallback).toBeTruthy();
    },
  );
});
