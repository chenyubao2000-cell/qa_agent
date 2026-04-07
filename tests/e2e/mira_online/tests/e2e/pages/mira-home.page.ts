import type { Page, Locator } from '@playwright/test';
import type { I18n } from '../fixtures';

export class MiraHomePage {
  constructor(private readonly page: Page, private readonly i18n?: I18n) {}

  // ── Navigation ──

  private get navSignInLink(): Locator {
    return this.page.getByRole('navigation').getByRole('link', { name: /Sign in|登录/i });
  }

  private get navJoinWaitlistLink(): Locator {
    return this.page.getByRole('navigation').getByRole('link', { name: /Join Waitlist|加入等待名单/i });
  }

  private get navFeaturesButton(): Locator {
    return this.page.getByRole('button', { name: /Features|功能/i });
  }

  private get languageCombobox(): Locator {
    return this.page.getByRole('combobox');
  }

  // ── Hero ──

  private get heroImage(): Locator {
    return this.page.getByRole('img', { name: 'Mira Hero' });
  }

  private get heroCtaLink(): Locator {
    // Hero CTA: the join-waitlist link inside the container that has the hero image
    return this.page.locator('div, section').filter({ has: this.page.getByRole('img', { name: 'Mira Hero' }) })
      .locator('a[href="/join-waitlist"]').first();
  }

  // ── Feature Tabs ──
  // Real DOM uses <button> without role="tab"

  private get coreTab(): Locator {
    return this.page.getByRole('button', { name: /^Core$|^核心$/i });
  }

  private get recruitingTab(): Locator {
    return this.page.getByRole('button', { name: /^Recruiting$|^招聘$/i });
  }

  // ── Feature Cards ──

  getCoreFeatureHeading(key: 'workWithYou' | 'trainedByYou' | 'topTierModels' | 'integratedTools'): Locator {
    const fallbackMap: Record<string, RegExp> = {
      workWithYou: /Work With You|协作式自动执行/i,
      trainedByYou: /Trained by You|可训练，也会学习/i,
      topTierModels: /Top-Tier Models|不是 Demo/i,
      integratedTools: /Integrated Into|无缝融入/i,
    };
    return this.page.getByRole('heading', { name: fallbackMap[key] });
  }

  getRecruitingFeatureHeading(key: 'candidateData' | 'communication' | 'recruitingSkills' | 'securityTrust'): Locator {
    const fallbackMap: Record<string, RegExp> = {
      candidateData: /Candidate Data|候选人数据获取/i,
      communication: /Communication|沟通与跟进/i,
      recruitingSkills: /Recruiting Skills|招聘技能/i,
      securityTrust: /Security.*Trust|安全与可信/i,
    };
    return this.page.getByRole('heading', { name: fallbackMap[key] });
  }

  // ── Bottom CTA ──

  private get bottomCtaHeading(): Locator {
    return this.page.getByRole('heading', { name: /Request Early Access|申请抢先体验/i });
  }

  private get bottomCtaLink(): Locator {
    return this.page.locator('a[href="/task"]').filter({ hasText: /Join waitlist|加入等待名单/i });
  }

  // ── Public Getters ──

  getNavSignInLink(): Locator { return this.navSignInLink; }
  getNavJoinWaitlistLink(): Locator { return this.navJoinWaitlistLink; }
  getNavFeaturesButton(): Locator { return this.navFeaturesButton; }
  getLanguageCombobox(): Locator { return this.languageCombobox; }
  getHeroImage(): Locator { return this.heroImage; }
  getHeroCtaLink(): Locator { return this.heroCtaLink; }
  getCoreTab(): Locator { return this.coreTab; }
  getRecruitingTab(): Locator { return this.recruitingTab; }
  getBottomCtaHeading(): Locator { return this.bottomCtaHeading; }
  getBottomCtaLink(): Locator { return this.bottomCtaLink; }

  /** Language-independent sign-in link (for after language switch) */
  getNavSignInLinkByHref(): Locator {
    return this.page.locator('nav a[href="/task"]').first();
  }

  /** Language-independent tab locators (for after language switch) */
  getCoreTabByIndex(): Locator {
    return this.page.getByRole('button', { name: /^Core$|^核心$/i });
  }

  getRecruitingTabByIndex(): Locator {
    return this.page.getByRole('button', { name: /^Recruiting$|^招聘$/i });
  }

  // ── Actions ──

  async goto(): Promise<void> {
    await this.page.goto('/');
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
    await this.page.getByRole('option', { name: language }).click();
    // Wait for page to settle after language switch
    await this.page.waitForLoadState('networkidle');
  }
}
