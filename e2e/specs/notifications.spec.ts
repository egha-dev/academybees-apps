import { expect, test } from '@playwright/test';

import { expectNoA11yViolations } from '../support/a11y.js';
import { DEMO_TEACHER, istNow, uuidv7 } from '../support/classes.js';
import { ownClientIp } from '../support/client-ip.js';
import { writeInAcademy } from '../support/db.js';
import { hostUrl, requireSeededAcademies } from '../support/hosts.js';
import { signInAt } from '../support/session.js';

/**
 * In-app notifications (Phase 6 S7; C-04, G-16): the teacher's bell shows unread reminders, the
 * list opens them, "Mark all as read" clears them. The nudge itself is written by the 10-minute
 * job (notifications.int.spec.ts); here one is placed directly so the screens can be checked.
 */
test.beforeAll(requireSeededAcademies);
test.beforeEach(({ context }) => ownClientIp(context));

test('the bell shows a reminder; the list opens it; mark all as read clears it', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const tag = `${testInfo.project.name.split('-')[0]} ${Date.now().toString(36)}`;
  await writeInAcademy(
    'demo-a',
    `INSERT INTO notification (id, tenant_id, recipient_id, kind, params, link, dedupe_key)
     SELECT $2, $1, t.membership_id, 'ATTENDANCE_NOT_TAKEN', $3::jsonb, '/teach/classes', $4
       FROM teacher t WHERE t.id = $5`,
    [
      uuidv7(),
      JSON.stringify({ batch: `Kuchipudi ${tag}`, start: '10:00', date: istNow().date }),
      `e2e:${tag}`,
      DEMO_TEACHER,
    ],
  );

  await signInAt(page, testInfo, 'demo-a', 'teacher@demo-a.test');
  await page.goto(hostUrl(testInfo, 'demo-a', '/teach'));
  const bell = page.getByRole('link', { name: /^Notifications, \d+ unread$/ });
  await expect(bell).toBeVisible({ timeout: 30_000 });
  await bell.click();

  await expect(page.getByRole('heading', { level: 1, name: 'Notifications' })).toBeVisible();
  const item = page.getByRole('listitem').filter({ hasText: `Kuchipudi ${tag}` });
  await expect(item).toContainText(`Attendance not taken for Kuchipudi ${tag} at 10:00`);
  await expect(item).toContainText('New');
  await expectNoA11yViolations(page);

  await page.getByRole('button', { name: 'Mark all as read' }).click();
  await expect(page.getByText('All marked as read')).toBeVisible();
  await expect(item).not.toContainText('New', { timeout: 15_000 });
});
