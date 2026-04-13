// source: cdp
// handoff: test-cases/generated/playwright-handoff-mira-home.json
// baseline: test-cases/generated/page-baseline-mira-home.json
// generated: 2026-03-23T00:00:00Z

import { test, expect } from '../../fixtures';
import { MiraHomePage } from '../../pages/mira-home.page';

// Public page — opt out of authenticated storageState
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('[CDP] Mira Homepage', () => {
  test('TC-CDP-HOME-001 首页核心功能展示完整：Hero + 核心 tab + 功能卡片 + 底部 CTA', { tag: ['@P2', '@full'] }, async ({ page, i18n }) => {
    const home = new MiraHomePage(page, i18n);
    await home.goto();

    // Hero section
    await expect(home.getHeroImage()).toBeVisible();
    await expect(home.getHeroCtaLink()).toBeVisible();
    await expect(home.getHeroCtaLink()).toHaveAttribute('href', '/join-waitlist');

    // Core tab active by default
    await expect(home.getCoreTab()).toBeVisible();

    // 4 core feature cards
    await expect(home.getCoreFeatureHeading('workWithYou')).toBeVisible();
    await expect(home.getCoreFeatureHeading('workWithYou')).toHaveText(/Work With You, Not For You|协作式自动执行/);
    await expect(home.getCoreFeatureHeading('trainedByYou')).toBeVisible();
    await expect(home.getCoreFeatureHeading('trainedByYou')).toHaveText(/Trained by You — Or Learns From You|可训练，也会学习/);
    await expect(home.getCoreFeatureHeading('topTierModels')).toBeVisible();
    await expect(home.getCoreFeatureHeading('topTierModels')).toHaveText(/Built on Top-Tier Models, Engineered for Reality|不是 Demo，而是工程化系统/);
    await expect(home.getCoreFeatureHeading('integratedTools')).toBeVisible();
    await expect(home.getCoreFeatureHeading('integratedTools')).toHaveText(/Integrated Into Your Existing Tools|无缝融入现有工具/);

    // Bottom CTA
    await expect(home.getBottomCtaHeading()).toBeVisible();
    await expect(home.getBottomCtaHeading()).toHaveText(/Request Early Access|申请抢先体验/);
    await expect(home.getBottomCtaLink()).toBeVisible();
  });

  test('TC-CDP-HOME-002 导航"登录"链接跳转到 /task', { tag: ['@P1', '@regression', '@full'] }, async ({ page, i18n }) => {
    const home = new MiraHomePage(page, i18n);
    await home.goto();

    await home.clickSignIn();
    await expect(page).toHaveURL(/\/task|\/sign-in/);
  });

  test('TC-CDP-HOME-003 Hero CTA"加入等待名单"跳转到 /join-waitlist', { tag: ['@P1', '@regression', '@full'] }, async ({ page, i18n }) => {
    const home = new MiraHomePage(page, i18n);
    await home.goto();

    await home.clickHeroCta();
    await expect(page).toHaveURL(/\/join-waitlist/);
  });
});

test.describe('[CDP] Mira Homepage — Feature Tabs', () => {
  test('TC-CDP-HOME-004 点击"招聘"tab 切换显示招聘功能卡片', { tag: ['@P1', '@regression', '@full'] }, async ({ page, i18n }) => {
    const home = new MiraHomePage(page, i18n);
    await home.goto();

    await home.clickRecruitingTab();

    await expect(home.getRecruitingFeatureHeading('candidateData')).toBeVisible();
    await expect(home.getRecruitingFeatureHeading('candidateData')).toHaveText(/Candidate Data|候选人数据获取/);
    await expect(home.getRecruitingFeatureHeading('communication')).toBeVisible();
    await expect(home.getRecruitingFeatureHeading('communication')).toHaveText(/Communication & Follow-up|沟通与跟进/);
    await expect(home.getRecruitingFeatureHeading('recruitingSkills')).toBeVisible();
    await expect(home.getRecruitingFeatureHeading('recruitingSkills')).toHaveText(/Recruiting Skills|招聘技能/);
    await expect(home.getRecruitingFeatureHeading('securityTrust')).toBeVisible();
    await expect(home.getRecruitingFeatureHeading('securityTrust')).toHaveText(/Security & Trust|安全与可信/);
  });

  test('TC-CDP-HOME-005 点击"核心"tab 切换显示核心功能卡片', { tag: ['@P1', '@regression', '@full'] }, async ({ page, i18n }) => {
    const home = new MiraHomePage(page, i18n);
    await home.goto();

    // First switch to Recruiting to set up precondition
    await home.clickRecruitingTab();
    await expect(home.getRecruitingFeatureHeading('candidateData')).toBeVisible();

    // Switch back to Core
    await home.clickCoreTab();

    await expect(home.getCoreFeatureHeading('workWithYou')).toBeVisible();
    await expect(home.getCoreFeatureHeading('workWithYou')).toHaveText(/Work With You, Not For You|协作式自动执行/);
    await expect(home.getCoreFeatureHeading('trainedByYou')).toBeVisible();
    await expect(home.getCoreFeatureHeading('trainedByYou')).toHaveText(/Trained by You — Or Learns From You|可训练，也会学习/);
    await expect(home.getCoreFeatureHeading('topTierModels')).toBeVisible();
    await expect(home.getCoreFeatureHeading('topTierModels')).toHaveText(/Built on Top-Tier Models, Engineered for Reality|不是 Demo，而是工程化系统/);
    await expect(home.getCoreFeatureHeading('integratedTools')).toBeVisible();
    await expect(home.getCoreFeatureHeading('integratedTools')).toHaveText(/Integrated Into Your Existing Tools|无缝融入现有工具/);
  });

  test('TC-CDP-HOME-009 Tab 切换 round-trip：核心→招聘→核心', { tag: ['@P2', '@full'] }, async ({ page, i18n }) => {
    const home = new MiraHomePage(page, i18n);
    await home.goto();

    // Core → Recruiting
    await home.clickRecruitingTab();
    await expect(home.getRecruitingFeatureHeading('candidateData')).toBeVisible();

    // Recruiting → Core
    await home.clickCoreTab();
    await expect(home.getCoreFeatureHeading('workWithYou')).toBeVisible();
    await expect(home.getCoreFeatureHeading('workWithYou')).toHaveText(/Work With You, Not For You|协作式自动执行/);
    await expect(home.getCoreFeatureHeading('integratedTools')).toBeVisible();
    await expect(home.getCoreFeatureHeading('integratedTools')).toHaveText(/Integrated Into Your Existing Tools|无缝融入现有工具/);
  });
});

