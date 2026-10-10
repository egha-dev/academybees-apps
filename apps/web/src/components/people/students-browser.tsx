// Loaded lazily by students-lazy.tsx (no 'use client' here, C-80): search, filters and the list.
import type { CursorPage, StudentListItem } from '@academybee/contracts';
import type { Messages } from '@academybee/i18n';
import { InlineAlert } from '@academybee/ui/components/alert';
import { StatusBadge } from '@academybee/ui/components/display';
import { EmptyState } from '@academybee/ui/components/feedback';
import { SelectInput } from '@academybee/ui/components/fields';
import { Box, Stack } from '@academybee/ui/components/layout';
import { PlainButton } from '@academybee/ui/components/plain-button';
import { Text } from '@academybee/ui/components/text';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { type ChangeEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { fill } from '@/components/shell-labels';
import { api } from '@/lib/api';

import { STATUS_TONE } from './status';

export type BrowserQuery = { q: string; status: string; archived: boolean };
export type StudentsBrowserLabels = {
  students: Messages['people']['students'];
  status: Messages['people']['status'];
  add: string;
};

const PAGE = 50;
/** Above this many rows only the visible ones are in the DOM (3 GB phones, ADR-035). */
const VIRTUALISE_FROM = 120;
const ROW_HEIGHT = 72;

function queryString(query: BrowserQuery, cursor?: string | null): string {
  const p = new URLSearchParams({ limit: String(PAGE) });
  if (query.q.trim().length >= 2) p.set('q', query.q.trim());
  if (query.status) p.set('status', query.status);
  if (query.archived) p.set('archived', 'true');
  if (cursor) p.set('cursor', cursor);
  return p.toString();
}

/**
 * Students list (UX §11.3): search as you type (name, admission number, a parent's phone),
 * status and archived filters, keyset "show more", and a virtualised list once it gets long.
 * The first page comes from the server; the URL keeps the filters so a reload or a shared link
 * shows the same list.
 */
export function StudentsBrowser({
  initial,
  initialQuery,
  canCreate,
  labels,
}: {
  initial: CursorPage<StudentListItem>;
  initialQuery: BrowserQuery;
  canCreate: boolean;
  labels: StudentsBrowserLabels;
}) {
  const t = labels.students;
  const [query, setQuery] = useState(initialQuery);
  const [items, setItems] = useState(initial.items);
  const [next, setNext] = useState(initial.nextCursor);
  const [loading, setLoading] = useState<'search' | 'more'>();
  const [failed, setFailed] = useState(false);
  const first = useRef(true);

  // Re-query when the search or filters change (debounced while typing).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const controller = { cancelled: false };
    const run = async () => {
      setLoading('search');
      const res = await api<CursorPage<StudentListItem>>(`/students?${queryString(query)}`);
      if (controller.cancelled) return;
      setLoading(undefined);
      if (!res.ok) {
        setFailed(true);
        return;
      }
      setFailed(false);
      setItems(res.data.items);
      setNext(res.data.nextCursor);
      const url = new URL(window.location.href);
      for (const key of ['q', 'status', 'archived']) url.searchParams.delete(key);
      if (query.q.trim()) url.searchParams.set('q', query.q.trim());
      if (query.status) url.searchParams.set('status', query.status);
      if (query.archived) url.searchParams.set('archived', 'true');
      window.history.replaceState(null, '', url);
    };
    const timer = setTimeout(() => void run(), 300);
    return () => {
      controller.cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  async function more() {
    if (!next) return;
    setLoading('more');
    const res = await api<CursorPage<StudentListItem>>(`/students?${queryString(query, next)}`);
    setLoading(undefined);
    if (!res.ok) {
      setFailed(true);
      return;
    }
    setItems((current) => [...current, ...res.data.items]);
    setNext(res.data.nextCursor);
  }

  const searching = query.q.trim().length >= 2 || query.status !== '';
  const statusOptions = [
    { value: '', label: t.filters.all },
    ...(['ACTIVE', 'ON_HOLD', 'COMPLETED', 'LEFT'] as const).map((s) => ({
      value: s,
      label: labels.status[s],
    })),
  ];

  return (
    <Stack spacing={4}>
      <Stack
        component="search"
        aria-label={t.filters.label}
        direction={{ xs: 'column', md: 'row' }}
        sx={{ gap: 3, alignItems: { md: 'flex-end' } }}
      >
        <Box sx={{ flex: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box
            component="label"
            htmlFor="student-search"
            sx={{ fontSize: 14, fontWeight: 600, color: 'ab.textPrimary' }}
          >
            {t.search}
          </Box>
          <Box
            component="input"
            id="student-search"
            type="search"
            role="searchbox"
            value={query.q}
            placeholder={t.searchPlaceholder}
            autoComplete="off"
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setQuery((q) => ({ ...q, q: e.target.value }))
            }
            sx={{
              minBlockSize: 48,
              paddingInline: '14px',
              font: 'inherit',
              fontSize: 16,
              color: 'ab.textPrimary',
              bgcolor: 'ab.surface',
              border: '1px solid',
              borderColor: 'ab.borderStrong',
              borderRadius: 2,
            }}
          />
        </Box>
        <Box sx={{ flex: 1 }}>
          <SelectInput
            name="status"
            label={t.filters.status}
            value={query.status}
            options={statusOptions}
            onChange={(status) => setQuery((q) => ({ ...q, status }))}
          />
        </Box>
        <Box role="group" aria-label={t.filters.label} sx={{ display: 'flex', gap: 1 }}>
          {([false, true] as const).map((archived) => (
            <PlainButton
              key={String(archived)}
              variant={query.archived === archived ? 'primary' : 'secondary'}
              onClick={() => setQuery((q) => ({ ...q, archived }))}
            >
              {archived ? t.filters.archived : t.filters.current}
            </PlainButton>
          ))}
        </Box>
      </Stack>

      <Box aria-live="polite" sx={{ minBlockSize: 20 }}>
        {loading === 'search' && <Text tone="secondary">{t.loading}</Text>}
      </Box>
      {failed && <InlineAlert tone="danger">{t.error}</InlineAlert>}

      {items.length === 0 && !loading ? (
        query.archived ? (
          <EmptyState
            title={t.archivedEmptyTitle}
            body={t.archivedEmptyBody}
            action={{
              label: t.filters.current,
              onClick: () => setQuery({ ...query, archived: false }),
            }}
          />
        ) : searching ? (
          <EmptyState
            title={t.noResultsTitle}
            body={t.noResultsBody}
            action={{
              label: t.clearSearch,
              onClick: () => setQuery({ ...query, q: '', status: '' }),
            }}
          />
        ) : (
          <EmptyState
            title={t.emptyTitle}
            body={t.emptyBody}
            {...(canCreate ? { action: { label: labels.add, href: '?add=1' } } : {})}
          />
        )
      ) : (
        <Rows items={items} labels={labels} />
      )}

      {next && (
        <Box>
          <PlainButton onClick={() => void more()} busy={loading === 'more'}>
            {loading === 'more' ? t.loadingMore : t.loadMore}
          </PlainButton>
        </Box>
      )}
    </Stack>
  );
}

function Rows({ items, labels }: { items: StudentListItem[]; labels: StudentsBrowserLabels }) {
  const listRef = useRef<HTMLUListElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const virtual = items.length > VIRTUALISE_FROM;
  // Where the list starts on the page, for the window virtualiser (measured after layout).
  useLayoutEffect(() => {
    if (virtual) setScrollMargin(listRef.current?.offsetTop ?? 0);
  }, [virtual]);
  const virtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
    scrollMargin,
    enabled: virtual,
  });
  const listSx = {
    margin: 0,
    padding: 0,
    borderBlockStart: '1px solid',
    borderColor: 'ab.border',
  } as const;
  if (!virtual)
    return (
      <Box component="ul" ref={listRef} sx={listSx}>
        {items.map((s) => (
          <Row key={s.id} student={s} labels={labels} />
        ))}
      </Box>
    );
  const rows = virtualizer.getVirtualItems();
  return (
    <Box
      component="ul"
      ref={listRef}
      sx={{ ...listSx, position: 'relative', blockSize: virtualizer.getTotalSize() }}
    >
      {rows.map((row) => (
        <Row
          key={items[row.index]!.id}
          student={items[row.index]!}
          labels={labels}
          offset={row.start - scrollMargin}
        />
      ))}
    </Box>
  );
}

function Row({
  student,
  labels,
  offset,
}: {
  student: StudentListItem;
  labels: StudentsBrowserLabels;
  offset?: number;
}) {
  const t = labels.students;
  const status = student.archivedAt ? 'ARCHIVED' : student.status;
  return (
    <Box
      component="li"
      sx={{
        listStyle: 'none',
        borderBlockEnd: '1px solid',
        borderColor: 'ab.border',
        ...(offset !== undefined
          ? {
              position: 'absolute',
              insetInline: 0,
              insetBlockStart: 0,
              transform: `translateY(${offset}px)`,
            }
          : {}),
      }}
    >
      <Box
        component="a"
        href={`/students/${student.id}`}
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          minBlockSize: ROW_HEIGHT,
          paddingInline: 2,
          paddingBlock: 2,
          color: 'inherit',
          textDecoration: 'none',
          '&:hover': { bgcolor: 'ab.surfaceRaised' },
        }}
      >
        <Stack spacing={0.5} sx={{ minInlineSize: 0, flex: 1 }}>
          <Text variant="body" as="span">
            <strong>{student.fullName}</strong>
            {student.preferredName ? ` (${student.preferredName})` : ''}
          </Text>
          <Text variant="meta" tone="secondary" as="span">
            {fill(t.admission, { number: student.admissionNo })}
            {' · '}
            {student.primaryParent
              ? [student.primaryParent.fullName, student.primaryParent.phone]
                  .filter(Boolean)
                  .join(' · ')
              : t.noParent}
          </Text>
        </Stack>
        <StatusBadge tone={STATUS_TONE[status]} label={labels.status[status]} />
      </Box>
    </Box>
  );
}
