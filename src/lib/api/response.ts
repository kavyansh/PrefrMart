import { NextResponse } from 'next/server';
import type { ZodError } from 'zod';

/**
 * One response envelope for every route handler.
 *
 * Errors always come back as `{ error: { code, message, fields? } }`. Internal
 * failures are logged server-side and replaced with a generic message — an
 * exception's text can leak table names, file paths and query fragments.
 */

export type ApiErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'payload_too_large'
  | 'unsupported_media_type'
  | 'internal';

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  payload_too_large: 413,
  unsupported_media_type: 415,
  internal: 500,
};

export type ApiErrorBody = {
  error: {
    code: ApiErrorCode;
    message: string;
    /** Field-level messages for form validation failures. */
    fields?: Record<string, string>;
  };
};

export function ok<T>(data: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(data, init);
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  fields?: Record<string, string>,
): NextResponse<ApiErrorBody> {
  return NextResponse.json(
    { error: { code, message, ...(fields ? { fields } : {}) } },
    { status: STATUS_BY_CODE[code] },
  );
}

/** Flatten a Zod error into per-field messages the client can attach to inputs. */
export function validationError(error: ZodError): NextResponse<ApiErrorBody> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    // Keep the first message per field; later ones are usually redundant.
    fields[key] ??= issue.message;
  }
  return apiError('bad_request', 'Some of the submitted values are not valid.', fields);
}

/**
 * Wrap a handler so an unexpected throw becomes a logged 500 rather than a stack
 * trace in the response body.
 */
export async function guarded<T>(
  label: string,
  handler: () => Promise<NextResponse<T> | NextResponse<ApiErrorBody>>,
): Promise<NextResponse<T> | NextResponse<ApiErrorBody>> {
  try {
    return await handler();
  } catch (error) {
    console.error(`[api:${label}]`, error);
    return apiError('internal', 'Something went wrong on our side. Please try again.');
  }
}
