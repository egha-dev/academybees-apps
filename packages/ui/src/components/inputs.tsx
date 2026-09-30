'use client';

import MenuItem from '@mui/material/MenuItem';
import MuiTextField from '@mui/material/TextField';
import { type ChangeEvent, useId } from 'react';

export type TextFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  name?: string;
  placeholder?: string;
  /** Field-level error message (UX §31: precise validation). */
  error?: string | undefined;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
  type?: 'text' | 'email' | 'tel' | 'password' | 'number' | 'search';
  autoComplete?: string;
  inputMode?: 'text' | 'numeric' | 'decimal' | 'tel' | 'email' | 'search';
};

export function TextField({
  label,
  value,
  onChange,
  error,
  helperText,
  inputMode,
  ...rest
}: TextFieldProps) {
  const id = useId();
  return (
    <MuiTextField
      id={id}
      label={label}
      value={value}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      error={Boolean(error)}
      helperText={error ?? helperText}
      fullWidth
      slotProps={inputMode ? { htmlInput: { inputMode } } : {}}
      {...rest}
    />
  );
}

export type SelectOption = { value: string; label: string };

export function Select({
  label,
  value,
  options,
  onChange,
  error,
  helperText,
  required,
  disabled,
}: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  error?: string;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <MuiTextField
      id={id}
      select
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      error={Boolean(error)}
      helperText={error ?? helperText}
      required={required}
      disabled={disabled}
      fullWidth
    >
      {options.map((o) => (
        <MenuItem key={o.value} value={o.value} sx={{ minHeight: 48 }}>
          {o.label}
        </MenuItem>
      ))}
    </MuiTextField>
  );
}
