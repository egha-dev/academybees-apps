/** Types for pilot-register.mjs (the synthetic register generator, C-111). */
export const HEADERS: string[];
export const EXPECTED: { rows: number; valid: number; problems: number };
export function rows(): string[][];
export function csv(): string;
export function xlsx(): Promise<Buffer>;
