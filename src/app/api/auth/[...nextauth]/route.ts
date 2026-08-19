import { handlers } from '@/lib/auth/config';

/**
 * Auth.js endpoints: /api/auth/signin, /signout, /session, /csrf, /callback/:provider.
 *
 * Node runtime because the credentials path reaches scrypt in lib/auth/password.ts and
 * Prisma through the adapter; neither runs on Edge.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const { GET, POST } = handlers;
