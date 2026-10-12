'use client';

// The timetable sits on the academy shell under the 200 KB route budget (G-24, C-116): the page
// ships only these wrappers; each sheet loads as its own chunk when opened.
import { type ComponentProps, lazy, Suspense } from 'react';

const Session = lazy(() => import('./session-sheet').then((m) => ({ default: m.SessionSheet })));
const AddHoliday = lazy(() =>
  import('./holiday-sheets').then((m) => ({ default: m.AddHolidaySheet })),
);
const RemoveHoliday = lazy(() =>
  import('./holiday-sheets').then((m) => ({ default: m.RemoveHoliday })),
);

function lazyPart<P extends object>(Part: React.ComponentType<P>) {
  return function LazyPart(props: P) {
    return (
      <Suspense fallback={null}>
        <Part {...props} />
      </Suspense>
    );
  };
}

export const SessionSheetLazy = lazyPart<ComponentProps<typeof Session>>(Session);
export const AddHolidayLazy = lazyPart<ComponentProps<typeof AddHoliday>>(AddHoliday);
export const RemoveHolidayLazy = lazyPart<ComponentProps<typeof RemoveHoliday>>(RemoveHoliday);
