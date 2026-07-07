// source: cdp
// baseline: test-cases/generated/page-baseline-task.json
// generated: 2026-07-03T00:00:00Z
//
// Source: read from D:\code\mira
//   apps/mira-work/app/(agent)/task/task-index-content.tsx  (h1 = t("welcome") in "dashboard" ns; renders TaskIndexInput + Suspense<ScenarioCardsData>)
//   apps/mira-work/app/(agent)/task/task-index-client.tsx    (TaskIndexInput wraps TaskInput; TaskIndexCards.handleCardSelect → sharedTaskInputRef.fillText(description), NO navigate / NO submit)
//   apps/mira-work/features/task/components/task-input.tsx   (RichInput = TipTap contentEditable role=textbox, placeholder chatbot.placeholder; SubmitButton disabled when !hasContent)
//   apps/mira-work/components/scenario-cards.tsx             (ScenarioCards: <p>{t("tryScenarios")}</p> + desktop grid `sm:grid-cols-2` of <button> cards; onClick → onSelect(caseId, description))
//   messages/en.json → dashboard.welcome, dashboard.tryScenarios, chatbot.placeholder
//
// Locator strategy (hasTestIds=false, dominantStrategy=role+name):
//   • Composer is a TipTap RichInput (contentEditable) exposing role=textbox — the only textbox on /task.
//   • Submit is PromptInputSubmit with a hardcoded aria-label "Submit".
//   • Scenario cards: the desktop grid is `[class*="grid-cols-2"]` scoped under the "Try these scenarios"
//     region (avoids the sm:hidden mobile carousel duplicates + slide-indicator buttons). Semantic anchor
//     on the i18n label + a class-fragment match (not a full utility-class chain, per playbook Pattern 3).
//   • hydration-readiness (playbook §19b): goto() waits for the h1 visible, then networkidle — this
//     deployment SSRs the skeleton before React hydrates; interacting too early can silently no-op.
//
// NOTE: ported from the mira-test sibling project (same app, same source, different
// environment) to bring miraday's TaskPage POM up to parity for TC-CDP-TASK-006~009.

import { expect, type Locator, type Page } from "@playwright/test";
import type { I18n } from "../fixtures";

const KEYS = {
  welcome: "dashboard.welcome",
  tryScenarios: "dashboard.tryScenarios",
} as const;

export class TaskPage {
  readonly page: Page;
  private readonly i18n?: I18n;

  // ── Main composer region (S0) ─────────────────────────────────────────────
  private readonly _heading: Locator;
  private readonly _composer: Locator;
  private readonly _submitButton: Locator;

  // ── Scenario cards region ──────────────────────────────────────────────────
  private readonly _tryScenariosLabel: Locator;
  private readonly _scenarioCards: Locator;

  // ── Task detail page (after submit → /task/{id}) ────────────────────────────
  private readonly _conversationLog: Locator;
  private readonly _messageTurns: Locator;

  constructor(page: Page, i18n?: I18n) {
    this.page = page;
    this.i18n = i18n;

    const welcomeText = this.t(KEYS.welcome, "What can I do for you?");
    const tryScenariosText = this.t(KEYS.tryScenarios, "Try these scenarios");

    this._heading = page.getByRole("heading", { name: welcomeText, level: 1 });
    // Scoped to [contenteditable] specifically (not just role=textbox): once a
    // compose_email draft canvas is open, its Subject <input> and Body <textarea>
    // are ALSO role=textbox, and a bare getByRole("textbox") becomes ambiguous
    // (Playwright strict-mode error) — see TC-CDP-TASK-007 failure history.
    // The main composer is a TipTap RichInput div — the only contenteditable on
    // /task, EXCEPT a second identical .tiptap instance also exists in the DOM
    // once a task session is active (same class of mobile/desktop duplicate as
    // the scenario cards below) — ":visible" picks the one actually on screen.
    this._composer = page.locator('[contenteditable="true"][role="textbox"]:visible');
    this._submitButton = page.getByRole("button", { name: "Submit" });

    this._tryScenariosLabel = page.getByText(tryScenariosText, { exact: true });
    // Desktop scenario grid scoped under the ScenarioCards root (parent of the label <p>).
    // `> button` = the 4 visible card buttons; excludes mobile carousel dupes + slide indicators.
    this._scenarioCards = this._tryScenariosLabel
      .locator("xpath=..")
      .locator('[class*="grid-cols-2"] > button');

    // On the task detail page (/task/{id}), messages render in an accessible
    // log region; each turn (user or assistant) is its own role="article" child
    // (CDP-verified: 6 articles for a 3-round exchange — no data-testid exists,
    // this is the most stable available structural marker).
    this._conversationLog = page.getByRole("log", { name: "Conversation messages" });
    this._messageTurns = this._conversationLog.getByRole("article");
  }

