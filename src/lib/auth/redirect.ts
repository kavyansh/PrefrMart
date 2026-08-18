/**
 * Safe handling of the post-login `next` parameter.
 *
 * An unvalidated redirect target is an open-redirect vulnerability: a link like
 * `/login?next=https://evil.example/login` sends the user somewhere that looks like a
 * continuation of our flow, on a domain the attacker controls, primed to harvest whatever they
 * type next. The address bar is the only signal, and by then they have already trusted the
 * journey.
 *
 * So only root-relative in-app paths are ever honoured, and anything else falls back to home.
 */

export const DEFAULT_REDIRECT = '/';

export function sanitizeRedirect(target: string | null | undefined): string {
  if (!target) return DEFAULT_REDIRECT;

  // Must be root-relative. Rejects "https://evil.example" and "evil.example/path".
  if (!target.startsWith('/')) return DEFAULT_REDIRECT;

  /*
   * Reject protocol-relative URLs. "//evil.example" starts with "/" and passes the check
   * above, but browsers resolve it as https://evil.example — the classic bypass.
   * Backslashes are rejected too: some browsers normalise "/\evil.example" the same way.
   */
  if (target.startsWith('//') || target.startsWith('/\\')) return DEFAULT_REDIRECT;

  // Control characters can be used to smuggle a newline into a Location header.
  if (/[\x00-\x1f\x7f]/.test(target)) return DEFAULT_REDIRECT;

  return target;
}

/** Build the sign-in URL that returns the user to where they were headed. */
export function loginUrlFor(pathname: string, search = ''): string {
  const target = `${pathname}${search}`;
  return `/login?next=${encodeURIComponent(sanitizeRedirect(target))}`;
}
