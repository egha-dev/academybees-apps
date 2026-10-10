// Loaded lazily by palette-trigger.tsx (no 'use client', C-80).
import type { SearchResults } from '@academybee/contracts';
import { Box, Stack } from '@academybee/ui/components/layout';
import { Text } from '@academybee/ui/components/text';
import { type ChangeEvent, type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';

import { fill } from '@/components/shell-labels';
import { api } from '@/lib/api';

import type { PaletteLabels, QuickAction } from './palette-trigger';

type Item = { id: string; group: string; label: string; detail?: string; href: string };

/**
 * The command palette (UX §9.1, ADR-026): one search over students, parents and teachers the
 * caller may see (the API applies their scopes), plus quick actions. A native modal `<dialog>`
 * (focus trapped, Escape closes); a combobox with arrow-key navigation for screen readers.
 */
export function Palette({
  labels,
  actions,
  onClose,
}: {
  labels: PaletteLabels;
  actions: QuickAction[];
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [state, setState] = useState<'idle' | 'searching' | 'error'>('idle');
  const [active, setActive] = useState(0);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    el.showModal();
    input.current?.focus();
    const close = () => onClose();
    el.addEventListener('close', close);
    return () => el.removeEventListener('close', close);
  }, [onClose]);

  useEffect(() => {
    const text = q.trim();
    // Short queries show the quick actions instead (derived below); nothing to fetch.
    if (text.length < 2) return;
    let cancelled = false;
    const run = async () => {
      setState('searching');
      const res = await api<SearchResults>(`/search?q=${encodeURIComponent(text)}`);
      if (cancelled) return;
      if (!res.ok) return setState('error');
      setResults(res.data);
      setState('idle');
      setActive(0);
    };
    const timer = setTimeout(() => void run(), 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q]);

  const searching = q.trim().length >= 2;
  const items: Item[] =
    searching && results
      ? [
          ...results.students.map((s) => ({
            id: `s-${s.id}`,
            group: labels.students,
            label: s.fullName,
            detail: s.admissionNo,
            href: `/students/${s.id}`,
          })),
          ...results.parents.map((p) => ({
            id: `p-${p.id}`,
            group: labels.parents,
            label: p.fullName,
            ...(p.studentName ? { detail: fill(labels.parentOf, { name: p.studentName }) } : {}),
            href: p.studentId ? `/students/${p.studentId}` : '/students',
          })),
          ...results.teachers.map((t) => ({
            id: `t-${t.id}`,
            group: labels.teachers,
            label: t.fullName,
            href: `/teachers/${t.id}`,
          })),
        ]
      : actions.map((a) => ({
          id: `a-${a.key}`,
          group: labels.actions,
          label: labels.quick[a.key],
          href: a.href,
        }));

  function go(item: Item | undefined) {
    if (item) window.location.assign(item.href);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(items[active]);
    }
  }

  const groups = [...new Set(items.map((i) => i.group))];
  const status = !searching
    ? labels.hint
    : state === 'searching'
      ? labels.searching
      : state === 'error'
        ? labels.error
        : results && items.length === 0
          ? labels.none
          : '';

  return (
    <Box
      component="dialog"
      ref={dialog}
      aria-label={labels.title}
      onClick={(e: React.MouseEvent) => {
        // A click on the backdrop (the dialog element itself) closes it.
        if (e.target === dialog.current) dialog.current?.close();
      }}
      sx={{
        inlineSize: 'min(640px, calc(100vw - 32px))',
        maxBlockSize: '70vh',
        marginBlockStart: '10vh',
        padding: 0,
        border: '1px solid',
        borderColor: 'ab.border',
        borderRadius: 3,
        bgcolor: 'ab.surface',
        color: 'ab.textPrimary',
        boxShadow: '0 16px 48px rgba(23,24,23,0.24)',
        '&::backdrop': { background: 'rgba(23,24,23,0.4)' },
      }}
    >
      <Stack spacing={0}>
        <Box sx={{ padding: 2, borderBlockEnd: '1px solid', borderColor: 'ab.border' }}>
          <Box
            component="input"
            ref={input}
            type="search"
            role="combobox"
            aria-label={labels.input}
            aria-expanded={items.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={items[active] ? `${listId}-${items[active].id}` : undefined}
            placeholder={labels.input}
            value={q}
            autoComplete="off"
            onChange={(e: ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            sx={{
              inlineSize: '100%',
              boxSizing: 'border-box',
              minBlockSize: 48,
              paddingInline: 2,
              font: 'inherit',
              fontSize: 18,
              color: 'ab.textPrimary',
              bgcolor: 'transparent',
              border: 0,
              outline: 'none',
            }}
          />
        </Box>
        <Box aria-live="polite" sx={{ paddingInline: 3, paddingBlock: status ? 2 : 0 }}>
          {status && (
            <Text variant="bodySmall" tone="secondary">
              {status}
            </Text>
          )}
        </Box>
        <Box
          id={listId}
          role="listbox"
          aria-label={labels.title}
          sx={{ overflowY: 'auto', maxBlockSize: '55vh', paddingBlockEnd: 1 }}
        >
          {groups.map((group) => (
            <Box key={group} role="group" aria-label={group}>
              <Text variant="meta" tone="secondary" as="div">
                <Box
                  component="span"
                  sx={{
                    display: 'block',
                    paddingInline: 3,
                    paddingBlockStart: 2,
                    paddingBlockEnd: 1,
                  }}
                >
                  {group}
                </Box>
              </Text>
              {items
                .filter((i) => i.group === group)
                .map((item) => {
                  const index = items.indexOf(item);
                  const selected = index === active;
                  return (
                    <Box
                      key={item.id}
                      id={`${listId}-${item.id}`}
                      role="option"
                      aria-selected={selected}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => go(item)}
                      sx={{
                        display: 'flex',
                        gap: 2,
                        alignItems: 'baseline',
                        justifyContent: 'space-between',
                        minBlockSize: 48,
                        paddingInline: 3,
                        paddingBlock: 1.5,
                        cursor: 'pointer',
                        bgcolor: selected ? 'ab.accentSoft' : 'transparent',
                        color: selected ? 'ab.onAccentSoft' : 'inherit',
                      }}
                    >
                      <Text as="span">{item.label}</Text>
                      {item.detail && (
                        <Text variant="meta" tone="secondary" as="span">
                          {item.detail}
                        </Text>
                      )}
                    </Box>
                  );
                })}
            </Box>
          ))}
        </Box>
      </Stack>
    </Box>
  );
}
