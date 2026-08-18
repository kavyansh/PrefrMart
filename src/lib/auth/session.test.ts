import { describe, expect, it } from 'vitest';

process.env.AUTH_SECRET ??= 'test-only-secret-that-is-definitely-long-enough-abcdef';

const { signSessionToken, verifySessionToken } = await import('./session');

describe('session tokens', () => {
  it('round-trips a user id', async () => {
    const token = await signSessionToken('user-123');
    expect(await verifySessionToken(token)).toEqual({ userId: 'user-123' });
  });

  it('rejects a tampered payload', async () => {
    const token = await signSessionToken('user-123');
    const [header, , signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'user-999' })).toString('base64url');
    expect(await verifySessionToken(`${header}.${forged}.${signature}`)).toBeNull();
  });

  it('rejects an unsigned "alg: none" token', async () => {
    /*
     * The classic JWT forgery: declare no algorithm and supply no signature. This is why
     * verification pins `algorithms: ['HS256']` — without that pin, some verifiers accept it.
     */
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ sub: 'user-999', iss: 'tender', aud: 'tender-web' }),
    ).toString('base64url');
    expect(await verifySessionToken(`${header}.${payload}.`)).toBeNull();
  });

  it('rejects a token signed with a different key', async () => {
    const { SignJWT } = await import('jose');
    const foreign = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-999')
      .setIssuer('tender')
      .setAudience('tender-web')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('a-completely-different-secret-value-here'));

    expect(await verifySessionToken(foreign)).toBeNull();
  });

  it('rejects a token from another issuer or audience', async () => {
    const { SignJWT } = await import('jose');
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET!);

    const wrongIssuer = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-1')
      .setIssuer('somebody-else')
      .setAudience('tender-web')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(secret);

    expect(await verifySessionToken(wrongIssuer)).toBeNull();
  });

  it('rejects an expired token', async () => {
    const { SignJWT } = await import('jose');
    const expired = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-1')
      .setIssuer('tender')
      .setAudience('tender-web')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));

    expect(await verifySessionToken(expired)).toBeNull();
  });

  it('returns null for junk rather than throwing', async () => {
    for (const junk of ['', 'not.a.token', 'aaa', '...']) {
      expect(await verifySessionToken(junk)).toBeNull();
    }
  });
});
