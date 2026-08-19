/**
 * Turning a NextAuth sign-in failure into something worth reading.
 *
 * The important rule here is which message is the DEFAULT. An earlier version fell back to
 * the credentials message for every error, so an `AdapterError` — the database being
 * unreachable — told the user their password was wrong. They then went looking for a problem
 * with their account that did not exist. A message that misdirects is worse than a vague one.
 *
 * So only `CredentialsSignin` claims the credentials are wrong. Everything unrecognised is
 * reported as a failure on our side, which is what an unrecognised error almost always is.
 */

/**
 * One message for every credential failure, on purpose. NextAuth collapses unknown-email and
 * wrong-password into a single `CredentialsSignin`, and nothing here may widen that back out:
 * telling the two apart turns sign-in into an account-existence oracle.
 */
export const CREDENTIALS_MESSAGE = 'That email or password is not correct.';

export const OAUTH_NOT_LINKED_MESSAGE =
  'That email already has a password account. Sign in with your password instead.';

/** Being throttled says nothing about whether an account exists, so it is safe to surface. */
export const RATE_LIMITED_MESSAGE = 'Too many sign-in attempts. Try again shortly.';

export const GENERIC_MESSAGE = 'Could not sign you in. Please try again.';

const BY_ERROR: Record<string, string> = {
  // The only error that may blame the user's credentials.
  CredentialsSignin: CREDENTIALS_MESSAGE,

  // Deliberate policy, not a fault: see lib/auth/config.ts on account linking.
  OAuthAccountNotLinked: OAUTH_NOT_LINKED_MESSAGE,
  AccountNotLinked: OAUTH_NOT_LINKED_MESSAGE,

  // The user backed out at the provider. Not an error to apologise for.
  AccessDenied: 'Sign-in was cancelled.',

  /*
   * Server-side: a missing OAuth secret, or the adapter failing. Saying so plainly matters —
   * this is the case that used to masquerade as a wrong password.
   */
  Configuration: 'Sign-in is not configured correctly. This is a problem on our side.',
};

/**
 * @param error NextAuth error type — from `?error=` on this page, or `SignInResponse.error`.
 * @param code  Our own code, thrown from the authorize callback.
 */
export function signInMessage(
  error: string | undefined,
  code: string | undefined = undefined,
): string {
  if (code === 'rate_limited') return RATE_LIMITED_MESSAGE;
  if (error === undefined) return GENERIC_MESSAGE;
  return BY_ERROR[error] ?? GENERIC_MESSAGE;
}
