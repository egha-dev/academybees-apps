// Loaded lazily by batches-lazy.tsx (no 'use client', C-80).
import type { Messages } from '@academybee/i18n';
import { Button } from '@academybee/ui/components/actions';
import { InlineAlert } from '@academybee/ui/components/alert';
import { useToast } from '@academybee/ui/components/feedback';
import { DateInput } from '@academybee/ui/components/fields';
import { Box, Stack } from '@academybee/ui/components/layout';
import { Sheet } from '@academybee/ui/components/overlays';
import { PlainButton } from '@academybee/ui/components/plain-button';
import { Text } from '@academybee/ui/components/text';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { type PeopleErrorLabels, peopleErrorMessage } from '@/components/people/errors';
import { fill } from '@/components/shell-labels';
import { api } from '@/lib/api';
import { useOnline } from '@/lib/use-online';

import { plural } from './plural';

type PatternLabels = Messages['scheduling']['pattern'];
type Day = { on: boolean; start: string; end: string };
const DAYS = [1, 2, 3, 4, 5, 6, 7] as const;
/** Quick choices (C-121): the patterns academies actually use. */
const PRESETS: Record<string, number[]> = {
  weekdays: [1, 2, 3, 4, 5],
  mwf: [1, 3, 5],
  tts: [2, 4, 6],
  tt: [2, 4],
  weekend: [6, 7],
  monSat: [1, 2, 3, 4, 5, 6],
  daily: [1, 2, 3, 4, 5, 6, 7],
};

/**
 * The weekly pattern editor (C-113, C-121): 2, 3, 5 or 7 days a week with one-tap presets, the
 * same time every day or a time per day, applied from a date. Classes changed by hand stay.
 * One slot per day here; the API also accepts more.
 */
