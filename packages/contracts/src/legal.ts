import { z } from 'zod';

/**
 * Legal documents the academy owner accepts before onboarding (G-06, ADR-034). The catalogue is
 * synced into `legal_document` on every migrate/deploy. Publishing a new version = adding an entry
 * with a later `publishedAt`; everyone is then asked to accept again. Content is locale-keyed
 * (ADR-040), `en-IN` only until Phase L.
 */
export const LEGAL_DOCUMENT_KINDS = [
  'TERMS',
  'PRIVACY',
  'DPA',
  'ACADEMY_PRIVACY_TEMPLATE',
] as const;
export const LegalDocumentKindSchema = z.enum(LEGAL_DOCUMENT_KINDS);
export type LegalDocumentKind = z.infer<typeof LegalDocumentKindSchema>;

/** What an academy owner must have accepted before onboarding (ADR-034). */
export const OWNER_LEGAL_KINDS = [
  'TERMS',
  'PRIVACY',
  'DPA',
] as const satisfies readonly LegalDocumentKind[];

export const LegalVariantSchema = z.object({
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(600),
  url: z.url(),
});
export type LegalVariant = z.infer<typeof LegalVariantSchema>;

export type LegalDocumentDefinition = {
  /** Fixed id so every environment agrees (UUIDv7-shaped). */
  id: string;
  kind: LegalDocumentKind;
  version: string;
  publishedAt: string;
  variants: Record<string, LegalVariant>;
};

/**
 * Draft texts on the marketing site (C-74) until counsel's versions are ready; staging may use
 * drafts, the pilot may not (EXECUTION_GUIDE Phase 3, G-28).
 */
export const LEGAL_DOCUMENTS: readonly LegalDocumentDefinition[] = [
  {
    id: '019a0000-0000-7000-8000-00000000a001',
    kind: 'TERMS',
    version: '2026-10-draft',
    publishedAt: '2026-10-07T00:00:00.000Z',
    variants: {
      'en-IN': {
        title: 'Terms of service',
        summary:
          'How your academy may use AcademyBee, what we provide, and what each side is responsible for.',
        url: 'https://academybees.com/terms/',
      },
    },
  },
  {
    id: '019a0000-0000-7000-8000-00000000a002',
    kind: 'PRIVACY',
    version: '2026-10-draft',
    publishedAt: '2026-10-07T00:00:00.000Z',
    variants: {
      'en-IN': {
        title: 'Privacy policy',
        summary: 'What personal data AcademyBee collects, why, and the rights people have over it.',
        url: 'https://academybees.com/privacy/',
      },
    },
  },
  {
    id: '019a0000-0000-7000-8000-00000000a003',
    kind: 'DPA',
    version: '2026-10-draft',
    publishedAt: '2026-10-07T00:00:00.000Z',
    variants: {
      'en-IN': {
        title: 'Data processing agreement',
        summary:
          "Your academy controls its students' and parents' data; AcademyBee processes it only to run the service for you.",
        url: 'https://academybees.com/dpa/',
      },
    },
  },
];

/** The current version of each kind at `now`: the latest one already published. */
export function currentLegalDocuments(
  now: Date,
  documents: readonly LegalDocumentDefinition[] = LEGAL_DOCUMENTS,
): LegalDocumentDefinition[] {
  const latest = new Map<LegalDocumentKind, LegalDocumentDefinition>();
  for (const doc of documents) {
    if (new Date(doc.publishedAt) > now) continue;
    const seen = latest.get(doc.kind);
    if (!seen || new Date(doc.publishedAt) > new Date(seen.publishedAt)) latest.set(doc.kind, doc);
  }
  return [...latest.values()];
}

/** `GET /legal/current` — the documents the signed-in owner must accept, and whether they have. */
export const LegalCurrentResponseSchema = z.object({
  documents: z.array(
    z.object({
      id: z.uuid(),
      kind: LegalDocumentKindSchema,
      version: z.string(),
      title: z.string(),
      summary: z.string(),
      url: z.url(),
      accepted: z.boolean(),
    }),
  ),
  /** True when nothing is left to accept. */
  complete: z.boolean(),
});
export type LegalCurrentResponse = z.infer<typeof LegalCurrentResponseSchema>;

/** `POST /legal/accept` — accept the listed current documents (all of them at once in the UI). */
export const LegalAcceptRequestSchema = z.object({
  documentIds: z.array(z.uuid()).min(1).max(10),
});
export type LegalAcceptRequest = z.infer<typeof LegalAcceptRequestSchema>;
