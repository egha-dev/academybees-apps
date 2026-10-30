'use client';

import { FormDialog } from '@academybee/ui/components/overlays';

import { LoginForm } from './login-form';
import type { SessionGuardLabels } from './session-guard';
import { SignOutButton } from './sign-out-button';

/** The re-login dialog, loaded only when a session is actually lost (route JS budget, C-68). */
export default function SessionLostDialog({
  labels,
  identifier,
  userId,
  onSignedIn,
}: {
  labels: SessionGuardLabels;
  identifier: string;
  userId?: string | undefined;
  onSignedIn: () => void;
}) {
  return (
    <FormDialog open title={labels.title} body={labels.body}>
      <LoginForm labels={labels.login} defaultIdentifier={identifier} onSignedIn={onSignedIn} />
      <SignOutButton
        labels={{ ...labels.signOut, signOut: labels.signOutInstead }}
        variant="ghost"
        userId={userId}
      />
    </FormDialog>
  );
}
