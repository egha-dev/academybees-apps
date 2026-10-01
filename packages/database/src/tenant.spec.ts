import { describe, expect, it } from 'vitest';

import { MODEL_KINDS, scopeArgs, TenantMismatchError, uniqueToFirstArgs } from './tenant.js';

const A = '01a0f76f-f6b7-7509-a8c2-25059adb97fb';
const B = '01a0f76f-f745-76ee-8122-37ac4c53af4c';

describe('MODEL_KINDS', () => {
  it('classifies the models', () => {
    expect(MODEL_KINDS).toMatchObject({
      Tenant: 'tenant-root',
      Branch: 'tenant-owned',
      TenantDomain: 'tenant-owned',
      AuditLog: 'platform-rows',
      FeatureFlagOverride: 'platform-rows',
      FeatureFlag: 'global',
    });
  });
});

describe('scopeArgs', () => {
  it('adds tenantId to filters', () => {
    expect(scopeArgs('Branch', 'findMany', { where: { name: 'Main' } }, A)).toEqual({
      where: { name: 'Main', tenantId: A },
    });
    expect(scopeArgs('Branch', 'count', {}, A)).toEqual({ where: { tenantId: A } });
  });

  it('accepts an explicit filter on the same tenant and refuses another', () => {
    expect(scopeArgs('Branch', 'findFirst', { where: { tenantId: A } }, A)).toEqual({
      where: { tenantId: A },
    });
    expect(() => scopeArgs('Branch', 'deleteMany', { where: { tenantId: B } }, A)).toThrow(
      TenantMismatchError,
    );
  });

  it('injects tenantId into created rows', () => {
    expect(scopeArgs('Branch', 'create', { data: { name: 'x' } }, A)).toEqual({
      data: { name: 'x', tenantId: A },
    });
    expect(scopeArgs('Branch', 'createMany', { data: [{ name: 'x' }, { name: 'y' }] }, A)).toEqual({
      data: [
        { name: 'x', tenantId: A },
        { name: 'y', tenantId: A },
      ],
    });
  });

  it('refuses rows for another tenant and relation writes', () => {
    expect(() => scopeArgs('Branch', 'create', { data: { tenantId: B } }, A)).toThrow(
      TenantMismatchError,
    );
    expect(() =>
      scopeArgs('Branch', 'create', { data: { tenant: { connect: { id: B } } } }, A),
    ).toThrow(TenantMismatchError);
    expect(() =>
      scopeArgs('Branch', 'update', { where: { id: 'x' }, data: { tenantId: B } }, A),
    ).toThrow(TenantMismatchError);
  });

  it('scopes upserts on both sides', () => {
    expect(
      scopeArgs('Branch', 'upsert', { where: { id: 'x' }, create: { name: 'x' }, update: {} }, A),
    ).toEqual({ where: { id: 'x', tenantId: A }, create: { name: 'x', tenantId: A }, update: {} });
  });

  it('keys the tenant row on id and never creates tenants', () => {
    expect(scopeArgs('Tenant', 'findMany', {}, A)).toEqual({ where: { id: A } });
    expect(() => scopeArgs('Tenant', 'findUnique', { where: { id: B } }, A)).toThrow(
      TenantMismatchError,
    );
    expect(() => scopeArgs('Tenant', 'create', { data: { id: A } }, A)).toThrow(
      TenantMismatchError,
    );
  });

  it('leaves global models alone', () => {
    expect(scopeArgs('FeatureFlag', 'findMany', { where: { key: 'k' } }, A)).toEqual({
      where: { key: 'k' },
    });
  });
});

describe('uniqueToFirstArgs', () => {
  it('flattens compound unique selectors and keeps everything else', () => {
    expect(
      uniqueToFirstArgs({
        where: { scope_key: { scope: 's', key: 'k' }, tenantId: A },
        select: { id: true },
      }),
    ).toEqual({ where: { scope: 's', key: 'k', tenantId: A }, select: { id: true } });
    expect(uniqueToFirstArgs({ where: { id: 'x', name: { equals: 'n' } } })).toEqual({
      where: { id: 'x', name: { equals: 'n' } },
    });
  });
});
