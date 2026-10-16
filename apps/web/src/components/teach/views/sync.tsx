// Part of the Teacher PWA's lazy chunk.
import { type AttendanceStatus, MarkSessionOpSchema } from '@academybee/contracts';
import type { ConflictChoice, SyncQueueItem } from '@academybee/sync';
import { useConnectivity } from '@academybee/sync/react';
import { Button } from '@academybee/ui/components/actions';
import { InlineAlert } from '@academybee/ui/components/alert';
import { Card, StatusBadge } from '@academybee/ui/components/display';
import { Box, Stack } from '@academybee/ui/components/layout';
import { ConfirmDialog } from '@academybee/ui/components/overlays';
import { PlainButton } from '@academybee/ui/components/plain-button';
import { Text } from '@academybee/ui/components/text';
import { useState } from 'react';

import { plural } from '@/components/scheduling/plural';
import { fill } from '@/lib/fill';

import { useTeach } from '../teach-app';
import { useLive } from '../use-live';

type ServerMark = { status: AttendanceStatus; version: number; markedByName: string | null };

/**
 * Sync Center (`/teach/sync`, ARCHITECTURE §11.6): what is waiting, what needs a decision and
 * what synced, in words. Retry; resolve a conflict per student; discard only after confirming —
 * never silently (CLAUDE.md §11).
 */
export function SyncView() {
  const { engine, labels, day, time } = useTeach();
  const t = labels.teach;
  const s = t.sync;
  const online = useConnectivity(engine.connectivity) === 'online';
  const [busy, setBusy] = useState(false);
  const [discarding, setDiscarding] = useState<string | null>(null);
  const data = useLive(async () => {
    const [items, sessions, batches, students, lastSyncedAt] = await Promise.all([
      engine.queue.list(),
      engine.db.sessions.toArray(),
      engine.db.batches.toArray(),
      engine.db.students.toArray(),
      engine.queue.lastSyncedAt(),
    ]);
    return {
      items,
      sessions: new Map(sessions.map((x) => [x.id, x])),
      batches: new Map(batches.map((b) => [b.id, b.name])),
      students: new Map(students.map((x) => [x.id, x.fullName])),
      lastSyncedAt,
    };
  }, [engine]);
  const persisted = useLive(
    async () => (await globalThis.navigator?.storage?.persisted?.()) ?? null,
    [],
  );
  if (!data) return <Text tone="secondary">{t.loading}</Text>;

  const describe = (item: SyncQueueItem) => {
    const op = MarkSessionOpSchema.safeParse(item.payload);
    const session = op.success ? data.sessions.get(op.data.sessionId) : undefined;
    const title = session
      ? fill(s.item, {
          batch: data.batches.get(session.batchId) ?? '',
          date: `${day(session.date, 'short')} ${time(session.startsAt)}`,
        })
      : s.itemUnknown;
    return { title, marks: op.success ? op.data.marks : [] };
  };
  const waiting = data.items.filter((i) => i.status === 'pending' || i.status === 'processing');
  const attention = data.items.filter((i) => i.status === 'failed' || i.status === 'conflict');
  const done = data.items
    .filter((i) => i.status === 'synced')
    .slice(-10)
    .reverse();

  async function syncNow() {
    setBusy(true);
    await engine.runner.run();
    await engine.pull();
    setBusy(false);
  }

  return (
    <Stack spacing={4}>
      <Stack spacing={0.5}>
        <Text variant="title" as="h1">
          {s.title}
        </Text>
        <Text tone="secondary">{s.body}</Text>
        <Text variant="meta" tone="secondary">
          {data.lastSyncedAt
            ? fill(s.lastSync, {
                time: new Intl.DateTimeFormat(document.documentElement.lang || 'en-IN', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(data.lastSyncedAt),
              })
            : s.never}
        </Text>
      </Stack>
      {persisted === false && <InlineAlert tone="info">{s.storage}</InlineAlert>}
      <Box>
        <Button
          variant="secondary"
          onClick={() => void syncNow()}
          loading={busy}
          disabled={!online}
        >
          {s.syncNow}
        </Button>
      </Box>

      <Stack spacing={2} component="section" aria-labelledby="sync-attention">
        <Text variant="section" as="h2" id="sync-attention">
          {s.attentionTitle}
        </Text>
        {attention.length === 0 ? (
          <Text tone="secondary">{s.nothing}</Text>
        ) : (
          attention.map((item) => (
            <AttentionItem
              key={item.opId}
              item={item}
              title={describe(item).title}
              studentName={(id) => data.students.get(id) ?? ''}
              onDiscard={() => setDiscarding(item.opId)}
            />
          ))
        )}
      </Stack>

      <Stack spacing={2} component="section" aria-labelledby="sync-waiting">
        <Text variant="section" as="h2" id="sync-waiting">
          {s.pendingTitle}
        </Text>
        {waiting.length === 0 ? (
          <Text tone="secondary">{s.nothing}</Text>
        ) : (
          waiting.map((item) => {
            const d = describe(item);
            return (
              <Card key={item.opId}>
                <Stack spacing={0.5}>
                  <Text>{d.title}</Text>
                  <Text variant="meta" tone="secondary">
                    {plural(s.students, d.marks.length)}
                  </Text>
                </Stack>
              </Card>
            );
          })
        )}
      </Stack>

      {done.length > 0 && (
        <Stack spacing={2} component="section" aria-labelledby="sync-done">
          <Text variant="section" as="h2" id="sync-done">
            {s.doneTitle}
          </Text>
          {done.map((item) => (
            <Box
              key={item.opId}
              sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}
            >
              <Text>{describe(item).title}</Text>
              <StatusBadge tone="success" label={labels.offline.sync.synced} />
            </Box>
          ))}
        </Stack>
      )}

      <ConfirmDialog
        open={discarding !== null}
        title={s.discardTitle}
        body={s.discardBody}
        confirmLabel={s.discard}
        cancelLabel={s.keep}
        tone="danger"
        onCancel={() => setDiscarding(null)}
        onConfirm={() => {
          const opId = discarding!;
          setDiscarding(null);
          void engine.queue.discard(opId);
          void engine.db.attendance.where('opId').equals(opId).delete();
        }}
      />
    </Stack>
  );
}

