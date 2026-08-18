import { z } from 'zod';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { PRODUCT_SORTS, REVIEW_SORTS } from '@/lib/catalog/sorts';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@/lib/auth/passwordPolicy';

/**
 * Every value crossing the network boundary is parsed here first.
 *
 * These schemas are shared by client forms and server handlers so the two cannot
 * disagree — but the server always re-validates. Client-side validation is a UX
 * affordance; the server-side parse is the actual trust boundary.
 */

// Re-exported for server-side callers already importing from this module. Client
// components must import from '@/lib/catalog/sorts' directly — importing from here pulls
// zod into the browser bundle.
export { PRODUCT_SORTS, type ProductSort } from '@/lib/catalog/sorts';

/** Cursor is a base64url token; `decodeCursor` does the real structural check. */
const cursorSchema = z
  .string()
  .max(200)
  .regex(/^[A-Za-z0-9_-]+$/, 'Malformed cursor')
  .optional();

/** Coerce a query-string integer, rejecting junk rather than silently NaN-ing. */
const queryInt = (min: number, max: number) =>
  z.coerce.number().int().min(min).max(max).optional();

export const productListQuerySchema = z.object({
  cursor: cursorSchema,
  limit: queryInt(1, MAX_PAGE_SIZE),
  category: z
    .string()
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'Malformed category')
    .optional(),
  sort: z.enum(PRODUCT_SORTS).optional(),
  // Prices arrive in minor units. Cap at ₹10,00,000 to keep the query bounded.
  minPrice: queryInt(0, 100_000_000),
  maxPrice: queryInt(0, 100_000_000),
  minRating: queryInt(1, 5),
  q: z.string().trim().max(120).optional(),
  /** Only show items that can actually be bought. */
  inStock: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

export type ProductListQuery = z.infer<typeof productListQuerySchema>;

export const reviewSortSchema = z.enum(REVIEW_SORTS).optional();

export const reviewListQuerySchema = z.object({
  cursor: cursorSchema,
  limit: queryInt(1, MAX_PAGE_SIZE),
  sort: reviewSortSchema,
});

/**
 * Review submission. Length caps are not cosmetic: they bound what a single row can
 * cost us, and stop a caller from using the body field as free storage.
 */
export const createReviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().trim().min(3, 'Give your review a short title.').max(120),
  body: z
    .string()
    .trim()
    .min(10, 'Tell us a little more — at least 10 characters.')
    .max(4_000, 'Reviews are limited to 4,000 characters.'),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;

/**
 * Credentials. The email is lowercased on parse so "Asha@Example.com" and
 * "asha@example.com" cannot become two accounts.
 *
 * Note the asymmetry: signup enforces a minimum password length, login does not. Applying
 * the rule at login would reject a legitimate older password and, worse, let an attacker
 * distinguish "too short" from "wrong" — a small oracle about stored credentials.
 */
export const credentialsSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(254)
    .refine((value) => value.includes('@'), 'Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.').max(MAX_PASSWORD_LENGTH),
});

export const signupSchema = credentialsSchema.extend({
  name: z.string().trim().min(1, 'Enter your name.').max(80),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
    .max(MAX_PASSWORD_LENGTH),
});

export type CredentialsInput = z.infer<typeof credentialsSchema>;
export type SignupInput = z.infer<typeof signupSchema>;

/** Parse URLSearchParams into a plain object Zod can read. */
export function searchParamsToObject(params: URLSearchParams): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    // Last value wins for repeated keys; none of our filters are multi-value.
    if (value !== '') result[key] = value;
  }
  return result;
}
