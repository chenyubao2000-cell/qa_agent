import type { Page, Locator } from "@playwright/test";
import type { I18n } from "../fixtures";
import { i18nRegex } from "../i18n-helpers";

export class MiraHomePage {
  constructor(
    private readonly page: Page,
    private readonly i18n?: I18n,
  ) {}

  // ── Navigation ──

  private get navSignInLink(): Locator {
    return this.page.getByRole("navigation").getByRole("link", {
      name: this.i18n
        ? this.i18n.t("homepage.nav.signIn")
        : i18nRegex("homepage.nav.signIn"),
    });
  }

  private get navJoinWaitlistLink(): Locator {
    return this.page.getByRole("navigation").getByRole("link", {
      name: this.i18n
        ? this.i18n.t("homepage.nav.getStarted")
        : i18nRegex("homepage.nav.getStarted"),
    });
  }

  private get navFeaturesButton(): Locator {
    return this.page.getByRole("button", {
      name: this.i18n
        ? this.i18n.t("homepage.features.label")
        : i18nRegex("homepage.features.label"),
    });
  }

  private get languageCombobox(): Locator {
    return this.page.getByRole("combobox");
  }

  // ── Hero ──

  private get heroImage(): Locator {
    return this.page.getByRole("img", { name: "Mira Hero" });
  }

  private get heroCtaLink(): Locator {
    return this.page
      .locator("div, section")
      .filter({ has: this.page.getByRole("img", { name: "Mira Hero" }) })
      .locator('a[href="/join-waitlist"]')
      .first();
  }

  // ── Feature Tabs ──

  private get coreTab(): Locator {
    return this.page.getByRole("button", {
      name: this.i18n
        ? new RegExp(`^${this.i18n.t("homepage.features.core")}$`, "i")
        : i18nRegex("homepage.features.core", { exact: true }),
    });
  }

  private get recruitingTab(): Locator {
    return this.page.getByRole("button", {
      name: this.i18n
        ? new RegExp(`^${this.i18n.t("homepage.features.recruiting")}$`, "i")
        : i18nRegex("homepage.features.recruiting", { exact: true }),
    });
  }

  // ── Feature Cards ──

  getCoreFeatureHeading(
    key: "workWithYou" | "trainedByYou" | "topTierModels" | "integratedTools",
  ): Locator {
    const i18nKeyMap: Record<string, string> = {
      workWithYou: "homepage.features.coreFeatures.workWithYou.title",
      trainedByYou: "homepage.features.coreFeatures.trainedByYou.title",
      topTierModels: "homepage.features.coreFeatures.topTierModels.title",
      integratedTools: "homepage.features.coreFeatures.integratedTools.title",
    };
    const i18nKey = i18nKeyMap[key];
    return this.page.getByRole("heading", {
      name: this.i18n ? this.i18n.t(i18nKey) : i18nRegex(i18nKey),
    });
  }

  getRecruitingFeatureHeading(
    key:
      | "candidateData"
      | "communication"
      | "recruitingSkills"
      | "securityTrust",
  ): Locator {
    const i18nKeyMap: Record<string, string> = {
      candidateData: "homepage.features.recruitingFeatures.candidateData.title",
      communication: "homepage.features.recruitingFeatures.communication.title",
      recruitingSkills:
        "homepage.features.recruitingFeatures.recruitingSkills.title",
      securityTrust: "homepage.features.recruitingFeatures.securityTrust.title",
    };
    const i18nKey = i18nKeyMap[key];
    return this.page.getByRole("heading", {
      name: this.i18n ? this.i18n.t(i18nKey) : i18nRegex(i18nKey),
    });
  }

  // ── Bottom CTA ──

  private get bottomCtaHeading(): Locator {
    return this.page.getByRole("heading", {
      name: this.i18n
        ? this.i18n.t("homepage.cta.title")
        : i18nRegex("homepage.cta.title"),
    });
  }

  private get bottomCtaLink(): Locator {
    return this.page.locator('a[href="/task"]').filter({
      hasText: this.i18n
        ? this.i18n.t("homepage.cta.button")
        : i18nRegex("homepage.cta.button"),
    });
  }

  // ── Public Getters ──

  getNavSignInLink(): Locator {
    return this.navSignInLink;
  }
  getNavJoinWaitlistLink(): Locator {
    return this.navJoinWaitlistLink;
  }
  getNavFeaturesButton(): Locator {
    return this.navFeaturesButton;
  }
  getLanguageCombobox(): Locator {
    return this.languageCombobox;
  }
  getHeroImage(): Locator {
    return this.heroImage;
  }
  getHeroCtaLink(): Locator {
    return this.heroCtaLink;
  }
  getCoreTab(): Locator {
    return this.coreTab;
  }
  getRecruitingTab(): Locator {
    return this.recruitingTab;
  }
  getBottomCtaHeading(): Locator {
    return this.bottomCtaHeading;
  }
  getBottomCtaLink(): Locator {
    return this.bottomCtaLink;
  }

  /** Language-independent sign-in link (for after language switch) */
  getNavSignInLinkByHref(): Locator {
    return this.page.locator('nav a[href="/task"]').first();
  }

  /** Language-independent tab locators (for after language switch) */
  getCoreTabByIndex(): Locator {
    return this.page.getByRole("button", {
      name: i18nRegex("homepage.features.core", { exact: true }),
    });
  }

  getRecruitingTabByIndex(): Locator {
    return this.page.getByRole("button", {
      name: i18nRegex("homepage.features.recruiting", { exact: true }),
    });
  }

  // ── Actions ──

  async goto(): Promise<void> {
    await this.page.goto("/");
  }

  async clickSignIn(): Promise<void> {
    await this.navSignInLink.click();
  }

  async clickNavJoinWaitlist(): Promise<void> {
    await this.navJoinWaitlistLink.click();
  }

  async clickHeroCta(): Promise<void> {
    await this.heroCtaLink.click();
  }

  async clickBottomCta(): Promise<void> {
    await this.bottomCtaLink.click();
  }

  async clickCoreTab(): Promise<void> {
    await this.coreTab.click();
  }

  async clickRecruitingTab(): Promise<void> {
    await this.recruitingTab.click();
  }

  async selectLanguage(language: string): Promise<void> {
    await this.languageCombobox.click();
    await this.page.getByRole("option", { name: language }).click();
    await this.page.waitForLoadState("networkidle");
  }
}