export function PatternEditor({
  batchId,
  batchName,
  slots,
  today,
  startOpen,
  labels,
}: {
  batchId: string;
  batchName: string;
  slots: { weekday: number; start: string; end: string }[];
  today: string;
  startOpen: boolean;
  labels: {
    pattern: PatternLabels;
    weekday: Record<string, string>;
    open: string;
    cancel: string;
    close: string;
    errors: PeopleErrorLabels;
  };
}) {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const p = labels.pattern;
  const first = slots[0];
  const initial = Object.fromEntries(
    DAYS.map((d) => {
      const s = slots.find((x) => x.weekday === d);
      return [
        d,
        {
          on: Boolean(s),
          start: s?.start ?? first?.start ?? '17:00',
          end: s?.end ?? first?.end ?? '18:00',
        },
      ];
    }),
  ) as Record<number, Day>;
  const sameInitially = slots.every((s) => s.start === first?.start && s.end === first?.end);
  const [open, setOpen] = useState(startOpen);
  const [days, setDays] = useState(initial);
  const [same, setSame] = useState(sameInitially);
  const [shared, setShared] = useState({
    start: first?.start ?? '17:00',
    end: first?.end ?? '18:00',
  });
  const [from, setFrom] = useState(today);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const chosen = DAYS.filter((d) => days[d]!.on);
  const timeOf = (d: number) => (same ? shared : days[d]!);

  function preset(list: number[]) {
    setDays((cur) =>
      Object.fromEntries(DAYS.map((d) => [d, { ...cur[d]!, on: list.includes(d) }])),
    );
  }

  function close() {
    setOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.delete('edit');
    window.history.replaceState(null, '', url);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const bad = chosen.find((d) => timeOf(d).end <= timeOf(d).start);
    if (bad) return setError(`${labels.weekday[`d${bad}`]}: ${p.endBeforeStart}`);
    setBusy(true);
    setError(undefined);
    const res = await api(`/batches/${batchId}/schedule`, {
      method: 'PUT',
      body: { from, slots: chosen.map((d) => ({ weekday: d, ...timeOf(d) })) },
    });
    setBusy(false);
    if (!res.ok) return setError(peopleErrorMessage(res.error, labels.errors));
    toast(p.saved);
    close();
    router.refresh();
  }

  const timeField = (value: string, onChange: (v: string) => void, label: string) => (
    <Stack spacing={0.5} sx={{ flex: '1 1 120px' }}>
      <Box component="label" sx={{ fontSize: 14, fontWeight: 600 }}>
        {label}
        <Box
          component="input"
          type="time"
          value={value}
          step={300}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
          sx={{
            display: 'block',
            marginBlockStart: 0.5,
            inlineSize: '100%',
            minBlockSize: 48,
            paddingInline: '12px',
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
    </Stack>
  );

  return (
    <>
      <PlainButton variant="primary" disabled={!online} onClick={() => setOpen(true)}>
        {labels.open}
      </PlainButton>
      <Sheet
        open={open}
        onClose={close}
        title={fill(p.title, { name: batchName })}
        closeLabel={labels.close}
      >
        <Stack component="form" spacing={4} noValidate onSubmit={(e: FormEvent) => void save(e)}>
          {error && <InlineAlert tone="danger">{error}</InlineAlert>}
          <Stack spacing={1}>
            <Text variant="bodySmall">{p.presets}</Text>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {Object.entries(PRESETS).map(([k, list]) => (
                <PlainButton key={k} variant="secondary" onClick={() => preset(list)}>
                  {p.preset[k as keyof typeof p.preset]}
                </PlainButton>
              ))}
            </Box>
          </Stack>
          <Box component="fieldset" sx={{ border: 0, margin: 0, padding: 0 }}>
            <Box component="legend" sx={{ fontSize: 14, fontWeight: 600, marginBlockEnd: 1 }}>
              {p.days}
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {DAYS.map((d) => (
                <Box
                  component="label"
                  key={d}
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 1,
                    minBlockSize: 48,
                    paddingInline: 2,
                    border: '1px solid',
                    borderColor: days[d]!.on ? 'ab.accent' : 'ab.borderStrong',
                    borderRadius: 2,
                    bgcolor: days[d]!.on ? 'ab.accentSoft' : 'ab.surface',
                    color: days[d]!.on ? 'ab.onAccentSoft' : 'ab.textPrimary',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={days[d]!.on}
                    onChange={(e) =>
                      setDays((cur) => ({ ...cur, [d]: { ...cur[d]!, on: e.target.checked } }))
                    }
                  />
                  {labels.weekday[`d${d}`]}
                </Box>
              ))}
            </Box>
          </Box>
          <Box
            component="label"
            sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, minBlockSize: 48 }}
          >
            <input type="checkbox" checked={same} onChange={(e) => setSame(e.target.checked)} />
            {p.sameTime}
          </Box>
          {same ? (
            <Stack direction="row" sx={{ gap: 2, flexWrap: 'wrap' }}>
              {timeField(shared.start, (v) => setShared((s) => ({ ...s, start: v })), p.start)}
              {timeField(shared.end, (v) => setShared((s) => ({ ...s, end: v })), p.end)}
            </Stack>
          ) : (
            <Stack spacing={2}>
              {chosen.map((d) => (
                <Stack key={d} spacing={1}>
                  <Text variant="bodySmall">
                    {fill(p.dayTime, { day: labels.weekday[`d${d}`]! })}
                  </Text>
                  <Stack direction="row" sx={{ gap: 2, flexWrap: 'wrap' }}>
                    {timeField(
                      days[d]!.start,
                      (v) => setDays((c) => ({ ...c, [d]: { ...c[d]!, start: v } })),
                      p.start,
                    )}
                    {timeField(
                      days[d]!.end,
                      (v) => setDays((c) => ({ ...c, [d]: { ...c[d]!, end: v } })),
                      p.end,
                    )}
                  </Stack>
                </Stack>
              ))}
            </Stack>
          )}
          <DateInput
            name="from"
            label={p.from}
            helperText={p.fromHint}
            value={from}
            onChange={setFrom}
          />
          <Box role="status" sx={{ color: 'ab.textSecondary' }}>
            {chosen.length ? plural(p.summary, chosen.length) : p.noDays}
          </Box>
          <Stack direction="row" spacing={2}>
            <Button type="submit" loading={busy} disabled={!online || from < today}>
              {p.save}
            </Button>
            <Button variant="secondary" onClick={close}>
              {labels.cancel}
            </Button>
          </Stack>
        </Stack>
      </Sheet>
    </>
  );
}
