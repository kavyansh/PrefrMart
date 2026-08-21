import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthForm } from '@/components/auth/AuthForm';
import {
  CREDENTIALS_MESSAGE,
  GENERIC_MESSAGE,
  OAUTH_NOT_LINKED_MESSAGE,
  RATE_LIMITED_MESSAGE,
} from '@/lib/auth/signInErrors';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/passwordPolicy';

/**
 * One form serving two journeys, doing up to two sequential requests, with three sources of error
 * message (local validation, our signup endpoint, NextAuth) that all have to land somewhere
 * sensible. The tests below are organised around the ways that goes wrong.
 *
 * The one to keep is "reports an unrecognised failure as ours, not the user's". `signInErrors.ts`
 * exists because an earlier version defaulted every error to the credentials message, so a database
 * outage told people their password was wrong and sent them hunting for an account problem that did
 * not exist. That default is the kind of thing a refactor silently reintroduces.
 */

const push = vi.fn();
const replace = vi.fn();
const refresh = vi.fn();

/** Router calls in the order they happened, which is what the refresh-then-replace test needs. */
let routerCalls: string[] = [];

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: (...args: unknown[]) => { routerCalls.push('push'); return push(...args); },
    replace: (...args: unknown[]) => { routerCalls.push('replace'); return replace(...args); },
    refresh: (...args: unknown[]) => { routerCalls.push('refresh'); return refresh(...args); },
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

const signIn = vi.fn();
vi.mock('next-auth/react', () => ({ signIn: (...args: unknown[]) => signIn(...args) }));

/** A `signIn` result shaped like NextAuth's, defaulting to success. */
function signInResult(overrides: Record<string, unknown> = {}) {
  return { ok: true, error: undefined, code: undefined, status: 200, url: null, ...overrides };
}

