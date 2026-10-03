import { fireEvent, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { expectAccessible, renderUi } from '../test/render.js';
import { InlineAlert } from './alert.js';
import { PasswordInput, TextInput } from './fields.js';

const LABELS = { show: 'Show password', hide: 'Hide password', capsLock: 'Caps Lock is on' };

function Controlled({ error }: { error?: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  return (
    <form>
      <TextInput
        label="Email"
        name="email"
        value={email}
        onChange={setEmail}
        error={error}
        required
      />
      <PasswordInput
        label="Password"
        name="password"
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
        helperText="At least 8 characters."
        labels={LABELS}
      />
    </form>
  );
}

describe('lean fields', () => {
  it('label the input, tie messages to it, and are accessible', async () => {
    const { container } = renderUi(<Controlled error="Enter this to continue." />);
    const email = screen.getByLabelText(/Email/);
    expect(email.getAttribute('aria-invalid')).toBe('true');
    expect(email.getAttribute('aria-required')).toBe('true');
    expect(document.getElementById(email.getAttribute('aria-describedby')!)?.textContent).toBe(
      'Enter this to continue.',
    );
    await userEvent.type(email, 'a@b.co');
    expect((email as HTMLInputElement).value).toBe('a@b.co');
    await expectAccessible(container);
  });

  it('shows and hides the password with a labelled toggle', async () => {
    renderUi(<Controlled />);
    const password = screen.getByLabelText<HTMLInputElement>('Password');
    expect(password.type).toBe('password');
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password.type).toBe('text');
    expect(screen.getByRole('button', { name: 'Hide password' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('announces Caps Lock instead of the helper text while it is on', () => {
    renderUi(<Controlled />);
    const password = screen.getByLabelText('Password');
    fireEvent.keyDown(password, { key: 'A', modifierCapsLock: true });
    expect(screen.getByRole('status').textContent).toBe('Caps Lock is on');
    fireEvent.blur(password);
    expect(screen.getByText('At least 8 characters.')).toBeTruthy();
  });
});

describe('InlineAlert', () => {
  it('announces errors at once and other messages politely, with an icon and text', async () => {
    const { container } = renderUi(
      <>
        <InlineAlert tone="danger">Wrong details</InlineAlert>
        <InlineAlert tone="success">Check your email</InlineAlert>
      </>,
    );
    expect(screen.getByRole('alert').textContent).toBe('Wrong details');
    expect(screen.getByRole('status').textContent).toBe('Check your email');
    await expectAccessible(container);
  });
});
