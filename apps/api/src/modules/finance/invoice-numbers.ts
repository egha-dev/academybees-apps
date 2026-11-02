import type { TransactionClient } from '@academybee/database';

import { DomainError } from '../../core/errors/domain-error.js';
import { fiscalYearOf, formatNumber } from './domain/numbering.js';

/**
 * Take the next invoice or receipt number (ADR-018, C-142): the year's row is created on first
 * use and stays locked until the transaction ends, so numbers never repeat and a rollback gives
 * the number back (no gaps from failed saves).
 */
export async function nextNumber(
  tx: TransactionClient,
  input: { tenantId: string; kind: 'INVOICE' | 'RECEIPT'; localDate: string; prefix: string },
): Promise<string> {
  const { tenantId, kind, prefix } = input;
  const fiscalYear = fiscalYearOf(input.localDate);
  const key = { tenantId_kind_fiscalYear: { tenantId, kind, fiscalYear } };
  await tx.numberSequence.upsert({
    where: key,
    create: { tenantId, kind, fiscalYear, prefix },
    update: {},
  });
  const [row] = await tx.$queryRaw<{ last_value: number; prefix: string }[]>`
    SELECT last_value, prefix FROM number_sequence
     WHERE tenant_id = ${tenantId}::uuid AND kind = ${kind}::number_kind
       AND fiscal_year = ${fiscalYear} FOR UPDATE`;
  if (!row) throw new DomainError('INTERNAL', 'sequence missing');
  const seq = row.last_value + 1;
  await tx.numberSequence.update({ where: key, data: { lastValue: seq } });
  return formatNumber(row.prefix, fiscalYear, seq);
}
