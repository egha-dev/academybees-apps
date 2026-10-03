'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

/**
 * Server-state cache for signed-in workspaces (TanStack Query, ARCHITECTURE §10.7). Mounted by
 * the signed-in shell (S7), not the root: public screens such as sign-in never fetch lists, and
 * keeping it out of the root keeps them inside the route JS budget (G-24, C-68).
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