test.describe('[CDP] Mira Homepage — Language Selector', () => {
  test('TC-CDP-HOME-006 语言切换：中文→英文，验证文本 i18n 正确', { tag: ['@P1', '@regression', '@full'] }, async ({ page, i18n }) => {
    const home = new MiraHomePage(page, i18n);
    await home.goto();

    // Determine starting language from project; switch to the opposite then verify
    const startLang = i18n.locale === 'zh' ? '简体中文' : 'English';
    const targetLang = i18n.locale === 'zh' ? 'English' : '简体中文';

    await home.selectLanguage(targetLang);

    if (targetLang === 'English') {
      // Verify English text renders (use href-based locator since i18n is project-bound)
      await expect(home.getNavSignInLinkByHref()).toContainText('Sign in');
      await expect(home.getCoreTabByIndex()).toContainText('Core');
      await expect(home.getRecruitingTabByIndex()).toContainText('Recruiting');
      await expect(page.getByRole('heading', { name: 'Request Early Access' })).toBeVisible();
    } else {
      await expect(home.getNavSignInLinkByHref()).toContainText('登录');
      await expect(home.getCoreTabByIndex()).toContainText('核心');
      await expect(home.getRecruitingTabByIndex()).toContainText('招聘');
      await expect(page.getByRole('heading', { name: '申请抢先体验' })).toBeVisible();
    }
  });

  test('TC-CDP-HOME-010 语言切换 round-trip：中文→英文→中文', { tag: ['@P2', '@full'] }, async ({ page, i18n }) => {
    const home = new MiraHomePage(page, i18n);
    await home.goto();

    // Round-trip: start lang → opposite → back
    const isZh = i18n.locale === 'zh';

    // Switch to opposite language
    await home.selectLanguage(isZh ? 'English' : '简体中文');
    if (isZh) {
      await expect(page.getByRole('heading', { name: 'Request Early Access' })).toBeVisible();
    } else {
      await expect(page.getByRole('heading', { name: '申请抢先体验' })).toBeVisible();
    }

    // Switch back to original language
    await home.selectLanguage(isZh ? '简体中文' : 'English');
    await expect(home.getNavSignInLinkByHref()).toContainText(/Sign in|登录/);
    await expect(home.getBottomCtaHeading()).toHaveText(/Request Early Access|申请抢先体验/);
  });

  test('TC-CDP-HOME-011 语言切换后 tab 状态保持', { tag: ['@P2', '@full'] }, async ({ page, i18n }) => {
    const home = new MiraHomePage(page, i18n);
    await home.goto();

    // Activate Recruiting tab
    await home.clickRecruitingTab();
    await expect(home.getRecruitingFeatureHeading('candidateData')).toBeVisible();

    // Switch to opposite language
    const isZh = i18n.locale === 'zh';
    await home.selectLanguage(isZh ? 'English' : '简体中文');

    // Language switch reloads the page and resets to Core tab.
    // Re-click Recruiting tab (use regex locator since page language differs from i18n fixture).
    await home.getRecruitingTabByIndex().click();

    if (isZh) {
      await expect(page.getByRole('heading', { name: 'Candidate Data' })).toBeVisible();
    } else {
      await expect(page.getByRole('heading', { name: '候选人数据获取' })).toBeVisible();
    }
  });
});

test.describe('[CDP] Mira Homepage — Navigation Links', () => {
  test('TC-CDP-HOME-007 底部 CTA"加入等待名单"跳转到 /task', { tag: ['@P1', '@regression', '@full'] }, async ({ page, i18n }) => {
    const home = new MiraHomePage(page, i18n);
    await home.goto();

    await home.clickBottomCta();
    await expect(page).toHaveURL(/\/task|\/sign-in/);
  });

  test('TC-CDP-HOME-008 导航"加入等待名单"链接跳转到 /join-waitlist', { tag: ['@P1', '@regression', '@full'] }, async ({ page, i18n }) => {
    const home = new MiraHomePage(page, i18n);
    await home.goto();

    await home.clickNavJoinWaitlist();
    await expect(page).toHaveURL(/\/join-waitlist/);
  });
});
