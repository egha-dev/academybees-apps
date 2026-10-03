import { describe, expect, it } from 'vitest';

import sitemap from '../app/sitemap';
import { CONTACT_EMAIL, earlyAccessHref, legalSections } from './site';

describe('academybees.com', () => {
  it('builds the early-access mailto with a prefilled subject and form', () => {
    const href = earlyAccessHref();
    expect(href.startsWith(`mailto:${CONTACT_EMAIL}?`)).toBe(true);
    expect(href).not.toContain('+');
    const params = new URLSearchParams(href.split('?')[1]);
    expect(params.get('subject')).toBe('Early access request');
    expect(params.get('body')).toContain('Academy name:');
  });

  it('renders every legal draft section with a title and text, in order', () => {
    for (const page of ['privacy', 'terms'] as const) {
      const sections = legalSections(page);
      expect(sections.length).toBeGreaterThan(5);
      for (const s of sections) {
        expect(s.title).not.toBe('');
        expect(s.paragraphs.length).toBeGreaterThan(0);
      }
    }
    expect(legalSections('privacy')[0]?.title).toBe('Who we are');
  });

  it('keeps the legal drafts out of the sitemap until they are approved', () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls).toEqual(['https://academybees.com/']);
  });
});
