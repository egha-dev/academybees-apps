export {
  createAppClient,
  createMigratorClient,
  withTransaction,
  type DatabaseClientOptions,
  type TransactionClient,
} from './clients.js';
export { Prisma, PrismaClient } from './generated/prisma/client.js';
export {
  bindUser,
  createTenantBoundClient,
  MODEL_KINDS,
  type ResolvedDomainRow,
  scopeArgs,
  TENANT_OWNED_MODELS,
  USER_OWNED_MODELS,
  type IdempotencyClaimRef,
  type IdempotencyClaimSource,
  IdempotencyClaimLostError,
  type TenantBoundClient,
  TenantContextMissingError,
  type TenantIdSource,
  type UserIdSource,
  TenantMismatchError,
  uniqueToFirstArgs,
} from './tenant.js';
export { ensureSystemRoles } from './roles.js';
export { uniqueIndexFields } from './unique-constraints.js';
export * from './generated/prisma/enums.js';
export type * from './generated/prisma/models.js';
