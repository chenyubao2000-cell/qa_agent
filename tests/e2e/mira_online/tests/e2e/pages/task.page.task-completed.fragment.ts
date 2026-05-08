// POM fragment: task-completed page actions (followup, rename-inline, more-menu, credits, message-copy)
// Merge target: tests/e2e/pages/task.page.ts
// Source:
//   - components/ai-elements/suggested-follow-ups.tsx
//   - features/task/components/task-header.tsx (pen-line, ellipsis, taskDetails popover)
//   - features/task/components/rename-task-dialog.tsx
//   - components/layout/credits-pill.tsx (CreditsPill on /task NEW page)
//   - features/task/components/message-item.tsx (user-message copy button)
// generated: 2026-04-28T00:00:00Z

import { type Page, type Locator } from "@playwright/test";
import type { I18n } from "../fixtures";
import { i18nRegex } from "../i18n-helpers";

export class TaskCompletedFragment {
  private readonly page: Page;
  private readonly i18n?: I18n;

  // ── Top-bar (task-header.tsx) ──
  private readonly topbarTaskTitleSpan: Locator; // span containing current title
  private readonly topbarTitleContainer: Locator; // group container (hover target)
  private readonly penLineBtn: Locator;
  private readonly ellipsisBtn: Locator;

  // ── Rename dialog (rename-task-dialog.tsx) ──
  private readonly renameDialog: Locator;
  private readonly renameDialogHeading: Locator;
  private readonly renameInput: Locator;
  private readonly renameSaveBtn: Locator;
  private readonly renameCancelBtn: Locator;

  // ── More menu (DropdownMenu) ──
  private readonly moreMenu: Locator;
  private readonly taskDetailsMenuItem: Locator;

  // ── Task details popover (Popover) ──
  private readonly taskDetailsPopover: Locator;
  private readonly taskDetailsTitleLabel: Locator;
  private readonly taskDetailsCreditsLabel: Locator;
  private readonly taskDetailsCreatedTimeLabel: Locator;
  private readonly taskDetailsClosePopoverBtn: Locator;

  // ── Credits Pill (only on /task NEW page) ──
  private readonly creditsPill: Locator;

  // ── Suggested follow-ups (ai-elements/suggested-follow-ups.tsx) ──
  // Header text "推荐追问" / "Suggested follow-ups" / "Suggestions de suivi"
  private readonly suggestedFollowUpsHeader: Locator;
  // Each follow-up: a Button containing an ArrowRight (lucide-arrow-right) icon
  // outside the chat log
  private readonly followUpButtons: Locator;

  // ── Conversation log (already in main POM via getChatLog, repeated for scope) ──
  private readonly chatLog: Locator;
  // user messages: parent .group with .is-user
  private readonly userMessages: Locator;
  // assistant messages: parent .group :not(.is-user)
  private readonly assistantMessages: Locator;
  // copy button on first user message
  private readonly userMessageCopyBtn: Locator;
  // copy buttons inside assistant message containers (negative-test fixture)
  private readonly assistantCopyButtons: Locator;
  // sidebar active task menu button (used by rename TC-004 to verify sidebar update)
  private readonly sidebarActiveTaskBtn: Locator;

  // ── Task input (re-used across areas) ──
  private readonly mainTextarea: Locator;

