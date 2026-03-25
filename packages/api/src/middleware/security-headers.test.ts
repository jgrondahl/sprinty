import { describe, expect, it } from 'bun:test';
import { withSecurityHeaders } from './security-headers';

describe('security headers middleware', () => {
  it('adds all required security headers', () => {
    const response = withSecurityHeaders(new Response('ok'));

    expect(response.headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    expect(response.headers.get('X-XSS-Protection')).toBe('0');
    expect(response.headers.get('Content-Security-Policy')).toBe("default-src 'self'");
    expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });
});
