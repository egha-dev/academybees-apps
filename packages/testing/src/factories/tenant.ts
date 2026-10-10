import { generateToken, hashPassword, hashToken } from '@academybee/auth';
import {
  newId,
  type PlanKey,
  ROLE_KEYS,
  ROLE_TEMPLATES,
  type RoleKey,
  startTrialSubscription,
} from '@academybee/contracts';
import pg from 'pg';

import { defineFactory } from './index.js';

export type TenantSeed = {
  id: string;
  slug: string;
  name: string;
  academyType: string;
  status: 'PENDING_APPROVAL' | 'SETUP' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  primaryColor: string;
  /** The academy's Trial subscription plan (C-89); null = no subscription (nothing granted). */
  plan: PlanKey | null;
};

let counter = 0;

/** Password of every fixture user (tests only). */
export const FIXTURE_PASSWORD = 'Fixture#Pass2026';
let fixtureHash: Promise<string> | undefined;

export const buildTenant = defineFactory<TenantSeed>(() => {
  counter += 1;
  const id = newId();
  return {
    id,
    // Unique and slug-shaped across parallel test files.
    slug: `t${id.slice(-8)}-${counter}`,
    name: `Test Academy ${counter}`,
    academyType: 'tuition',
    status: 'ACTIVE',
    primaryColor: '#1F6F5C',
    plan: 'trial',
  };
});

export type TenantFixture = TenantSeed & {
  branchId: string;
  /** A member (role `owner`, with the owner template's grants) of this academy only. */
  user: { id: string; email: string; membershipId: string; roleId: string };
  invitationId: string;
  /** The raw link token of that invitation (teacher role, to `invitee-<slug>@example.test`). */
  invitationToken: string;
  /** System role ids by key (owner = `user.roleId`). */
  roleIds: Record<RoleKey, string>;
  /** One row in every people and scheduling table (C-09), linked to each other. */
  people: PeopleFixture;
};

export type PeopleFixture = {
  teacherId: string;
  studentId: string;
  parentId: string;
  /** The parent ↔ student link row. */
  parentLinkId: string;
  /** The `school_bus` custom field definition. */
  customFieldId: string;
  courseId: string;
  levelId: string;
  batchId: string;
  ruleId: string;
  sessionId: string;
  admissionNo: string;
};

/**
 * Insert a tenant with its PRIMARY subdomain, branding, settings, default branch and Trial
 * subscription, the way
 * provisioning will (Phase 3). Pass a connection that may write tenant rows — the migrator (FORCE
 * RLS applies, so the context is set per transaction) or the superuser.
 */
