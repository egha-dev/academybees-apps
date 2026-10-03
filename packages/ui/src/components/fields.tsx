'use client';

import VisibilityIcon from '@mui/icons-material/VisibilityRounded';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOffRounded';
import Box from '@mui/material/Box';
import { type ChangeEvent, type KeyboardEvent, type ReactNode, useId, useState } from 'react';

import { radius, TOUCH_TARGET } from '../tokens.js';

/**
 * Lean form fields for the screens with the tightest JS budget (sign-in, reset, invite; G-24,
 * plan Phase 2 risk "Route JS budget"): native `<input>` + visible `<label>`, styled with the
 * theme's semantic roles through `Box`, which every page already loads. Same behaviour as
 * `TextField` — visible label, helper or error text tied by `aria-describedby`, 48 px targets,
 * text that may grow 40 % — at a fraction of the size.
 */
const changeHandler = (onChange: ((value: string) => void) | undefined) =>
  onChange ? (e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value) : undefined;

export type TextInputProps = {
  label: string;
  /**
   * Controlled (`value` + `onChange`) or uncontrolled (`defaultValue`, read with FormData on
   * submit). Prefer uncontrolled on public forms: what someone types before the page hydrates
   * is kept.
   */
  value?: string;
  onChange?: (value: string) => void;
  defaultValue?: string;
  name: string;
  readOnly?: boolean;
  error?: string | undefined;
  helperText?: string | undefined;
  required?: boolean;
  disabled?: boolean;
  type?: 'text' | 'email' | 'tel';
  autoComplete?: string;
  inputMode?: 'text' | 'email' | 'tel' | 'numeric';
  autoFocus?: boolean;
};

const inputSx = {
  inlineSize: '100%',
  minBlockSize: TOUCH_TARGET,
  boxSizing: 'border-box',
  paddingInline: '14px',
  paddingBlock: '10px',
  font: 'inherit',
  fontSize: 16, // ≥ 16 px: iOS does not zoom into the field
  color: 'ab.textPrimary',
  backgroundColor: 'ab.surface',
  border: '1px solid',
  borderColor: 'ab.borderStrong',
  borderRadius: `${radius.md}px`,
  outline: 'none',
  '&:focus-visible': { outline: '2px solid', outlineColor: 'ab.focus', outlineOffset: '1px' },
  '&[aria-invalid="true"]': { borderColor: 'ab.status.danger.solid', borderWidth: '2px' },
  '&:disabled': { color: 'ab.textSecondary', backgroundColor: 'ab.surfaceRaised' },
} as const;

/** Not translatable text: a typographic marker. */
const REQUIRED_MARK = '*';

function FieldFrame({
  id,
  label,
  required,
  message,
  messageId,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean | undefined;
  message?: string | undefined;
  messageId: string;
  error: boolean;
  children: ReactNode;
}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, minInlineSize: 0 }}>
      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'baseline' }}>
        <Box
          component="label"
          htmlFor={id}
          sx={{ fontSize: 14, fontWeight: 600, color: 'ab.textPrimary', lineHeight: 1.4 }}
        >
          {label}
        </Box>
        {required && (
          // Visual marker beside the label (not in it): the label text stays the accessible
          // name, and the input carries aria-required.
          <Box component="span" aria-hidden sx={{ fontSize: 14, color: 'ab.textSecondary' }}>
            {REQUIRED_MARK}
          </Box>
        )}
      </Box>
      {children}
      {message && (
        <Box
          id={messageId}
          role={error ? undefined : 'status'}
          sx={{
            fontSize: 13,
            lineHeight: 1.5,
            color: error ? 'ab.status.danger.fg' : 'ab.textSecondary',
            fontWeight: error ? 600 : 400,
          }}
        >
          {message}
        </Box>
      )}
    </Box>
  );
}

export function TextInput({
  label,
  value,
  onChange,
  error,
  helperText,
  required,
  ...rest
}: TextInputProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const message = error ?? helperText;
  return (
    <FieldFrame
      id={id}
      label={label}
      required={required}
      message={message}
      messageId={messageId}
      error={Boolean(error)}
    >
      <Box
        component="input"
        id={id}
        {...(value !== undefined ? { value } : {})}
        onChange={changeHandler(onChange)}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? messageId : undefined}
        aria-required={required || undefined}
        sx={inputSx}
        {...rest}
      />
    </FieldFrame>
  );
}

export type PasswordInputProps = Omit<TextInputProps, 'type' | 'inputMode'> & {
  labels: { show: string; hide: string; capsLock: string };
  autoComplete: 'current-password' | 'new-password';
};

/** Password with a show/hide toggle and a Caps Lock hint (announced, never colour-only). */
export function PasswordInput({
  label,
  value,
  onChange,
  error,
  helperText,
  required,
  labels,
  ...rest
}: PasswordInputProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const trackCaps = (e: KeyboardEvent<HTMLInputElement>) =>
    setCapsLock(e.getModifierState('CapsLock'));
  const message = error ?? (capsLock ? labels.capsLock : helperText);
  return (
    <FieldFrame
      id={id}
      label={label}
      required={required}
      message={message}
      messageId={messageId}
      error={Boolean(error)}
    >
      <Box sx={{ position: 'relative' }}>
        <Box
          component="input"
          id={id}
          type={visible ? 'text' : 'password'}
          {...(value !== undefined ? { value } : {})}
          onChange={changeHandler(onChange)}
          onKeyDown={trackCaps}
          onKeyUp={trackCaps}
          onBlur={() => setCapsLock(false)}
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? messageId : undefined}
          aria-required={required || undefined}
          sx={{ ...inputSx, paddingInlineEnd: `${TOUCH_TARGET}px` }}
          {...rest}
        />
        <Box
          component="button"
          type="button"
          aria-label={visible ? labels.hide : labels.show}
          aria-pressed={visible}
          aria-controls={id}
          onClick={() => setVisible((v) => !v)}
          sx={{
            position: 'absolute',
            insetBlockStart: 0,
            insetInlineEnd: 0,
            inlineSize: TOUCH_TARGET,
            blockSize: '100%',
            minBlockSize: TOUCH_TARGET,
            display: 'grid',
            placeItems: 'center',
            border: 0,
            background: 'none',
            cursor: 'pointer',
            color: 'ab.textSecondary',
            borderRadius: `${radius.md}px`,
            '&:focus-visible': { outline: '2px solid', outlineColor: 'ab.focus' },
          }}
        >
          {visible ? <VisibilityOffIcon aria-hidden /> : <VisibilityIcon aria-hidden />}
        </Box>
      </Box>
    </FieldFrame>
  );
}
