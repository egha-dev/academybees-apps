// Part of the Teacher PWA's lazy chunk.
import { ATTENDANCE_STATUSES, type AttendanceStatus } from '@academybee/contracts';
import type { RollEntry } from '@academybee/sync';
import { Button } from '@academybee/ui/components/actions';
import { InlineAlert } from '@academybee/ui/components/alert';
import { Box, Stack } from '@academybee/ui/components/layout';
import { PlainButton } from '@academybee/ui/components/plain-button';
import { Text } from '@academybee/ui/components/text';
import { useMemo, useState } from 'react';

import { plural, plurals } from '@/components/scheduling/plural';
import { fill } from '@/lib/fill';

import { useTeach } from '../teach-app';
import { useLive, useNow } from '../use-live';

/** C-130: teachers change a roll call until 48 h after the class ends. */
const TEACHER_EDIT_MS = 48 * 3_600_000;

const TONES: Record<AttendanceStatus, string> = {
  PRESENT: 'ab.status.success',
  ABSENT: 'ab.status.danger',
  LATE: 'ab.status.warning',
  LEAVE: 'ab.status.info',
};

/**
 * Take attendance (UX §12, Tier 1): Mark all present, then change the exceptions with large
 * Present / Absent / Late / Leave toggles. Saving puts the roll call on this device at once and
 * queues it for the academy (C-126, C-131) — the same online or offline.
 */