export async function createTenantFixture(
  connectionString: string,
  overrides: Partial<TenantSeed> = {},
): Promise<TenantFixture> {
  const t = buildTenant(overrides);
  const branchId = newId();
  const user = {
    id: newId(),
    email: `owner-${t.slug}@example.test`,
    membershipId: newId(),
    roleId: newId(),
  };
  const invitationId = newId();
  const invitationToken = generateToken();
  const roleIds = {} as Record<RoleKey, string>;
  let people!: PeopleFixture;
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [t.id]);
    await client.query(
      `INSERT INTO tenant (id, slug, name, academy_type, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())`,
      [t.id, t.slug, t.name, t.academyType, t.status],
    );
    await client.query(
      `INSERT INTO tenant_domain (id, tenant_id, hostname, kind, role, verification, verified_at, updated_at)
       VALUES ($1, $2, $3, 'SUBDOMAIN', 'PRIMARY', 'VERIFIED', now(), now())`,
      [newId(), t.id, t.slug],
    );
    await client.query(
      `INSERT INTO tenant_branding (tenant_id, display_name, primary_color, updated_at)
       VALUES ($1, $2, $3, now())`,
      [t.id, t.name, t.primaryColor],
    );
    await client.query(`INSERT INTO tenant_settings (tenant_id, updated_at) VALUES ($1, now())`, [
      t.id,
    ]);
    await client.query(
      `INSERT INTO branch (id, tenant_id, name, is_default, updated_at)
       VALUES ($1, $2, 'Main branch', true, now())`,
      [branchId, t.id],
    );
    if (t.plan) {
      const sub = startTrialSubscription(t.plan, new Date());
      await client.query(
        `INSERT INTO subscription (tenant_id, plan_key, status, trial_ends_at, entitlements, updated_at)
         VALUES ($1, $2, 'TRIAL', $3, $4, now())`,
        [t.id, sub.planKey, sub.trialEndsAt, JSON.stringify(sub.entitlements)],
      );
      // A neutral override (same value as the plan) so every tenant table has fixture rows.
      await client.query(
        `INSERT INTO subscription_override (id, tenant_id, key, kind, "limit", reason)
         VALUES ($1, $2, 'messagesPerMonth', 'LIMIT', $3, 'fixture')`,
        [newId(), t.id, sub.entitlements.limits.messagesPerMonth],
      );
    }
    // Identity rows (C-59): a user may be created only for the identifier being looked up.
    await client.query(`SELECT set_config('app.lookup_identifier', $1, true)`, [user.email]);
    await client.query(
      `INSERT INTO "user" (id, email, name, updated_at) VALUES ($1, $2, $3, now())`,
      [user.id, user.email, `Owner of ${t.name}`],
    );
    await client.query(`SELECT set_config('app.user_id', $1, true)`, [user.id]);
    await client.query(
      `INSERT INTO user_credential (user_id, password_hash, updated_at) VALUES ($1, $2, now())`,
      [user.id, await (fixtureHash ??= hashPassword(FIXTURE_PASSWORD))],
    );
    await client.query(
      `INSERT INTO membership (id, tenant_id, user_id, status, updated_at)
       VALUES ($1, $2, $3, 'ACTIVE', now())`,
      [user.membershipId, t.id, user.id],
    );
    // Every system role with its template grants, as provisioning does (C-60, Phase 3).
    for (const key of ROLE_KEYS) {
      const roleId = key === 'owner' ? user.roleId : newId();
      roleIds[key] = roleId;
      await client.query(
        `INSERT INTO role (id, tenant_id, key, name, updated_at) VALUES ($1, $2, $3, $4, now())`,
        [roleId, t.id, key, key[0]!.toUpperCase() + key.slice(1)],
      );
      for (const [capability, scope] of Object.entries(ROLE_TEMPLATES[key].grants))
        await client.query(
          `INSERT INTO role_permission (tenant_id, role_id, capability, scope) VALUES ($1, $2, $3, $4)`,
          [t.id, roleId, capability, scope],
        );
    }
    await client.query(
      `INSERT INTO membership_role (tenant_id, membership_id, role_id) VALUES ($1, $2, $3)`,
      [t.id, user.membershipId, user.roleId],
    );
    await client.query(
      `INSERT INTO invitation (id, tenant_id, email, role_keys, token_hash, expires_at)
       VALUES ($1, $2, $3, '{teacher}', $4, now() + interval '7 days')`,
      [invitationId, t.id, `invitee-${t.slug}@example.test`, hashToken(invitationToken)],
    );
    people = await insertPeopleAndScheduling(client, t, branchId, user.membershipId);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
  return { ...t, branchId, user, invitationId, invitationToken, roleIds, people };
}

/**
 * The owner teaches one batch of one course with one student (and their parent, consent, health
 * note, custom field), one weekly rule and its next session; onboarding is finished unless the
 * academy is still setting up. Same transaction and tenant context as the tenant itself.
 */
