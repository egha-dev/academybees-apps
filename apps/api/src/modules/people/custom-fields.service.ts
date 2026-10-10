import {
  CalendarDateSchema,
  type CreateCustomFieldSchema,
  type CustomField,
  type CustomFieldValues,
  MAX_CUSTOM_FIELDS,
  newId,
  type UpdateCustomFieldSchema,
} from '@academybee/contracts';
import type { TenantBoundClient, TransactionClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { z } from 'zod';

import { AuditService } from '../../core/audit/audit.service.js';
import type { RequestContext } from '../../core/context/request-context.js';
import { TENANT_DB } from '../../core/database/database.module.js';
import { DomainError } from '../../core/errors/domain-error.js';

/** Labels are stored as locale variants (ADR-040); English only until Phase L. */
const LOCALE = 'en-IN';

type Row = {
  id: string;
  key: string;
  label: unknown;
  type: CustomField['type'];
  options: unknown;
  required: boolean;
  sortOrder: number;
  archivedAt: Date | null;
};
type StoredOption = { value: string; label: Record<string, string> };

const SELECT = {
  id: true,
  key: true,
  label: true,
  type: true,
  options: true,
  required: true,
  sortOrder: true,
  archivedAt: true,
} as const;

/**
 * Academy-defined student fields (G-05): up to 10 typed fields. Definitions are archived, never
 * deleted, so values already stored keep their meaning. Values are validated here for every write
 * (Add Student, edit, import).
 */
@Injectable()
export class CustomFieldsService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly cls: ClsService<RequestContext>,
    private readonly audit: AuditService,
  ) {}

  async list(
    db: Pick<TenantBoundClient, 'customFieldDefinition'> = this.db,
  ): Promise<CustomField[]> {
    const rows = await db.customFieldDefinition.findMany({
      where: { entity: 'STUDENT' },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: SELECT,
    });
    return rows.map(toField);
  }

  async create(input: z.infer<typeof CreateCustomFieldSchema>): Promise<CustomField> {
    const tenantId = this.tenantId();
    return this.db.$transaction(async (tx) => {
      const existing = await tx.customFieldDefinition.findMany({
        where: { entity: 'STUDENT' },
        select: { key: true, archivedAt: true, sortOrder: true },
      });
      if (existing.filter((f) => !f.archivedAt).length >= MAX_CUSTOM_FIELDS)
        throw new DomainError('VALIDATION_FAILED', 'too many custom fields', [
          { path: 'label', issue: 'too_many' },
        ]);
      const key = uniqueKey(
        input.label,
        existing.map((f) => f.key),
      );
      const row = await tx.customFieldDefinition.create({
        data: {
          id: newId(),
          tenantId,
          entity: 'STUDENT',
          key,
          label: { [LOCALE]: input.label },
          type: input.type,
          ...(input.type === 'SELECT' ? { options: toOptions(input.options ?? [], []) } : {}),
          required: input.required,
          sortOrder: Math.max(0, ...existing.map((f) => f.sortOrder + 1)),
        },
        select: SELECT,
      });
      await this.audit.record(
        { action: 'academy.custom_field_created', entityType: 'CustomField', entityId: row.id },
        tx,
      );
      return toField(row);
    });
  }

  async update(id: string, input: z.infer<typeof UpdateCustomFieldSchema>): Promise<CustomField> {
    return this.db.$transaction(async (tx) => {
      const row = await tx.customFieldDefinition.findFirst({ where: { id }, select: SELECT });
      if (!row) throw new DomainError('NOT_FOUND', 'custom field');
      if (input.archived === false && row.archivedAt) {
        const active = await tx.customFieldDefinition.count({
          where: { entity: 'STUDENT', archivedAt: null },
        });
        if (active >= MAX_CUSTOM_FIELDS)
          throw new DomainError('VALIDATION_FAILED', 'too many custom fields', [
            { path: 'archived', issue: 'too_many' },
          ]);
      }
      if (input.options && row.type !== 'SELECT')
        throw new DomainError('VALIDATION_FAILED', 'options only for SELECT', [
          { path: 'options', issue: 'invalid' },
        ]);
      const updated = await tx.customFieldDefinition.update({
        where: { id },
        data: {
          ...(input.label ? { label: { ...labels(row.label), [LOCALE]: input.label } } : {}),
          ...(input.options
            ? { options: toOptions(input.options, storedOptions(row.options)) }
            : {}),
          ...(input.required !== undefined ? { required: input.required } : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
          ...(input.archived !== undefined
            ? { archivedAt: input.archived ? (row.archivedAt ?? new Date()) : null }
            : {}),
        },
        select: SELECT,
      });
      await this.audit.record(
        { action: 'academy.custom_field_updated', entityType: 'CustomField', entityId: id },
        tx,
      );
      return toField(updated);
    });
  }

  /**
   * Check values against the academy's active definitions. `previous` are the stored values: on an
   * edit only changed keys are checked, and values of archived fields are kept untouched.
   * `requireAll` (creating) also insists on required fields.
   */
  async validate(
    tx: TransactionClient,
    values: CustomFieldValues | undefined,
    options: { previous?: CustomFieldValues; requireAll: boolean },
  ): Promise<CustomFieldValues> {
    const fields = await this.list(tx);
    const active = new Map(fields.filter((f) => !f.archived).map((f) => [f.key, f]));
    const merged: CustomFieldValues = { ...(options.previous ?? {}) };
    const issues: { path: string; issue: string }[] = [];
    for (const [key, value] of Object.entries(values ?? {})) {
      const field = active.get(key);
      if (!field) {
        issues.push({ path: `customFields.${key}`, issue: 'unknown' });
        continue;
      }
      if (value === null || value === '') {
        merged[key] = null;
        continue;
      }
      const ok =
        (field.type === 'TEXT' && typeof value === 'string' && value.trim().length <= 200) ||
        (field.type === 'NUMBER' && typeof value === 'number' && Number.isFinite(value)) ||
        (field.type === 'DATE' &&
          typeof value === 'string' &&
          CalendarDateSchema.safeParse(value).success) ||
        (field.type === 'SELECT' &&
          typeof value === 'string' &&
          field.options.some((o) => o.value === value));
      if (!ok) issues.push({ path: `customFields.${key}`, issue: 'invalid' });
      else merged[key] = typeof value === 'string' ? value.trim() : value;
    }
    if (options.requireAll)
      for (const field of active.values())
        if (field.required && (merged[field.key] === undefined || merged[field.key] === null))
          issues.push({ path: `customFields.${field.key}`, issue: 'required' });
    if (issues.length) throw new DomainError('VALIDATION_FAILED', 'custom fields', issues);
    return merged;
  }

  private tenantId(): string {
    const id = this.cls.get('tenantId');
    if (!id) throw new DomainError('NOT_FOUND', 'no academy');
    return id;
  }
}

