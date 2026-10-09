import 'server-only';

import { type AcademyDetail, AcademyDetailSchema } from '@academybee/contracts';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import { apiServerGet } from '@/lib/api.server';

/**
 * One academy for the console pages, read once per request (the API records each view on the
 * academy's audit trail). Unknown → 404 page; the console can't reach academy data → `undefined`.
 */
export const loadAcademy = cache(async (id: string): Promise<AcademyDetail | undefined> => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const res = await apiServerGet(`/platform/tenants/${id}`);
  if (res.status === 404) notFound();
  if (res.status === 503) return undefined;
  if (!res.ok) throw new Error(`academy ${res.status}`);
  return AcademyDetailSchema.parse(await res.json());
});