  /** i18n-aware label resolver with an English fallback (single-locale project). */
  private t(key: string, fallback: string): string {
    const v = this.i18n?.t(key);
    return v && v !== key ? v : fallback;
  }

  // ── Public getters ──────────────────────────────────────────────────────
  get heading(): Locator { return this._heading; }
  get composer(): Locator { return this._composer; }
  get submitButton(): Locator { return this._submitButton; }
  get tryScenariosLabel(): Locator { return this._tryScenariosLabel; }
  get scenarioCards(): Locator { return this._scenarioCards; }
  get conversationLog(): Locator { return this._conversationLog; }
  get messageTurns(): Locator { return this._messageTurns; }

  /** First (visible) desktop scenario card. */
  get firstScenarioCard(): Locator { return this._scenarioCards.first(); }

  // ── Actions ───────────────────────────────────────────────────────────────
  /** Open /task (authenticated). Waits for hydration before returning. */
  async goto(): Promise<void> {
    await this.page.goto("/task");
    // Wait for the welcome heading to render...
    await this._heading.waitFor({ state: "visible", timeout: 20_000 });
    // ...then a hydration-readiness proxy — SSR renders the skeleton before React
    // attaches handlers; fill()/click() too early can silently no-op. See
    // e2e-flakiness-playbook.md §19b. /task has only one-shot fetches (no polling),
    // so networkidle is an adequate settle signal.
    await this.page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    // Composer must be interactive before any test touches it.
    await this._composer.waitFor({ state: "visible", timeout: 15_000 });
  }

  /** Type text into the composer (RichInput contentEditable). */
  async fillComposer(text: string): Promise<void> {
    await this._composer.fill(text);
  }

  /** Clear the composer back to empty. */
  async clearComposer(): Promise<void> {
    await this._composer.fill("");
  }

  /** Plain-text content of the composer (RichInput has no input value; read text). */
  async composerText(): Promise<string> {
    return (await this._composer.textContent())?.trim() ?? "";
  }

  /** Click the first scenario card (fills the composer with the card's description; no navigation). */
  async clickFirstScenarioCard(): Promise<void> {
    await this._scenarioCards.first().click();
  }

  /** Number of desktop scenario cards rendered. */
  async scenarioCardCount(): Promise<number> {
    return this._scenarioCards.count();
  }