async function insertPeopleAndScheduling(
  client: pg.Client,
  t: TenantSeed,
  branchId: string,
  membershipId: string,
): Promise<PeopleFixture> {
  const f: PeopleFixture = {
    teacherId: newId(),
    studentId: newId(),
    parentId: newId(),
    parentLinkId: newId(),
    customFieldId: newId(),
    courseId: newId(),
    levelId: newId(),
    batchId: newId(),
    ruleId: newId(),
    sessionId: newId(),
    admissionNo: 'ADM-0001',
  };
  const q = (sql: string, params: unknown[]) => client.query(sql, params);
  await q(
    `INSERT INTO teacher (id, tenant_id, branch_id, membership_id, full_name, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())`,
    [f.teacherId, t.id, branchId, membershipId, `Owner of ${t.name}`],
  );
  await q(
    `INSERT INTO course (id, tenant_id, name, updated_at) VALUES ($1, $2, 'Course 1', now())`,
    [f.courseId, t.id],
  );
  await q(
    `INSERT INTO course_level (id, tenant_id, course_id, name, updated_at)
     VALUES ($1, $2, $3, 'Level 1', now())`,
    [f.levelId, t.id, f.courseId],
  );
  await q(
    `INSERT INTO batch (id, tenant_id, branch_id, course_id, level_id, name, capacity, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'Batch 1', 20, now())`,
    [f.batchId, t.id, branchId, f.courseId, f.levelId],
  );
  await q(
    `INSERT INTO batch_teacher (tenant_id, batch_id, teacher_id, is_primary) VALUES ($1, $2, $3, true)`,
    [t.id, f.batchId, f.teacherId],
  );
  await q(
    `INSERT INTO student (id, tenant_id, branch_id, admission_no, full_name, admission_date, updated_at)
     VALUES ($1, $2, $3, $4, 'Student One', CURRENT_DATE, now())`,
    [f.studentId, t.id, branchId, f.admissionNo],
  );
  await q(
    `INSERT INTO student_health_note (tenant_id, student_id, notes, updated_at)
     VALUES ($1, $2, 'Fixture note', now())`,
    [t.id, f.studentId],
  );
  await q(
    `INSERT INTO parent (id, tenant_id, full_name, phone, whatsapp_capable, updated_at)
     VALUES ($1, $2, 'Parent One', '+919800000001', true, now())`,
    [f.parentId, t.id],
  );
  await q(
    `INSERT INTO parent_student (id, tenant_id, parent_id, student_id, relationship, is_primary_contact)
     VALUES ($1, $2, $3, $4, 'MOTHER', true)`,
    [f.parentLinkId, t.id, f.parentId, f.studentId],
  );
  await q(
    `INSERT INTO consent_record (id, tenant_id, parent_id, student_id, action, purposes, notice_version, channel)
     VALUES ($1, $2, $3, $4, 'GRANT', '{service}', 'fixture', 'ACADEMY_STAFF')`,
    [newId(), t.id, f.parentId, f.studentId],
  );
  await q(
    `INSERT INTO custom_field_definition (id, tenant_id, entity, key, label, type, updated_at)
     VALUES ($1, $2, 'STUDENT', 'school_bus', '{"en-IN":"School bus"}', 'TEXT', now())`,
    [f.customFieldId, t.id],
  );
  await q(
    `INSERT INTO tenant_sequence (tenant_id, key, next_value, updated_at)
     VALUES ($1, 'admission', 2, now())`,
    [t.id],
  );
  await q(
    `INSERT INTO batch_enrolment (id, tenant_id, batch_id, student_id, started_on, updated_at)
     VALUES ($1, $2, $3, $4, CURRENT_DATE, now())`,
    [newId(), t.id, f.batchId, f.studentId],
  );
  // Mondays 17:00–18:00 local; the session below is the next Monday, stored in UTC (IST −5:30).
  await q(
    `INSERT INTO schedule_rule (id, tenant_id, batch_id, teacher_id, weekday, start_minute, end_minute,
       effective_from, updated_at)
     VALUES ($1, $2, $3, $4, 1, 1020, 1080, CURRENT_DATE, now())`,
    [f.ruleId, t.id, f.batchId, f.teacherId],
  );
  await q(
    `INSERT INTO class_session (id, tenant_id, branch_id, batch_id, schedule_rule_id, teacher_id,
       session_date, starts_at, ends_at, origin, updated_at)
     SELECT $1, $2, $3, $4, $5, $6, d,
            (d + time '17:00') AT TIME ZONE 'Asia/Kolkata', (d + time '18:00') AT TIME ZONE 'Asia/Kolkata',
            'GENERATED', now()
       FROM (SELECT CURRENT_DATE + ((8 - extract(isodow FROM CURRENT_DATE)::int) % 7) AS d) next_monday`,
    [f.sessionId, t.id, branchId, f.batchId, f.ruleId, f.teacherId],
  );
  await q(
    `INSERT INTO activity_event (id, tenant_id, entity_type, entity_id, type, actor_membership_id, data)
     VALUES ($1, $2, 'STUDENT', $3, 'student.created', $4, '{"source":"manual"}')`,
    [newId(), t.id, f.studentId, membershipId],
  );
  await q(
    `INSERT INTO import_job (id, tenant_id, kind, status, file_name, file_size, file_type, expires_at, updated_at)
     VALUES ($1, $2, 'STUDENTS', 'COMPLETED', 'students.csv', 10, 'csv', now() + interval '7 days', now())`,
    [newId(), t.id],
  );
  await q(
    `INSERT INTO join_request (id, tenant_id, user_id, parent_name, child_name, status, updated_at)
     SELECT $1, $2, user_id, 'Fixture Parent', 'Fixture Child', 'REJECTED', now()
       FROM membership WHERE id = $3`,
    [newId(), t.id, membershipId],
  );
  // An earlier (replaced) logo: every tenant table has fixture rows (media_file, C-97).
  const mediaId = newId();
  await q(
    `INSERT INTO media_file (id, tenant_id, purpose, visibility, storage_key, mime_type, size_bytes, status, removed_at)
     VALUES ($1, $2, 'branding.logo', 'PUBLIC', $3, 'image/png', 1024, 'REMOVED', now())`,
    [mediaId, t.id, `t/${t.id}/branding/${mediaId}.png`],
  );
  const done = t.status !== 'SETUP' && t.status !== 'PENDING_APPROVAL';
  await q(
    `INSERT INTO tenant_onboarding (tenant_id, current_step, completed_at, updated_at)
     VALUES ($1, $2, $3, now())`,
    [t.id, done ? 'ready' : 'profile', done ? new Date() : null],
  );
  return f;
}
