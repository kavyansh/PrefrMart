import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { isSameOrigin } from './request';

/**
 * These guard a bug that was live until measured: the check originally compared `Origin`
 * against `request.nextUrl.origin`, which Next normalises to `http://localhost:<port>`
 * regardless of the host the request arrived on. That rejected legitimate same-origin
 * requests and would have broken every form behind a proxy or real hostname.
 */

function request(url: string, headers: Record<string, string>): NextRequest {
  return new NextRequest(new Request(url, { method: 'POST', headers }));
}

describe('isSameOrigin', () => {
  it('accepts a same-origin Origin matching the Host header', () => {
    // The regression case: Next would report nextUrl.origin as localhost here.
    expect(
      isSameOrigin(
        request('http://127.0.0.1:3111/api/x', {
          origin: 'http://127.0.0.1:3111',
          host: '127.0.0.1:3111',
        }),
      ),
    ).toBe(true);
  });

  it('accepts a same-origin Origin on a real hostname', () => {
    expect(
      isSameOrigin(
        request('https://shop.example.com/api/x', {
          origin: 'https://shop.example.com',
          host: 'shop.example.com',
        }),
      ),
    ).toBe(true);
  });

  it('rejects a cross-site Origin', () => {
    expect(
      isSameOrigin(
        request('https://shop.example.com/api/x', {
          origin: 'https://evil.example',
          host: 'shop.example.com',
        }),
      ),
    ).toBe(false);
  });

  it('rejects an Origin that only looks like a prefix of the host', () => {
    // shop.example.com.evil.test must not pass as shop.example.com.
    expect(
      isSameOrigin(
        request('https://shop.example.com/api/x', {
          origin: 'https://shop.example.com.evil.test',
          host: 'shop.example.com',
        }),
      ),
    ).toBe(false);
  });

  it('distinguishes ports', () => {
    expect(
      isSameOrigin(
        request('http://localhost:3000/api/x', {
          origin: 'http://localhost:4000',
          host: 'localhost:3000',
        }),
      ),
    ).toBe(false);
  });

  describe('Sec-Fetch-Site takes precedence', () => {
    it('accepts same-origin', () => {
      expect(
        isSameOrigin(
          request('https://shop.example.com/api/x', { 'sec-fetch-site': 'same-origin' }),
        ),
      ).toBe(true);
    });

    it('accepts none, which is a direct navigation', () => {
      expect(
        isSameOrigin(request('https://shop.example.com/api/x', { 'sec-fetch-site': 'none' })),
      ).toBe(true);
    });

    it('rejects cross-site even when Origin would have matched', () => {
      // A browser that says cross-site is authoritative; a matching Origin cannot override it.
      expect(
        isSameOrigin(
          request('https://shop.example.com/api/x', {
            'sec-fetch-site': 'cross-site',
            origin: 'https://shop.example.com',
            host: 'shop.example.com',
          }),
        ),
      ).toBe(false);
    });

    it('rejects same-site, which still means a different origin', () => {
      expect(
        isSameOrigin(request('https://shop.example.com/api/x', { 'sec-fetch-site': 'same-site' })),
      ).toBe(false);
    });
  });

  it('allows a non-browser client that sends neither header', () => {
    // curl and scripted clients have no victim cookies to ride on, so blocking them
    // buys nothing and breaks API testing. The session cookie still governs access.
    expect(isSameOrigin(request('http://localhost:3000/api/x', {}))).toBe(true);
  });

  it('prefers x-forwarded-host when present', () => {
    expect(
      isSameOrigin(
        request('http://internal:8080/api/x', {
          origin: 'https://shop.example.com',
          'x-forwarded-host': 'shop.example.com',
          host: 'internal:8080',
        }),
      ),
    ).toBe(true);
  });

  it('rejects an unparseable Origin', () => {
    expect(
      isSameOrigin(request('http://localhost:3000/api/x', { origin: 'not-a-url', host: 'localhost:3000' })),
    ).toBe(false);
  });
});
