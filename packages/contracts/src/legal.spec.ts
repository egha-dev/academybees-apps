import { describe, expect, it } from 'vitest';

import {
  currentLegalDocuments,
  LEGAL_DOCUMENTS,
  LegalVariantSchema,
  OWNER_LEGAL_KINDS,
} from './legal.js';

describe('legal catalogue (G-06, ADR-034)', () => {
  it('has a current en-IN version of every document the owner must accept', () => {
    const current = currentLegalDocuments(new Date('2026-10-08T00:00:00Z'));
    for (const kind of OWNER_LEGAL_KINDS) {
      const doc = current.find((d) => d.kind === kind);
      expect(doc, kind).toBeDefined();
      expect(LegalVariantSchema.parse(doc!.variants['en-IN'])).toBeTruthy();
    }
  });

  it('ids and kind+version are unique', () => {
    expect(new Set(LEGAL_DOCUMENTS.map((d) => d.id)).size).toBe(LEGAL_DOCUMENTS.length);
    expect(new Set(LEGAL_DOCUMENTS.map((d) => `${d.kind}@${d.version}`)).size).toBe(
      LEGAL_DOCUMENTS.length,
    );
  });

  it('picks the latest published version and ignores future ones', () => {
    const v = (version: string, publishedAt: string) => ({
      id: version,
      kind: 'TERMS' as const,
      version,
      publishedAt,
      variants: {},
    });
    const docs = [
      v('1', '2026-01-01T00:00:00Z'),
      v('2', '2026-06-01T00:00:00Z'),
      v('3', '2027-01-01T00:00:00Z'),
    ];
    expect(
      currentLegalDocuments(new Date('2026-07-01T00:00:00Z'), docs).map((d) => d.version),
    ).toEqual(['2']);
  });
});
