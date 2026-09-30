import { isUuidV7 } from '@academybee/contracts';
import { describe, expect, it } from 'vitest';

import { buildOutboxEvent, defineFactory } from './index.js';

describe('factories', () => {
  it('builds fresh defaults and applies overrides', () => {
    const a = buildOutboxEvent();
    const b = buildOutboxEvent({ type: 'other.event' });
    expect(isUuidV7(a.id)).toBe(true);
    expect(a.id).not.toBe(b.id);
    expect(b.type).toBe('other.event');
  });

  it('never shares mutable defaults between builds', () => {
    const build = defineFactory(() => ({ tags: [] as string[] }));
    build().tags.push('x');
    expect(build().tags).toEqual([]);
  });
});
