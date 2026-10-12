// Loaded lazily by courses-lazy.tsx (no 'use client', C-80).
import type { Course } from '@academybee/contracts';
import type { Messages } from '@academybee/i18n';
import { Button } from '@academybee/ui/components/actions';
import { InlineAlert } from '@academybee/ui/components/alert';
import { useToast } from '@academybee/ui/components/feedback';
import { TextAreaInput, TextInput } from '@academybee/ui/components/fields';
import { Box, Stack } from '@academybee/ui/components/layout';
import { PlainButton } from '@academybee/ui/components/plain-button';
import { Text } from '@academybee/ui/components/text';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { type PeopleErrorLabels, peopleErrorMessage } from '@/components/people/errors';
import { api } from '@/lib/api';
import { useOnline } from '@/lib/use-online';

import { plural } from './plural';

type Labels = {
  courses: Messages['scheduling']['courses'];
  common: Messages['people']['form'];
  errors: PeopleErrorLabels;
};

/** Courses and their levels: add, rename, add levels, archive (refused while in use). */
export function CoursesEditor({
  courses,
  archived,
  canManage,
  labels,
}: {
  courses: Course[];
  archived: Course[];
  canManage: boolean;
  labels: Labels;
}) {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const l = labels.courses;
  const [draft, setDraft] = useState({ name: '', levels: '' });
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<string>();

  async function call(
    id: string,
    run: () => Promise<{ ok: boolean; error?: Parameters<typeof peopleErrorMessage>[0] }>,
  ) {
    setBusy(id);
    setError(undefined);
    const res = await run();
    setBusy(undefined);
    if (!res.ok && res.error) {
      const issue = res.error.details?.[0]?.issue;
      return setError(
        issue === 'has_active_batches'
          ? l.archiveBlocked
          : peopleErrorMessage(res.error, labels.errors),
      );
    }
    toast(l.saved);
    router.refresh();
  }

  function add(e: FormEvent) {
    e.preventDefault();
    if (!draft.name.trim()) return setError(labels.common.required);
    void call('new', async () => {
      const res = await api<Course>('/courses', {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: {
          name: draft.name.trim(),
          levels: draft.levels
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
        },
      });
      if (res.ok) setDraft({ name: '', levels: '' });
      return res;
    });
  }

  return (
    <Stack spacing={5}>
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      {courses.length === 0 ? (
        <Text tone="secondary">{l.empty}</Text>
      ) : (
        <Stack component="ul" spacing={3} sx={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {courses.map((c) => (
            <CourseRow
              key={c.id}
              course={c}
              canManage={canManage}
              online={online}
              busy={busy === c.id}
              labels={labels}
              onCall={(run) => void call(c.id, run)}
            />
          ))}
        </Stack>
      )}
      {canManage && (
        <Box component="form" noValidate onSubmit={add} sx={{ maxInlineSize: 560 }}>
          <Stack spacing={3}>
            <Text variant="section">{l.add}</Text>
            <TextInput
              name="courseName"
              label={l.name}
              required
              value={draft.name}
              onChange={(v) => setDraft((d) => ({ ...d, name: v }))}
            />
            <TextAreaInput
              name="levels"
              label={l.levels}
              helperText={l.levelsHint}
              rows={3}
              value={draft.levels}
              onChange={(v) => setDraft((d) => ({ ...d, levels: v }))}
            />
            <Box>
              <Button type="submit" loading={busy === 'new'} disabled={!online}>
                {l.add}
              </Button>
            </Box>
          </Stack>
        </Box>
      )}
      {archived.length > 0 && (
        <Text tone="secondary">{archived.map((c) => c.name).join(', ')}</Text>
      )}
    </Stack>
  );
}

function CourseRow({
  course,
  canManage,
  online,
  busy,
  labels,
  onCall,
}: {
  course: Course;
  canManage: boolean;
  online: boolean;
  busy: boolean;
  labels: Labels;
  onCall: (
    run: () => Promise<{ ok: boolean; error?: Parameters<typeof peopleErrorMessage>[0] }>,
  ) => void;
}) {
  const l = labels.courses;
  const [name, setName] = useState(course.name);
  const [level, setLevel] = useState('');
  return (
    <Box
      component="li"
      sx={{ padding: 3, border: '1px solid', borderColor: 'ab.border', borderRadius: 2 }}
    >
      <Stack spacing={2}>
        <Text>
          <strong>{course.name}</strong>
        </Text>
        <Text variant="meta" tone="secondary">
          {plural(l.inUse, course.batchCount)}
          {course.levels.length ? ` · ${course.levels.map((x) => x.name).join(', ')}` : ''}
        </Text>
        {canManage && (
          <Stack spacing={2}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              sx={{ gap: 2, alignItems: { sm: 'flex-end' } }}
            >
              <Box sx={{ flex: 1 }}>
                <TextInput
                  name={`rename-${course.id}`}
                  label={l.name}
                  value={name}
                  onChange={setName}
                />
              </Box>
              <PlainButton
                variant="secondary"
                busy={busy}
                disabled={!online || !name.trim() || name.trim() === course.name}
                onClick={() =>
                  onCall(() =>
                    api(`/courses/${course.id}`, {
                      method: 'PATCH',
                      body: { version: course.version, name: name.trim() },
                    }),
                  )
                }
              >
                {l.rename}
              </PlainButton>
            </Stack>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              sx={{ gap: 2, alignItems: { sm: 'flex-end' } }}
            >
              <Box sx={{ flex: 1 }}>
                <TextInput
                  name={`level-${course.id}`}
                  label={l.levelName}
                  value={level}
                  onChange={setLevel}
                />
              </Box>
              <PlainButton
                variant="secondary"
                disabled={!online || !level.trim()}
                onClick={() =>
                  onCall(async () => {
                    const res = await api(`/courses/${course.id}/levels`, {
                      method: 'POST',
                      body: { name: level.trim() },
                    });
                    if (res.ok) setLevel('');
                    return res;
                  })
                }
              >
                {l.addLevel}
              </PlainButton>
            </Stack>
            <Box>
              <PlainButton
                variant="ghost"
                disabled={!online}
                onClick={() =>
                  onCall(() =>
                    api(`/courses/${course.id}`, {
                      method: 'PATCH',
                      body: { version: course.version, status: 'ARCHIVED' },
                    }),
                  )
                }
              >
                {l.archive}
              </PlainButton>
            </Box>
          </Stack>
        )}
      </Stack>
    </Box>
  );
}