/** A failed or conflicting change: why, and what the user can do. */
function AttentionItem({
  item,
  title,
  studentName,
  onDiscard,
}: {
  item: SyncQueueItem;
  title: string;
  studentName: (id: string) => string;
  onDiscard: () => void;
}) {
  const { engine, labels } = useTeach();
  const s = labels.teach.sync;
  const status = labels.teach.status;
  const conflicts = (item.conflict?.server ?? []) as { studentId: string; server: ServerMark }[];
  const op = MarkSessionOpSchema.safeParse(item.payload);
  const mine = new Map(op.success ? op.data.marks.map((m) => [m.studentId, m.status]) : []);
  const [choices, setChoices] = useState<Record<string, ConflictChoice>>({});
  const reason =
    s.reasons[(item.lastError?.message ?? 'other') as keyof typeof s.reasons] ?? s.reasons.other;
  return (
    <Card>
      <Stack spacing={2}>
        <Text>{title}</Text>
        {item.status === 'failed' ? (
          <>
            <InlineAlert tone="danger">{reason}</InlineAlert>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <PlainButton
                variant="secondary"
                onClick={() => void engine.queue.retryNow(item.opId).then(() => engine.schedule())}
              >
                {s.retry}
              </PlainButton>
              <PlainButton variant="ghost" onClick={onDiscard}>
                {s.discard}
              </PlainButton>
            </Box>
          </>
        ) : (
          <>
            <Text variant="section" as="h3">
              {s.conflictTitle}
            </Text>
            <Text tone="secondary">{s.conflictBody}</Text>
            {conflicts.map((c) => {
              const name = `conflict-${item.opId}-${c.studentId}`;
              const choice = choices[c.studentId] ?? 'mine';
              const theirs = c.server.markedByName
                ? fill(s.theirs, { name: c.server.markedByName, status: status[c.server.status] })
                : fill(s.theirsUnknown, { status: status[c.server.status] });
              const mineStatus = mine.get(c.studentId);
              return (
                <Box
                  key={c.studentId}
                  component="fieldset"
                  sx={{ border: 0, padding: 0, margin: 0 }}
                >
                  <Box component="legend" sx={{ fontWeight: 600, marginBlockEnd: 1 }}>
                    {studentName(c.studentId)}
                  </Box>
                  {(['mine', 'theirs'] as const).map((option) => (
                    <Box
                      key={option}
                      component="label"
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.5,
                        minBlockSize: 48,
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="radio"
                        name={name}
                        checked={choice === option}
                        onChange={() => setChoices((x) => ({ ...x, [c.studentId]: option }))}
                      />
                      {option === 'mine'
                        ? fill(s.mine, { status: mineStatus ? status[mineStatus] : '' })
                        : theirs}
                    </Box>
                  ))}
                </Box>
              );
            })}
            <Box>
              <Button
                onClick={() =>
                  void engine.client
                    .resolveConflict(item.opId, choices)
                    .then(() => engine.schedule())
                }
              >
                {s.resolve}
              </Button>
            </Box>
          </>
        )}
      </Stack>
    </Card>
  );
}
