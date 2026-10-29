import { expect, test } from '@playwright/test';

import { adminSession, classForDemoTeacher, rollCall, tooLateToday } from '../support/classes.js';
import { ownClientIp } from '../support/client-ip.js';
import { inAcademy } from '../support/db.js';
import { hostUrl, requireSeededAcademies } from '../support/hosts.js';
import { counts, readyForOffline } from '../support/offline.js';
import { signInAt } from '../support/session.js';

/**
 * Phase 6 exit journey (IMPLEMENTATION_PLAN Phase 6; C-124, C-126, C-128): the admin sets up a
 * class; the teacher finds it on Teacher Today, takes attendance online, then — with no
 * connection — corrects one student and reloads; back online it reaches the academy once, with
 * one parent intent per absent or late student; the admin sees the class taken. On iPhone
 * (WebKit) the journey runs online only: offline there is proven on a real phone.
 */
test.beforeAll(requireSeededAcademies);
test.beforeEach(({ context }) => ownClientIp(context));

test('teacher takes attendance online and offline; the academy sees it once', async ({
  page,
  context,
  browser,
}, testInfo) => {
  test.setTimeout(240_000);
  test.skip(tooLateToday(), 'Too close to midnight in India for a class today');
  const offline = testInfo.project.name !== 'iphone-webkit';
  const tag = `${testInfo.project.name.split('-')[0]} ${Date.now().toString(36)}`;
  const batch = `Odissi ${tag}`;

  const admin = await adminSession(browser, testInfo);
  try {
    const { sessionId, students } = await classForDemoTeacher(admin, batch, 4);
    const names = students.map((s) => s.name);

    // Teacher Today → the class.
    await signInAt(page, testInfo, 'demo-a', 'teacher@demo-a.test');
    await page.goto(hostUrl(testInfo, 'demo-a', '/teach'));
    await expect(page.getByRole('heading', { level: 1, name: /^Hello, / })).toBeVisible({
      timeout: 30_000,
    });
    await page
      .getByRole('link', { name: new RegExp(batch) })
      .first()
      .click();
    await expect(page.getByRole('heading', { level: 1, name: batch })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(counts(0, 0, 4))).toBeVisible({ timeout: 30_000 });

    // Online: Mark all present, one late, save — synced.
    await page.getByRole('button', { name: 'Mark all present' }).click();
    await page
      .getByRole('group', { name: `Attendance for ${names[1]}` })
      .getByRole('button', { name: 'Late' })
      .click();
    await expect(page.getByText(counts(3, 0, 0, 1))).toBeVisible();
    await page.getByRole('button', { name: 'Save attendance' }).click();
    await expect
      .poll(async () => (await rollCall(admin, sessionId)).counts, { timeout: 30_000 })
      .toMatchObject({ PRESENT: 3, LATE: 1, unmarked: 0 });
    await expect(page.getByText('All changes synced', { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });

    if (offline) {
      // Offline: correct one student to absent; a reload keeps it waiting.
      await readyForOffline(page, () =>
        expect(page.getByText(counts(3, 0, 0, 1))).toBeVisible({ timeout: 30_000 }),
      );
      await context.setOffline(true);
      await page
        .getByRole('group', { name: `Attendance for ${names[2]}` })
        .getByRole('button', { name: 'Absent' })
        .click();
      await page.getByRole('button', { name: 'Save attendance' }).click();
      await expect(page.getByText('Saved on this device — 1 record waiting to sync')).toBeVisible();
      await page.reload();
      await expect(page.getByText(counts(2, 1, 0, 1))).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText('Saved on this device — 1 record waiting to sync')).toBeVisible();
      expect((await rollCall(admin, sessionId)).counts).toMatchObject({ PRESENT: 3, ABSENT: 0 });

      // Back online: it syncs by itself.
      await context.setOffline(false);
      await expect(page.getByText('All changes synced', { exact: true }).first()).toBeVisible({
        timeout: 120_000,
      });
      expect((await rollCall(admin, sessionId)).counts).toMatchObject({
        PRESENT: 2,
        ABSENT: 1,
        LATE: 1,
        unmarked: 0,
      });
      const intents = await inAcademy<{ kind: string; n: number }>(
        'demo-a',
        `SELECT kind::text, count(*)::int AS n FROM notification_intent
          WHERE session_id = $1 AND status = 'PENDING' GROUP BY kind ORDER BY kind`,
        [sessionId],
      );
      expect(intents).toEqual([
        { kind: 'ATTENDANCE_ABSENT', n: 1 },
        { kind: 'ATTENDANCE_LATE', n: 1 },
      ]);
    }

    // The academy sees the class taken.
    await admin.page.goto(hostUrl(testInfo, 'demo-a', '/attendance'));
    await expect(admin.page.getByRole('heading', { level: 1, name: 'Attendance' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(admin.page.getByRole('listitem').filter({ hasText: batch }).first()).toContainText(
      'Taken',
    );
  } finally {
    await admin.context.close();
  }
});