export function AttendanceView() {
  const { engine, labels, today, time, day, canEditPast, backHref = '/teach/classes' } = useTeach();
  const t = labels.teach;
  const a = t.attendance;
  const [sessionId] = useState(
    () =>
      new URLSearchParams(typeof location === 'undefined' ? '' : location.search).get('session') ??
      '',
  );
  const data = useLive(
    async () => ({
      cls: await engine.local.class(sessionId),
      roll: await engine.local.roll(sessionId),
    }),
    [engine, sessionId],
  );
  const now = useNow();
  const [draft, setDraft] = useState<Record<string, AttendanceStatus>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Start from what is on this device; the user's unsaved choices win.
  const marks = useMemo(() => {
    const out: Record<string, AttendanceStatus | undefined> = {};
    for (const r of data?.roll ?? []) out[r.student.id] = r.mark?.status;
    return out;
  }, [data]);

  if (!data) return <Text tone="secondary">{t.loading}</Text>;
  const { cls, roll } = data;
  if (!cls)
    return (
      <Stack spacing={3}>
        <InlineAlert tone="info">{a.notFound}</InlineAlert>
        <Box>
          <PlainButton variant="secondary" href={backHref}>
            {a.back}
          </PlainButton>
        </Box>
      </Stack>
    );

  const date = today();
  // The server decides (C-130); this mirrors it so nobody marks a class the server will refuse:
  // a change made now must be within 48 h of the class's end (it may sync up to 7 days later).
  const lock =
    cls.status === 'CANCELLED'
      ? a.cancelled
      : cls.date > date
        ? a.notYet
        : !canEditPast && now > Date.parse(cls.endsAt) + TEACHER_EDIT_MS
          ? a.closed
          : null;
  const value = (r: RollEntry) => draft[r.student.id] ?? marks[r.student.id];
  const changed = roll.filter(
    (r) => draft[r.student.id] && draft[r.student.id] !== marks[r.student.id],
  );
  const counts = { present: 0, absent: 0, late: 0, leave: 0, unmarked: 0 };
  for (const r of roll) {
    const v = value(r);
    if (!v) {
      if (r.expected) counts.unmarked += 1;
    } else counts[v.toLowerCase() as 'present' | 'absent' | 'late' | 'leave'] += 1;
  }

  async function save() {
    if (!changed.length) return;
    setSaving(true);
    await engine.client.markSession(
      sessionId,
      changed.map((r) => ({ studentId: r.student.id, status: draft[r.student.id]! })),
    );
    engine.schedule();
    setDraft({});
    setSaving(false);
    setSaved(true);
  }

  return (
    <Stack spacing={4}>
      <Stack spacing={0.5}>
        <Text variant="title" as="h1">
          {fill(a.title, { batch: cls.batchName })}
        </Text>
        <Text tone="secondary">
          {fill(a.when, { date: day(cls.date), start: time(cls.startsAt), end: time(cls.endsAt) })}
        </Text>
      </Stack>
      {lock && <InlineAlert tone="info">{lock}</InlineAlert>}
      {roll.length === 0 ? (
        <Text tone="secondary">{a.noStudents}</Text>
      ) : (
        <>
          <Text aria-live="polite">{plurals(a.counts, counts)}</Text>
          {!lock && (
            <Box>
              <PlainButton
                variant="secondary"
                onClick={() =>
                  setDraft((d) => {
                    const next = { ...d };
                    for (const r of roll)
                      if (r.expected && !value(r)) next[r.student.id] = 'PRESENT';
                    return next;
                  })
                }
              >
                {a.markAll}
              </PlainButton>
            </Box>
          )}
          <Stack component="ul" spacing={2} sx={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {roll.map((r) => (
              <Box
                component="li"
                key={r.student.id}
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 2,
                  padding: 2,
                  border: '1px solid',
                  borderColor: 'ab.border',
                  borderRadius: 2,
                  bgcolor: 'ab.surface',
                }}
              >
                <Stack spacing={0.5} sx={{ flex: '1 1 160px', minInlineSize: 0 }}>
                  <Box sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{r.student.fullName}</Box>
                  {!r.expected && (
                    <Text variant="meta" tone="secondary" as="span">
                      {a.notExpected}
                    </Text>
                  )}
                  {r.mark && r.mark.syncState !== 'synced' && !draft[r.student.id] && (
                    <Text variant="meta" tone="secondary" as="span">
                      {r.mark.syncState === 'pending'
                        ? a.pending
                        : r.mark.syncState === 'conflict'
                          ? a.conflict
                          : a.failed}
                    </Text>
                  )}
                </Stack>
                <Box
                  role="group"
                  aria-label={fill(a.statusFor, { name: r.student.fullName })}
                  sx={{ display: 'flex', gap: 1 }}
                >
                  {ATTENDANCE_STATUSES.map((s) => {
                    const on = value(r) === s;
                    return (
                      <Box
                        component="button"
                        type="button"
                        key={s}
                        aria-pressed={on}
                        disabled={Boolean(lock)}
                        title={t.status[s]}
                        onClick={() => setDraft((d) => ({ ...d, [r.student.id]: s }))}
                        sx={{
                          minInlineSize: 48,
                          minBlockSize: 48,
                          paddingInline: 1.5,
                          font: 'inherit',
                          fontWeight: 700,
                          borderRadius: 2,
                          border: '2px solid',
                          cursor: lock ? 'default' : 'pointer',
                          borderColor: on ? `${TONES[s]}.solid` : 'ab.borderStrong',
                          bgcolor: on ? `${TONES[s]}.solid` : 'ab.surface',
                          color: on ? `${TONES[s]}.onSolid` : 'ab.textPrimary',
                          '&:disabled': { opacity: 0.6 },
                        }}
                      >
                        <span aria-hidden>{t.short[s]}</span>
                        <Box component="span" sx={visuallyHidden}>
                          {t.status[s]}
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
              </Box>
            ))}
          </Stack>
          {!lock && (
            <Stack
              spacing={1}
              sx={{
                position: 'sticky',
                insetBlockEnd: 72,
                bgcolor: 'ab.background',
                paddingBlock: 2,
              }}
            >
              {changed.length > 0 && (
                <Text variant="meta" tone="secondary">
                  {plural(a.unsaved, changed.length)}
                </Text>
              )}
              {saved && changed.length === 0 && (
                <InlineAlert tone="success">{a.savedLocal}</InlineAlert>
              )}
              <Box>
                <Button onClick={() => void save()} loading={saving} disabled={!changed.length}>
                  {saving ? a.saving : a.save}
                </Button>
              </Box>
            </Stack>
          )}
        </>
      )}
      <Box>
        <PlainButton variant="ghost" href={backHref}>
          {a.back}
        </PlainButton>
      </Box>
    </Stack>
  );
}

const visuallyHidden = {
  position: 'absolute',
  inlineSize: 1,
  blockSize: 1,
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
} as const;
