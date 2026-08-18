/**
 * Server-only environment access with fail-fast validation.
 *
 * A weak or missing AUTH_SECRET silently downgrades session security, so we refuse
 * to boot rather than run insecurely. This module must never be imported from a
 * client component.
 */

const MIN_SECRET_LENGTH = 32;

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

let cachedAuthSecret: Uint8Array | undefined;

/** HS256 signing key for session JWTs, as bytes. */
export function authSecret(): Uint8Array {
  if (cachedAuthSecret) return cachedAuthSecret;

  const raw = required('AUTH_SECRET');
  if (raw.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `AUTH_SECRET must be at least ${MIN_SECRET_LENGTH} characters (got ${raw.length}). ` +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"',
    );
  }
  if (raw.startsWith('replace-me')) {
    throw new Error('AUTH_SECRET is still the placeholder from .env.example. Generate a real one.');
  }

  cachedAuthSecret = new TextEncoder().encode(raw);
  return cachedAuthSecret;
}

export function databaseUrl(): string {
  return required('DATABASE_URL');
}

export const isProduction = process.env.NODE_ENV === 'production';
export const isTest = process.env.NODE_ENV === 'test';
