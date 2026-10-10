import { expect, test } from '@playwright/test';

import { expectNoA11yViolations } from '../support/a11y.js';
import { ownClientIp } from '../support/client-ip.js';
import { hostUrl, requireSeededAcademies } from '../support/hosts.js';
import { signInAt } from '../support/session.js';

/**
 * Import students from a spreadsheet (G-02; PO checklist "preview shows errors in plain language;
 * commit; re-import creates no duplicates"). Synthetic CSV until the pilot's anonymised file
 * (A10) is in e2e/fixtures/, which then runs the same steps. Desktop: it adds students to demo-a.
 */
test.beforeAll(requireSeededAcademies);
test.beforeEach(({ context }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Adds students to demo-a; run once');
  return ownClientIp(context);
});

function roster(tag: string, fixed: boolean): Buffer {
  const lines = ['Name,DOB,Father Name,Mobile,Class'];
  for (let i = 1; i <= 12; i += 1)
    lines.push(
      `Imported ${tag} ${i},${String(i + 1).padStart(2, '0')}/05/2014,Dad ${tag} ${i},${!fixed && i <= 2 ? '123' : `97${String(30_000_000 + i)}`},Grade ${i % 5}`,
    );
  return Buffer.from(`${lines.join('\n')}\n`);
}

test('import a register: problems in plain language, commit, re-import adds no duplicates', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const tag = `${Date.now()}`.slice(-6);
  await signInAt(page, testInfo, 'demo-a', 'admin@demo-a.test');
  await page.goto(hostUrl(testInfo, 'demo-a', '/students'));
  await page.getByRole('link', { name: 'Import', exact: true }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Import students and parents' }),
  ).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expectNoA11yViolations(page);

  await page.getByLabel('Spreadsheet file').setInputFiles({
    name: 'register.csv',
    mimeType: 'text/csv',
    buffer: roster(tag, false),
  });
  await page.getByRole('button', { name: 'Upload and check' }).click();
  await expect(page.getByText('10 students ready to import')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('2 rows have problems and will be skipped')).toBeVisible();
  await expect(page.getByText(/Parent mobile: Not a mobile number/).first()).toBeVisible();
  await expectNoA11yViolations(page);
  await page.getByRole('button', { name: 'Import 10 students' }).click();
  await expect(page.getByText('10 students were added.')).toBeVisible({ timeout: 20_000 });

  // The corrected file: only the two fixed rows are new.
  await page.getByRole('button', { name: 'Import another file' }).click();
  await page.getByLabel('Spreadsheet file').setInputFiles({
    name: 'register-fixed.csv',
    mimeType: 'text/csv',
    buffer: roster(tag, true),
  });
  await page.getByRole('button', { name: 'Upload and check' }).click();
  await expect(page.getByText('2 students ready to import')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('10 students are already here and will be skipped')).toBeVisible();
  await page.getByRole('button', { name: 'Import 2 students' }).click();
  await expect(page.getByText('2 students were added.')).toBeVisible({ timeout: 20_000 });

  await page.goto(
    hostUrl(testInfo, 'demo-a', `/students?q=${encodeURIComponent(`Imported ${tag}`)}`),
  );
  await expect(page.getByRole('link', { name: new RegExp(`Imported ${tag} `) })).toHaveCount(12);
});