/** A fetch response shaped like our API's, for the signup endpoint. */
function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
  routerCalls = [];
  vi.stubGlobal('fetch', fetchMock);
  signIn.mockResolvedValue(signInResult());
  fetchMock.mockResolvedValue(jsonResponse(201, { user: { id: 'u1' } }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function setup(props: Partial<Parameters<typeof AuthForm>[0]> = {}) {
  render(<AuthForm mode="login" next="/account/profile" {...props} />);
  return { user: userEvent.setup() };
}

/** Fills the credential fields. Name is only present in signup mode. */
async function fillCredentials(
  user: ReturnType<typeof userEvent.setup>,
  { name, email, password }: { name?: string; email: string; password: string },
) {
  if (name !== undefined) await user.type(screen.getByLabelText('Your name'), name);
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
}

describe('AuthForm', () => {
  describe('what each mode offers', () => {
    it('asks for a name on signup only', () => {
      setup({ mode: 'signup' });
      expect(screen.getByLabelText('Your name')).toBeInTheDocument();
    });

    it('asks only for credentials on login', () => {
      setup({ mode: 'login' });
      expect(screen.queryByLabelText('Your name')).not.toBeInTheDocument();
    });

    it('hints the password requirement on signup, before it can be violated', () => {
      setup({ mode: 'signup' });

      const password = screen.getByLabelText('Password');
      expect(password).toHaveAccessibleDescription(`At least ${MIN_PASSWORD_LENGTH} characters.`);
    });

    it('tells password managers which journey this is', () => {
      setup({ mode: 'signup' });

      // 'new-password' invites a generated password; 'current-password' would invite autofill of an
      // existing one, on a form that is creating the account.
      expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'new-password');
      expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'email');
    });

    it('carries the destination across when switching form', () => {
      setup({ mode: 'login', next: '/checkout' });

      // Switching to signup must not lose where the shopper was originally headed.
      expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute(
        'href',
        '/signup?next=%2Fcheckout',
      );
    });
  });

  describe('local validation', () => {
    it('rejects an address with no @ before making a request', async () => {
      const { user } = setup();

      await fillCredentials(user, { email: 'not-an-email', password: 'hunter2hunter2' });
      await user.click(screen.getByRole('button', { name: 'Sign in' }));

      expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
      expect(signIn).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects an empty password', async () => {
      const { user } = setup();

      await user.type(screen.getByLabelText('Email'), 'someone@example.com');
      await user.click(screen.getByRole('button', { name: 'Sign in' }));

      expect(screen.getByText('Enter your password.')).toBeInTheDocument();
      expect(signIn).not.toHaveBeenCalled();
    });

    it('requires a name on signup', async () => {
      const { user } = setup({ mode: 'signup' });

      await fillCredentials(user, { email: 'someone@example.com', password: 'hunter2hunter2' });
      await user.click(screen.getByRole('button', { name: 'Create account' }));

      expect(screen.getByText('Enter your name.')).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('enforces the minimum password length on signup', async () => {
      const { user } = setup({ mode: 'signup' });

      await fillCredentials(user, { name: 'Ada', email: 'ada@example.com', password: 'short' });
      await user.click(screen.getByRole('button', { name: 'Create account' }));

      expect(
        screen.getByText(`Use at least ${MIN_PASSWORD_LENGTH} characters.`),
      ).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('does not enforce it on login', async () => {
      const { user } = setup({ mode: 'login' });

      await fillCredentials(user, { email: 'ada@example.com', password: 'short' });
      await user.click(screen.getByRole('button', { name: 'Sign in' }));

      // Applying the rule here would reject a legitimate older password, and would leak that the
      // stored one is short.
      expect(signIn).toHaveBeenCalled();
      expect(
        screen.queryByText(`Use at least ${MIN_PASSWORD_LENGTH} characters.`),
      ).not.toBeInTheDocument();
    });

    it('ties each message to its input for assistive tech', async () => {
      const { user } = setup();

      await fillCredentials(user, { email: 'nope', password: 'hunter2hunter2' });
      await user.click(screen.getByRole('button', { name: 'Sign in' }));

      const email = screen.getByLabelText('Email');
      expect(email).toHaveAttribute('aria-invalid', 'true');
      // Not just text sitting nearby — described-by is how a screen reader reads it as part of the
      // field.
      expect(email).toHaveAccessibleDescription('Enter a valid email address.');
    });
  });

  describe('signing in', () => {
    it('handles the result in place rather than letting NextAuth navigate', async () => {
      const { user } = setup();

      await fillCredentials(user, { email: ' ada@example.com ', password: 'hunter2hunter2' });
      await user.click(screen.getByRole('button', { name: 'Sign in' }));

      expect(signIn).toHaveBeenCalledWith('credentials', {
        // Trimmed: a trailing space from an autofill should not be a failed sign-in.
        email: 'ada@example.com',
        password: 'hunter2hunter2',
        redirect: false,
      });
    });

    it('discards the router cache before navigating', async () => {
      const { user } = setup({ next: '/checkout' });

      await fillCredentials(user, { email: 'ada@example.com', password: 'hunter2hunter2' });
      await user.click(screen.getByRole('button', { name: 'Sign in' }));

      await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/checkout'));
      // Order matters: the cache still holds the signed-out render of the destination, which would
      // otherwise flash for a beat after signing in.
      expect(routerCalls).toEqual(['refresh', 'replace']);
    });

    it('reports a rejected password as a credential problem', async () => {
      signIn.mockResolvedValue(signInResult({ ok: false, error: 'CredentialsSignin' }));
      const { user } = setup();

      await fillCredentials(user, { email: 'ada@example.com', password: 'wrong-password' });
      await user.click(screen.getByRole('button', { name: 'Sign in' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(CREDENTIALS_MESSAGE);
      expect(replace).not.toHaveBeenCalled();
    });

    it('reports an unrecognised failure as ours, not the user’s', async () => {
      // An AdapterError is the database being unreachable. Blaming the password here is the exact
      // regression signInErrors.ts was written to prevent.
      signIn.mockResolvedValue(signInResult({ ok: false, error: 'AdapterError' }));
      const { user } = setup();

      await fillCredentials(user, { email: 'ada@example.com', password: 'hunter2hunter2' });
      await user.click(screen.getByRole('button', { name: 'Sign in' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(GENERIC_MESSAGE);
      expect(alert).not.toHaveTextContent(CREDENTIALS_MESSAGE);
    });

    it('surfaces throttling, which says nothing about whether an account exists', async () => {
      signIn.mockResolvedValue(
        signInResult({ ok: false, error: 'CredentialsSignin', code: 'rate_limited' }),
      );
      const { user } = setup();

      await fillCredentials(user, { email: 'ada@example.com', password: 'hunter2hunter2' });
      await user.click(screen.getByRole('button', { name: 'Sign in' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(RATE_LIMITED_MESSAGE);
    });

    it('distinguishes an unreachable server from a rejection', async () => {
      signIn.mockRejectedValue(new TypeError('Failed to fetch'));
      const { user } = setup();

      await fillCredentials(user, { email: 'ada@example.com', password: 'hunter2hunter2' });
      await user.click(screen.getByRole('button', { name: 'Sign in' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Could not reach the server. Check your connection and try again.',
      );
    });

    it('re-enables the button after a failure', async () => {
      signIn.mockResolvedValue(signInResult({ ok: false, error: 'CredentialsSignin' }));
      const { user } = setup();

      await fillCredentials(user, { email: 'ada@example.com', password: 'wrong-password' });
      await user.click(screen.getByRole('button', { name: 'Sign in' }));

      // A form that stays disabled after a wrong password is a dead end.
      expect(await screen.findByRole('button', { name: 'Sign in' })).toBeEnabled();
    });
  });

  describe('signing up', () => {
    it('creates the account, then establishes the session', async () => {
      const { user } = setup({ mode: 'signup', next: '/' });

      await fillCredentials(user, {
        name: '  Ada Lovelace  ',
        email: '  ada@example.com  ',
        password: 'hunter2hunter2',
      });
      await user.click(screen.getByRole('button', { name: 'Create account' }));

      // Two requests, in this order: NextAuth has no registration flow for credentials, and a
      // cookie it did not mint is not one it recognises.
      expect(fetchMock).toHaveBeenCalledWith('/api/auth/signup', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          password: 'hunter2hunter2',
        }),
      }));
      await vi.waitFor(() => expect(signIn).toHaveBeenCalled());
    });

    it('maps a rejected field back onto its input', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(409, {
          error: {
            message: 'That email is already registered.',
            fields: { email: 'That email is already registered.' },
          },
        }),
      );
      const { user } = setup({ mode: 'signup' });

      await fillCredentials(user, {
        name: 'Ada',
        email: 'taken@example.com',
        password: 'hunter2hunter2',
      });
      await user.click(screen.getByRole('button', { name: 'Create account' }));

      // Next to the field that caused it, rather than a banner the user has to interpret.
      const email = await screen.findByLabelText('Email');
      expect(email).toHaveAttribute('aria-invalid', 'true');
      expect(email).toHaveAccessibleDescription('That email is already registered.');
      // And no session attempt, because there is no account.
      expect(signIn).not.toHaveBeenCalled();
    });

    it('falls back to a generic message when the server sends no message', async () => {
      fetchMock.mockResolvedValue(jsonResponse(500, {}));
      const { user } = setup({ mode: 'signup' });

      await fillCredentials(user, { name: 'Ada', email: 'ada@example.com', password: 'hunter2hunter2' });
      await user.click(screen.getByRole('button', { name: 'Create account' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Something went wrong. Please try again.',
      );
    });

    it('survives a response that is not JSON at all', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => { throw new SyntaxError('Unexpected token < in JSON'); },
      } as unknown as Response);
      const { user } = setup({ mode: 'signup' });

      await fillCredentials(user, { name: 'Ada', email: 'ada@example.com', password: 'hunter2hunter2' });
      await user.click(screen.getByRole('button', { name: 'Create account' }));

      // A gateway error page instead of JSON must still produce a message, not a blank form.
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Something went wrong. Please try again.',
      );
    });
  });

  describe('OAuth', () => {
    it('starts a full redirect, since the handshake leaves the site', async () => {
      const { user } = setup({ next: '/checkout' });

      await user.click(screen.getByRole('button', { name: 'Continue with Google' }));

      // No `redirect: false` here: there is no in-page result to handle.
      expect(signIn).toHaveBeenCalledWith('google', { redirectTo: '/checkout' });
    });

    it('offers both providers above the fields', () => {
      setup();

      // Someone who has an account through Google is looking for the button, not the fields.
      expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Continue with GitHub' })).toBeInTheDocument();
    });

    it('shows a bounced-back error on arrival', () => {
      // The OAuth journey failed and returned here as ?error=, which the page passes in.
      setup({ initialError: 'OAuthAccountNotLinked' });

      expect(screen.getByRole('alert')).toHaveTextContent(OAUTH_NOT_LINKED_MESSAGE);
    });

    it('shows no alert when there is nothing to report', () => {
      setup();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });
});