  constructor(page: Page, i18n?: I18n) {
    this.page = page;
    this.i18n = i18n;

    // Top-bar elements: scoped to <header> tag in task-header.tsx
    // The title container is the inline `group` div surrounding title + pen-line
    this.topbarTitleContainer = page
      .locator("header div.group")
      .first();
    this.topbarTaskTitleSpan = this.topbarTitleContainer
      .locator("span.truncate")
      .first();
    this.penLineBtn = page
      .locator("header button:has(svg.lucide-pen-line)")
      .first();
    this.ellipsisBtn = page
      .locator("header button:has(svg.lucide-ellipsis)")
      .first();

    // Rename dialog (Radix Dialog with chatbot.editTitle heading)
    // Use a scope filter on heading so we don't collide with share dialog
    this.renameDialog = page
      .locator('[role="dialog"]')
      .filter({
        has: page.getByRole("heading", {
          name: i18n
            ? new RegExp(`^${i18n.t("chatbot.editTitle")}$`, "i")
            : i18nRegex("chatbot.editTitle", { exact: true }),
        }),
      })
      .first();
    this.renameDialogHeading = this.renameDialog.getByRole("heading", {
      name: i18n
        ? new RegExp(`^${i18n.t("chatbot.editTitle")}$`, "i")
        : i18nRegex("chatbot.editTitle", { exact: true }),
    });
    this.renameInput = this.renameDialog.locator("input#task-name").first();
    this.renameSaveBtn = this.renameDialog.getByRole("button", {
      name: i18n
        ? new RegExp(`^${i18n.t("chatbot.save")}$`, "i")
        : i18nRegex("chatbot.save", { exact: true }),
    });
    this.renameCancelBtn = this.renameDialog.getByRole("button", {
      name: i18n
        ? new RegExp(`^${i18n.t("chatbot.cancel")}$`, "i")
        : i18nRegex("chatbot.cancel", { exact: true }),
    });

    // Dropdown menu (Radix DropdownMenu — role=menu)
    this.moreMenu = page.locator('[role="menu"]').first();
    this.taskDetailsMenuItem = page.getByRole("menuitem", {
      name: i18n
        ? new RegExp(`^${i18n.t("chatbot.taskDetails")}$`, "i")
        : i18nRegex("chatbot.taskDetails", { exact: true }),
    });

    // Task details popover (Radix Popover — content has its own taskDetails text but
    // is NOT a [role='menu']; locate by stable structure: contains chatbot.taskDetails
    // header AND chatbot.creditsConsumed label).
    this.taskDetailsPopover = page
      .locator("[data-radix-popper-content-wrapper] > *, [data-slot='popover-content']")
      .filter({
        has: page.getByText(
          i18n
            ? new RegExp(`^${i18n.t("chatbot.creditsConsumed")}$`, "i")
            : i18nRegex("chatbot.creditsConsumed", { exact: true }),
        ),
      })
      .first();
    this.taskDetailsTitleLabel = this.taskDetailsPopover.getByText(
      i18n
        ? new RegExp(`^${i18n.t("chatbot.taskTitle")}$`, "i")
        : i18nRegex("chatbot.taskTitle", { exact: true }),
    );
    this.taskDetailsCreditsLabel = this.taskDetailsPopover.getByText(
      i18n
        ? new RegExp(`^${i18n.t("chatbot.creditsConsumed")}$`, "i")
        : i18nRegex("chatbot.creditsConsumed", { exact: true }),
    );
    this.taskDetailsCreatedTimeLabel = this.taskDetailsPopover.getByText(
      i18n
        ? new RegExp(`^${i18n.t("chatbot.createdTime")}$`, "i")
        : i18nRegex("chatbot.createdTime", { exact: true }),
    );
    this.taskDetailsClosePopoverBtn = this.taskDetailsPopover
      .locator("button:has(svg.lucide-x)")
      .first();

    // Credits Pill: only rendered on /task NEW page (CreditsPill component).
    // Anchor on Coins icon ONLY — the i18n key billing.creditsBadge is missing
    // in preview's messages bundle so the literal label may render as either
    // "{n} Credits" (translated) OR "billing.creditsBadge" (key fallback).
    this.creditsPill = page
      .locator("main button:has(svg.lucide-coins)")
      .first();

    // Suggested follow-ups
    this.suggestedFollowUpsHeader = page
      .locator("main")
      .getByText(
        i18n
          ? new RegExp(`^${i18n.t("chatbot.suggestedFollowUps")}$`, "i")
          : i18nRegex("chatbot.suggestedFollowUps", { exact: true }),
      )
      .first();
    // Buttons inside main but NOT inside [role='log']. The Suggestions render
    // as <Button> with ArrowRight inside, sibling of role=log. Excluding
    // role=log buttons gives us follow-up suggestions only.
    this.followUpButtons = page.locator(
      "main > * button:has(svg.lucide-arrow-right):not([role='log'] button)",
    );

    // Conversation log
    this.chatLog = page.locator('[role="log"]');
    // Anchor on stable role+aria — message-item.tsx renders <div role="article"
    // aria-label="Message N of M, from user|assistant"> per chat message.
    // Old selector '.group:not(:has(.is-user))' matched user containers too,
    // because a `.group.is-user` div is not `:has(.is-user)` on itself.
    this.userMessages = this.chatLog.locator(
      '[role="article"][aria-label*="from user" i]',
    );
    this.assistantMessages = this.chatLog.locator(
      '[role="article"][aria-label*="from assistant" i]',
    );
    this.userMessageCopyBtn = this.userMessages
      .locator("button:has(svg.lucide-copy)")
      .first();
    // Negative TC-CDP-MSGCOPY-003: ANY lucide-copy inside an assistant article
    this.assistantCopyButtons = this.assistantMessages.locator(
      "button:has(svg.lucide-copy)",
    );
    this.sidebarActiveTaskBtn = page.locator(
      '[data-sidebar="menu-button"][data-active="true"]',
    );

    this.mainTextarea = page.locator("main textarea").first();
  }

