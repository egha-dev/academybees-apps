// Loaded lazily by teach-lazy.tsx (no 'use client', C-80): Dexie and the sync engine ride here.
import { localDate } from '@academybee/contracts';
import type { Messages } from '@academybee/i18n';
import type { SyncEngine } from '@academybee/sync';
import { useConnectivity, useSyncStatus } from '@academybee/sync/react';
import { InlineAlert } from '@academybee/ui/components/alert';
import { Box, Stack } from '@academybee/ui/components/layout';
import { OfflineBanner, SyncIndicator } from '@academybee/ui/components/offline';
import { PlainButton } from '@academybee/ui/components/plain-button';
import { Text } from '@academybee/ui/components/text';
import { createContext, useContext, useEffect, useState } from 'react';

import type { SignOutLabels } from '@/components/auth/sign-out-button';
import { plural } from '@/components/scheduling/plural';
import { fill } from '@/lib/fill';
import { setSignOutGuard } from '@/lib/unsynced';

import { engineFor, needsSignIn, onEngineChange, warmShells } from './engine';
import { useLive, useNow } from './use-live';
import { AttendanceView } from './views/attendance';
import { ClassesView } from './views/classes';
import { MoreView } from './views/more';
import { StudentsView } from './views/students';
import { SyncView } from './views/sync';
import { TodayView } from './views/today';

export type TeachView = 'today' | 'classes' | 'attendance' | 'students' | 'sync' | 'more';

export type TeachLabels = {
  teach: Messages['teach'];
  offline: Messages['offline'];
  signOut: SignOutLabels;
  switchHref: string | null;
};

export type TeachProps = {
  view: TeachView;
  userId: string;
  name: string;
  /** The academy's name: one teacher can teach at several. */
  academy: string;
  timeZone: string;
  /** Owners and admins may correct roll calls after the window (C-130). */
  canEditPast: boolean;
  labels: TeachLabels;
};

type Ctx = TeachProps & {
  engine: SyncEngine;
  /** Academy-local today, recomputed each render (a phone left open past midnight). */
  today: () => string;
  time: (iso: string) => string;
  day: (date: string, style?: 'short' | 'long') => string;
};
const TeachContext = createContext<Ctx | null>(null);

export function useTeach(): Ctx {
  const ctx = useContext(TeachContext);
  if (!ctx) throw new Error('outside TeachApp');
  return ctx;
}

const lang = () =>
  typeof document === 'undefined' ? 'en-IN' : document.documentElement.lang || 'en-IN';

/**
 * The Teacher PWA (UX §14, C-06, C-124): every screen reads this device's copy of the teacher's
 * classes and students, so it works the same offline. The status line always says whether
 * changes have reached the academy (UX §12.1).
 */
export function TeachApp(props: TeachProps) {
  const engine = engineFor(props.userId);
  const [, setTick] = useState(0);
  useEffect(() => onEngineChange(() => setTick((n) => n + 1)), []);
  const ready = useLive(() => engine.local.ready(), [engine]);
  useEffect(() => {
    if (ready) void warmShells();
  }, [ready]);
  const ctx: Ctx = {
    ...props,
    engine,
    today: () => localDate(new Date(), props.timeZone),
    time: (iso) =>
      new Intl.DateTimeFormat(lang(), {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: props.timeZone,
      }).format(new Date(iso)),
    day: (date, style = 'long') =>
      new Intl.DateTimeFormat(lang(), {
        ...(style === 'long'
          ? { weekday: 'long', day: 'numeric', month: 'long' }
          : { weekday: 'short', day: 'numeric', month: 'short' }),
        timeZone: 'UTC',
      }).format(new Date(`${date}T00:00:00Z`)),
  };
  const t = props.labels.teach;
  const screens = {
    today: TodayView,
    classes: ClassesView,
    attendance: AttendanceView,
    students: StudentsView,
    sync: SyncView,
    more: MoreView,
  } satisfies Record<TeachView, () => React.ReactNode>;
  const Screen = screens[props.view];
  return (
    <TeachContext.Provider value={ctx}>
      <Stack spacing={3}>
        <StatusLine />
        {needsSignIn() && (
          <InlineAlert tone="warning">
            {t.signInAgain}{' '}
            <a href={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}>
              {t.signIn}
            </a>
          </InlineAlert>
        )}
        {ready === undefined ? (
          <Text tone="secondary">{t.loading}</Text>
        ) : !ready && props.view !== 'more' && props.view !== 'sync' ? (
          <FirstSync />
        ) : (
          <Screen />
        )}
      </Stack>
    </TeachContext.Provider>
  );
}

/** Before the first download: wait online, or say a connection is needed once. */
function FirstSync() {
  const { engine, labels } = useTeach();
  const online = useConnectivity(engine.connectivity) === 'online';
  return online ? (
    <Text tone="secondary">{labels.teach.loading}</Text>
  ) : (
    <InlineAlert tone="info">{labels.teach.firstSyncOffline}</InlineAlert>
  );
}

/** Offline banner and the sync indicator (UX §12.1), plus the sign-out guard's live count. */
function StatusLine() {
  const { engine, labels } = useTeach();
  const connectivity = useConnectivity(engine.connectivity);
  const status = useSyncStatus(engine.queue, connectivity);
  const now = useNow();
  const o = labels.offline;
  // Counted in records (marks), as people think of them: one saved roll call of 25 students
  // is 25 records waiting, not one (UX §12.1). The queue's own counts decide the state.
  const records = useLive(async () => {
    const rows = await engine.db.attendance
      .where('syncState')
      .anyOf('pending', 'conflict', 'failed')
      .toArray();
    return {
      waiting: rows.filter((r) => r.syncState === 'pending').length,
      unsynced: rows.length,
    };
  }, [engine]);
  const waiting = records?.waiting ?? status.counts.pending + status.counts.processing;
  const unsynced = Math.max(records?.unsynced ?? 0, waiting + status.attention);
  useEffect(() => {
    setSignOutGuard({ unsynced });
  }, [unsynced, engine]);
  const label =
    status.state === 'attention'
      ? plural(o.sync.attention, status.attention)
      : status.state === 'pending'
        ? plural(o.sync.pending, waiting)
        : status.state === 'syncing'
          ? o.sync.syncing
          : status.state === 'offline'
            ? waiting
              ? plural(o.sync.pending, waiting)
              : o.sync.offline
            : o.sync.synced;
  const detail =
    status.state === 'synced' && status.lastSyncedAt
      ? fill(o.sync.syncedAt, {
          time:
            now - status.lastSyncedAt < 60_000
              ? o.sync.justNow
              : new Intl.DateTimeFormat(lang(), { hour: 'numeric', minute: '2-digit' }).format(
                  status.lastSyncedAt,
                ),
        })
      : undefined;
  return (
    <Stack spacing={1}>
      {connectivity === 'offline' && <OfflineBanner message={o.banner} />}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          flexWrap: 'wrap',
        }}
      >
        <SyncIndicator
          state={status.state === 'offline' && waiting ? 'pending' : status.state}
          label={label}
          {...(detail ? { detail } : {})}
        />
        {status.attention > 0 && (
          <PlainButton variant="ghost" href="/teach/sync">
            {labels.teach.more.sync}
          </PlainButton>
        )}
      </Box>
    </Stack>
  );
}
