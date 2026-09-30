import { v7 as uuidV7, validate, version } from 'uuid';
import { z } from 'zod';

/**
 * UUIDv7 identifiers generated in application code (ADR-009). Time-ordered, so they index well,
 * and clients can create IDs offline (sync `opId`, offline creates).
 */
export function newId(): string {
  return uuidV7();
}

export function isUuidV7(value: string): boolean {
  return validate(value) && version(value) === 7;
}

export const UuidV7Schema = z.uuid({ version: 'v7' });
