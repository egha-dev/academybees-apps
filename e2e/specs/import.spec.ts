import { expect, test } from '@playwright/test';

import { expectNoA11yViolations } from '../support/a11y.js';
import { ownClientIp } from '../support/client-ip.js';
import { hostUrl, requireSeededAcademies } from '../support/hosts.js';
import { signInAt } from '../support/session.js';

/**
 * Import students from a spreadsheet (G-02; PO checklist "preview shows errors in plain language;
 * commit; re-import creates no duplicates"), plus the synthetic pilot register in e2e/fixtures/
 * (C-111) until a pilot academy's anonymised file (A10) arrives. Desktop only: it adds students.
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

test('the synthetic pilot register imports cleanly from CSV, and the Excel copy adds nobody twice', async ({
  page,
}, testInfo) => {
  test.setTimeout(150_000);
  // e2e/fixtures/pilot-register.mjs (C-111): until a pilot academy's anonymised register (A10)
  // arrives. demo-b, so the 40 students don't crowd demo-a's trial limit.
  const fixture = await import('../fixtures/pilot-register.mjs');
  await signInAt(page, testInfo, 'demo-b', 'owner@demo-b.test');
  await page.goto(hostUrl(testInfo, 'demo-b', '/students/import'));
  await page.waitForLoadState('networkidle');

  await page.getByLabel('Spreadsheet file').setInputFiles({
    name: 'pilot-register.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(fixture.csv()),
  });
  await page.getByRole('button', { name: 'Upload and check' }).click();
  const fresh = page.getByText(`${fixture.EXPECTED.valid} students ready to import`);
  const rerun = page.getByText(`${fixture.EXPECTED.valid} students are already here`);
  await expect(fresh.or(rerun)).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByText(`${fixture.EXPECTED.problems} rows have problems and will be skipped`),
  ).toBeVisible();
  // Problems in words: a short mobile, an impossible date, a missing name, the same child twice.
  await expect(page.getByText(/Not a mobile number/).first()).toBeVisible();
  await expectNoA11yViolations(page);
  // Locally, `pnpm db:seed:perf` fills demo-b with 50,000 students, past the trial limit: the
  // wizard then (correctly) refuses to import. CI's fresh database always has room.
  test.skip(
    await page.getByText(/Your plan has room for/).isVisible(),
    'demo-b is over its student limit (perf seed); reseed a fresh database to run this',
  );
  if (await fresh.isVisible()) {
    await page.getByRole('button', { name: `Import ${fixture.EXPECTED.valid} students` }).click();
    await expect(page.getByText(`${fixture.EXPECTED.valid} students were added.`)).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole('button', { name: 'Import another file' }).click();
  } else {
    await page.goto(hostUrl(testInfo, 'demo-b', '/students/import'));
    await page.waitForLoadState('networkidle');
  }

  // The same register saved from Excel: everyone is already here.
  await page.getByLabel('Spreadsheet file').setInputFiles({
    name: 'pilot-register.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: await fixture.xlsx(),
  });
  await page.getByRole('button', { name: 'Upload and check' }).click();
  await expect(page.getByText('No students ready to import')).toBeVisible({ timeout: 30_000 });
  await expect(rerun).toBeVisible();
  await expect(page.getByRole('button', { name: /^Import \d+ student/ })).toBeDisabled();
});

test('when importing isn’t available, the page says so and offers no retry', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  // Staging without a private bucket answers 503 `imports_unavailable` (C-97); simulate it.
  await signInAt(page, testInfo, 'demo-a', 'admin@demo-a.test');
  await page.route('**/api/v1/students/import', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 'SERVICE_UNAVAILABLE',
              message: 'private storage not configured',
              details: [{ path: 'file', issue: 'imports_unavailable' }],
              requestId: 'e2e',
            },
          }),
        })
      : route.continue(),
  );
  await page.goto(hostUrl(testInfo, 'demo-a', '/students/import'));
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Spreadsheet file').setInputFiles({
    name: 'register.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Name,Mobile\nAsha,9840012345\n'),
  });
  await page.getByRole('button', { name: 'Upload and check' }).click();
  await expect(
    page.getByText("Student import isn't available right now — please contact support."),
  ).toBeVisible();
  await expect(page.getByText(/Try again/)).toHaveCount(0);
});
