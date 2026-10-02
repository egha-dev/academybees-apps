import { type Capability, ROLE_KEYS, ROLE_TEMPLATES, type RoleKey } from '@academybee/contracts';

import type { Prisma } from './generated/prisma/client.js';

/** Stored role name (data, for audit and custom-role lists). The UI shows i18n `roles.<key>`. */
const ROLE_NAMES: Record<RoleKey, string> = {
  owner: 'Owner',
  admin: 'Admin',
  teacher: 'Teacher',
  accountant: 'Accountant',
  receptionist: 'Receptionist',
  parent: 'Parent',
  student: 'Student',
};

/**
 * Copy the code role templates into one academy (C-60): one `Role` per template with its scoped
 * permissions. Idempotent — existing roles keep their ids and gain missing permissions. Run inside
 * a transaction with that academy's context (`app.tenant_id`). Used by dev seeds now and by
 * provisioning from Phase 3.
 */
export async function ensureSystemRoles(
  tx: Prisma.TransactionClient,
  tenantId: string,
  newId: () => string,
): Promise<Record<RoleKey, string>> {
  const ids = {} as Record<RoleKey, string>;
  for (const key of ROLE_KEYS) {
    const role = await tx.role.upsert({
      where: { tenantId_key: { tenantId, key } },
      create: { id: newId(), tenantId, key, name: ROLE_NAMES[key], isSystem: true },
      update: {},
      select: { id: true },
    });
    ids[key] = role.id;
    const grants = Object.entries(ROLE_TEMPLATES[key].grants) as Array<
      [Capability, (typeof ROLE_TEMPLATES)[RoleKey]['grants'][Capability] & string]
    >;
    await tx.rolePermission.createMany({
      data: grants.map(([capability, scope]) => ({ tenantId, roleId: role.id, capability, scope })),
      skipDuplicates: true,
    });
  }
  return ids;
}
