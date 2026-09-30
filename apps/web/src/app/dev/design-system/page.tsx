import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { serverEnv } from '@/lib/env';

import { DesignSystemShowcase } from './showcase';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

/** Every component and state (task 0.7). Gated by environment: 404 in production. */
export default function DesignSystemPage() {
  if (serverEnv().APP_ENV === 'production') notFound();
  return <DesignSystemShowcase />;
}
