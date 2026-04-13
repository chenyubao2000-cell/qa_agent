import { test, expect } from '../../fixtures';
import { TalentListPage } from '../../pages/talent-list.page';

test('debug timing', async ({ page, i18n }) => {
  const talentList = new TalentListPage(page, i18n);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await talentList.gotoSharePage();
  await talentList.clickOnePersonCard();
  await talentList.waitForPanelOpen();
  
  // Before maximize - check side panel grid
  const beforeMax = await page.evaluate(() => {
    const panels = document.querySelectorAll('.fixed.inset-0');
    return {
      fixedPanelCount: panels.length,
      panelDetails: Array.from(panels).map(p => ({
        class: p.className,
        grids: Array.from(p.querySelectorAll('[class*="grid-cols"]')).map(g => ({
          class: g.className?.toString(),
          childCount: g.childElementCount
        }))
      }))
    };
  });
  console.log('BEFORE MAXIMIZE:', JSON.stringify(beforeMax));

  await talentList.clickMaximize();
  await talentList.waitForFullscreenPanel();
  
  // Immediately after maximize
  const afterMax0 = await page.evaluate(() => {
    const panels = document.querySelectorAll('.fixed.inset-0');
    return {
      fixedPanelCount: panels.length,
      panelDetails: Array.from(panels).map(p => ({
        class: p.className,
        grids: Array.from(p.querySelectorAll('[class*="grid-cols"]')).map(g => ({
          class: g.className?.toString(),
          childCount: g.childElementCount
        }))
      }))
    };
  });
  console.log('AFTER MAX (immediate):', JSON.stringify(afterMax0));

  // Wait 1s
  await page.waitForTimeout(1000);
  const afterMax1 = await page.evaluate(() => {
    const panels = document.querySelectorAll('.fixed.inset-0');
    return {
      fixedPanelCount: panels.length,
      panelDetails: Array.from(panels).map(p => ({
        class: p.className,
        grids: Array.from(p.querySelectorAll('[class*="grid-cols"]')).map(g => ({
          class: g.className?.toString(),
          childCount: g.childElementCount
        }))
      }))
    };
  });
  console.log('AFTER MAX (1s):', JSON.stringify(afterMax1));

  // Wait 2s more
  await page.waitForTimeout(2000);
  const afterMax3 = await page.evaluate(() => {
    const panels = document.querySelectorAll('.fixed.inset-0');
    return {
      fixedPanelCount: panels.length,
      panelDetails: Array.from(panels).map(p => ({
        class: p.className,
        grids: Array.from(p.querySelectorAll('[class*="grid-cols"]')).map(g => ({
          class: g.className?.toString(),
          childCount: g.childElementCount
        }))
      }))
    };
  });
  console.log('AFTER MAX (3s):', JSON.stringify(afterMax3));

  expect(true).toBe(true);
});