  /**
   * Submit the composer and wait for the client-side navigation to the new
   * task detail route (/task/{id}, source: task-index-client.tsx's create-task
   * flow — id is server-generated, so only the path shape is asserted).
   */
  async submitAndWaitForTaskDetail(): Promise<void> {
    await this._submitButton.click();
    await this.page.waitForURL(/\/task\/[^/?#]+$/, { timeout: 30_000 });
  }

  /** Number of message turns (user + assistant) currently rendered in the log. */
  async messageTurnCount(): Promise<number> {
    return this._messageTurns.count();
  }

  /**
   * Wait until the log has grown past `baselineCount` turns AND the newest
   * turn has non-empty text — i.e. the assistant has actually replied, not
   * just echoed the user's own submitted message back as turn 1.
   *
   * Waits for generation to genuinely finish first (see waitForGenerationIdle)
   * rather than relying on a fixed timeout to guess when streaming is done —
   * the subsequent assertions then just confirm the already-settled state,
   * so this normally resolves in whatever time the reply actually took, not
   * however long we happened to budget for it.
   */
  async waitForAssistantReply(baselineCount: number, timeout = 60_000): Promise<string> {
    await this.waitForGenerationIdle({ finishTimeout: timeout });
    await expect(this._messageTurns).toHaveCount(baselineCount + 1, { timeout: 5_000 });
    const lastTurn = this._messageTurns.last();
    await expect(lastTurn).not.toHaveText("", { timeout: 5_000 });
    return (await lastTurn.textContent())?.trim() ?? "";
  }

  /**
   * Deterministic "is Mira still generating" signal, confirmed via live DOM
   * probing (not guessed from CSS): the Submit button's `disabled` attribute
   * stays `true` in BOTH the idle state (composer empty) and the actively-
   * streaming state, so it is USELESS for detecting completion on its own.
   * The button's icon, however, reliably swaps to a spinning loader
   * (`lucide-loader-circle` + `animate-spin`) while streaming and reverts to
   * the plain `lucide-arrow-up` icon the instant generation finishes — that
   * icon swap is the real signal, not the disabled flag and not a fixed wait.
   *
   * Two-phase: first best-effort wait for the spinner to appear (skipped if a
   * very fast reply already finished before we could observe it starting),
   * then wait for it to disappear — that second wait is what actually blocks
   * until generation is done.
   */
  async waitForGenerationIdle(opts: { startTimeout?: number; finishTimeout?: number } = {}): Promise<void> {
    const { startTimeout = 15_000, finishTimeout = 120_000 } = opts;
    // :visible, not .first() — there are two Submit buttons in the DOM (the same
    // mobile/desktop duplicate pattern as the composer elsewhere in this file);
    // .first() risks always resolving to the hidden one, which would report
    // "hidden" trivially without ever having observed the real spinner.
    const spinner = this.page.locator('button[aria-label="Submit"] svg.animate-spin:visible');
    await spinner.waitFor({ state: "visible", timeout: startTimeout }).catch(() => {});
    await spinner.waitFor({ state: "hidden", timeout: finishTimeout });
  }

  // ── Tool-traversal audit helpers (TC-CDP-TASK-007) ──────────────────────
  // Source: live CDP probing against bff (see e2e-flakiness-playbook.md §23/§24
  // context) — confirmed real button text, not guessed from tool schemas.

  /**
   * Long multi-step directives can pause mid-sequence with "Mira will continue
   * after your response" even with no confirm/approve gate actually reached —
   * observed live: the run stalled right after `write_todos` (step 1 of 27)
   * waiting for a plain continuation nudge. Drives the conversation forward by
   * polling `until` and, whenever stalled, sending a "continue" message.
   */
  async driveUntil(
    until: () => Promise<boolean>,
    opts: { timeout?: number; pollInterval?: number; nudgeText?: string } = {},
  ): Promise<void> {
    const {
      timeout = 240_000,
      pollInterval = 5_000,
      nudgeText = "Continue with the remaining steps now, in order, without stopping again unless a tool itself requires a confirm/approve action from me.",
    } = opts;
    const deadline = Date.now() + timeout;
    let lastNudge = 0;
    const stalledMarker = this.page.getByText("Mira will continue after your response").last();
    const icpAcceptBtn = this.page.getByRole("button", { name: /^(Accept|Search)$/ }).first();
    // exact: true is required here — Playwright's default name match is a
    // case-insensitive substring, and "No" would otherwise match the
    // ever-present "Browser extension not detected — click to install" button
    // ("not" contains "no"), permanently registering as a false "dialog open"
    // and silently suppressing every nudge for the rest of the run.
    const emailNoBtn = this.page.getByRole("button", { name: "No", exact: true }).first();
    const emailYesBtn = this.page.getByRole("button", { name: "Yes", exact: true }).first();
    const teamApproveBtn = this.page.getByRole("button", { name: "Approve & Run", exact: true }).first();
    // The compose_email draft canvas renders its own "Send" button — a form
    // waiting for a real click, exactly like the confirm/approve gates above.
    // A plain-text "continue" nudge does nothing useful here (observed live:
    // sending one while this button is showing derails the model into
    // re-generating instead of waiting for the click) — it must be treated as
    // a blocking dialog the same way, not as a stall to nudge past.
    const emailSendBtn = this.page.getByRole("button", { name: "Send", exact: true }).first();
    while (Date.now() < deadline) {
      if (await until()) return;
      // Opportunistically clear the ICP accept/confirm gate on every iteration, not
      // just once up front — infer_icp re-renders this same unconfirmed card on every
      // retry if it's never clicked (observed live: the model treats an ICP it never
      // got a confirmed output for as still-pending, and just re-calls infer_icp
      // again on each "continue" nudge instead of moving forward — an infinite loop
      // if this gate is only checked before the loop starts).
      // Bounded — an unbounded click on a visible-but-unactionable target would
      // otherwise hang this single await for the rest of the test's budget (the
      // same class of bug already fixed for the nudge click below).
      if (await icpAcceptBtn.isVisible().catch(() => false)) {
        await icpAcceptBtn.click({ timeout: 10_000 }).catch(() => {});
      }
      // Auto-resolve the compose_email Send gate and the team_create approval
      // gate the instant either appears, regardless of which driveUntil call is
      // currently active (critical-cards wait, a later gate wait, etc.) — the
      // model can reach step 23/24 before every earlier critical-card step has
      // rendered (observed live: a non-deterministic step-skip past several
      // research/file tools straight to compose_email). If driveUntil merely
      // refused to nudge past a real Send/Approve button without ever clicking
      // it (correct — a text nudge is not a valid answer to either), the run
      // would deadlock: the call site that's supposed to click it never gets
      // control back until ITS OWN condition is met, which depends on steps the
      // model already skipped past. Safe to resolve unconditionally here — we
      // NEVER want a real email sent regardless of call site, and team_create
      // is meant to be approved exactly once whenever it appears.
      if (await emailSendBtn.isVisible().catch(() => false)) {
        await emailSendBtn.click({ timeout: 10_000 }).catch(() => {});
        await this.rejectConfirmDialog(15_000).catch(() => {});
      }
      if (await teamApproveBtn.isVisible().catch(() => false)) {
        await teamApproveBtn.click({ timeout: 10_000 }).catch(() => {});
      }
      // A live Yes/No dialog from some OTHER confirm-tool call (not the two
      // handled above) still needs an explicit answer this loop doesn't know
      // how to give — treat it as blocking so we don't nudge past it, even
      // though nothing here resolves it. The caller is responsible for those.
      const blockingDialogOpen =
        (await emailNoBtn.isVisible().catch(() => false)) ||
        (await emailYesBtn.isVisible().catch(() => false)) ||
        (await teamApproveBtn.isVisible().catch(() => false)) ||
        (await emailSendBtn.isVisible().catch(() => false));
      // Never nudge while Mira is actively generating (see waitForGenerationIdle
      // for how this signal was confirmed live) — the "Mira will continue..."
      // text is only expected once a turn has genuinely ended, but this is cheap
      // insurance against sending a redundant/interrupting message mid-stream.
      const generating = await this.page
        .locator('button[aria-label="Submit"] svg.animate-spin:visible')
        .first()
        .isVisible()
        .catch(() => false);
      const stalled = !blockingDialogOpen && !generating && (await stalledMarker.isVisible().catch(() => false));
      if (process.env.DRIVE_UNTIL_DEBUG) {
        console.log(
          `[driveUntil] icpVisible=${await icpAcceptBtn.isVisible().catch(() => "err")} ` +
            `blockingDialogOpen=${blockingDialogOpen} generating=${generating} stalled=${stalled} ` +
            `sinceLastNudge=${Date.now() - lastNudge}ms elapsed=${Date.now() - (deadline - timeout)}ms`,
        );
      }
      // Fill FIRST, then click — the composer is empty while stalled (the previous
      // submit already cleared it), so checking submitButton.isEnabled() before
      // filling always sees it disabled and the nudge silently never fires.
      // Bounded with a short explicit timeout on the click: a hung actionability
      // retry here (observed live — target re-rendering mid-click) would otherwise
      // block this single await for the rest of the test's overall budget, since
      // the outer while-loop can't re-check its own deadline until this line returns.
      if (stalled && Date.now() - lastNudge > 10_000) {
        try {
          await this.fillComposer(nudgeText);
          await this._submitButton.click({ timeout: 10_000 });
        } catch {
          // transient UI race (element replaced mid-click, etc.) — next iteration retries.
        }
        lastNudge = Date.now();
      }
      await this.page.waitForTimeout(pollInterval);
    }
    throw new Error(`driveUntil: condition not met within ${timeout}ms`);
  }

  /**
   * The generic `confirm` tool dialog — heading "Confirmation needed", buttons
   * "Yes" / "No". Verifies the click actually registered (the button disappearing
   * once answered) and retries once — observed live: a click can silently fail to
   * register without throwing, leaving the dialog open and unanswered.
   */
  async rejectConfirmDialog(timeout = 30_000): Promise<void> {
    const noBtn = this.page.getByRole("button", { name: "No", exact: true }).first();
    await noBtn.waitFor({ state: "visible", timeout });
    await noBtn.click({ timeout: 10_000 });
    const answered = await noBtn.waitFor({ state: "hidden", timeout: 15_000 }).then(() => true).catch(() => false);
    if (!answered) await noBtn.click({ timeout: 10_000 }); // one retry if the first click didn't stick
  }

  async approveConfirmDialog(timeout = 30_000): Promise<void> {
    const yesBtn = this.page.getByRole("button", { name: "Yes", exact: true }).first();
    await yesBtn.waitFor({ state: "visible", timeout });
    await yesBtn.click({ timeout: 10_000 });
    const answered = await yesBtn.waitFor({ state: "hidden", timeout: 15_000 }).then(() => true).catch(() => false);
    if (!answered) await yesBtn.click({ timeout: 10_000 });
  }

  /** The team_create Confirm Card — heading "Agent Team needed", buttons "Approve & Run" / "Cancel". */
  async approveAgentTeam(timeout = 60_000): Promise<void> {
    const approveBtn = this.page.getByRole("button", { name: "Approve & Run", exact: true }).first();
    await approveBtn.waitFor({ state: "visible", timeout });
    await approveBtn.click({ timeout: 10_000 });
    const answered = await approveBtn.waitFor({ state: "hidden", timeout: 15_000 }).then(() => true).catch(() => false);
    if (!answered) await approveBtn.click({ timeout: 10_000 });
  }

  /** Open the "View all files in this task" panel. */
  async openFilesPanel(): Promise<void> {
    await this.page.getByRole("button", { name: /View all files/ }).first().click();
  }

  /** Count of file rows currently listed in the (already-open) files panel. */
  async fileCount(): Promise<number> {
    return this.page.getByRole("button", { name: "Download file" }).count();
  }

  // ── Tool-card side panel ("Mira's Workspace") ────────────────────────────
  // Source: messages/en.json `workspace` namespace (title/usingTool) — every tool
  // result card, regardless of tool type, opens the SAME generic right-side panel
  // shell on click (heading "Mira's Workspace" + "Mira is using {tool}"), with the
  // tool-specific content (candidate cards for people_search, document preview for
  // file tools, spreadsheet/slide preview for sb_xlsx/pptx_create, etc.) rendered
  // beneath that shared shell. Confirmed live via CDP on bff: clicking "People
  // Search" and "File Create" cards both produce this same heading/using-text
  // pattern with materially different content underneath.

  /** The "Mira's Workspace" panel heading — visible whenever the side panel is open. */
  get workspacePanelHeading(): Locator {
    return this.page.getByRole("heading", { name: "Mira's Workspace", level: 2 });
  }

  /**
   * Click a rendered tool-result card (by its accessible name) and verify the
   * right-side "Mira's Workspace" panel opens attributing the correct tool —
   * i.e. "Mira is using {toolLabel}" appears, not just that *some* panel opened.
   * Deliberately does NOT assert on the tool-specific content shape underneath
   * (candidate list vs. document preview vs. spreadsheet grid, etc.) — that
   * varies per tool and is exercised implicitly by the fact that a real
   * tool call produced this card in the first place; the contract this method
   * locks down is "the card is clickable and attributes the panel correctly."
   */
  async openToolCardAndVerifyPanel(cardPattern: RegExp, toolLabelPattern: RegExp, timeout = 15_000): Promise<void> {
    const card = this.page.getByRole("button", { name: cardPattern }).first();
    await card.click({ timeout });
    await this.workspacePanelHeading.waitFor({ state: "visible", timeout });
    await expect(this.page.getByText("Mira is using").last()).toBeVisible({ timeout: 5_000 });
    await expect(this.page.getByText(toolLabelPattern).last()).toBeVisible({ timeout: 5_000 });
  }
}