  // ── Top-bar getters ──
  getTopbarTitleContainer(): Locator {
    return this.topbarTitleContainer;
  }
  getTopbarTaskTitleSpan(): Locator {
    return this.topbarTaskTitleSpan;
  }
  getPenLineBtn(): Locator {
    return this.penLineBtn;
  }
  getEllipsisBtn(): Locator {
    return this.ellipsisBtn;
  }

  // ── Rename dialog getters ──
  getRenameDialog(): Locator {
    return this.renameDialog;
  }
  getRenameDialogHeading(): Locator {
    return this.renameDialogHeading;
  }
  getRenameInput(): Locator {
    return this.renameInput;
  }
  getRenameSaveBtn(): Locator {
    return this.renameSaveBtn;
  }
  getRenameCancelBtn(): Locator {
    return this.renameCancelBtn;
  }

  // ── More menu / task-details popover ──
  getMoreMenu(): Locator {
    return this.moreMenu;
  }
  getTaskDetailsMenuItem(): Locator {
    return this.taskDetailsMenuItem;
  }
  getTaskDetailsPopover(): Locator {
    return this.taskDetailsPopover;
  }
  getTaskDetailsTitleLabel(): Locator {
    return this.taskDetailsTitleLabel;
  }
  getTaskDetailsCreditsLabel(): Locator {
    return this.taskDetailsCreditsLabel;
  }
  getTaskDetailsCreatedTimeLabel(): Locator {
    return this.taskDetailsCreatedTimeLabel;
  }
  getTaskDetailsClosePopoverBtn(): Locator {
    return this.taskDetailsClosePopoverBtn;
  }

  // ── Credits Pill ──
  getCreditsPill(): Locator {
    return this.creditsPill;
  }
  /** Anywhere on the page — use for negative assertions (page detail should NOT have it). */
  getCreditsPillAnywhere(): Locator {
    return this.page.locator("button:has(svg.lucide-coins)").filter({
      hasText: /Credits/,
    });
  }

  // ── Follow-up suggestions ──
  getSuggestedFollowUpsHeader(): Locator {
    return this.suggestedFollowUpsHeader;
  }
  getFollowUpButtons(): Locator {
    return this.followUpButtons;
  }

  // ── Conversation log ──
  getChatLog(): Locator {
    return this.chatLog;
  }
  getUserMessages(): Locator {
    return this.userMessages;
  }
  getAssistantMessages(): Locator {
    return this.assistantMessages;
  }
  getUserMessageCopyBtn(): Locator {
    return this.userMessageCopyBtn;
  }
  /** Used by TC-CDP-MSGCOPY-003 negative regression — should always be count=0. */
  getAssistantCopyButtons(): Locator {
    return this.assistantCopyButtons;
  }
  /** Sidebar active task button (data-active='true') — used by rename TC-004. */
  getSidebarActiveTaskBtn(): Locator {
    return this.sidebarActiveTaskBtn;
  }

