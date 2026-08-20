import { describe, expect, it } from 'vitest';
import { isCrossOriginHttpLink } from './htmlBlockLinks';

const BASE_URI = 'https://example.com/guide/page';

describe('isCrossOriginHttpLink', () => {
  it.each([
    ['/docs', 'a root-relative link'],
    ['#section', 'a fragment link'],
    ['https://example.com/settings', 'a same-origin absolute URL'],
    ['mailto:hello@example.com', 'an email link'],
    ['tel:+1234567890', 'a telephone link']
  ])('does not treat %s as cross-origin HTTP(S) (%s)', (href) => {
    expect(isCrossOriginHttpLink(href, BASE_URI)).toBe(false);
  });

  it('treats a cross-origin HTTPS URL as cross-origin HTTP(S)', () => {
    expect(isCrossOriginHttpLink('https://docs.example.org/start', BASE_URI)).toBe(true);
  });
});
