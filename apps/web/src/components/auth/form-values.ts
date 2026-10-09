import type { FormEvent } from 'react';

/** The submitted form's text values by field name (fields are uncontrolled, see TextInput). */
export function formValues(e: FormEvent<HTMLFormElement>): (name: string) => string {
  const data = new FormData(e.currentTarget);
  return (name) => {
    const value = data.get(name);
    return typeof value === 'string' ? value : '';
  };
}