  // ── Main textarea ──
  getMainTextarea(): Locator {
    return this.mainTextarea;
  }

  // ── Actions ──
  async hoverTitle(): Promise<void> {
    await this.topbarTitleContainer.hover();
  }

  async clickPenLine(): Promise<void> {
    // React hydration race: onClick may not yet be attached after first paint.
    // Pattern matches view-all-files.fragment.ts:128. The pen-line button is
    // `display: none` until the parent group is hovered (md:group-hover:flex),
    // so we MUST hover the title container before clicking.
    await this.page
      .waitForLoadState("networkidle", { timeout: 15_000 })
      .catch(() => {});
    await this.topbarTitleContainer.hover().catch(() => {});
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.topbarTitleContainer.hover().catch(() => {});
      await this.penLineBtn.click({ force: true }).catch(() => {});
      try {
        await this.renameDialog.waitFor({ state: "visible", timeout: 5_000 });
        return;
      } catch {
        // Fallback: programmatic click via DOM bypasses any pointer hover state
        await this.penLineBtn
          .evaluate((el) => (el as HTMLElement).click())
          .catch(() => {});
        try {
          await this.renameDialog.waitFor({ state: "visible", timeout: 5_000 });
          return;
        } catch {
          await this.page.waitForTimeout(1000);
        }
      }
    }
    await this.renameDialog.waitFor({ state: "visible", timeout: 5_000 });
  }

  async fillRename(value: string): Promise<void> {
    await this.renameInput.fill(value);
  }

  async clickRenameSave(): Promise<void> {
    await this.renameSaveBtn.click();
    await this.renameDialog.waitFor({ state: "hidden", timeout: 30_000 });
  }

  async clickRenameCancel(): Promise<void> {
    await this.renameCancelBtn.click();
    await this.renameDialog.waitFor({ state: "hidden", timeout: 10_000 });
  }

  async clickEllipsis(): Promise<void> {
    // Wait for hydration before clicking the radix DropdownMenuTrigger.
    await this.ellipsisBtn.waitFor({ state: "visible", timeout: 15_000 });
    await this.page
      .waitForLoadState("networkidle", { timeout: 15_000 })
      .catch(() => {});
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.ellipsisBtn.click({ force: true }).catch(() => {});
      try {
        await this.moreMenu.waitFor({ state: "visible", timeout: 5_000 });
        return;
      } catch {
        // Fallback: native DOM click
        await this.ellipsisBtn
          .evaluate((el) => (el as HTMLElement).click())
          .catch(() => {});
        try {
          await this.moreMenu.waitFor({ state: "visible", timeout: 5_000 });
          return;
        } catch {
          await this.page.waitForTimeout(1000);
        }
      }
    }
    await this.moreMenu.waitFor({ state: "visible", timeout: 5_000 });
  }

  async clickTaskDetails(): Promise<void> {
    // Radix DropdownMenu auto-focuses the first menuitem on open. Mouse click
    // hit-testing in headless can miss the onSelect handler — use keyboard
    // Enter on the focused item, which is the most reliable Radix path.
    // (Mouse click fallback if focus was lost or menu re-rendered.)
    await this.page.keyboard.press("Enter").catch(() => {});
    try {
      await this.taskDetailsPopover.waitFor({
        state: "visible",
        timeout: 3_000,
      });
      return;
    } catch {
      // Mouse click fallback
      await this.taskDetailsMenuItem.click({ force: true }).catch(() => {});
      await this.taskDetailsPopover.waitFor({
        state: "visible",
        timeout: 8_000,
      });
    }
  }

  async clickTaskDetailsClose(): Promise<void> {
    // Close popover via inner X. Falls back to Escape if X isn't visible.
    const visible = await this.taskDetailsClosePopoverBtn
      .isVisible({ timeout: 2000 })
      .catch(() => false);
    if (visible) {
      await this.taskDetailsClosePopoverBtn.click();
    } else {
      await this.page.keyboard.press("Escape");
    }
    await this.taskDetailsPopover.waitFor({
      state: "hidden",
      timeout: 10_000,
    });
  }

  async pressEscape(): Promise<void> {
    await this.page.keyboard.press("Escape");
  }

  async waitForFollowUpsReady(timeout = 60_000): Promise<void> {
    // Either the header appears or first button appears — whichever comes first
    await Promise.race([
      this.suggestedFollowUpsHeader.waitFor({ state: "visible", timeout }),
      this.followUpButtons.first().waitFor({ state: "visible", timeout }),
    ]);
    // After the AnimatePresence transition, ensure at least one button is interactive
    await this.followUpButtons.first().waitFor({
      state: "visible",
      timeout: 30_000,
    });
  }

  async clickFirstFollowUp(): Promise<string> {
    const first = this.followUpButtons.first();
    await first.waitFor({ state: "visible", timeout: 15_000 });
    const text = (await first.textContent())?.trim() ?? "";
    await first.click();
    return text;
  }

  async hoverFirstUserMessage(): Promise<void> {
    const first = this.userMessages.first();
    await first.waitFor({ state: "visible", timeout: 15_000 });
    await first.hover();
  }

  async clickUserMessageCopy(): Promise<void> {
    // chromium headless blocks navigator.clipboard.readText without explicit grant
    await this.page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"])
      .catch(() => {});
    await this.hoverFirstUserMessage();
    // Copy button is hover-revealed (opacity-0 → opacity-100). Retry click +
    // dispatch native click until lucide-check icon swap is observed (UI
    // proof that React onClick fired). Up to 3 attempts with 800ms settle.
    const checkIcon = this.userMessages
      .first()
      .locator("button:has(svg.lucide-check)")
      .first();
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.userMessageCopyBtn.click({ force: true }).catch(() => {});
      await this.userMessageCopyBtn
        .evaluate((el) => (el as HTMLElement).click())
        .catch(() => {});
      try {
        await checkIcon.waitFor({ state: "visible", timeout: 2_000 });
        return;
      } catch {
        await this.hoverFirstUserMessage();
      }
    }
    // Final wait — surfaces real failure
    await checkIcon.waitFor({ state: "visible", timeout: 3_000 });
  }

  /** Read the text content of the first user message (stripped). */
  async readFirstUserMessageText(): Promise<string> {
    const first = this.userMessages.first();
    await first.waitFor({ state: "visible", timeout: 15_000 });
    // The visible message text is inside .wrap-anywhere div (per message-item.tsx line 283)
    const inner = first.locator("div.wrap-anywhere").first();
    return ((await inner.textContent()) ?? "").trim();
  }

  /** Read the current top-bar task title text (stripped). */
  async readTopbarTitle(): Promise<string> {
    await this.topbarTaskTitleSpan.waitFor({
      state: "visible",
      timeout: 15_000,
    });
    return ((await this.topbarTaskTitleSpan.textContent()) ?? "").trim();
  }

  /** Read creditsConsumed value text from popover (number string or "-"). */
  async readCreditsConsumedValue(): Promise<string> {
    // Real DOM (verified via CDP):
    //   <div class="flex items-center gap-2">
    //     <span class="text-muted-foreground shrink-0">Credits Consumed</span>
    //     <span class="text-foreground">81</span>
    //   </div>
    // Anchor on label span via hasText, then sibling .text-foreground span.
    const labelText = this.i18n
      ? this.i18n.t("chatbot.creditsConsumed")
      : "Credits Consumed";
    const valueSpan = this.taskDetailsPopover
      .locator("div.flex.items-center.gap-2", { hasText: labelText })
      .locator("span.text-foreground")
      .first();
    await valueSpan.waitFor({ state: "attached", timeout: 10_000 });
    return ((await valueSpan.textContent()) ?? "").trim();
  }

  async readUserMessageCount(): Promise<number> {
    return await this.userMessages.count();
  }

  async waitForUserMessageCount(target: number, timeout = 30_000): Promise<void> {
    await this.page.waitForFunction(
      (n) => document.querySelectorAll('[role="log"] .is-user').length >= n,
      target,
      { timeout },
    );
  }

  /** Wait until completed status is visible (chatbot.completed). */
  async waitForCompleted(timeout = 60_000): Promise<void> {
    const completed = this.page
      .getByText(
        this.i18n
          ? new RegExp(`^${this.i18n.t("chatbot.completed")}$`, "i")
          : i18nRegex("chatbot.completed", { exact: true }),
      )
      .first();
    await completed.waitFor({ state: "visible", timeout });
  }

  // ── Plan / Step Collapsible (Radix Collapsible inside chat log) ──
  // Each AI plan step renders as a collapsible whose trigger is a `<div
  // aria-expanded="..." data-state="open|closed">` with the step header text.
  // The trigger uses Radix's pointerdown handler — playwright's `.click()`
  // (with full pointer events) works; programmatic DOM `.click()` does NOT.

  /** All step Collapsible triggers in the chat log (not nested sub-tools). */
  getStepTriggers(): Locator {
    // Outer step triggers sit directly inside the role=log; inner sub-tool
    // expandables (Web Search, Create Excel...) also have aria-expanded —
    // Radix wraps them too — so we anchor on the stable
    // `cursor-pointer` class on the outer step header div which is shared
    // by both, but inner ones are nested deeper. Use both for breadth.
    return this.chatLog.locator('div[aria-expanded][data-state]');
  }

  /** Step trigger that contains the given text (e.g. "Search for"). */
  getStepTriggerByText(text: string | RegExp): Locator {
    return this.chatLog
      .locator('div[aria-expanded][data-state]', { hasText: text })
      .first();
  }

  /** Toggle a Radix Collapsible trigger via mouse, then keyboard fallback. */
  private async toggleStepTrigger(trigger: Locator): Promise<void> {
    await trigger.scrollIntoViewIfNeeded();
    // 1) trusted mouse.click at center
    const box = await trigger.boundingBox();
    if (box) {
      await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await this.page.waitForTimeout(200);
    }
    // 2) keyboard Enter on focused trigger
    await trigger.focus().catch(() => {});
    await this.page.keyboard.press("Enter").catch(() => {});
    await this.page.waitForTimeout(150);
    // 3) keyboard Space (Radix Collapsible binds onKeyDown for Space too)
    await this.page.keyboard.press(" ").catch(() => {});
  }

  /** Expand a step trigger. Idempotent — no-op if already open. */
  async expandStep(trigger: Locator): Promise<void> {
    await trigger.waitFor({ state: "visible", timeout: 10_000 });
    if ((await trigger.getAttribute("aria-expanded")) === "true") return;
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.toggleStepTrigger(trigger);
      try {
        await this.page.waitForFunction(
          ([el]) => el?.getAttribute("aria-expanded") === "true",
          [await trigger.elementHandle()] as any,
          { timeout: 1_500 },
        );
        return;
      } catch {
        // retry
      }
    }
    // Final assertion-style wait — surfaces real failure
    await this.page.waitForFunction(
      ([el]) => el?.getAttribute("aria-expanded") === "true",
      [await trigger.elementHandle()] as any,
      { timeout: 3_000 },
    );
  }

  /** Collapse a step trigger. Idempotent. */
  async collapseStep(trigger: Locator): Promise<void> {
    if ((await trigger.getAttribute("aria-expanded")) === "false") return;
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.toggleStepTrigger(trigger);
      const state = await trigger.getAttribute("aria-expanded");
      if (state === "false") return;
    }
  }

  /**
   * Read expanded step content via aria-controls — Radix Collapsible's
   * trigger has `aria-controls` pointing to the content panel id. Returns
   * "" if not expanded or content panel missing.
   */
  async readStepContent(trigger: Locator): Promise<string> {
    return await trigger.evaluate((el) => {
      const id = el.getAttribute("aria-controls");
      if (!id) return "";
      const panel = document.getElementById(id);
      if (!panel) return "";
      return (panel as HTMLElement).innerText.replace(/\s+/g, " ").trim();
    });
  }
}
