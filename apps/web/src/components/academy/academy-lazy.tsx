'use client';

// Settings pages sit on the academy shell at the 200 KB route budget (G-24): the pages ship only
// this wrapper; the forms load as their own chunks (rendered on the server first).
import { type ComponentProps, lazy, Suspense } from 'react';

const Profile = lazy(() =>
  import('./academy-profile-form').then((m) => ({ default: m.AcademyProfileForm })),
);
const Branding = lazy(() =>
  import('./branding-editor').then((m) => ({ default: m.BrandingEditor })),
);

export function AcademyProfileLazy(props: ComponentProps<typeof Profile>) {
  return (
    <Suspense fallback={null}>
      <Profile {...props} />
    </Suspense>
  );
}

export function BrandingLazy(props: ComponentProps<typeof Branding>) {
  return (
    <Suspense fallback={null}>
      <Branding {...props} />
    </Suspense>
  );
}
