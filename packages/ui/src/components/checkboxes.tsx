'use client';

import Box from '@mui/material/Box';
import { type Theme } from '@mui/material/styles';
import { type ChangeEvent, useId } from 'react';

import { TOUCH_TARGET } from '../tokens.js';
import { ab } from './ab.js';

export type CheckboxOption = {
  value: string;
  label: string;
  /** Shown but not changeable (e.g. a role the user can't grant). */
  disabled?: boolean;
};

/**
 * A labelled group of native checkboxes (`fieldset` + `legend`), 48 px rows. Controlled: `value`
 * is the list of checked values.
 */
export function CheckboxGroup({
  legend,
  options,
  value,
  onChange,
  name,
  error,
  helperText,
}: {
  legend: string;
  options: CheckboxOption[];
  value: readonly string[];
  onChange: (value: string[]) => void;
  name: string;
  error?: string | undefined;
  helperText?: string | undefined;
}) {
  const id = useId();
  const messageId = `${id}-message`;
  const message = error ?? helperText;
  const toggle = (option: string, checked: boolean) =>
    onChange(checked ? [...value, option] : value.filter((v) => v !== option));
  return (
    <Box
      component="fieldset"
      aria-describedby={message ? messageId : undefined}
      aria-invalid={error ? true : undefined}
      sx={{ border: 0, margin: 0, padding: 0, minInlineSize: 0 }}
    >
      <Box
        component="legend"
        sx={{
          fontSize: 14,
          fontWeight: 600,
          color: 'ab.textPrimary',
          padding: 0,
          marginBlockEnd: 1,
        }}
      >
        {legend}
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
        {options.map((option) => (
          <Box
            key={option.value}
            component="label"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              minBlockSize: TOUCH_TARGET,
              cursor: option.disabled ? 'not-allowed' : 'pointer',
              color: option.disabled ? 'ab.textSecondary' : 'ab.textPrimary',
              fontSize: 16,
            }}
          >
            <Box
              component="input"
              type="checkbox"
              name={name}
              value={option.value}
              checked={value.includes(option.value)}
              disabled={option.disabled}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                toggle(option.value, e.target.checked)
              }
              sx={{
                inlineSize: 20,
                blockSize: 20,
                margin: 0,
                accentColor: (t: Theme) => ab(t).primary,
                '&:focus-visible': {
                  outline: '2px solid',
                  outlineColor: 'ab.focus',
                  outlineOffset: '2px',
                },
              }}
            />
            {option.label}
          </Box>
        ))}
      </Box>
      {message && (
        <Box
          id={messageId}
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