function labels(raw: unknown): Record<string, string> {
  return raw && typeof raw === 'object' ? (raw as Record<string, string>) : {};
}

function storedOptions(raw: unknown): StoredOption[] {
  return Array.isArray(raw) ? (raw as StoredOption[]) : [];
}

/** Keep the stored value of options whose label is unchanged, so saved answers stay valid. */
function toOptions(newLabels: string[], previous: StoredOption[]): StoredOption[] {
  const byLabel = new Map(previous.map((o) => [o.label[LOCALE], o.value]));
  const used = new Set(previous.map((o) => o.value));
  let next = previous.length + 1;
  return newLabels.map((label) => {
    let value = byLabel.get(label);
    if (!value) {
      while (used.has(`opt_${next}`)) next += 1;
      value = `opt_${next}`;
      used.add(value);
    }
    return { value, label: { [LOCALE]: label } };
  });
}

/** `belt_colour` from "Belt colour"; non-Latin labels get `field_N` (keys are never shown). */
function uniqueKey(label: string, taken: string[]): string {
  const base =
    label
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/^(\d)/, 'f_$1')
      .slice(0, 32) || `field_${taken.length + 1}`;
  let key = base;
  for (let i = 2; taken.includes(key); i += 1) key = `${base}_${i}`;
  return key;
}

function toField(row: Row): CustomField {
  return {
    id: row.id,
    key: row.key,
    label: labels(row.label)[LOCALE] ?? row.key,
    type: row.type,
    options: storedOptions(row.options).map((o) => ({
      value: o.value,
      label: o.label[LOCALE] ?? o.value,
    })),
    required: row.required,
    sortOrder: row.sortOrder,
    archived: row.archivedAt !== null,
  };
}
